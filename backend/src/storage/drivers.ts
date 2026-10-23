import * as fs from 'fs';
import * as path from 'path';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { UnsafeKeyError } from './keys';

export interface StoredObject {
  bytes: Buffer;
  mime: string;
}

export interface PresignOptions {
  ttlSeconds: number;
  contentDisposition: string;
  contentType?: string;
}

export interface StorageDriver {
  readonly name: 'local' | 's3';
  put(key: string, bytes: Buffer, mime: string): Promise<void>;
  /** null when the object does not exist. */
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** Only drivers that can sign their own URLs (S3). The local driver is signed by StorageService. */
  presign?(key: string, opts: PresignOptions): Promise<string>;
}

// ─── Local disk ────────────────────────────────────────────────

const META_SUFFIX = '.meta.json';

/**
 * Files under `root/<key>` plus a `<key>.meta.json` sidecar holding the mime type.
 * Single-server only: the files are not shared between API instances and are not in
 * the database backup — see resolveStorageConfig() for why production needs an opt-in.
 */
export class LocalDriver implements StorageDriver {
  readonly name = 'local' as const;
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private file(key: string): string {
    if (key.endsWith(META_SUFFIX)) throw new UnsafeKeyError('Reserved key suffix');
    const p = path.resolve(this.root, ...key.split('/'));
    // Belt and braces on top of assertSafeKey(): the resolved path must stay inside root.
    if (!p.startsWith(this.root + path.sep)) throw new UnsafeKeyError(`Key escapes the storage root: ${key}`);
    return p;
  }

  async put(key: string, bytes: Buffer, mime: string) {
    const p = this.file(key);
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    // Write to a temp name and rename so a crash never leaves a half-written object.
    const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.writeFile(tmp, bytes);
    await fs.promises.rename(tmp, p);
    await fs.promises.writeFile(p + META_SUFFIX, JSON.stringify({ mime }));
  }

  async get(key: string): Promise<StoredObject | null> {
    const p = this.file(key);
    let bytes: Buffer;
    try {
      bytes = await fs.promises.readFile(p);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
    let mime = 'application/octet-stream';
    try {
      mime = JSON.parse(await fs.promises.readFile(p + META_SUFFIX, 'utf8')).mime || mime;
    } catch { /* sidecar missing: generic type */ }
    return { bytes, mime };
  }

  async delete(key: string) {
    const p = this.file(key);
    await fs.promises.rm(p, { force: true });
    await fs.promises.rm(p + META_SUFFIX, { force: true });
  }

  async copy(from: string, to: string) {
    const obj = await this.get(from);
    if (!obj) throw new Error(`Source object not found: ${from}`);
    await this.put(to, obj.bytes, obj.mime);
  }

  async exists(key: string) {
    try {
      await fs.promises.access(this.file(key));
      return true;
    } catch {
      return false;
    }
  }
}

// ─── S3 / Cloudflare R2 / MinIO ────────────────────────────────

export interface S3Config {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
}

const isNotFound = (e: unknown) => {
  const err = e as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return err?.name === 'NotFound' || err?.name === 'NoSuchKey' || err?.Code === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404;
};

/** CopySource is "<bucket>/<key>" URL-encoded per segment (keys are already [A-Za-z0-9._-/]). */
const copySource = (bucket: string, key: string) => `${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;

export class S3Driver implements StorageDriver {
  readonly name = 's3' as const;
  readonly client: S3Client;
  readonly bucket: string;

  constructor(cfg: S3Config) {
    this.bucket = cfg.bucket;
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint || undefined,
      forcePathStyle: cfg.forcePathStyle,
      credentials: cfg.accessKeyId && cfg.secretAccessKey ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey } : undefined,
      // R2 / MinIO reject or ignore the SDK's default CRC32 trailers; only send checksums when an API requires them.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async put(key: string, bytes: Buffer, mime: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: mime, ContentLength: bytes.length }));
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = Buffer.from(await r.Body!.transformToByteArray());
      return { bytes, mime: r.ContentType || 'application/octet-stream' };
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async copy(from: string, to: string) {
    await this.client.send(new CopyObjectCommand({ Bucket: this.bucket, Key: to, CopySource: copySource(this.bucket, from) }));
  }

  async exists(key: string) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (e) {
      if (isNotFound(e)) return false;
      throw e;
    }
  }

  presign(key: string, opts: PresignOptions) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: opts.contentDisposition,
        ...(opts.contentType ? { ResponseContentType: opts.contentType } : {}),
      }),
      { expiresIn: opts.ttlSeconds },
    );
  }
}
