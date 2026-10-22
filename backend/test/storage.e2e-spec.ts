import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ThrottlerStorage } from '@nestjs/throttler';
import { CreateBucketCommand, HeadObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService, resolveStorageConfig } from '../src/storage/storage.service';
import { admissionDocKey, safeName } from '../src/storage/keys';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const S3rver = require('s3rver');

/**
 * Document storage (plan §2.4/2.6): local driver + S3 driver (in-process s3rver speaking the
 * real S3 HTTP API), signed URLs, Student-DMS archive at principal sign-off, magic-byte
 * checks, the legacy-row migration script and off-site DB backups.
 */

const BACKEND = path.join(__dirname, '..');
const PNG_BYTES = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARAAI/wH+p6cSAAAAAElFTkSuQmCC', 'base64');
const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const dataUrl = (mime: string, b: Buffer) => `data:${mime};base64,${b.toString('base64')}`;

const LOGINS = {
  ao: ['ao@sainik01.edu', 'Demo@Ao1'],
  os: ['os@sainik01.edu', 'Demo@Os1'],
  accounts: ['accounts@sainik01.edu', 'Demo@Accounts1'],
  vp: ['vp@sainik01.edu', 'Demo@Vp1'],
  principal: ['principal@sainik01.edu', 'Demo@Principal1'],
  teacher: ['teacher@sainik01.edu', 'Demo@Teacher1'],
  otherParent: ['parent@sainik01.edu', 'Demo@Parent1'],
  green: ['admin@greenfield02.edu', 'Demo@Green1'],
} as const;
type Who = keyof typeof LOGINS;

const FORM = {
  student_name: 'Storage Test Child',
  date_of_birth: '2015-04-12',
  fathers_name: 'Arun Rao',
  mothers_name: 'Lata Rao',
  aadhaar_number: '123412341234',
  class_id: 'cls_06a',
};

const STORAGE_ENV = ['STORAGE_DRIVER', 'STORAGE_DIR', 'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_FORCE_PATH_STYLE'];

async function boot(env: Record<string, string>) {
  for (const k of STORAGE_ENV) delete process.env[k];
  Object.assign(process.env, env);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ThrottlerStorage)
    .useValue({ increment: async () => ({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }) })
    .compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

/** Runs a node script without blocking the event loop (s3rver lives in this process). */
function runNode(script: string, args: string[], env: Record<string, string | undefined>) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const p = spawn(process.execPath, [script, ...args], { cwd: BACKEND, env: { ...process.env, ...env } });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr += d));
    p.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

function lastJson(out: string) {
  const lines = out.trim().split(/\r?\n/).filter((l) => l.startsWith('{'));
  return JSON.parse(lines[lines.length - 1]);
}

// ─── s3rver (shared by the S3 suites) ───────────────────────────

let s3rver: any;
let s3Port = 0;
let s3Dir = '';
const S3_CREDS = { S3_REGION: 'us-east-1', S3_ACCESS_KEY_ID: 'S3RVER', S3_SECRET_ACCESS_KEY: 'S3RVER', S3_FORCE_PATH_STYLE: '1' };
const s3Client = () =>
  new S3Client({
    region: 'us-east-1',
    endpoint: `http://127.0.0.1:${s3Port}`,
    forcePathStyle: true,
    credentials: { accessKeyId: 'S3RVER', secretAccessKey: 'S3RVER' },
  });

beforeAll(async () => {
  s3Dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-s3rver-'));
  s3rver = new S3rver({ port: 0, address: '127.0.0.1', silent: true, directory: s3Dir });
  const info = await s3rver.run();
  s3Port = info.port;
  const c = s3Client();
  await c.send(new CreateBucketCommand({ Bucket: 'erp-docs' }));
  await c.send(new CreateBucketCommand({ Bucket: 'erp-backups' }));
});

afterAll(async () => {
  await s3rver?.close();
  fs.rmSync(s3Dir, { recursive: true, force: true });
});

