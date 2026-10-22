import * as crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AdmissionDocument } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { admissionDocKey, studentDocKey, studentDocPrefix } from './keys';
import { StorageService } from './storage.service';

export interface UploadedFile {
  fileName: string;
  sizeBytes: number;
  mime: string;
  bytes: Buffer;
}

type DocRow = Pick<AdmissionDocument, 'id' | 'branchId' | 'docType' | 'fileName' | 'dataUrl' | 'storageKey' | 'mimeType' | 'sizeBytes'>;

const DATA_URL_RE = /^data:([a-zA-Z0-9.+/-]+);base64,(.*)$/s;

/** Legacy inline row → bytes + mime (null when the data URL is malformed). */
export function decodeDataUrl(dataUrl: string | null | undefined): { bytes: Buffer; mime: string } | null {
  const m = dataUrl ? DATA_URL_RE.exec(dataUrl) : null;
  return m ? { bytes: Buffer.from(m[2], 'base64'), mime: m[1].toLowerCase() } : null;
}

/**
 * Admission/student documents on top of StorageService: the DB row keeps metadata only
 * (storageKey, mimeType, size); the bytes live in the object store. Rows created before
 * the move still carry `dataUrl` until scripts/migrate-documents-to-storage.js runs.
 */
@Injectable()
export class DocumentStorage {
  private readonly logger = new Logger('DocumentStorage');

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  /** Writes the object for a new admission document; the caller creates the row with the returned fields. */
  async putAdmissionFile(branchId: string, admissionId: string, file: UploadedFile) {
    const id = crypto.randomUUID();
    const storageKey = admissionDocKey(branchId, admissionId, id, file.fileName);
    await this.storage.put(storageKey, file.bytes, file.mime);
    return { id, storageKey, mimeType: file.mime, fileName: file.fileName, sizeBytes: file.sizeBytes };
  }

  /** Object first, then the row; if the row cannot be written the orphan object is removed. */
  async createAdmissionDoc(branchId: string, admissionId: string, docType: string, file: UploadedFile) {
    const obj = await this.putAdmissionFile(branchId, admissionId, file);
    try {
      return await this.prisma.admissionDocument.create({ data: { ...obj, branchId, admissionId, docType } });
    } catch (e) {
      await this.storage.deleteQuietly(obj.storageKey);
      throw e;
    }
  }

  /** Row first (the source of truth), then the object (best effort, logged). */
  async deleteDoc(doc: Pick<AdmissionDocument, 'id' | 'storageKey'>) {
    await this.prisma.admissionDocument.delete({ where: { id: doc.id } });
    await this.storage.deleteQuietly(doc.storageKey);
  }

  discard(storageKey: string | null | undefined) {
    return this.storage.deleteQuietly(storageKey);
  }

  /** Bytes of a document from storage or, for legacy rows, from the inline data URL. */
  async read(doc: DocRow): Promise<{ bytes: Buffer; mime: string } | null> {
    if (doc.storageKey) {
      const obj = await this.storage.get(doc.storageKey);
      return { bytes: obj.bytes, mime: doc.mimeType || obj.mime };
    }
    return decodeDataUrl(doc.dataUrl);
  }

  /**
   * Download descriptor: a short-lived signed URL. `data_url` is only present for legacy
   * rows that have not been migrated yet (they have no object to sign).
   */
  async link(doc: DocRow, opts: { inline?: boolean } = {}) {
    const base = { id: doc.id, doc_type: doc.docType, file_name: doc.fileName, size_bytes: doc.sizeBytes };
    if (doc.storageKey) {
      const mime = doc.mimeType ?? undefined;
      const { url, expires_at } = await this.storage.signedUrl(doc.storageKey, undefined, doc.fileName, { inline: opts.inline, mime });
      return { ...base, mime_type: doc.mimeType, url, expires_at };
    }
    return { ...base, mime_type: decodeDataUrl(doc.dataUrl)?.mime ?? doc.mimeType, url: null, expires_at: null, data_url: doc.dataUrl };
  }

  /**
   * Student DMS archive (runs after the principal signs and the rows already carry studentId):
   * every document of the student that is not yet in branches/<b>/students/<id>/documents/ is
   * copied there, the row is re-pointed, then the admission copy is deleted. Legacy inline rows
   * are written into the student folder and their dataUrl cleared. Idempotent — safe to re-run;
   * a failure leaves that row on its old (still readable) key and is reported, not thrown.
   */
  async archiveToStudent(branchId: string, studentId: string) {
    const prefix = studentDocPrefix(branchId, studentId);
    const docs = await this.prisma.admissionDocument.findMany({ where: { branchId, studentId } });
    let moved = 0;
    const failed: string[] = [];
    for (const doc of docs) {
      if (doc.storageKey?.startsWith(prefix)) continue;
      const target = studentDocKey(branchId, studentId, doc.id, doc.fileName);
      try {
        if (doc.storageKey) {
          await this.storage.copy(doc.storageKey, target);
          await this.prisma.admissionDocument.update({ where: { id: doc.id }, data: { storageKey: target } });
          await this.storage.deleteQuietly(doc.storageKey);
        } else {
          const legacy = decodeDataUrl(doc.dataUrl);
          if (!legacy) throw new Error('no storage key and no readable data URL');
          await this.storage.put(target, legacy.bytes, legacy.mime);
          await this.prisma.admissionDocument.update({
            where: { id: doc.id },
            data: { storageKey: target, mimeType: legacy.mime, sizeBytes: legacy.bytes.length, dataUrl: null },
          });
        }
        moved += 1;
      } catch (e) {
        failed.push(doc.id);
        this.logger.error(`DMS archive of document ${doc.id} for student ${studentId} failed: ${(e as Error).message}`);
      }
    }
    return { moved, failed };
  }
}
