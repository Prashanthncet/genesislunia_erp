import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Plan Phase 11 joint sync: "two simulated schools simultaneously, to confirm tenant
 * isolation actually holds". Module suites each test their own cross-school cases;
 * this one sweeps EVERY list endpoint from both schools and checks no foreign row
 * leaks, then tries foreign ids on reads and writes and checks nothing changed.
 */
// Two full sweeps of ~36 endpoints per test: well past Jest's 5s default.
jest.setTimeout(120_000);

describe('Tenant isolation across all modules (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaService;
  const tok: Record<string, string> = {};

  const LOGINS = {
    sainik: ['schooladmin@sainik01.edu', 'Demo@Admin1'],
    sainikSuper: ['admin@sainik01.edu', 'Admin@123'],
    green: ['admin@greenfield02.edu', 'Demo@Green1'],
    greenParent: ['parent@greenfield02.edu', 'Demo@Green1'],
    sainikParent: ['parent@sainik01.edu', 'Demo@Parent1'],
  } as const;

  // Ids/names that exist in exactly one school. Matched as whole tokens, because
  // "stu_001" is a substring of "g2_stu_001".
  const SAINIK_ONLY = ['stu_001', 'stu_002', 'cls_10a', 't_rajesh', 'sub_mat', 'ex_1', 'sainik01', 'Aditya Vardhan Singh'];
  const GREEN_ONLY = ['g2_stu_001', 'g2_stu_002', 'g2_cls_5a', 'g2_t_asha', 'g2_sub_mat', 'g2_ex_1', 'g2_inv_1', 'greenfield02', 'Neel Joshi'];
  const leaks = (body: string, markers: string[]) =>
    markers.filter((m) => new RegExp(`(^|[^A-Za-z0-9_])${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_]|$)`).test(body));

  const LIST_ENDPOINTS = [
    '/api/students?page_size=500', '/api/classes', '/api/fees/invoices', '/api/fees/payments', '/api/fees/structures',
    '/api/fees/defaulters', '/api/attendance?date=2026-10-01', '/api/attendance/low', '/api/staff', '/api/staff/salaries',
    '/api/staff/payslips', '/api/timetable/teachers', '/api/timetable/school-view', '/api/academics/subjects',
    '/api/academics/syllabus', '/api/academics/assignments', '/api/exams', '/api/exams/grade-bands', '/api/hostel',
    '/api/hostel/allocations', '/api/hostel/visitors', '/api/staff-leaves', '/api/student-leaves', '/api/gate-passes',
    '/api/notifications', '/api/admissions', '/api/admissions/fields', '/api/cbt/tests', '/api/cbt/questions',
    '/api/reports/dashboard', '/api/reports/summary', '/api/reports/fees', '/api/reports/attendance',
    '/api/reports/performance', '/api/audit-log', '/api/auth/users',
  ];

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
      expect(res.status).toBe(200);
      tok[k] = res.body.token;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const as = (who: keyof typeof LOGINS) => ({
    get: (u: string) => request(server).get(u).set('Authorization', `Bearer ${tok[who]}`),
    post: (u: string, b?: object) => request(server).post(u).set('Authorization', `Bearer ${tok[who]}`).send(b as object),
    put: (u: string, b?: object) => request(server).put(u).set('Authorization', `Bearer ${tok[who]}`).send(b as object),
    del: (u: string) => request(server).delete(u).set('Authorization', `Bearer ${tok[who]}`),
  });

  it('greenfield admin: no list endpoint returns a single sainik01 row', async () => {
    const found: string[] = [];
    let checked = 0;
    for (const url of LIST_ENDPOINTS) {
      const res = await as('green').get(url);
      expect(res.status).toBeLessThan(500);
      if (res.status !== 200) continue;
      checked += 1;
      for (const m of leaks(res.text, SAINIK_ONLY)) found.push(`${url} → ${m}`);
    }
    expect(found).toEqual([]);
    expect(checked).toBeGreaterThan(25); // the sweep actually ran against real responses
  });

  it('sainik01 admins (school + super): no list endpoint returns a single greenfield row', async () => {
    const found: string[] = [];
    for (const who of ['sainik', 'sainikSuper'] as const) {
      for (const url of LIST_ENDPOINTS) {
        const res = await as(who).get(url);
        expect(res.status).toBeLessThan(500);
        if (res.status === 200) for (const m of leaks(res.text, GREEN_ONLY)) found.push(`${who} ${url} → ${m}`);
      }
    }
    expect(found).toEqual([]);
  });

  it('direct reads of foreign ids are 404 (not 403 — existence is not revealed)', async () => {
    const urls = [
      '/api/students/g2_stu_001', '/api/students/g2_stu_001/profile', '/api/fees/invoices/g2_inv_1',
      '/api/fees/invoices/g2_inv_1/invoice.pdf', '/api/exams/report-card/g2_stu_001', '/api/exams/report-card/g2_stu_001/pdf',
      '/api/attendance/student/g2_stu_001/calendar?month=2026-10', '/api/timetable/master/g2_cls_5a',
      '/api/classes/g2_cls_5a', '/api/staff/g2_t_asha', '/api/students/g2_stu_001/export/id-card',
    ];
    for (const u of urls) {
      const res = await as('sainik').get(u);
      expect([u, res.status]).toEqual([u, 404]);
    }
  });

  it('writes with foreign ids are refused and the foreign rows are untouched', async () => {
    const before = await prisma.attendanceRecord.findFirstOrThrow({ where: { studentId: 'g2_stu_001', date: '2026-10-01' } });
    const markBefore = await prisma.examMark.findFirstOrThrow({ where: { examId: 'g2_ex_1', studentId: 'g2_stu_001' } });
    const attempts: [string, () => request.Test][] = [
      ['attendance', () => as('sainik').post('/api/attendance', { class_id: 'g2_cls_5a', date: '2026-10-01', records: [{ student_id: 'g2_stu_001', status: 'Absent' }] })],
      ['marks', () => as('sainik').post('/api/exams/marks', { exam_id: 'g2_ex_1', subject_id: 'g2_sub_mat', marks: [{ student_id: 'g2_stu_001', score: 1 }] })],
      ['invoice', () => as('sainik').post('/api/fees/invoices', { student_id: 'g2_stu_001', term: 'X', total_amount: 1, due_date: '2026-12-01' })],
      ['payment', () => as('sainik').post('/api/fees/payments', { invoice_id: 'g2_inv_1', amount_paid: 1, payment_mode: 'Cash' })],
      ['structure', () => as('sainik').post('/api/fees/structures', { class_id: 'g2_cls_5a', fee_type: 'X', amount: 1 })],
      ['student update', () => as('sainik').put('/api/students/g2_stu_001', { full_name: 'Hacked' })],
      ['student class move', () => as('sainik').put('/api/students/stu_002', { class_id: 'g2_cls_5a' })],
      ['incident', () => as('sainik').post('/api/discipline/incidents', { student_id: 'g2_stu_001', incident_date: '2026-10-01', description: 'x' })],
      ['gate pass', () => as('sainik').post('/api/gate-passes', { student_id: 'g2_stu_001', type: 'Local Outing', reason: 'x', out_time: '2026-10-02T10:00' })],
      ['student leave', () => as('sainik').post('/api/student-leaves', { student_id: 'g2_stu_001', leave_type: 'Sick', start_date: '2026-10-12', end_date: '2026-10-12', reason: 'x' })],
      ['staff leave on behalf', () => as('sainik').post('/api/staff-leaves', { staff_id: 'g2_t_asha', leave_type: 'Casual', start_date: '2026-10-12', end_date: '2026-10-12', reason: 'x' })],
      ['timetable slot', () => as('sainik').put('/api/timetable/slot', { class_id: 'g2_cls_5a', day_of_week: 'Mon', period_number: 1, subject: 'Maths', teacher_id: 'g2_t_asha' })],
      ['hostel auto-assign', () => as('sainik').post('/api/hostel/auto-allocate', { student_id: 'g2_stu_001' })],
      ['payment order', () => as('sainik').post('/api/payments/orders', { purpose: 'invoice', ref_id: 'g2_inv_1' })],
      ['user for foreign student', () => as('sainik').post('/api/auth/users', { email: 'x@x.edu', password: 'Abcdefg1', role: 'student', student_id: 'g2_stu_001' })],
    ];
    for (const [label, send] of attempts) {
      const res = await send();
      // Anything but success; 404 is the norm, 400 for DTO-level refusals, 403 never leaks data either.
      expect([label, res.status < 300]).toEqual([label, false]);
      expect([label, res.status]).not.toEqual([label, 500]);
    }
    expect(await prisma.attendanceRecord.findFirstOrThrow({ where: { id: before.id } })).toEqual(before);
    expect(await prisma.examMark.findFirstOrThrow({ where: { id: markBefore.id } })).toEqual(markBefore);
    expect((await prisma.student.findUniqueOrThrow({ where: { id: 'g2_stu_001' } })).fullName).toBe('Neel Joshi');
    expect((await prisma.student.findUniqueOrThrow({ where: { id: 'stu_002' } })).classId).not.toBe('g2_cls_5a');
    expect(await prisma.feeInvoice.count({ where: { studentId: 'g2_stu_001', branchId: 'sainik01' } })).toBe(0);
  });

  it('parents: each school\'s parent sees only their own children', async () => {
    const g = await as('greenParent').get('/api/portal/overview');
    expect(g.status).toBe(200);
    expect(leaks(g.text, SAINIK_ONLY)).toEqual([]);
    expect(g.text).toContain('g2_stu_001');
    const s = await as('sainikParent').get('/api/portal/overview');
    expect(leaks(s.text, GREEN_ONLY)).toEqual([]);
    for (const u of ['/api/portal/children/stu_001/fees', '/api/students/stu_001/profile', '/api/exams/report-card/stu_001']) {
      expect([403, 404]).toContain((await as('greenParent').get(u)).status);
    }
  });
});
