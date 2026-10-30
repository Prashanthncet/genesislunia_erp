import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Phase 2 — Student Information System, fees, notifications, classes.
 * Role allow/deny matrix, cross-school isolation, printables, doc-number concurrency.
 */
describe('SIS / fees / notifications / classes (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;
  const tok: Record<string, string> = {};

  const LOGINS: Record<string, [string, string]> = {
    super: ['admin@sainik01.edu', 'Admin@123'],
    admin: ['schooladmin@sainik01.edu', 'Demo@Admin1'],
    principal: ['principal@sainik01.edu', 'Demo@Principal1'],
    os: ['os@sainik01.edu', 'Demo@Os1'],
    ao: ['ao@sainik01.edu', 'Demo@Ao1'],
    accounts: ['accounts@sainik01.edu', 'Demo@Accounts1'],
    teacher: ['teacher@sainik01.edu', 'Demo@Teacher1'],
    warden: ['warden@sainik01.edu', 'Demo@Warden1'],
    security: ['security@sainik01.edu', 'Demo@Security1'],
    hr: ['hr@sainik01.edu', 'Demo@Hr1'],
    parent: ['parent@sainik01.edu', 'Demo@Parent1'],
    student: ['student@sainik01.edu', 'Demo@Student1'],
    g2admin: ['admin@greenfield02.edu', 'Demo@Green1'],
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    for (const [k, [email, password]] of Object.entries(LOGINS)) {
      const res = await request(server).post('/api/auth/login').send({ email, password });
      if (res.status !== 200) throw new Error(`login ${k} failed: ${res.status}`);
      tok[k] = res.body.token;
    }
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  const as = (who: string) => ({
    get: (u: string) => request(server).get(u).set('Authorization', `Bearer ${tok[who]}`),
    post: (u: string, b?: object) => request(server).post(u).set('Authorization', `Bearer ${tok[who]}`).send(b ?? {}),
    put: (u: string, b?: object) => request(server).put(u).set('Authorization', `Bearer ${tok[who]}`).send(b ?? {}),
    del: (u: string) => request(server).delete(u).set('Authorization', `Bearer ${tok[who]}`),
  });
  /** supertest buffers binary responses with this parser. */
  const binary = (res: any, cb: (e: Error | null, b: Buffer) => void) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };
  const pdf = (who: string, u: string) => as(who).get(u).buffer(true).parse(binary);

  // ─── Students ───────────────────────────────────────────────

  describe('students role matrix', () => {
    it('teacher can read the list, with parent contacts stripped', async () => {
      const res = await as('teacher').get('/api/students?class_id=cls_10a');
      expect(res.status).toBe(200);
      expect(res.body.contacts_hidden).toBe(true);
      expect(res.body.data.every((s: any) => s.mobileNumber === null && s.email === null)).toBe(true);
    });

    it('office roles see contacts', async () => {
      const res = await as('os').get('/api/students?class_id=cls_10a');
      expect(res.status).toBe(200);
      expect(res.body.contacts_hidden).toBe(false);
    });

    it('teacher cannot create / update / delete students', async () => {
      expect((await as('teacher').post('/api/students', { admission_no: 'X-T1', full_name: 'T', gender: 'Male', class_id: 'cls_10a' })).status).toBe(403);
      expect((await as('teacher').put('/api/students/stu_002', { mother_name: 'x' })).status).toBe(403);
      expect((await as('teacher').put('/api/students/stu_002/status', { status: 'Left' })).status).toBe(403);
      expect((await as('teacher').del('/api/students/stu_002')).status).toBe(403);
    });

    it('parent / student / hr cannot list students', async () => {
      expect((await as('parent').get('/api/students')).status).toBe(403);
      expect((await as('student').get('/api/students')).status).toBe(403);
      expect((await as('hr').get('/api/students')).status).toBe(403);
    });

    it('OS (STUDENT_WRITE) can create; class from another school is 404', async () => {
      const bad = await as('os').post('/api/students', { admission_no: 'SIS-E2E-1', full_name: 'Cross', gender: 'Male', class_id: 'g2_cls_5a' });
      expect(bad.status).toBe(404);
      const ok = await as('os').post('/api/students', { admission_no: 'SIS-E2E-1', full_name: 'SIS Test', gender: 'Female', class_id: 'cls_10a' });
      expect(ok.status).toBe(201);
      const move = await as('os').put(`/api/students/${ok.body.id}`, { class_id: 'g2_cls_5a' });
      expect(move.status).toBe(404);
    });

    it('DELETE: student without history is removed; with history → 409; soft status Left works', async () => {
      const created = await as('admin').post('/api/students', { admission_no: 'SIS-E2E-DEL', full_name: 'Mistake', gender: 'Male', class_id: 'cls_10a' });
      expect((await as('admin').del(`/api/students/${created.body.id}`)).status).toBe(200);
      const refused = await as('admin').del('/api/students/stu_003');
      expect(refused.status).toBe(409);
      expect(await prisma.student.count({ where: { id: 'stu_003' } })).toBe(1);
      expect((await as('os').del('/api/students/stu_003')).status).toBe(403); // delete is admins-only
      expect((await as('os').put('/api/students/stu_003/status', { status: 'Bogus' })).status).toBe(400);
      expect((await as('os').put('/api/students/stu_003/status', { status: 'Left', reason: '   ' })).status).toBe(400);
    });

    it('cross-school: sainik admin requesting g2_stu_001 → 404', async () => {
      expect((await as('admin').get('/api/students/g2_stu_001')).status).toBe(404);
      expect((await as('admin').get('/api/students/g2_stu_001/profile')).status).toBe(404);
      expect((await as('admin').get('/api/students/g2_stu_001/export/fee-summary')).status).toBe(404);
    });
  });

  describe('student profile', () => {
    it('admin gets the full profile (class, house, attendance %, fees, marks, documents)', async () => {
      const res = await as('admin').get('/api/students/stu_001/profile');
      expect(res.status).toBe(200);
      expect(res.body.student.admission_no).toBe('S2023-045');
      expect(res.body.student.class.id).toBe('cls_10a');
      expect(res.body.student).toHaveProperty('house');
      expect(typeof res.body.attendance.percentage).toBe('number');
      expect(res.body.fees.invoiced).toBeGreaterThan(0);
      expect(Array.isArray(res.body.academics.recent_marks)).toBe(true);
      expect(Array.isArray(res.body.documents)).toBe(true);
    });

    it('teacher: profile without fees/documents/contacts', async () => {
      const res = await as('teacher').get('/api/students/stu_001/profile');
      expect(res.status).toBe(200);
      expect(res.body.fees).toBeNull();
      expect(res.body.documents).toBeNull();
      expect(res.body.parents.mobile_number).toBeNull();
    });

    it('parent: own child ok (stu_001), other child 403 (stu_002)', async () => {
      const ok = await as('parent').get('/api/students/stu_001/profile');
      expect(ok.status).toBe(200);
      expect(ok.body.fees).not.toBeNull();
      expect((await as('parent').get('/api/students/stu_002/profile')).status).toBe(403);
    });

    it('student: self ok, classmate 403', async () => {
      expect((await as('student').get('/api/students/stu_001/profile')).status).toBe(200);
      expect((await as('student').get('/api/students/stu_002/profile')).status).toBe(403);
    });

    it('archived DMS document: listed and downloadable by office + own parent; teacher 403', async () => {
      const doc = await prisma.admissionDocument.create({
        data: {
          branchId: 'sainik01', studentId: 'stu_001', docType: 'birth_certificate', fileName: 'bc.txt',
          dataUrl: `data:text/plain;base64,${Buffer.from('birth-cert').toString('base64')}`, sizeBytes: 10,
        },
      });
      const prof = await as('os').get('/api/students/stu_001/profile');
      expect(prof.body.documents.some((d: any) => d.id === doc.id)).toBe(true);
      const dl = await as('parent').get(`/api/students/stu_001/documents/${doc.id}`);
      expect(dl.status).toBe(200);
      expect(dl.text).toBe('birth-cert');
      expect((await as('teacher').get(`/api/students/stu_001/documents/${doc.id}`)).status).toBe(403);
      expect((await as('parent').get(`/api/students/stu_002/documents/${doc.id}`)).status).toBe(403);
      expect((await as('os').get(`/api/students/stu_002/documents/${doc.id}`)).status).toBe(404);
    });
  });

  describe('export hooks', () => {
    it('ID card for an Active student: JSON + %PDF', async () => {
      const j = await as('os').get('/api/students/stu_001/export/id-card');
      expect(j.status).toBe(200);
      expect(j.body.student.admission_no).toBe('S2023-045');
      expect(j.body.qr_payload).toContain('stu_001');
      const p = await pdf('os', '/api/students/stu_001/export/id-card.pdf');
      expect(p.status).toBe(200);
      expect(p.headers['content-type']).toContain('application/pdf');
      expect((p.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    });

    it('TC refused while Active (409), issued once Left: JSON + %PDF', async () => {
      expect((await as('os').get('/api/students/stu_003/export/tc')).status).toBe(409);
      expect((await as('os').put('/api/students/stu_003/status', { status: 'Left', reason: 'Relocated' })).status).toBe(200);
      const j = await as('os').get('/api/students/stu_003/export/tc');
      expect(j.status).toBe(200);
      expect(j.body.student.status).toBe('Left');
      expect(j.body).toHaveProperty('fees_cleared');
      const p = await pdf('os', '/api/students/stu_003/export/tc.pdf');
      expect(p.status).toBe(200);
      expect((p.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
      // ID card now refused for a student who has left
      expect((await as('os').get('/api/students/stu_003/export/id-card')).status).toBe(409);
      await as('os').put('/api/students/stu_003/status', { status: 'Active' });
    });

    it('teacher cannot export TC / ID card', async () => {
      expect((await as('teacher').get('/api/students/stu_001/export/id-card')).status).toBe(403);
    });

    it('fee-summary: parent own child ok, other 403; teacher 403', async () => {
      const ok = await as('parent').get('/api/students/stu_004/export/fee-summary');
      expect(ok.status).toBe(200);
      expect(ok.body).toEqual(expect.objectContaining({ student_id: 'stu_004', invoiced: expect.any(Number), balance: expect.any(Number) }));
      expect((await as('parent').get('/api/students/stu_002/export/fee-summary')).status).toBe(403);
      expect((await as('teacher').get('/api/students/stu_001/export/fee-summary')).status).toBe(403);
    });
  });

  // ─── Fees ──────────────────────────────────────────────────

  describe('fees', () => {
    it('read matrix: accounts/OS/principal ok; warden/security/teacher 403', async () => {
      for (const who of ['accounts', 'os', 'principal']) expect((await as(who).get('/api/fees/invoices')).status).toBe(200);
      for (const who of ['warden', 'security', 'teacher', 'hr']) {
        expect((await as(who).get('/api/fees/invoices')).status).toBe(403);
        expect((await as(who).get('/api/fees/structures')).status).toBe(403);
        expect((await as(who).get('/api/fees/defaulters')).status).toBe(403);
      }
    });

    it('write matrix: accounts can create; OS (read-only) gets 403', async () => {
      const ok = await as('accounts').post('/api/fees/structures', { class_id: 'cls_10a', fee_type: 'SIS E2E', amount: 100 });
      expect(ok.status).toBe(201);
      expect((await as('os').post('/api/fees/structures', { class_id: 'cls_10a', fee_type: 'x', amount: 1 })).status).toBe(403);
      expect((await as('os').post('/api/fees/invoices', { student_id: 'stu_001', term: 'SIS', total_amount: 1, due_date: '2026-12-01' })).status).toBe(403);
      await as('accounts').del(`/api/fees/structures/${ok.body.id}`);
    });

    it('cross-school: invoicing g2_stu_001 / structure for g2_cls_5a / g2 invoice → 404', async () => {
      expect((await as('admin').post('/api/fees/invoices', { student_id: 'g2_stu_001', term: 'X', total_amount: 10, due_date: '2026-12-01' })).status).toBe(404);
      expect((await as('admin').post('/api/fees/structures', { class_id: 'g2_cls_5a', fee_type: 'X', amount: 10 })).status).toBe(404);
      expect((await as('admin').post('/api/fees/invoices/generate', { class_id: 'g2_cls_5a', term: 'X', due_date: '2026-12-01' })).status).toBe(404);
      expect((await as('admin').get('/api/fees/invoices/g2_inv_1')).status).toBe(404);
      expect((await as('admin').post('/api/fees/payments', { invoice_id: 'g2_inv_1', amount_paid: 1, payment_mode: 'Cash' })).status).toBe(404);
    });

    it('parent sees only own children invoices; other child 403', async () => {
      const res = await as('parent').get('/api/fees/invoices');
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.every((i: any) => ['stu_001', 'stu_004'].includes(i.studentId))).toBe(true);
      expect((await as('parent').get('/api/fees/invoices?student_id=stu_002')).status).toBe(403);
    });

    it('defaulters list: overdue unpaid invoices only', async () => {
      const res = await as('accounts').get('/api/fees/defaulters');
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(res.body.students.length);
      for (const s of res.body.students) {
        expect(s.overdue_amount).toBeGreaterThan(0);
        expect(s.oldest_due < res.body.as_of).toBe(true);
      }
    });

    it('receipt + invoice PDFs start with %PDF; parent own ok, other child 403', async () => {
      const inv = await as('accounts').post('/api/fees/invoices', { student_id: 'stu_001', term: 'SIS-PDF', total_amount: 1000, due_date: '2026-01-10' });
      expect(inv.status).toBe(201);
      const pay = await as('accounts').post('/api/fees/payments', { invoice_id: inv.body.id, amount_paid: 400, payment_mode: 'UPI', reference_no: 'UPI123' });
      expect(pay.status).toBe(201);
      const r = await pdf('accounts', `/api/fees/payments/${pay.body.id}/receipt.pdf`);
      expect(r.status).toBe(200);
      expect((r.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
      const i = await pdf('parent', `/api/fees/invoices/${inv.body.id}/invoice.pdf`);
      expect(i.status).toBe(200);
      expect((i.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
      expect((await pdf('parent', `/api/fees/payments/${pay.body.id}/receipt.pdf`)).status).toBe(200);

      // overdue flag: due date in the past, balance outstanding
      const list = await as('accounts').get('/api/fees/invoices?student_id=stu_001');
      expect(list.body.find((x: any) => x.id === inv.body.id).overdue).toBe(true);

      const other = await as('accounts').post('/api/fees/invoices', { student_id: 'stu_002', term: 'SIS-PDF', total_amount: 50, due_date: '2026-12-10' });
      const otherPay = await as('accounts').post('/api/fees/payments', { invoice_id: other.body.id, amount_paid: 50, payment_mode: 'Cash' });
      expect((await pdf('parent', `/api/fees/payments/${otherPay.body.id}/receipt.pdf`)).status).toBe(403);
      expect((await pdf('teacher', `/api/fees/payments/${otherPay.body.id}/receipt.pdf`)).status).toBe(403);
    });

    it('doc numbers are per-branch, sequential and unique under 10 concurrent payments', async () => {
      const inv = await as('accounts').post('/api/fees/invoices', { student_id: 'stu_002', term: 'SIS-CONC', total_amount: 1000, due_date: '2026-12-31' });
      expect(inv.status).toBe(201);
      expect(inv.body.invoice_no).toMatch(/^INV-SAINIK01-\d{4}-\d{4}$/);

      const results = await Promise.all(Array.from({ length: 10 }, () =>
        as('accounts').post('/api/fees/payments', { invoice_id: inv.body.id, amount_paid: 10, payment_mode: 'Cash' })));
      expect(results.map((r) => r.status)).toEqual(Array(10).fill(201));
      const nos = results.map((r) => r.body.receipt_no as string);
      expect(new Set(nos).size).toBe(10);
      nos.forEach((n) => expect(n).toMatch(/^RCPT-SAINIK01-\d{4}-\d{4}$/));
      const seq = nos.map((n) => parseInt(n.slice(-4), 10)).sort((a, b) => a - b);
      for (let k = 1; k < seq.length; k += 1) expect(seq[k]).toBe(seq[k - 1] + 1);

      const detail = await as('accounts').get(`/api/fees/invoices/${inv.body.id}`);
      expect(detail.body.paid_amount).toBe(100);
      expect(detail.body.payments).toHaveLength(10);

      // Concurrent overpayment cannot slip through: 10 × 100 against a 250 invoice.
      const small = await as('accounts').post('/api/fees/invoices', { student_id: 'stu_002', term: 'SIS-CONC2', total_amount: 250, due_date: '2026-12-31' });
      const race = await Promise.all(Array.from({ length: 10 }, () =>
        as('accounts').post('/api/fees/payments', { invoice_id: small.body.id, amount_paid: 100, payment_mode: 'Cash' })));
      expect(race.filter((r) => r.status === 201)).toHaveLength(2);
      expect(race.filter((r) => r.status === 409)).toHaveLength(8);

      // Another school's numbering is independent and starts its own sequence.
      const g2 = await as('g2admin').post('/api/fees/invoices', { student_id: 'g2_stu_001', term: 'SIS', total_amount: 10, due_date: '2026-12-31' });
      expect(g2.status).toBe(201);
      expect(g2.body.invoice_no).toMatch(/^INV-GREENFIELD02-\d{4}-0001$/);
    }, 60_000);

    it('online payments are flagged in the payments list', async () => {
      const inv = await prisma.feeInvoice.findFirstOrThrow({ where: { term: 'SIS-PDF', studentId: 'stu_001' } });
      await prisma.offlinePayment.create({
        data: { branchId: 'sainik01', invoiceId: inv.id, amountPaid: 100, paymentMode: 'Online', paymentDate: '2026-10-20', receiptNo: 'RCPT-SAINIK01-ONLINE-TEST' },
      });
      const res = await as('accounts').get(`/api/fees/payments?invoice_id=${inv.id}`);
      expect(res.status).toBe(200);
      expect(res.body.some((p: any) => p.online === true && p.paymentMode === 'Online')).toBe(true);
    });
  });

  // ─── Notifications ─────────────────────────────────────────

  describe('notifications', () => {
    beforeAll(async () => {
      await prisma.notificationLog.createMany({
        data: [
          { branchId: 'sainik01', channel: 'sms', recipient: '9000000001', body: 'Your OTP: 482913 for gate pass', refType: 'gate_pass', refId: 'gp_legacy', status: 'mocked' },
          { branchId: 'sainik01', channel: 'email', recipient: 'parent@sainik01.edu', body: 'Login created. Password: Secret#123 change it.', refType: 'admission', refId: 'adm_sis_e2e', status: 'mocked' },
          { branchId: 'sainik01', channel: 'email', recipient: 'someone-else@x.com', body: 'Not for the parent', refType: 'broadcast', status: 'mocked' },
        ],
      });
    });

    it('log matrix: OS/AO/principal ok; teacher/accounts/parent 403', async () => {
      for (const who of ['os', 'ao', 'principal']) expect((await as(who).get('/api/notifications')).status).toBe(200);
      for (const who of ['teacher', 'accounts', 'parent', 'student', 'warden']) expect((await as(who).get('/api/notifications')).status).toBe(403);
    });

    it('legacy OTP / password bodies are masked at read time', async () => {
      const res = await as('os').get('/api/notifications?q=OTP');
      const all = await as('os').get('/api/notifications?limit=500');
      const text = JSON.stringify(all.body);
      expect(res.status).toBe(200);
      expect(text).not.toContain('482913');
      expect(text).not.toContain('Secret#123');
    });

    it('per-applicant history via ref_type + ref_id; recipient search', async () => {
      const res = await as('ao').get('/api/notifications?ref_type=admission&ref_id=adm_sis_e2e');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      const byRecipient = await as('ao').get('/api/notifications?recipient=someone-else');
      expect(byRecipient.body.every((n: any) => n.recipient.includes('someone-else'))).toBe(true);
    });

    it('parent /mine: only own contacts / children, never others', async () => {
      const res = await as('parent').get('/api/notifications/mine');
      expect(res.status).toBe(200);
      expect(res.body.some((n: any) => n.recipient === 'parent@sainik01.edu')).toBe(true);
      expect(res.body.some((n: any) => n.recipient === 'someone-else@x.com')).toBe(false);
      expect(JSON.stringify(res.body)).not.toContain('Secret#123');
      expect((await as('os').get('/api/notifications/mine')).status).toBe(403);
    });

    it('broadcast: OS allowed, teacher 403, other-school class 404, bad channel 400', async () => {
      expect((await as('teacher').post('/api/notifications/broadcast', { channel: 'email', audience: 'all_staff', body: 'hi' })).status).toBe(403);
      expect((await as('os').post('/api/notifications/broadcast', { channel: 'sms', audience: 'class', class_id: 'g2_cls_5a', body: 'hi' })).status).toBe(404);
      expect((await as('os').post('/api/notifications/broadcast', { channel: 'pigeon', audience: 'all_staff', body: 'hi' })).status).toBe(400);
      const ok = await as('os').post('/api/notifications/broadcast', { channel: 'email', audience: 'custom', recipients: 'a@x.com, b@x.com', body: 'SIS e2e' });
      expect(ok.status).toBe(201);
      expect(ok.body.dispatched).toBe(2);
    });

    it('per-student history (staff): 200 in branch, 404 cross-school', async () => {
      expect((await as('os').get('/api/notifications/student/stu_001')).status).toBe(200);
      expect((await as('os').get('/api/notifications/student/g2_stu_001')).status).toBe(404);
    });
  });

  // ─── Classes ───────────────────────────────────────────────

  describe('classes', () => {
    it('staff read; portal 403; teacher cannot write; principal can', async () => {
      expect((await as('teacher').get('/api/classes')).status).toBe(200);
      // Security = gate desk + visitors only (school decision 2026-10-24).
      expect((await as('security').get('/api/classes/cls_10a')).status).toBe(403);
      expect((await as('parent').get('/api/classes')).status).toBe(403);
      expect((await as('teacher').post('/api/classes', { name: 'SIS Class' })).status).toBe(403);
      const c = await as('principal').post('/api/classes', { name: 'SIS Class', section: 'Z' });
      expect(c.status).toBe(201);
      expect((await as('principal').del(`/api/classes/${c.body.id}`)).status).toBe(200);
      expect((await as('admin').get('/api/classes/g2_cls_5a')).status).toBe(404);
    });

    it('class detail does not leak student contacts', async () => {
      const res = await as('teacher').get('/api/classes/cls_10a');
      expect(res.body.students[0]).not.toHaveProperty('mobileNumber');
      expect((await as('teacher').get('/api/classes/cls_10b')).status).toBe(403);
      expect((await as('teacher').get('/api/students/stu_004/profile')).status).toBe(403);
    });
  });
});
