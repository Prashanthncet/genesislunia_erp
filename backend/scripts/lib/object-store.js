/**
 * Plain-JS object store for the ops scripts (they run in the production image, which has
 * no ts-node). Mirrors src/storage/{keys,drivers,storage.service}.ts: same env vars, same
 * key layout, same local on-disk format (<root>/<key> + <key>.meta.json). Keep in sync.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const KEY_RE = /^[A-Za-z0-9._\-/]+$/;
const META_SUFFIX = '.meta.json';

function safeName(name) {
  const base = String(name == null ? '' : name).split(/[/\\]/).pop() || '';
  let s = base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/\.{2,}/g, '_').replace(/^[.]+/, '');
  if (s.length > 80) {
    const dot = s.lastIndexOf('.');
    const ext = dot > 0 && s.length - dot <= 10 ? s.slice(dot) : '';
    s = s.slice(0, 80 - ext.length) + ext;
  }
  return s || 'file';
}

function safeId(id) {
  if (!ID_RE.test(String(id == null ? '' : id))) throw new Error(`Unsafe id for a storage key: ${JSON.stringify(id)}`);
  return id;
}

function assertSafeKey(key) {
  if (typeof key !== 'string' || !key || key.length > 512 || !KEY_RE.test(key) || key.startsWith('/')) {
    throw new Error(`Unsafe storage key: ${JSON.stringify(key)}`);
  }
  for (const seg of key.split('/')) if (!seg || seg === '.' || seg === '..') throw new Error(`Unsafe storage key: ${JSON.stringify(key)}`);
  return key;
}

const admissionDocKey = (b, a, d, f) => `branches/${safeId(b)}/admissions/${safeId(a)}/${safeId(d)}-${safeName(f)}`;
const studentDocPrefix = (b, s) => `branches/${safeId(b)}/students/${safeId(s)}/documents/`;
const studentDocKey = (b, s, d, f) => `${studentDocPrefix(b, s)}${safeId(d)}-${safeName(f)}`;

function s3ConfigFromEnv(env, bucket) {
  return {
    endpoint: env.S3_ENDPOINT || undefined,
    region: env.S3_REGION || (env.S3_ENDPOINT ? 'auto' : 'ap-south-1'),
    bucket,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: ['1', 'true', 'yes'].includes(String(env.S3_FORCE_PATH_STYLE || '').toLowerCase()),
  };
}

class LocalStore {
  constructor(root) {
    this.name = 'local';
    this.root = path.resolve(root);
  }
  file(key) {
    assertSafeKey(key);
    if (key.endsWith(META_SUFFIX)) throw new Error('Reserved key suffix');
    const p = path.resolve(this.root, ...key.split('/'));
    if (!p.startsWith(this.root + path.sep)) throw new Error(`Key escapes the storage root: ${key}`);
    return p;
  }
  async put(key, bytes, mime) {
    const p = this.file(key);
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.writeFile(tmp, bytes);
    await fs.promises.rename(tmp, p);
    await fs.promises.writeFile(p + META_SUFFIX, JSON.stringify({ mime }));
  }
  async size(key) {
    try {
      return (await fs.promises.stat(this.file(key))).size;
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }
  async get(key) {
    try {
      return await fs.promises.readFile(this.file(key));
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }
  async copy(from, to) {
    const bytes = await this.get(from);
    if (!bytes) throw new Error(`Source object not found: ${from}`);
    let mime = 'application/octet-stream';
    try { mime = JSON.parse(await fs.promises.readFile(this.file(from) + META_SUFFIX, 'utf8')).mime || mime; } catch { /* no sidecar */ }
    await this.put(to, bytes, mime);
  }
  async delete(key) {
    const p = this.file(key);
    await fs.promises.rm(p, { force: true });
    await fs.promises.rm(p + META_SUFFIX, { force: true });
  }
}

class S3Store {
  constructor(cfg) {
    const { S3Client } = require('@aws-sdk/client-s3');
    this.name = 's3';
    this.bucket = cfg.bucket;
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle,
      credentials: cfg.accessKeyId && cfg.secretAccessKey ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey } : undefined,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    this.cmd = require('@aws-sdk/client-s3');
  }
  async put(key, bytes, mime) {
    assertSafeKey(key);
    await this.client.send(new this.cmd.PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: mime, ContentLength: bytes.length }));
  }
  /** Object size via HEAD, null when missing. */
  async size(key) {
    try {
      const r = await this.client.send(new this.cmd.HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return Number(r.ContentLength);
    } catch (e) {
      if (e && (e.name === 'NotFound' || (e.$metadata && e.$metadata.httpStatusCode === 404))) return null;
      throw e;
    }
  }
  async get(key) {
    try {
      const r = await this.client.send(new this.cmd.GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return Buffer.from(await r.Body.transformToByteArray());
    } catch (e) {
      if (e && (e.name === 'NoSuchKey' || (e.$metadata && e.$metadata.httpStatusCode === 404))) return null;
      throw e;
    }
  }
  async copy(from, to) {
    assertSafeKey(from);
    assertSafeKey(to);
    const src = `${this.bucket}/${from.split('/').map(encodeURIComponent).join('/')}`;
    await this.client.send(new this.cmd.CopyObjectCommand({ Bucket: this.bucket, Key: to, CopySource: src }));
  }
  async delete(key) {
    await this.client.send(new this.cmd.DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  /** All keys under a prefix (paginated). */
  async list(prefix) {
    const keys = [];
    let token;
    do {
      const r = await this.client.send(new this.cmd.ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }));
      for (const o of r.Contents || []) keys.push({ key: o.Key, size: Number(o.Size) });
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }
}

/** Same rules as resolveStorageConfig() in src/storage/storage.service.ts. */
function storeFromEnv(env = process.env) {
  const driver = String(env.STORAGE_DRIVER || 'local').toLowerCase();
  if (driver === 's3') {
    if (!env.S3_BUCKET) throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET');
    return new S3Store(s3ConfigFromEnv(env, env.S3_BUCKET));
  }
  if (driver !== 'local') throw new Error(`Unknown STORAGE_DRIVER "${driver}"`);
  if (env.NODE_ENV === 'production' && env.STORAGE_ALLOW_LOCAL !== '1') {
    throw new Error('STORAGE_DRIVER=local is refused in production unless STORAGE_ALLOW_LOCAL=1');
  }
  const dir = env.STORAGE_DIR
    ? path.resolve(env.STORAGE_DIR)
    : env.NODE_ENV === 'test' ? path.join(os.tmpdir(), 'genesis-erp-storage-test') : path.resolve(process.cwd(), 'storage');
  return new LocalStore(dir);
}

module.exports = {
  LocalStore, S3Store, storeFromEnv, s3ConfigFromEnv,
  safeName, safeId, assertSafeKey, admissionDocKey, studentDocKey, studentDocPrefix,
};