// ─── Config rules ───────────────────────────────────────────────

describe('storage config', () => {
  it('production refuses the local driver unless STORAGE_ALLOW_LOCAL=1; s3 needs bucket + creds', () => {
    expect(() => resolveStorageConfig({ NODE_ENV: 'production' })).toThrow(/refused in production/);
    expect(resolveStorageConfig({ NODE_ENV: 'production', STORAGE_ALLOW_LOCAL: '1', STORAGE_DIR: '/data/storage' }).driver).toBe('local');
    expect(() => resolveStorageConfig({ STORAGE_DRIVER: 's3' })).toThrow(/S3_BUCKET/);
    expect(() => resolveStorageConfig({ NODE_ENV: 'production', STORAGE_DRIVER: 's3', S3_BUCKET: 'b' })).toThrow(/S3_ACCESS_KEY_ID/);
    const r2 = resolveStorageConfig({ STORAGE_DRIVER: 's3', S3_BUCKET: 'b', S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com' });
    expect(r2).toMatchObject({ driver: 's3', s3: { region: 'auto', bucket: 'b' } });
    expect(() => resolveStorageConfig({ STORAGE_DRIVER: 'ftp' })).toThrow(/Unknown STORAGE_DRIVER/);
  });

  it('key helpers neutralise user-controlled names and reject unsafe ids', () => {
    expect(safeName('../../etc/passwd')).toBe('passwd');
    expect(safeName('..\\..\\boot.ini')).toBe('boot.ini');
    expect(safeName('my scan (1).pdf')).toBe('my_scan__1_.pdf');
    expect(safeName('...')).not.toContain('..');
    expect(safeName('')).toBe('file');
    expect(() => admissionDocKey('sainik01', '../x', 'd1', 'a.png')).toThrow();
    expect(admissionDocKey('sainik01', 'app1', 'doc1', '../a.png')).toBe('branches/sainik01/admissions/app1/doc1-a.png');
  });
});

// ─── Local driver: service + signed URL endpoint ────────────────

describe('local driver', () => {
  let app: INestApplication;
  let server: any;
  let storage: StorageService;
  let dir: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-storage-local-'));
    app = await boot({ STORAGE_DRIVER: 'local', STORAGE_DIR: dir });
    server = app.getHttpServer();
    storage = app.get(StorageService);
  });
  afterAll(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('put / get / exists / copy / delete', async () => {
    expect(storage.driverName).toBe('local');
    await storage.put('t/a.pdf', PDF_BYTES, 'application/pdf');
    expect(fs.existsSync(path.join(dir, 't', 'a.pdf'))).toBe(true);
    expect(await storage.exists('t/a.pdf')).toBe(true);
    const got = await storage.get('t/a.pdf');
    expect(got.bytes.equals(PDF_BYTES)).toBe(true);
    expect(got.mime).toBe('application/pdf');
    await storage.copy('t/a.pdf', 't/b.pdf');
    expect((await storage.get('t/b.pdf')).bytes.equals(PDF_BYTES)).toBe(true);
    await storage.delete('t/a.pdf');
    expect(await storage.exists('t/a.pdf')).toBe(false);
    await expect(storage.get('t/a.pdf')).rejects.toMatchObject({ status: 404 });
  });

  it('signed URL downloads without a bearer token; tampered or expired → 403', async () => {
    await storage.put('t/c.png', PNG_BYTES, 'image/png');
    const { url, expires_at } = await storage.signedUrl('t/c.png', 60, 'photo.png');
    expect(url).toMatch(/^\/api\/files\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(expires_at.getTime()).toBeGreaterThan(Date.now());
    const ok = await request(server).get(url).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toBe('image/png');
    expect(ok.headers['content-disposition']).toContain('attachment; filename="photo.png"');
    expect(ok.headers['x-content-type-options']).toBe('nosniff');
    expect((ok.body as Buffer).equals(PNG_BYTES)).toBe(true);

    const [body, sig] = url.slice('/api/files/'.length).split('.');
    const flip = (s: string) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
    expect((await request(server).get(`/api/files/${body}.${flip(sig)}`)).status).toBe(403);
    // re-pointing the token at another key without re-signing
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), k: 't/b.pdf' })).toString('base64url');
    expect((await request(server).get(`/api/files/${forged}.${sig}`)).status).toBe(403);
    expect((await request(server).get('/api/files/garbage')).status).toBe(403);

    const spy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
    try {
      expect((await request(server).get(url)).status).toBe(403);
    } finally {
      spy.mockRestore();
    }
    expect((await request(server).get(url)).status).toBe(200);
  });

  it('path traversal is rejected before touching the disk', async () => {
    for (const bad of ['../evil.txt', 't/../../evil.txt', '/abs.txt', 't\\..\\evil.txt', 't//x', 't/./x', 'x.meta.json']) {
      await expect(storage.put(bad, PDF_BYTES, 'application/pdf')).rejects.toBeDefined();
    }
    await expect(storage.signedUrl('../../etc/passwd', 60, 'x')).rejects.toMatchObject({ status: 400 });
    expect(fs.existsSync(path.join(dir, '..', 'evil.txt'))).toBe(false);
  });
});

