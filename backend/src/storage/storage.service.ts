import * as crypto from 'crypto';
import * as os from 'os';
import * as path from 'path';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { resolveJwtSecret } from '../auth/jwt-secret';
import { LocalDriver, S3Config, S3Driver, StorageDriver, StoredObject } from './drivers';
import { assertSafeKey, UnsafeKeyError } from './keys';

export type StorageConfig =
  | { driver: 'local'; dir: string }
  | { driver: 's3'; s3: S3Config };

/**
 * STORAGE_DRIVER=s3    → any S3 API: Cloudflare R2 today (S3_ENDPOINT=https://<acct>.r2.cloudflarestorage.com,
 *                        S3_REGION=auto), AWS S3 later by dropping S3_ENDPOINT. Config only, no code change.
 * STORAGE_DRIVER=local → files under STORAGE_DIR (default ./storage, or a temp dir under NODE_ENV=test).
 *
 * Production refuses `local` unless STORAGE_ALLOW_LOCAL=1: local disk is per-container (a second API
 * instance or a redeploy without the volume silently loses every Aadhaar/birth certificate), and it is
 * not covered by the database backup or by any off-site copy. The single-server compose stack opts in
 * because it mounts a persistent volume; anything bigger must use object storage.
 */
export function resolveStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const driver = (env.STORAGE_DRIVER || 'local').toLowerCase();
  if (driver === 's3') {
    const bucket = env.S3_BUCKET;
    if (!bucket) throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET');
    if (env.NODE_ENV === 'production' && (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)) {
      throw new Error('STORAGE_DRIVER=s3 requires S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY in production');
    }
    return {
      driver: 's3',
      s3: {
        endpoint: env.S3_ENDPOINT || undefined,
        region: env.S3_REGION || (env.S3_ENDPOINT ? 'auto' : 'ap-south-1'),
        bucket,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        forcePathStyle: ['1', 'true', 'yes'].includes(String(env.S3_FORCE_PATH_STYLE ?? '').toLowerCase()),
      },
    };
  }
  if (driver !== 'local') throw new Error(`Unknown STORAGE_DRIVER "${driver}" (use "local" or "s3")`);
  if (env.NODE_ENV === 'production' && env.STORAGE_ALLOW_LOCAL !== '1') {
    throw new Error(
      'STORAGE_DRIVER=local is refused in production: documents would live on one container disk with no off-site copy. ' +
        'Configure STORAGE_DRIVER=s3 (R2/S3), or set STORAGE_ALLOW_LOCAL=1 on a single server with a persistent volume.',
    );
  }
  const dir = env.STORAGE_DIR
    ? path.resolve(env.STORAGE_DIR)
    : env.NODE_ENV === 'test'
      ? path.join(os.tmpdir(), 'genesis-erp-storage-test')
      : path.resolve(process.cwd(), 'storage');
  return { driver: 'local', dir };
}

interface TokenPayload {
  k: string; // key
  e: number; // expiry, unix seconds
  n: string; // download file name
  d: 'inline' | 'attachment';
  m?: string; // content type to serve
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function contentDisposition(kind: 'inline' | 'attachment', fileName: string) {
  const ascii = fileName.replace(/[^A-Za-z0-9._-]/g, '_') || 'file';
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export interface SignedUrlOptions {
  inline?: boolean;
  /** Content type to serve the object as (defaults to what was stored). */
  mime?: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger('Storage');
  readonly driver: StorageDriver;
  readonly defaultTtl: number;
  private readonly secret: string;
  private readonly publicBase: string;

  constructor() {
    const cfg = resolveStorageConfig();
    this.driver = cfg.driver === 's3' ? new S3Driver(cfg.s3) : new LocalDriver(cfg.dir);
    this.secret = process.env.STORAGE_SIGNING_SECRET || resolveJwtSecret();
    this.defaultTtl = Math.min(3600, Math.max(30, Number(process.env.STORAGE_URL_TTL_SECONDS) || 300));
    this.publicBase = (process.env.STORAGE_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
    this.logger.log(cfg.driver === 's3' ? `S3 driver, bucket ${cfg.s3.bucket}${cfg.s3.endpoint ? ` @ ${cfg.s3.endpoint}` : ''}` : `local driver at ${cfg.dir}`);
  }

  get driverName() {
    return this.driver.name;
  }

  private key(key: string) {
    try {
      return assertSafeKey(key);
    } catch (e) {
      if (e instanceof UnsafeKeyError) throw new BadRequestException('Invalid storage key');
      throw e;
    }
  }

  async put(key: string, bytes: Buffer, mime: string) {
    return this.driver.put(this.key(key), bytes, mime);
  }

  async get(key: string): Promise<StoredObject> {
    const obj = await this.driver.get(this.key(key));
    if (!obj) throw new NotFoundException('File not found in storage');
    return obj;
  }

  async delete(key: string) {
    return this.driver.delete(this.key(key));
  }

  /** Best-effort delete (cleanup paths): logs instead of throwing. */
  async deleteQuietly(key: string | null | undefined) {
    if (!key) return;
    try {
      await this.delete(key);
    } catch (e) {
      this.logger.warn(`Could not delete ${key}: ${(e as Error).message}`);
    }
  }

  async copy(from: string, to: string) {
    return this.driver.copy(this.key(from), this.key(to));
  }

  async exists(key: string) {
    return this.driver.exists(this.key(key));
  }

  /**
   * Short-lived URL that downloads the object without the API token.
   * S3/R2: a presigned GET. Local: /api/files/<payload>.<hmac>, verified by FilesController.
   */
  async signedUrl(key: string, ttlSeconds = this.defaultTtl, downloadName = 'file', opts: SignedUrlOptions = {}) {
    this.key(key);
    const ttl = Math.min(3600, Math.max(1, Math.floor(ttlSeconds)));
    const expiresAt = new Date(Date.now() + ttl * 1000);
    const disposition: 'inline' | 'attachment' = opts.inline ? 'inline' : 'attachment';
    if (this.driver.presign) {
      const url = await this.driver.presign(key, {
        ttlSeconds: ttl,
        contentDisposition: contentDisposition(disposition, downloadName),
        contentType: opts.mime,
      });
      return { url, expires_at: expiresAt };
    }
    const payload: TokenPayload = { k: key, e: Math.floor(expiresAt.getTime() / 1000), n: downloadName, d: disposition, ...(opts.mime ? { m: opts.mime } : {}) };
    const body = b64url(JSON.stringify(payload));
    return { url: `${this.publicBase}/api/files/${body}.${this.sign(body)}`, expires_at: expiresAt };
  }

  private sign(body: string) {
    return crypto.createHmac('sha256', this.secret).update(`genesis-file:${body}`).digest('base64url');
  }

  /** Verifies a local signed-URL token. Tampered, malformed or expired → 403. */
  verifyToken(token: string): TokenPayload {
    const [body, sig, extra] = String(token ?? '').split('.');
    if (!body || !sig || extra !== undefined || token.length > 2048) throw new ForbiddenException('Invalid file link');
    const expected = Buffer.from(this.sign(body));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) throw new ForbiddenException('Invalid file link');
    let p: TokenPayload;
    try {
      p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      throw new ForbiddenException('Invalid file link');
    }
    if (typeof p?.k !== 'string' || typeof p.e !== 'number') throw new ForbiddenException('Invalid file link');
    if (p.e * 1000 <= Date.now()) throw new ForbiddenException('This file link has expired');
    return p;
  }
}
