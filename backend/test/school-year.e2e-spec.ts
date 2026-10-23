import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Plan Phase 11 joint sync: "Run one full school year's worth of scenarios end to end —
 * admission through report cards, payroll, and a CBT exam — across two simulated schools
 * simultaneously, to confirm tenant isolation actually holds."
 *
 * Both schools run the same year at the same time (Promise.all). Sainik School uses a
 * separate login per workflow role; Greenfield, a small school, runs everything through
 * its school admin. Afterwards each school must see its own new student, payments,
 * report card, CBT attempt and payslips — and none of the other school's.
 */
jest.setTimeout(180_000);

type Agent = {
  get: (u: string) => request.Test;
  post: (u: string, b?: object) => request.Test;
  put: (u: string, b?: object) => request.Test;
};

describe('A school year in two schools at once (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaService;

  const login = async (email: string, password: string): Promise<Agent> => {
    const res = await request(server).post('/api/auth/login').send({ email, password });
    if (res.status !== 200) throw new Error(`login ${email} → ${res.status}`);
    const t = res.body.token as string;
    return {
      get: (u) => request(server).get(u).set('Authorization', `Bearer ${t}`),
      post: (u, b) => request(server).post(u).set('Authorization', `Bearer ${t}`).send(b ?? {}),
      put: (u, b) => request(server).put(u).set('Authorization', `Bearer ${t}`).send(b ?? {}),
    };
  };
  const ok = async (label: string, r: request.Test | Promise<request.Response>, expected = [200, 201]) => {
    const res = await r;
    if (!expected.includes(res.status)) throw new Error(`${label} → ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
    return res;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  type School = {
    name: string;
    branch: string;
    year: string;
    classId: string;
    subjectId: string;
    roles: Record<'ao' | 'os' | 'accounts' | 'vp' | 'principal' | 'academic' | 'author' | 'payroll' | 'admin', Agent>;
    needsTemplate: boolean;
  };
  type Outcome = { studentId: string; parentEmail: string; receiptNo: string; examId: string; attemptId: string; payslipId: string; score: number };

  async function runYear(s: School): Promise<Outcome> {
    const r = s.roles;
    const tag = `${s.branch}-${Date.now()}`;

    // ── Admissions: template → form → parent submits → each role signs its step ──
    if (s.needsTemplate) {
      for (const [label, field_type] of [['Student Name', 'text'], ['Date of Birth', 'date']] as const) {
        await ok(`${s.name} field ${label}`, r.ao.post('/api/admissions/fields', { label, field_type, academic_year: s.year }));
      }
      await ok(`${s.name} send template`, r.ao.post(`/api/admissions/templates/${s.year}/send`));
      await ok(`${s.name} approve template`, r.os.post(`/api/admissions/templates/${s.year}/approve`));
    }
    const parentEmail = `year.parent.${tag}@example.com`;
    const links = await ok(`${s.name} trigger-links`, r.ao.post('/api/admissions/trigger-links', {
      academic_year: s.year, parents: [{ parent_name: `Year Parent ${s.name}`, parent_email: parentEmail, parent_contact: '9811100000' }],
    }));
    const g = links.body.generated[0] as { id: string; token: string; login_id: string; password: string };

    const form = await ok(`${s.name} public form`, request(server).get(`/api/admissions/public/${g.token}`));
    const answers: Record<string, string> = { class_id: s.classId };
    for (const f of form.body.fields as { key: string; field_type: string; validation_rule: string | null }[]) {
      answers[f.key] = f.field_type === 'date' ? '2016-05-05' : f.validation_rule ? '123456789012' : `Year Pupil ${s.name}`;
    }
    await ok(`${s.name} parent submits`, request(server).post(`/api/admissions/public/${g.token}/submit`).send(answers));
    await ok(`${s.name} validate`, r.ao.post(`/api/admissions/${g.id}/validate`, { is_valid: true }));
    const order = await ok(`${s.name} admission order`, request(server).post(`/api/admissions/public/${g.token}/pay`).send({}));
    await ok(`${s.name} admission paid`, request(server).post(`/api/payments/mock/${order.body.order_id}/complete`));
    await ok(`${s.name} accounts verify`, r.accounts.post(`/api/admissions/${g.id}/verify-receipt`, {}));
    await ok(`${s.name} roll + house`, r.os.post(`/api/admissions/${g.id}/allocate`, { class_id: s.classId }));
    await ok(`${s.name} VP`, r.vp.post(`/api/admissions/${g.id}/vp-approve`));
    const signed = await ok(`${s.name} principal signs`, r.principal.post(`/api/admissions/${g.id}/principal-approve`, { signature_name: `Principal of ${s.name}` }));
    const studentId = signed.body.student_id as string;
    expect(studentId).toBeTruthy();

    // ── Attendance through the year (sampled days), absences notify the parent ──
    for (const [i, date] of ['2026-11-02', '2026-12-01', '2027-01-04', '2027-02-01'].entries()) {
      await ok(`${s.name} attendance ${date}`, r.academic.post('/api/attendance', {
        class_id: s.classId, date, records: [{ student_id: studentId, status: i === 1 ? 'Absent' : 'Present' }],
      }));
    }

    // ── Term fee: invoice, then the parent pays online with their own login ──
    const invoice = await ok(`${s.name} invoice`, r.accounts.post('/api/fees/invoices', {
      student_id: studentId, term: `Year-${tag}`, total_amount: 12500, due_date: '2027-01-15',
    }));
    const parent = await login(g.login_id, g.password);
    const feeOrder = await ok(`${s.name} fee order`, parent.post('/api/payments/orders', { purpose: 'invoice', ref_id: invoice.body.id }));
    await ok(`${s.name} fee paid`, request(server).post(`/api/payments/mock/${feeOrder.body.order_id}/complete`));
    const payments = await prisma.offlinePayment.findMany({ where: { invoiceId: invoice.body.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0].paymentMode).toBe('Online');

    // ── Exam → marks → report card published (frozen) → parent sees it ──
    const term = `YEAR-${tag}`;
    const exam = await ok(`${s.name} exam`, r.academic.post('/api/exams', {
      name: `Annual ${s.name}`, date: '2027-03-01', class_id: s.classId, term, academic_year: s.year, max_marks: 100,
    }));
    await ok(`${s.name} marks`, r.academic.post('/api/exams/marks', {
      exam_id: exam.body.id, subject_id: s.subjectId, marks: [{ student_id: studentId, score: 84 }],
    }));
    expect((await parent.get(`/api/exams/report-card/${studentId}?term=${term}&academic_year=${s.year}`)).status).toBe(404);
    await ok(`${s.name} publish`, r.academic.post('/api/exams/report-cards/publish', { class_id: s.classId, academic_year: s.year, term }));
    const card = await ok(`${s.name} parent report card`, parent.get(`/api/exams/report-card/${studentId}?term=${term}&academic_year=${s.year}`));
    expect(JSON.stringify(card.body)).toContain('84');

    // ── CBT: teacher sets a test, the new student takes it with their own login ──
    const mk = (b: object) => ok(`${s.name} question`, r.author.post('/api/cbt/questions', { class_id: s.classId, ...b }));
    const mcq = await mk({ question: `Year MCQ ${tag}`, type: 'mcq', option_a: '2', option_b: '4', option_c: '6', option_d: '8', correct_option: 'B', marks: 2 });
    const essay = await mk({ question: `Year essay ${tag}`, type: 'subjective', marks: 3 });
    const test = await ok(`${s.name} test`, r.author.post('/api/cbt/tests', {
      title: `Year CBT ${tag}`, class_id: s.classId, duration_min: 30, question_ids: [mcq.body.id, essay.body.id],
    }));
    await ok(`${s.name} publish test`, r.author.put(`/api/cbt/tests/${test.body.id}/publish`));
    const studentEmail = `year.student.${tag}@example.com`;
    await ok(`${s.name} student login`, r.admin.post('/api/auth/users', { email: studentEmail, password: 'Year@Pupil1', role: 'student', student_id: studentId }));
    const pupil = await login(studentEmail, 'Year@Pupil1');
    const start = await ok(`${s.name} start test`, pupil.post(`/api/cbt/tests/${test.body.id}/start`));
    const attemptId = start.body.attempt_id as string;
    await ok(`${s.name} autosave`, pupil.put(`/api/cbt/attempts/${attemptId}/answers`, { answers: { [mcq.body.id]: 'B', [essay.body.id]: 'Plants make food from light.' } }));
    await ok(`${s.name} submit`, pupil.post(`/api/cbt/attempts/${attemptId}/submit`));
    const graded = await ok(`${s.name} grade essay`, r.author.put(`/api/cbt/attempts/${attemptId}/grade`, { question_id: essay.body.id, marks: 2 }));
    expect(graded.body.score).toBe(4); // 2 auto + 2 manual

    // ── Payroll for the month, one payslip paid ──
    const month = '2027-03';
    if (s.needsTemplate) {
      // A new school sets up salaries before its first payroll run.
      await ok(`${s.name} salary structure`, r.payroll.put('/api/staff/salaries/g2_t_asha', {
        basic_salary: 42000, hra: 16800, da: 5250, tax_mode: 'slab', tax_regime: 'new', epf_percent: 12,
      }));
    }
    await ok(`${s.name} payroll`, r.payroll.post('/api/staff/payslips/generate', { month }));
    const slips = await ok(`${s.name} payslips`, r.payroll.get(`/api/staff/payslips?month=${month}`));
    expect(slips.body.length).toBeGreaterThan(0);
    const slip = slips.body[0] as { id: string };
    await ok(`${s.name} mark paid`, r.payroll.put(`/api/staff/payslips/${slip.id}/mark-paid`));

    const receipt = await prisma.offlinePayment.findFirstOrThrow({ where: { invoiceId: invoice.body.id } });
    return { studentId, parentEmail, receiptNo: receipt.receiptNo ?? '', examId: exam.body.id, attemptId, payslipId: slip.id, score: graded.body.score };
  }

  it('runs admission → attendance → fees → report card → CBT → payroll in both schools concurrently, isolated', async () => {
    const roles = async (logins: Record<string, [string, string]>) =>
      Object.fromEntries(await Promise.all(Object.entries(logins).map(async ([k, [e, p]]) => [k, await login(e, p)]))) as School['roles'];
    const green = 'Demo@Green1';
    const sainik: School = {
      name: 'Sainik', branch: 'sainik01', year: '2026-27', classId: 'cls_06a', subjectId: 'sub_mat', needsTemplate: false,
      roles: await roles({
        ao: ['ao@sainik01.edu', 'Demo@Ao1'], os: ['os@sainik01.edu', 'Demo@Os1'], accounts: ['accounts@sainik01.edu', 'Demo@Accounts1'],
        vp: ['vp@sainik01.edu', 'Demo@Vp1'], principal: ['principal@sainik01.edu', 'Demo@Principal1'],
        academic: ['principal@sainik01.edu', 'Demo@Principal1'], author: ['hod@sainik01.edu', 'Demo@Hod1'],
        payroll: ['hr@sainik01.edu', 'Demo@Hr1'], admin: ['schooladmin@sainik01.edu', 'Demo@Admin1'],
      }),
    };
    const greenfield: School = {
      name: 'Greenfield', branch: 'greenfield02', year: '2026-27', classId: 'g2_cls_5a', subjectId: 'g2_sub_mat', needsTemplate: true,
      roles: await roles(Object.fromEntries(
        ['ao', 'os', 'accounts', 'vp', 'principal', 'academic', 'author', 'payroll', 'admin'].map((k) => [k, ['admin@greenfield02.edu', green] as [string, string]]),
      )),
    };

    const [a, b] = await Promise.all([runYear(sainik), runYear(greenfield)]);

    // Each new record belongs to its own school…
    expect((await prisma.student.findUniqueOrThrow({ where: { id: a.studentId } })).branchId).toBe('sainik01');
    expect((await prisma.student.findUniqueOrThrow({ where: { id: b.studentId } })).branchId).toBe('greenfield02');
    expect(a.receiptNo).toMatch(/^RCPT-SAINIK01-/);
    expect(b.receiptNo).toMatch(/^RCPT-GREENFIELD02-/);
    for (const [id, branch] of [[a.examId, 'sainik01'], [b.examId, 'greenfield02']] as const) {
      expect((await prisma.exam.findUniqueOrThrow({ where: { id } })).branchId).toBe(branch);
    }
    for (const [id, branch] of [[a.attemptId, 'sainik01'], [b.attemptId, 'greenfield02']] as const) {
      expect((await prisma.cbtAttempt.findUniqueOrThrow({ where: { id } })).branchId).toBe(branch);
    }
    expect(await prisma.reportCardSnapshot.count({ where: { studentId: a.studentId, branchId: 'sainik01' } })).toBe(1);
    expect(await prisma.reportCardSnapshot.count({ where: { studentId: b.studentId, branchId: 'greenfield02' } })).toBe(1);

    // …and neither school can see the other's year through the API.
    const sAdmin = sainik.roles.admin;
    const gAdmin = greenfield.roles.admin;
    for (const [who, mine, theirs] of [[sAdmin, a, b], [gAdmin, b, a]] as const) {
      const students = await ok('students', who.get('/api/students?page_size=500'));
      const ids = (students.body.data ?? students.body).map((x: { id: string }) => x.id);
      expect(ids).toContain(mine.studentId);
      expect(ids).not.toContain(theirs.studentId);
      expect((await who.get(`/api/students/${theirs.studentId}`)).status).toBe(404);
      expect((await who.get(`/api/exams/report-card/${theirs.studentId}`)).status).toBe(404);
      expect((await who.get(`/api/cbt/attempts/${theirs.attemptId}`)).status).not.toBe(200);
      const slips = await ok('payslips', who.get('/api/staff/payslips?month=2027-03'));
      expect(slips.body.map((p: { id: string }) => p.id)).not.toContain(theirs.payslipId);
    }
  });
});