// ─── Admissions + students documents end-to-end, per driver ─────

type Driver = 'local' | 's3';

describe.each<Driver>(['local', 's3'])('documents end-to-end via the API (%s driver)', (driver) => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;
  let storage: StorageService;
  let dir = '';
  const tok: Partial<Record<Who, string>> = {};
  const as = (who: Who) => ({
    get: (u: string) => request(server).get(u).set('Authorization', `Bearer ${tok[who]}`),
    post: (u: string, b?: object) => request(server).post(u).set('Authorization', `Bearer ${tok[who]}`).send(b ?? {}),
    del: (u: string) => request(server).delete(u).set('Authorization', `Bearer ${tok[who]}`),
  });
  const pub = {
    post: (t: string, p: string, b?: object) => request(server).post(`/api/admissions/public/${t}/${p}`).send(b ?? {}),
    del: (t: string, p: string) => request(server).delete(`/api/admissions/public/${t}/${p}`),
  };

  /** Fetches a signed URL the way a browser would (no Authorization header). */
  async function fetchSigned(url: string): Promise<{ status: number; bytes: Buffer; type: string | null }> {
    if (url.startsWith('/')) {
      const r = await request(server).get(url).buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      return { status: r.status, bytes: r.body as Buffer, type: r.headers['content-type'] ?? null };
    }
    const r = await fetch(url);
    return { status: r.status, bytes: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') };
  }

  const ids: { app?: string; token?: string; photo?: string; pdf?: string; receipt?: string; student?: string } = {};

  beforeAll(async () => {
    if (driver === 'local') {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-storage-e2e-'));
      app = await boot({ STORAGE_DRIVER: 'local', STORAGE_DIR: dir });
    } else {
      app = await boot({ STORAGE_DRIVER: 's3', S3_ENDPOINT: `http://127.0.0.1:${s3Port}`, S3_BUCKET: 'erp-docs', ...S3_CREDS });
    }
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
    for (const [who, [email, password]] of Object.entries(LOGINS)) {
      const res = await request(server).post('/api/auth/login').send({ email, password });
      expect(res.status).toBe(200);
      tok[who as Who] = res.body.token;
    }
  });
  afterAll(async () => {
    await app.close();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('uses the configured driver', () => {
    expect(storage.driverName).toBe(driver);
  });

  it('parent upload goes to storage (no base64 in the DB); magic bytes are enforced', async () => {
    const inv = await as('ao').post('/api/admissions/trigger-links', {
      parents: [{ parent_name: `Store ${driver}`, parent_email: `store-${driver}@test.com`, parent_contact: '9876500000' }],
    });
    expect(inv.status).toBe(201);
    ids.app = inv.body.generated[0].id;
    ids.token = inv.body.generated[0].token;
    const t = ids.token!;

    // HTML disguised as a PNG (declared mime + extension say png, bytes say otherwise)
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    expect((await pub.post(t, 'documents', { doc_type: 'photo', file_name: 'photo.png', data_url: dataUrl('image/png', html) })).status).toBe(400);
    // a real JPEG declared as PNG
    const mism = await pub.post(t, 'documents', { doc_type: 'photo', file_name: 'photo.png', data_url: dataUrl('image/png', JPEG_BYTES) });
    expect(mism.status).toBe(400);
    expect(mism.body.message).toMatch(/JPEG/);
    // PDF bytes with a .png name
    expect((await pub.post(t, 'documents', { doc_type: 'photo', file_name: 'x.png', data_url: dataUrl('application/pdf', PDF_BYTES) })).status).toBe(400);

    const photo = await pub.post(t, 'documents', { doc_type: 'photo', file_name: 'my photo.png', data_url: dataUrl('image/png', PNG_BYTES) });
    expect(photo.status).toBe(201);
    ids.photo = photo.body.id;
    const pdf = await pub.post(t, 'documents', { doc_type: 'birth_certificate', file_name: 'bc.pdf', data_url: dataUrl('application/pdf', PDF_BYTES) });
    expect(pdf.status).toBe(201);
    ids.pdf = pdf.body.id;
    const extra = await pub.post(t, 'documents', { doc_type: 'other', file_name: 'extra.jpg', data_url: dataUrl('image/jpeg', JPEG_BYTES) });
    expect(extra.status).toBe(201);

    const row = await prisma.admissionDocument.findUniqueOrThrow({ where: { id: ids.photo } });
    expect(row.dataUrl).toBeNull();
    expect(row.mimeType).toBe('image/png');
    expect(row.sizeBytes).toBe(PNG_BYTES.length);
    expect(row.storageKey).toBe(`branches/sainik01/admissions/${ids.app}/${ids.photo}-my_photo.png`);
    expect(await storage.exists(row.storageKey!)).toBe(true);

    // parent removes a document → object deleted too
    const extraRow = await prisma.admissionDocument.findUniqueOrThrow({ where: { id: extra.body.id } });
    expect((await pub.del(t, `documents/${extra.body.id}`)).status).toBe(200);
    expect(await storage.exists(extraRow.storageKey!)).toBe(false);

    expect((await pub.post(t, 'submit', { ...FORM, student_name: `Storage ${driver}` })).status).toBe(201);
  });

  it('staff upload + signed download URL (no data_url); wrong role 403, other school 404', async () => {
    const up = await as('ao').post(`/api/admissions/${ids.app}/documents`, { doc_type: 'aadhaar', file_name: 'aadhaar.pdf', data_url: dataUrl('application/pdf', PDF_BYTES) });
    expect(up.status).toBe(201);
    expect((await as('ao').post(`/api/admissions/${ids.app}/documents`, { doc_type: 'aadhaar', file_name: 'a.pdf', data_url: dataUrl('application/pdf', Buffer.from('<html>')) })).status).toBe(400);

    const list = await as('ao').get(`/api/admissions/${ids.app}/documents`);
    expect(list.body.map((d: any) => d.id)).toEqual(expect.arrayContaining([ids.photo, ids.pdf, up.body.id]));
    expect(JSON.stringify(list.body)).not.toContain('base64');

    const dl = await as('ao').get(`/api/admissions/documents/${ids.photo}/download`);
    expect(dl.status).toBe(200);
    expect(dl.body).toMatchObject({ id: ids.photo, file_name: 'my photo.png', mime_type: 'image/png' });
    expect(dl.body.data_url).toBeUndefined();
    expect(new Date(dl.body.expires_at).getTime()).toBeGreaterThan(Date.now());
    if (driver === 's3') expect(dl.body.url).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:${s3Port}/erp-docs/branches/sainik01/admissions/.*X-Amz-Signature=`));
    const got = await fetchSigned(dl.body.url);
    expect(got.status).toBe(200);
    expect(got.bytes.equals(PNG_BYTES)).toBe(true);
    expect(got.type).toContain('image/png');

    expect((await as('teacher').get(`/api/admissions/documents/${ids.photo}/download`)).status).toBe(403);
    expect((await as('green').get(`/api/admissions/documents/${ids.photo}/download`)).status).toBe(404);

    // staff delete removes the object
    const row = await prisma.admissionDocument.findUniqueOrThrow({ where: { id: up.body.id } });
    expect((await as('ao').del(`/api/admissions/documents/${up.body.id}`)).status).toBe(200);
    expect(await storage.exists(row.storageKey!)).toBe(false);
  });

  it('legacy inline rows still download through data_url', async () => {
    const legacy = await prisma.admissionDocument.create({
      data: { branchId: 'sainik01', admissionId: ids.app, docType: 'marksheet', fileName: 'old.png', dataUrl: dataUrl('image/png', PNG_BYTES), sizeBytes: PNG_BYTES.length },
    });
    const dl = await as('ao').get(`/api/admissions/documents/${legacy.id}/download`);
    expect(dl.status).toBe(200);
    expect(dl.body.url).toBeNull();
    expect(dl.body.data_url).toContain('base64');
    expect(dl.body.mime_type).toBe('image/png');
  });

  it('receipt upload at fee verification is stored as an object', async () => {
    expect((await as('ao').post(`/api/admissions/${ids.app}/validate`, { is_valid: true })).status).toBe(201);
    expect((await as('accounts').post(`/api/admissions/${ids.app}/pay`, { reference_no: `CASH-${driver}`, payment_mode: 'Cash' })).status).toBe(201);
    const bad = await as('accounts').post(`/api/admissions/${ids.app}/verify-receipt`, {
      receipt_no: `RCPT-STORE-${driver}-X`, receipt: { file_name: 'receipt.pdf', data_url: dataUrl('application/pdf', Buffer.from('not a pdf')) },
    });
    expect(bad.status).toBe(400);
    const res = await as('accounts').post(`/api/admissions/${ids.app}/verify-receipt`, {
      receipt_no: `RCPT-STORE-${driver}`, receipt: { file_name: 'receipt.pdf', data_url: dataUrl('application/pdf', PDF_BYTES) },
    });
    expect(res.status).toBe(201);
    const adm = await prisma.admission.findUniqueOrThrow({ where: { id: ids.app } });
    const doc = await prisma.admissionDocument.findUniqueOrThrow({ where: { id: adm.receiptDocId! } });
    ids.receipt = doc.id;
    expect(doc.dataUrl).toBeNull();
    expect(doc.docType).toBe('fee_receipt');
    expect(doc.storageKey).toMatch(new RegExp(`^branches/sainik01/admissions/${ids.app}/${doc.id}-receipt\\.pdf$`));
    expect((await storage.get(doc.storageKey!)).bytes.equals(PDF_BYTES)).toBe(true);
  });

  it('principal sign-off archives every document into the per-student DMS folder', async () => {
    expect((await as('os').post(`/api/admissions/${ids.app}/allocate`, { class_id: 'cls_06a' })).status).toBe(201);
    expect((await as('vp').post(`/api/admissions/${ids.app}/vp-approve`)).status).toBe(201);
    const before = await prisma.admissionDocument.findMany({ where: { admissionId: ids.app } });
    const oldKeys = before.map((d) => d.storageKey).filter(Boolean) as string[];

    const sign = await as('principal').post(`/api/admissions/${ids.app}/principal-approve`, { signature_name: 'Principal' });
    expect(sign.status).toBe(201);
    ids.student = sign.body.student_id;
    expect(sign.body.documents_moved).toBe(before.length); // photo, bc, legacy marksheet, receipt
    expect(sign.body.documents_move_failed).toBe(0);

    const prefix = `branches/sainik01/students/${ids.student}/documents/`;
    const after = await prisma.admissionDocument.findMany({ where: { admissionId: ids.app } });
    for (const d of after) {
      expect(d.studentId).toBe(ids.student);
      expect(d.dataUrl).toBeNull();
      expect(d.storageKey).toBe(`${prefix}${d.id}-${safeName(d.fileName)}`);
      expect(await storage.exists(d.storageKey!)).toBe(true);
    }
    for (const k of oldKeys) expect(await storage.exists(k)).toBe(false);

    if (driver === 's3') {
      const c = s3Client();
      const listed = await c.send(new ListObjectsV2Command({ Bucket: 'erp-docs', Prefix: prefix }));
      expect((listed.Contents ?? []).map((o) => o.Key).sort()).toEqual(after.map((d) => d.storageKey).sort());
      const leftover = await c.send(new ListObjectsV2Command({ Bucket: 'erp-docs', Prefix: `branches/sainik01/admissions/${ids.app}/` }));
      expect(leftover.KeyCount ?? 0).toBe(0);
    } else {
      expect(fs.readdirSync(path.join(dir, 'branches', 'sainik01', 'students', ids.student!, 'documents')).filter((f) => !f.endsWith('.meta.json')).length).toBe(after.length);
    }
  });

  it('student DMS: signed URL + proxy download; portal/teacher 403, other school 404', async () => {
    const sid = ids.student!;
    const prof = await as('os').get(`/api/students/${sid}/profile`);
    expect(prof.status).toBe(200);
    expect(prof.body.documents.map((d: any) => d.id)).toEqual(expect.arrayContaining([ids.photo, ids.pdf, ids.receipt]));

    const u = await as('os').get(`/api/students/${sid}/documents/${ids.pdf}/url`);
    expect(u.status).toBe(200);
    expect(u.body).toMatchObject({ file_name: 'bc.pdf', mime_type: 'application/pdf' });
    expect(u.body.url).toEqual(expect.any(String));
    const got = await fetchSigned(u.body.url);
    expect(got.status).toBe(200);
    expect(got.bytes.equals(PDF_BYTES)).toBe(true);

    const proxied = await as('os').get(`/api/students/${sid}/documents/${ids.photo}`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(proxied.status).toBe(200);
    expect((proxied.body as Buffer).equals(PNG_BYTES)).toBe(true);

    expect((await as('teacher').get(`/api/students/${sid}/documents/${ids.pdf}/url`)).status).toBe(403);
    expect((await as('otherParent').get(`/api/students/${sid}/documents/${ids.pdf}/url`)).status).toBe(403);
    expect((await as('green').get(`/api/students/${sid}/documents/${ids.pdf}/url`)).status).toBe(404);

    // ID card embeds the archived PNG photo read back from storage
    const card = await as('os').get(`/api/students/${sid}/export/id-card.pdf`);
    expect(card.status).toBe(200);
    expect(card.headers['content-type']).toContain('application/pdf');
  });

  it('migration script moves legacy inline rows into this store (dry run first, idempotent)', async () => {
    const legacy = await prisma.admissionDocument.create({
      data: { branchId: 'sainik01', studentId: 'stu_001', docType: 'birth_certificate', fileName: 'legacy bc.pdf', dataUrl: dataUrl('application/pdf', PDF_BYTES), sizeBytes: 1 },
    });
    const broken = await prisma.admissionDocument.create({
      data: { branchId: 'sainik01', studentId: 'stu_001', docType: 'other', fileName: 'broken.png', dataUrl: 'not-a-data-url', sizeBytes: 1 },
    });
    const env = driver === 'local'
      ? { STORAGE_DRIVER: 'local', STORAGE_DIR: dir }
      : { STORAGE_DRIVER: 's3', S3_ENDPOINT: `http://127.0.0.1:${s3Port}`, S3_BUCKET: 'erp-docs', ...S3_CREDS };
    const script = path.join('scripts', 'migrate-documents-to-storage.js');

    const dry = await runNode(script, ['--dry-run'], env);
    expect(dry.code).toBe(0);
    const dryOut = lastJson(dry.stdout);
    expect(dryOut).toMatchObject({ dry_run: true, driver });
    expect(dryOut.migrated).toBeGreaterThanOrEqual(1);
    expect((await prisma.admissionDocument.findUniqueOrThrow({ where: { id: legacy.id } })).dataUrl).not.toBeNull();

    const run = await runNode(script, [], env);
    expect(run.code).toBe(0);
    const out = lastJson(run.stdout);
    expect(out.dry_run).toBe(false);
    expect(out.migrated).toBe(dryOut.migrated);
    expect(out.malformed).toBe(1);
    const row = await prisma.admissionDocument.findUniqueOrThrow({ where: { id: legacy.id } });
    expect(row.dataUrl).toBeNull();
    expect(row.mimeType).toBe('application/pdf');
    expect(row.sizeBytes).toBe(PDF_BYTES.length);
    expect(row.storageKey).toBe(`branches/sainik01/students/stu_001/documents/${legacy.id}-legacy_bc.pdf`);
    expect((await storage.get(row.storageKey!)).bytes.equals(PDF_BYTES)).toBe(true);
    expect((await prisma.admissionDocument.findUniqueOrThrow({ where: { id: broken.id } })).dataUrl).toBe('not-a-data-url');

    const again = lastJson((await runNode(script, [], env)).stdout);
    expect(again.migrated).toBe(0);

    const dl = await as('os').get(`/api/students/stu_001/documents/${legacy.id}/url`);
    expect((await fetchSigned(dl.body.url)).bytes.equals(PDF_BYTES)).toBe(true);
    await prisma.admissionDocument.delete({ where: { id: broken.id } });
  });
});

// ─── Off-site DB backup to S3 ───────────────────────────────────

describe('backup-db.js off-site upload (s3rver)', () => {
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-backup-'));
  afterAll(() => fs.rmSync(backupDir, { recursive: true, force: true }));
  const env = (bucket: string) => ({
    BACKUP_DIR: backupDir,
    BACKUP_S3_BUCKET: bucket,
    BACKUP_KEEP_REMOTE: '1',
    S3_ENDPOINT: `http://127.0.0.1:${s3Port}`,
    ...S3_CREDS,
  });

  it('uploads the verified snapshot, HEAD size matches, remote retention applied', async () => {
    const script = path.join('scripts', 'backup-db.js');
    const first = await runNode(script, [], env('erp-backups'));
    expect(first.stderr).toBe('');
    expect(first.code).toBe(0);
    const o1 = lastJson(first.stdout).offsite;
    expect(o1).toMatchObject({ bucket: 'erp-backups', verified: 'head-size-match' });
    const local = path.join(backupDir, path.basename(o1.key));
    const head = await s3Client().send(new HeadObjectCommand({ Bucket: 'erp-backups', Key: o1.key }));
    expect(Number(head.ContentLength)).toBe(fs.statSync(local).size);
    expect(o1.bytes).toBe(fs.statSync(local).size);

    const second = await runNode(script, [], env('erp-backups'));
    expect(second.code).toBe(0);
    const o2 = lastJson(second.stdout).offsite;
    expect(o2.pruned_remote).toEqual([o1.key]);
    const listed = await s3Client().send(new ListObjectsV2Command({ Bucket: 'erp-backups', Prefix: 'backups/' }));
    expect((listed.Contents ?? []).map((c) => c.Key)).toEqual([o2.key]);
  });

  it('exits non-zero when the upload fails', async () => {
    const r = await runNode(path.join('scripts', 'backup-db.js'), [], env('no-such-bucket'));
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('"backup":"failed"');
  });
});
