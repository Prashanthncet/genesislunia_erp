import * as crypto from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ThrottlerStorage } from '@nestjs/throttler';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Admissions workflow (plan Phase 1 + 2) and online payments, driven by the correct
 * role at every step, with the wrong role / wrong school / wrong status checked too.
 */

const WEBHOOK_SECRET = 'whsec_e2e_test';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARAAI/wH+p6cSAAAAAElFTkSuQmCC';

const LOGINS = {
  admin: ['schooladmin@sainik01.edu', 'Demo@Admin1'],
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
  student_name: 'Kabir Test Rao',
  date_of_birth: '2015-04-12',
  fathers_name: 'Arun Rao',
  mothers_name: 'Lata Rao',
  aadhaar_number: '123412341234',
  class_id: 'cls_06a',
};

describe('Admissions workflow + payments (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;
  const tok: Partial<Record<Who, string>> = {};

  const as = (who: Who) => ({
    get: (u: string) => request(server).get(u).set('Authorization', `Bearer ${tok[who]}`),
    post: (u: string, b?: object) => request(server).post(u).set('Authorization', `Bearer ${tok[who]}`).send(b ?? {}),
    put: (u: string, b?: object) => request(server).put(u).set('Authorization', `Bearer ${tok[who]}`).send(b ?? {}),
    del: (u: string) => request(server).delete(u).set('Authorization', `Bearer ${tok[who]}`),
  });
  const pub = {
    get: (t: string) => request(server).get(`/api/admissions/public/${t}`),
    post: (t: string, path: string, b?: object) => request(server).post(`/api/admissions/public/${t}/${path}`).send(b ?? {}),
  };

  async function invite(name: string, email: string) {
    const res = await as('ao').post('/api/admissions/trigger-links', {
      parents: [{ parent_name: name, parent_email: email, parent_contact: '9876500000' }],
    });
    expect(res.status).toBe(201);
    return res.body.generated[0] as { id: string; token: string; login_id: string; password: string };
  }
  async function toValidated(name: string, email: string) {
    const g = await invite(name, email);
    expect((await pub.post(g.token, 'submit', { ...FORM, student_name: name })).status).toBe(201);
    expect((await as('ao').post(`/api/admissions/${g.id}/validate`, { is_valid: true })).status).toBe(201);
    return g;
  }
  const statusOf = async (id: string) => (await prisma.admission.findUniqueOrThrow({ where: { id } })).status;

  beforeAll(async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    // This suite fires a few hundred requests from one IP within a minute; rate limits are
    // not what it tests, so the throttler counter is stubbed (guards and routes stay real).
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue({ increment: async () => ({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }) })
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    for (const [who, [email, password]] of Object.entries(LOGINS)) {
      const res = await request(server).post('/api/auth/login').send({ email, password });
      expect(res.status).toBe(200);
      tok[who as Who] = res.body.token;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Field template ────────────────────────────────────────

  describe('field template approval', () => {
    const Y = '2031-32';

    it('AO builds a draft, OS rejects with remarks, AO fixes, OS publishes; published is locked', async () => {
      expect((await as('teacher').get(`/api/admissions/fields?academic_year=${Y}`)).status).toBe(403);
      expect((await as('teacher').post('/api/admissions/fields', { label: 'X', field_type: 'text', academic_year: Y })).status).toBe(403);

      const f1 = await as('ao').post('/api/admissions/fields', { label: 'Student Name', field_type: 'text', academic_year: Y });
      expect(f1.status).toBe(201);
      const f2 = await as('ao').post('/api/admissions/fields', { label: 'PIN', field_type: 'text', validation_rule: '^[0-9]{6}$', academic_year: Y });
      expect(f2.status).toBe(201);
      expect((await as('ao').post('/api/admissions/fields', { label: 'pin', field_type: 'text', academic_year: Y })).status).toBe(409);
      expect((await as('ao').post('/api/admissions/fields', { label: 'Bad', field_type: 'text', validation_rule: '([', academic_year: Y })).status).toBe(400);
      expect((await as('ao').post('/api/admissions/fields/reorder', { academic_year: Y, ids: [f2.body.id, f1.body.id] })).status).toBe(201);

      expect((await as('ao').post(`/api/admissions/templates/${Y}/send`)).status).toBe(201);
      // locked while pending
      expect((await as('ao').put(`/api/admissions/fields/${f1.body.id}`, { label: 'Name' })).status).toBe(409);
      // AO cannot approve its own template; OS must
      expect((await as('ao').post(`/api/admissions/templates/${Y}/approve`)).status).toBe(403);
      expect((await as('accounts').post(`/api/admissions/templates/${Y}/approve`)).status).toBe(403);
      expect((await as('os').post(`/api/admissions/templates/${Y}/reject`, {})).status).toBe(400);
      expect((await as('os').post(`/api/admissions/templates/${Y}/reject`, { remarks: 'Add a photo field' })).status).toBe(201);

      const tpls = await as('ao').get('/api/admissions/templates');
      const t = tpls.body.find((x: { academic_year: string }) => x.academic_year === Y);
      expect(t.status).toBe('Rejected');
      expect(t.review_remarks).toBe('Add a photo field');

      expect((await as('ao').put(`/api/admissions/fields/${f1.body.id}`, { label: 'Student Full Name' })).status).toBe(200);
      expect((await as('ao').post(`/api/admissions/templates/${Y}/send`)).status).toBe(201);
      expect((await as('os').post(`/api/admissions/templates/${Y}/approve`)).status).toBe(201);
      expect((await as('os').post(`/api/admissions/templates/${Y}/approve`)).status).toBe(409);

      const fields = await as('ao').get(`/api/admissions/fields?academic_year=${Y}`);
      expect(fields.body.map((f: { status: string }) => f.status)).toEqual(['Published', 'Published']);
      expect(fields.body[0].id).toBe(f2.body.id); // reorder kept
      expect((await as('ao').put(`/api/admissions/fields/${f1.body.id}`, { label: 'Nope' })).status).toBe(409);
      expect((await as('ao').del(`/api/admissions/fields/${f1.body.id}`)).status).toBe(409);
      expect((await as('ao').post('/api/admissions/fields', { label: 'Late', field_type: 'text', academic_year: Y })).status).toBe(409);
    });

    it('copy from year creates a Draft copy', async () => {
      const res = await as('ao').post('/api/admissions/templates/2032-33/copy', { from_year: '2026-27' });
      expect(res.status).toBe(201);
      const f = await as('ao').get('/api/admissions/fields?academic_year=2032-33');
      expect(f.body.length).toBe(res.body.copied);
      expect(f.body.every((x: { status: string }) => x.status === 'Draft')).toBe(true);
      expect((await as('ao').post('/api/admissions/templates/2032-33/copy', { from_year: '2026-27' })).status).toBe(409);
    });

    it('cannot create admission forms for a year without a published template', async () => {
      const res = await as('ao').post('/api/admissions/trigger-links', {
        academic_year: '2032-33',
        parents: [{ parent_name: 'No Template', parent_email: 'nt@test.com' }],
      });
      expect(res.status).toBe(409);
    });
  });

  // ─── Happy path, role by role ──────────────────────────────

  describe('full admission cycle', () => {
    let g: { id: string; token: string; login_id: string; password: string };
    let parentToken = '';
    let orderId = '';
    let studentId = '';

    it('AO creates the form: parent login generated, password returned once and never logged', async () => {
      expect((await as('teacher').post('/api/admissions/trigger-links', { parents: [{ parent_name: 'T', parent_email: 't@test.com' }] })).status).toBe(403);
      expect((await as('accounts').post('/api/admissions/trigger-links', { parents: [{ parent_name: 'T', parent_email: 't@test.com' }] })).status).toBe(403);
      expect((await as('ao').post('/api/admissions/trigger-links', { parents: [{ parent_name: 'No contact' }] })).status).toBe(400);

      g = await invite('Happy Parent', 'happy@test.com');
      expect(g.login_id).toMatch(/^p\d{6}$/);
      expect(g.password).toMatch(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10}$/);

      const row = await prisma.admission.findUniqueOrThrow({ where: { id: g.id } });
      expect(row.status).toBe('Links Sent');
      expect(row.linkExpiresAt!.getTime() - Date.now()).toBeGreaterThan(14 * 86400000);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: row.parentUserId! } });
      expect(user.role).toBe('parent');
      expect(user.email).toBe(g.login_id);
      expect(user.mustChangePassword).toBe(true);
      expect(user.password).not.toBe(g.password);

      const logs = await prisma.notificationLog.findMany({ where: { refType: 'admission', refId: g.id } });
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs.some((l) => l.body.includes(g.login_id))).toBe(true);
      expect(logs.some((l) => l.body.includes(g.password))).toBe(false);

      const list = await as('ao').get('/api/admissions');
      expect(list.status).toBe(200);
      expect(JSON.stringify(list.body)).not.toContain(g.password);
      expect(JSON.stringify(list.body)).not.toContain(g.token);

      const login = await request(server).post('/api/auth/login').send({ email: g.login_id, password: g.password });
      expect(login.status).toBe(200);
      expect(login.body.role).toBe('parent');
      expect(login.body.must_change_password).toBe(true);
      parentToken = login.body.token;
    });

    it('parent fills the PUBLISHED template, uploads documents, submits; resubmission is blocked', async () => {
      const form = await pub.get(g.token);
      expect(form.status).toBe(200);
      expect(form.body.editable).toBe(true);
      const keys = form.body.fields.map((f: { key: string }) => f.key);
      expect(keys).toEqual(expect.arrayContaining(['student_name', 'date_of_birth', 'fathers_name', 'mothers_name', 'aadhaar_number']));

      expect((await pub.post(g.token, 'submit', { student_name: 'Only Name' })).status).toBe(400);
      expect((await pub.post(g.token, 'submit', { ...FORM, aadhaar_number: '12' })).status).toBe(400);
      expect((await pub.post(g.token, 'draft', { student_name: 'Kabir' })).status).toBe(201);

      expect((await pub.post(g.token, 'documents', { doc_type: 'aadhaar', file_name: 'a.svg', data_url: 'data:image/svg+xml;base64,PHN2Zz4=' })).status).toBe(400);
      expect((await pub.post(g.token, 'documents', { doc_type: 'photo', file_name: 'photo.png', data_url: PNG })).status).toBe(201);
      expect((await pub.post(g.token, 'documents', { doc_type: 'birth_certificate', file_name: 'bc.png', data_url: PNG })).status).toBe(201);

      const sub = await pub.post(g.token, 'submit', FORM);
      expect(sub.status).toBe(201);
      expect(await statusOf(g.id)).toBe('Submitted by Parent');

      expect((await pub.post(g.token, 'submit', FORM)).status).toBe(409);
      expect((await pub.post(g.token, 'documents', { doc_type: 'photo', file_name: 'p.png', data_url: PNG })).status).toBe(409);
      const after = await pub.get(g.token);
      expect(after.body.editable).toBe(false);
    });

    it('AO validates (Re-submit needs remarks; parent resubmits; then Valid). Wrong role 403', async () => {
      expect((await as('accounts').post(`/api/admissions/${g.id}/validate`, { is_valid: true })).status).toBe(403);
      expect((await as('teacher').post(`/api/admissions/${g.id}/validate`, { is_valid: true })).status).toBe(403);
      expect((await as('ao').post(`/api/admissions/${g.id}/validate`, { is_valid: false })).status).toBe(400);

      const rs = await as('ao').post(`/api/admissions/${g.id}/validate`, { is_valid: false, remarks: 'Photo is blurred' });
      expect(rs.status).toBe(201);
      const form = await pub.get(g.token);
      expect(form.body.status).toBe('Re-submit');
      expect(form.body.remarks).toBe('Photo is blurred');
      expect((await pub.post(g.token, 'documents', { doc_type: 'photo', file_name: 'photo2.png', data_url: PNG })).status).toBe(201);
      expect((await pub.post(g.token, 'submit', FORM)).status).toBe(201);

      // AO document viewer
      const docs = await as('ao').get(`/api/admissions/${g.id}/documents`);
      expect(docs.body.length).toBe(3);
      const dl = await as('ao').get(`/api/admissions/documents/${docs.body[0].id}/download`);
      // Stored in object storage; the viewer gets a short-lived signed URL that really serves the file.
      expect(dl.body.url).toEqual(expect.any(String));
      expect((await request(server).get(new URL(dl.body.url, 'http://localhost').pathname)).status).toBe(200);

      expect((await as('ao').post(`/api/admissions/${g.id}/validate`, { is_valid: true })).status).toBe(201);
      expect(await statusOf(g.id)).toBe('Document Validated');
    });

    it('illegal transitions are 409 (skipping steps)', async () => {
      expect((await as('vp').post(`/api/admissions/${g.id}/vp-approve`)).status).toBe(409);
      expect((await as('os').post(`/api/admissions/${g.id}/allocate`, {})).status).toBe(409);
      expect((await as('accounts').post(`/api/admissions/${g.id}/verify-receipt`, {})).status).toBe(409);
      expect((await as('principal').post(`/api/admissions/${g.id}/principal-approve`, { signature_name: 'X' })).status).toBe(409);
      expect((await as('ao').post(`/api/admissions/${g.id}/validate`, { is_valid: true })).status).toBe(409);
      expect((await as('ao').get(`/api/admissions/${g.id}/export/tc`)).status).toBe(409);
      expect((await as('principal').get(`/api/admissions/${g.id}/letter.pdf`)).status).toBe(409);
    });

    it('parent pays online (mock gateway); replay is idempotent', async () => {
      const my = await request(server).get('/api/admissions/my').set('Authorization', `Bearer ${parentToken}`);
      expect(my.status).toBe(200);
      expect(my.body[0].id).toBe(g.id);
      expect(my.body[0].can_pay).toBe(true);

      // another parent / a teacher cannot create an order for this application
      expect((await as('otherParent').post('/api/payments/orders', { purpose: 'admission', ref_id: g.id })).status).toBe(404);
      expect((await as('teacher').post('/api/payments/orders', { purpose: 'admission', ref_id: g.id })).status).toBe(403);
      expect((await as('green').post('/api/payments/orders', { purpose: 'admission', ref_id: g.id })).status).toBe(404);

      const order = await request(server)
        .post('/api/payments/orders')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({ purpose: 'admission', ref_id: g.id, amount: 1 });
      expect(order.status).toBe(201);
      expect(order.body.gateway).toBe('mock');
      expect(order.body.amount).toBe(25000); // server-side price, client amount ignored
      orderId = order.body.order_id;

      // public form payment step creates an order too
      const pubOrder = await pub.post(g.token, 'pay');
      expect(pubOrder.status).toBe(201);

      const done = await request(server).post(`/api/payments/mock/${orderId}/complete`);
      expect(done.status).toBe(200);
      expect(done.body.duplicate).toBe(false);
      expect(await statusOf(g.id)).toBe('Payment Received');
      const replay = await request(server).post(`/api/payments/mock/${orderId}/complete`);
      expect(replay.status).toBe(200);
      expect(replay.body.duplicate).toBe(true);
      const steps = await prisma.admissionStep.findMany({ where: { admissionId: g.id, toStatus: 'Payment Received' } });
      expect(steps.length).toBe(1);
      expect(steps[0].actorRole).toBe('system');
      expect((await pub.post(g.token, 'pay')).status).toBe(409);
    });

    it('Accounts verifies with receipt number + receipt upload', async () => {
      expect((await as('os').post(`/api/admissions/${g.id}/verify-receipt`, {})).status).toBe(403);
      expect((await as('ao').post(`/api/admissions/${g.id}/verify-receipt`, {})).status).toBe(403);
      const res = await as('accounts').post(`/api/admissions/${g.id}/verify-receipt`, {
        receipt_no: 'ADM-E2E-0001',
        receipt: { file_name: 'receipt.pdf', data_url: 'data:application/pdf;base64,JVBERi0xLjQK' },
      });
      expect(res.status).toBe(201);
      const row = await prisma.admission.findUniqueOrThrow({ where: { id: g.id } });
      expect(row.status).toBe('Fee Approved');
      expect(row.receiptNo).toBe('ADM-E2E-0001');
      const doc = await prisma.admissionDocument.findUniqueOrThrow({ where: { id: row.receiptDocId! } });
      expect(doc.docType).toBe('fee_receipt');
    });

    it('OS assigns roll + house; VP sends back (remarks), OS re-assigns, VP approves', async () => {
      expect((await as('accounts').post(`/api/admissions/${g.id}/allocate`, {})).status).toBe(403);
      expect((await as('vp').post(`/api/admissions/${g.id}/allocate`, {})).status).toBe(403);
      expect((await as('green').post(`/api/admissions/${g.id}/allocate`, {})).status).toBe(404);
      const a = await as('os').post(`/api/admissions/${g.id}/allocate`, { class_id: 'cls_06a' });
      expect(a.status).toBe(201);
      expect(a.body.roll_no).toMatch(/^[A-Z0-9]+-\d{4}-\d{3}$/);
      expect(['Red', 'Blue', 'Green', 'Yellow']).toContain(a.body.house);

      expect((await as('accounts').post(`/api/admissions/${g.id}/vp-approve`)).status).toBe(403);
      expect((await as('principal').post(`/api/admissions/${g.id}/vp-send-back`, { remarks: 'x' })).status).toBe(403);
      expect((await as('vp').post(`/api/admissions/${g.id}/vp-send-back`, {})).status).toBe(400);
      expect((await as('vp').post(`/api/admissions/${g.id}/vp-send-back`, { remarks: 'Wrong section' })).status).toBe(201);
      expect(await statusOf(g.id)).toBe('Fee Approved');

      expect((await as('os').post(`/api/admissions/${g.id}/allocate`, { class_id: 'cls_06a' })).status).toBe(201);
      expect((await as('vp').post(`/api/admissions/${g.id}/vp-approve`)).status).toBe(201);
      expect(await statusOf(g.id)).toBe('VP Approved');
    });

    it('Principal: send back once, then digitally signs → Admission Complete with Student master', async () => {
      expect((await as('ao').post(`/api/admissions/${g.id}/principal-approve`, { signature_name: 'X' })).status).toBe(403);
      expect((await as('vp').post(`/api/admissions/${g.id}/principal-approve`, { signature_name: 'X' })).status).toBe(403);
      expect((await as('green').post(`/api/admissions/${g.id}/principal-approve`, { signature_name: 'X' })).status).toBe(404);

      expect((await as('principal').post(`/api/admissions/${g.id}/principal-send-back`, { remarks: 'Check house balance' })).status).toBe(201);
      expect(await statusOf(g.id)).toBe('Roll No Assigned');
      expect((await as('vp').post(`/api/admissions/${g.id}/vp-approve`)).status).toBe(201);

      expect((await as('principal').post(`/api/admissions/${g.id}/principal-approve`, {})).status).toBe(400);
      const res = await as('principal').post(`/api/admissions/${g.id}/principal-approve`, { signature_name: 'Dr. Principal Sharma' });
      expect(res.status).toBe(201);
      studentId = res.body.student_id;
      expect(studentId).toBeDefined();

      const row = await prisma.admission.findUniqueOrThrow({ where: { id: g.id } });
      expect(row.status).toBe('Admission Complete');
      expect(row.signatureName).toBe('Dr. Principal Sharma');
      expect(row.signedAt).not.toBeNull();
      expect(row.studentId).toBe(studentId);

      const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId } });
      expect(student.fullName).toBe(FORM.student_name);
      expect(student.dob).toBe(FORM.date_of_birth);
      expect(student.fatherName).toBe(FORM.fathers_name);
      expect(student.motherName).toBe(FORM.mothers_name);
      expect(student.classId).toBe('cls_06a');
      expect(student.rollNo).toBe(row.rollNo);
      expect(student.house).toBe(row.house);
      expect(student.admissionId).toBe(g.id);

      const link = await prisma.parentStudent.findFirst({ where: { userId: row.parentUserId!, studentId } });
      expect(link).not.toBeNull();
      const docs = await prisma.admissionDocument.findMany({ where: { admissionId: g.id } });
      expect(docs.length).toBe(4);
      expect(docs.every((d) => d.studentId === studentId)).toBe(true);

      const actions = (await prisma.admissionStep.findMany({ where: { admissionId: g.id }, orderBy: { createdAt: 'asc' } })).map((s) => s.toStatus);
      expect(actions.slice(-2)).toEqual(['Admission Confirmed', 'Admission Complete']);
    });

    it('confirming twice is 409 and never creates a duplicate student', async () => {
      expect((await as('principal').post(`/api/admissions/${g.id}/principal-approve`, { signature_name: 'Again' })).status).toBe(409);
      expect(await prisma.student.count({ where: { admissionId: g.id } })).toBe(1);
      expect((await as('vp').post(`/api/admissions/${g.id}/reject`, { remarks: 'too late' })).status).toBe(409);
    });

    it('letter PDF, parent portal view, timeline and export hooks', async () => {
      const pdf = await as('principal').get(`/api/admissions/${g.id}/letter.pdf`).buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

      const parentPdf = await request(server).get(`/api/admissions/${g.id}/letter.pdf`).set('Authorization', `Bearer ${parentToken}`);
      expect(parentPdf.status).toBe(200);
      expect((await as('otherParent').get(`/api/admissions/${g.id}/letter.pdf`)).status).toBe(404);
      expect((await as('teacher').get(`/api/admissions/${g.id}/letter.pdf`)).status).toBe(403);

      const my = await request(server).get('/api/admissions/my').set('Authorization', `Bearer ${parentToken}`);
      expect(my.body[0].status).toBe('Admission Complete');
      expect(my.body[0].letter_available).toBe(true);
      expect(my.body[0].confirmation.roll_no).toBeDefined();
      expect(my.body[0].timeline.length).toBeGreaterThanOrEqual(10);
      expect((await as('ao').get('/api/admissions/my')).status).toBe(403);

      const me = await request(server).get('/api/auth/me').set('Authorization', `Bearer ${parentToken}`);
      expect(me.body.children.some((c: { id: string }) => c.id === studentId)).toBe(true);

      const tl = await as('ao').get(`/api/admissions/${g.id}/timeline`);
      expect(tl.status).toBe(200);
      expect(tl.body.steps.length).toBeGreaterThanOrEqual(10);
      expect(tl.body.notifications.length).toBeGreaterThanOrEqual(3);
      expect(JSON.stringify(tl.body)).not.toContain(g.password);
      expect((await as('teacher').get(`/api/admissions/${g.id}/timeline`)).status).toBe(403);
      expect((await as('green').get(`/api/admissions/${g.id}/timeline`)).status).toBe(404);

      for (const kind of ['tc', 'id-card', 'fee']) {
        const r = await as('os').get(`/api/admissions/${g.id}/export/${kind}`);
        expect(r.status).toBe(200);
        expect(r.body.student_id).toBe(studentId);
      }
      const fee = await as('accounts').get(`/api/admissions/${g.id}/export/fee`);
      expect(fee.body.admission_fee.receipt_no).toBe('ADM-E2E-0001');
      expect((await as('ao').get(`/api/admissions/${g.id}/export/nope`)).status).toBe(404);
    });
  });

  // ─── Other branches of the machine ─────────────────────────

  it('Accounts records an offline payment (reference required)', async () => {
    const g = await toValidated('Offline Payer', 'offline@test.com');
    expect((await as('ao').post(`/api/admissions/${g.id}/pay`, { reference_no: 'CHQ-1' })).status).toBe(403);
    expect((await as('accounts').post(`/api/admissions/${g.id}/pay`, {})).status).toBe(400);
    expect((await as('accounts').post(`/api/admissions/${g.id}/pay`, { reference_no: 'CHQ-778812', payment_mode: 'Cheque' })).status).toBe(201);
    expect(await statusOf(g.id)).toBe('Payment Received');
    expect((await as('accounts').post(`/api/admissions/${g.id}/pay`, { reference_no: 'CHQ-2' })).status).toBe(409);
  });

  it('VP / Principal can reject with remarks; AO cannot; rejected is terminal', async () => {
    const g = await toValidated('Rejected Kid', 'reject@test.com');
    expect((await as('ao').post(`/api/admissions/${g.id}/reject`, { remarks: 'x' })).status).toBe(403);
    expect((await as('vp').post(`/api/admissions/${g.id}/reject`, {})).status).toBe(400);
    expect((await as('vp').post(`/api/admissions/${g.id}/reject`, { remarks: 'Age criteria not met' })).status).toBe(201);
    expect(await statusOf(g.id)).toBe('Rejected');
    expect((await as('accounts').post(`/api/admissions/${g.id}/pay`, { reference_no: 'R1' })).status).toBe(409);
    expect((await pub.post(g.token, 'pay')).status).toBe(409);
  });

  it('expired link → 410; reminder run marks it Link Expired; AO re-issues', async () => {
    const g = await invite('Late Parent', 'late@test.com');
    await prisma.admission.update({ where: { id: g.id }, data: { linkExpiresAt: new Date(Date.now() - 60_000) } });
    expect((await pub.get(g.token)).status).toBe(410);
    expect((await pub.post(g.token, 'submit', FORM)).status).toBe(410);
    expect((await pub.post(g.token, 'documents', { doc_type: 'photo', file_name: 'p.png', data_url: PNG })).status).toBe(410);

    expect((await as('teacher').post('/api/admissions/reminders/run')).status).toBe(403);
    const run = await as('ao').post('/api/admissions/reminders/run');
    expect(run.status).toBe(200);
    expect(run.body.expired).toBeGreaterThanOrEqual(1);
    expect(await statusOf(g.id)).toBe('Link Expired');
    expect((await pub.get(g.token)).status).toBe(410);

    const re = await as('ao').post(`/api/admissions/${g.id}/reissue-link`);
    expect(re.status).toBe(201);
    const newToken = new URL(re.body.form_link).searchParams.get('token')!;
    expect((await pub.get(g.token)).status).toBe(404); // old link dead
    const form = await pub.get(newToken);
    expect(form.status).toBe(200);
    expect(form.body.editable).toBe(true);
  });

  it('Day-7 and Day-13 reminders are sent once each', async () => {
    const g = await invite('Slow Parent', 'slow@test.com');
    const DAY = 86400000;
    // link sent 8 days ago
    await prisma.admission.update({ where: { id: g.id }, data: { linkExpiresAt: new Date(Date.now() + 7 * DAY) } });
    await as('ao').post('/api/admissions/reminders/run');
    let row = await prisma.admission.findUniqueOrThrow({ where: { id: g.id } });
    expect(row.remindersSent).toBe(1);
    expect(row.lastReminderAt).not.toBeNull();
    await as('ao').post('/api/admissions/reminders/run');
    expect((await prisma.admission.findUniqueOrThrow({ where: { id: g.id } })).remindersSent).toBe(1);
    // day 14
    await prisma.admission.update({ where: { id: g.id }, data: { linkExpiresAt: new Date(Date.now() + 1 * DAY) } });
    await as('ao').post('/api/admissions/reminders/run');
    row = await prisma.admission.findUniqueOrThrow({ where: { id: g.id } });
    expect(row.remindersSent).toBe(2);
    const reminders = await prisma.notificationLog.findMany({ where: { refId: g.id, subject: { startsWith: 'Reminder' } } });
    expect(reminders.length).toBe(4); // 2 reminders x (email + sms)
    expect(row.status).toBe('Links Sent');
  });

  // ─── Razorpay webhook ──────────────────────────────────────

  describe('razorpay webhook', () => {
    const sign = (s: string) => crypto.createHmac('sha256', WEBHOOK_SECRET).update(s).digest('hex');
    const hook = (payload: string, sig?: string) => {
      const r = request(server).post('/api/payments/webhook/razorpay').set('Content-Type', 'application/json');
      if (sig) r.set('X-Razorpay-Signature', sig);
      return r.send(payload);
    };

    it('rejects a bad / missing signature, applies a valid one once, ignores replay', async () => {
      const g = await toValidated('Webhook Kid', 'webhook@test.com');
      const branch = (await prisma.admission.findUniqueOrThrow({ where: { id: g.id } })).branchId;
      await prisma.paymentOrder.create({
        data: { branchId: branch, purpose: 'admission', refId: g.id, amount: 25000, gateway: 'razorpay', gatewayOrderId: 'order_E2E_1' },
      });
      const payload = JSON.stringify({
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_E2E_1', order_id: 'order_E2E_1', amount: 2500000, status: 'captured' } } },
      });
      expect((await hook(payload)).status).toBe(401);
      expect((await hook(payload, sign(payload + 'x'))).status).toBe(401);
      expect((await hook(payload, 'deadbeef')).status).toBe(401);
      expect(await statusOf(g.id)).toBe('Document Validated');

      const ok = await hook(payload, sign(payload));
      expect(ok.status).toBe(200);
      expect(ok.body.duplicate).toBe(false);
      expect(await statusOf(g.id)).toBe('Payment Received');
      const row = await prisma.admission.findUniqueOrThrow({ where: { id: g.id } });
      expect(row.paymentRef).toBe('pay_E2E_1');

      const replay = await hook(payload, sign(payload));
      expect(replay.status).toBe(200);
      expect(replay.body.duplicate).toBe(true);
      expect(await prisma.admissionStep.count({ where: { admissionId: g.id, toStatus: 'Payment Received' } })).toBe(1);

      // the mock endpoint cannot complete a real-gateway order
      expect((await request(server).post('/api/payments/mock/order_E2E_1/complete')).status).toBe(404);
    });

    it('amount mismatch is refused', async () => {
      const g = await toValidated('Mismatch Kid', 'mismatch@test.com');
      const branch = (await prisma.admission.findUniqueOrThrow({ where: { id: g.id } })).branchId;
      await prisma.paymentOrder.create({
        data: { branchId: branch, purpose: 'admission', refId: g.id, amount: 25000, gateway: 'razorpay', gatewayOrderId: 'order_E2E_2' },
      });
      const payload = JSON.stringify({
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_E2E_2', order_id: 'order_E2E_2', amount: 100, status: 'captured' } } },
      });
      expect((await hook(payload, sign(payload))).status).toBe(400);
      expect(await statusOf(g.id)).toBe('Document Validated');
    });
  });

  // ─── Fee invoice online payment ────────────────────────────

  it('parent pays own child invoice online → OfflinePayment(Online) + RCPT receipt; other child 403', async () => {
    const inv = await prisma.feeInvoice.create({
      data: { branchId: (await prisma.student.findUniqueOrThrow({ where: { id: 'stu_001' } })).branchId, studentId: 'stu_001', term: 'PAY-E2E', totalAmount: 1200, dueDate: '2026-12-01', status: 'Unpaid' },
    });
    await prisma.offlinePayment.create({
      data: { branchId: inv.branchId, invoiceId: inv.id, amountPaid: 200, paymentMode: 'Cash', paymentDate: '2026-10-01' },
    });
    const other = await prisma.feeInvoice.findFirst({ where: { studentId: 'stu_002' } });

    const order = await as('otherParent').post('/api/payments/orders', { purpose: 'invoice', ref_id: inv.id });
    expect(order.status).toBe(201);
    expect(order.body.amount).toBe(1000);
    if (other) expect((await as('otherParent').post('/api/payments/orders', { purpose: 'invoice', ref_id: other.id })).status).toBe(403);
    expect((await as('otherParent').post('/api/payments/orders', { purpose: 'invoice', ref_id: 'g2_inv_1' })).status).toBe(404);
    expect((await as('vp').post('/api/payments/orders', { purpose: 'invoice', ref_id: inv.id })).status).toBe(403);

    expect((await request(server).post(`/api/payments/mock/${order.body.order_id}/complete`)).status).toBe(200);
    const pays = await prisma.offlinePayment.findMany({ where: { invoiceId: inv.id, paymentMode: 'Online' } });
    expect(pays.length).toBe(1);
    expect(pays[0].amountPaid).toBe(1000);
    expect(pays[0].receiptNo).toMatch(/^RCPT-[A-Z0-9]+-\d{4}-\d{4}$/);
    expect(pays[0].referenceNo).toMatch(/^mock_pay_/);
    expect((await prisma.feeInvoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('Paid');
    expect((await as('otherParent').post('/api/payments/orders', { purpose: 'invoice', ref_id: inv.id })).status).toBe(409);
  });

  // ─── School isolation ──────────────────────────────────────

  it('another school cannot see or act on sainik01 admissions', async () => {
    const list = await as('ao').get('/api/admissions');
    const someId = list.body[0].id;
    expect((await as('green').get(`/api/admissions/${someId}`)).status).toBe(404);
    expect((await as('green').get(`/api/admissions/${someId}/documents`)).status).toBe(404);
    expect((await as('green').post(`/api/admissions/${someId}/validate`, { is_valid: true })).status).toBe(404);
    expect((await as('green').post(`/api/admissions/${someId}/vp-approve`)).status).toBe(404);
    expect((await as('green').post(`/api/admissions/${someId}/reject`, { remarks: 'x' })).status).toBe(404);
    const greenList = await as('green').get('/api/admissions');
    expect(greenList.body.some((a: { id: string }) => a.id === someId)).toBe(false);
    const doc = await prisma.admissionDocument.findFirst({ where: { admission: { branchId: { not: 'x' } } } });
    if (doc) expect((await as('green').get(`/api/admissions/documents/${doc.id}/download`)).status).toBe(doc.branchId === (await prisma.user.findFirstOrThrow({ where: { email: 'admin@greenfield02.edu' } })).branchId ? 200 : 404);
  });
});
