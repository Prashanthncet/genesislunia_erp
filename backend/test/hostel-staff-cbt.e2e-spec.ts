import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Phases 8 (hostel), 9 (staff & payroll) and 10 (CBT): role checks, school isolation,
 * bed allocation under concurrency, roll-call, payroll rules, and the timed CBT flow.
 */
describe('Hostel / Staff & Payroll / CBT (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaService;
  const tok: Record<string, string> = {};

  const LOGINS: Record<string, [string, string]> = {
    admin: ['schooladmin@sainik01.edu', 'Demo@Admin1'],
    warden: ['warden@sainik01.edu', 'Demo@Warden1'],
    security: ['security@sainik01.edu', 'Demo@Security1'],
    teacher: ['teacher@sainik01.edu', 'Demo@Teacher1'],
    hr: ['hr@sainik01.edu', 'Demo@Hr1'],
    accounts: ['accounts@sainik01.edu', 'Demo@Accounts1'],
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
      expect(res.status).toBe(200);
      tok[k] = res.body.token;
    }
    // A student login in the second school, for isolation checks.
    const mk = await as('g2admin').post('/api/auth/users').send({
      email: 'g2student@greenfield02.edu', password: 'Stud3nt@G2x', role: 'student', name: 'G2 Student', student_id: 'g2_stu_001',
    });
    expect(mk.status).toBe(201);
    const g2 = await request(server).post('/api/auth/login').send({ email: 'g2student@greenfield02.edu', password: 'Stud3nt@G2x' });
    expect(g2.status).toBe(200);
    tok.g2student = g2.body.token;
  });

  afterAll(async () => {
    await app.close();
  });

  function as(who: string) {
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${tok[who]}`);
    return {
      get: (u: string) => auth(request(server).get(u)),
      post: (u: string) => auth(request(server).post(u)),
      put: (u: string) => auth(request(server).put(u)),
      del: (u: string) => auth(request(server).delete(u)),
    };
  }

  // ═══ HOSTEL ═══════════════════════════════════════════════════

  describe('hostel', () => {
    let hostelId = '';

    beforeAll(async () => {
      const h = await as('warden').post('/api/hostel').send({ name: 'HSC Test House', warden_id: 't_amit' });
      expect(h.status).toBe(201);
      hostelId = h.body.id;
    });

    it('reads are role-gated: teacher 403, security 200; warden_id from another school 404', async () => {
      expect((await as('teacher').get('/api/hostel')).status).toBe(403);
      expect((await as('teacher').get('/api/hostel/allocations')).status).toBe(403);
      expect((await as('parent').get('/api/hostel/rooms')).status).toBe(403);
      expect((await as('security').get('/api/hostel')).status).toBe(200);
      expect((await as('security').post('/api/hostel/allocations/auto').send({ student_id: 'stu_004' })).status).toBe(403);
      const badWarden = await as('admin').post('/api/hostel').send({ name: 'X', warden_id: 'g2_t_asha' });
      expect(badWarden.status).toBe(404);
    });

    it('hostel capacity = sum of room capacities', async () => {
      await as('warden').post('/api/hostel/rooms').send({ hostel_id: hostelId, room_number: 'HSC-CAP', capacity: 3 });
      const list = await as('warden').get('/api/hostel');
      const mine = list.body.find((h: { id: string }) => h.id === hostelId);
      expect(mine.capacity).toBe(3);
    });

    it('auto-assign of another school\'s student → 404 (no allocation written)', async () => {
      const res = await as('admin').post('/api/hostel/allocations/auto').send({ student_id: 'g2_stu_001' });
      expect(res.status).toBe(404);
      const manual = await as('admin').post('/api/hostel/allocations').send({ student_id: 'g2_stu_001', room_id: 'rm_ju01' });
      expect(manual.status).toBe(404);
      expect(await prisma.hostelAllocation.count({ where: { studentId: 'g2_stu_001' } })).toBe(0);
    });

    it('capacity race: 6 concurrent allocations into a 1-bed room → exactly one succeeds', async () => {
      const room = await as('warden').post('/api/hostel/rooms').send({ hostel_id: hostelId, room_number: 'HSC-RACE', capacity: 1 });
      expect(room.status).toBe(201);
      const free = await as('warden').get('/api/hostel/unallocated-students');
      expect(free.body.length).toBeGreaterThanOrEqual(6);
      const ids: string[] = free.body.slice(0, 6).map((s: { id: string }) => s.id);
      const results = await Promise.all(
        ids.map((sid) => as('warden').post('/api/hostel/allocations').send({ student_id: sid, room_id: room.body.id })),
      );
      const ok = results.filter((r) => r.status === 201);
      const conflict = results.filter((r) => r.status === 409);
      expect(ok.length).toBe(1);
      expect(conflict.length).toBe(5);
      expect(await prisma.hostelAllocation.count({ where: { roomId: room.body.id } })).toBe(1);
      expect(ok[0].body.bed_label).toBe('B1');
    });

    it('beds are unique per room; manual bed choice, first free bed, bed map', async () => {
      const room = await as('warden').post('/api/hostel/rooms').send({ hostel_id: hostelId, room_number: 'HSC-BEDS', capacity: 2 });
      const free = await as('warden').get('/api/hostel/unallocated-students');
      const [a, b] = free.body.map((s: { id: string }) => s.id);
      const first = await as('warden').post('/api/hostel/allocations').send({ student_id: a, room_id: room.body.id, bed_label: 'B2' });
      expect(first.status).toBe(201);
      expect(first.body.bed_label).toBe('B2');
      const clash = await as('warden').post('/api/hostel/allocations').send({ student_id: b, room_id: room.body.id, bed_label: 'B2' });
      expect(clash.status).toBe(409);
      const outOfRange = await as('warden').post('/api/hostel/allocations').send({ student_id: b, room_id: room.body.id, bed_label: 'B9' });
      expect(outOfRange.status).toBe(400);
      const auto = await as('warden').post('/api/hostel/allocations').send({ student_id: b, room_id: room.body.id });
      expect(auto.body.bed_label).toBe('B1');
      const rooms = await as('security').get(`/api/hostel/rooms?hostel_id=${hostelId}`);
      const beds = rooms.body.find((r: { id: string }) => r.id === room.body.id).beds;
      expect(beds.map((x: { label: string; student: { id: string } | null }) => [x.label, x.student?.id])).toEqual([['B1', b], ['B2', a]]);
      const shrink = await as('warden').put(`/api/hostel/rooms/${room.body.id}`).send({ capacity: 1 });
      expect(shrink.status).toBe(409);
    });

    it('roll-call: roster pre-fills On Leave, bulk save with markedBy, history report, role + residency checks', async () => {
      const room = await as('warden').post('/api/hostel/rooms').send({ hostel_id: hostelId, room_number: 'HSC-ROLL', capacity: 4 });
      // stu_004 has an Approved leave 2026-10-12..13 and a Checked Out gate pass in the seed.
      const mv = await as('warden').post('/api/hostel/allocations').send({ student_id: 'stu_004', room_id: room.body.id });
      expect(mv.status).toBe(201);
      const free = await as('warden').get('/api/hostel/unallocated-students');
      const other = free.body[0].id;
      await as('warden').post('/api/hostel/allocations').send({ student_id: other, room_id: room.body.id });

      const roster = await as('security').get(`/api/hostel/roll-call?hostel_id=${hostelId}&date=2026-10-12&session=Night`);
      expect(roster.status).toBe(200);
      const r4 = roster.body.roster.find((r: { student_id: string }) => r.student_id === 'stu_004');
      expect(r4.status).toBe('On Leave');
      expect(r4.saved).toBe(false);
      expect(r4.leave_reason).toMatch(/leave/i);
      const ro = roster.body.roster.find((r: { student_id: string }) => r.student_id === other);
      expect(ro.status).toBe('Present');

      const save = await as('warden').post('/api/hostel/roll-call').send({
        hostel_id: hostelId, date: '2026-10-12', session: 'Night',
        entries: [{ student_id: 'stu_004', status: 'On Leave' }, { student_id: other, status: 'Absent' }],
      });
      expect(save.status).toBe(201);
      expect(save.body.counts).toEqual({ 'On Leave': 1, Absent: 1 });
      const row = await prisma.hostelRollCall.findFirst({ where: { studentId: other, date: '2026-10-12', session: 'Night' } });
      expect(row?.markedBy).toBe('t_amit');

      const again = await as('security').get(`/api/hostel/roll-call?hostel_id=${hostelId}&date=2026-10-12&session=Night`);
      expect(again.body.already_marked).toBe(true);
      expect(again.body.roster.find((r: { student_id: string }) => r.student_id === other).status).toBe('Absent');

      const report = await as('admin').get(`/api/hostel/roll-call/report?from=2026-10-01&to=2026-10-31&status=Absent&hostel_id=${hostelId}`);
      expect(report.status).toBe(200);
      expect(report.body.rows.some((r: { studentId: string }) => r.studentId === other)).toBe(true);

      const outsider = await as('warden').post('/api/hostel/roll-call').send({
        hostel_id: hostelId, date: '2026-10-12', session: 'Morning', entries: [{ student_id: 'g2_stu_001', status: 'Present' }],
      });
      expect(outsider.status).toBe(400);
      const bad = await as('warden').post('/api/hostel/roll-call').send({
        hostel_id: hostelId, date: '2026-10-12', session: 'Noon', entries: [{ student_id: other, status: 'Present' }],
      });
      expect(bad.status).toBe(400);
      const teacher = await as('teacher').post('/api/hostel/roll-call').send({
        hostel_id: hostelId, date: '2026-10-12', session: 'Morning', entries: [{ student_id: other, status: 'Present' }],
      });
      expect(teacher.status).toBe(403);
    });

    it('parent sees only their own children\'s rooms', async () => {
      const res = await as('parent').get('/api/hostel/my');
      expect(res.status).toBe(200);
      const ids = res.body.map((r: { student_id: string }) => r.student_id).sort();
      expect(ids).toEqual(['stu_001', 'stu_004']);
      expect(res.body.find((r: { student_id: string }) => r.student_id === 'stu_004').room).toBe('HSC-ROLL');
    });

    it('visitor log: desk can add with a hostel; unknown hostel 404; teacher 403', async () => {
      const ok = await as('security').post('/api/hostel/visitors').send({ hostel_id: hostelId, visitor_name: 'HSC Visitor', whom_to_meet: 'stu_004', purpose: 'Visit' });
      expect(ok.status).toBe(201);
      const bad = await as('security').post('/api/hostel/visitors').send({ hostel_id: 'nope', visitor_name: 'HSC Visitor', whom_to_meet: 'x' });
      expect(bad.status).toBe(404);
      expect((await as('teacher').post('/api/hostel/visitors').send({ visitor_name: 'x', whom_to_meet: 'y' })).status).toBe(403);
      const list = await as('security').get(`/api/hostel/visitors?hostel_id=${hostelId}`);
      expect(list.body[0].hostelName).toBe('HSC Test House');
    });
  });

  // ═══ STAFF & PAYROLL ══════════════════════════════════════════

  describe('staff & payroll', () => {
    it('teacher is 403 on directory, salaries, payslip list and other profiles', async () => {
      for (const u of ['/api/staff', '/api/staff/salaries', '/api/staff/payslips', '/api/staff/t_meera']) {
        expect((await as('teacher').get(u)).status).toBe(403);
      }
      expect((await as('teacher').post('/api/staff/payslips/generate').send({ month: '2027-03' })).status).toBe(403);
    });

    it('directory never carries salary data; filters by department', async () => {
      const res = await as('hr').get('/api/staff?department=Mathematics');
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.every((s: { department: string }) => s.department === 'Mathematics')).toBe(true);
      expect(JSON.stringify(res.body)).not.toMatch(/salary|basicSalary/i);
      const one = await as('hr').get('/api/staff/t_meera'); // HR is a payroll role → sees salary
      expect(one.body.salaryStructure).toBeDefined();
    });

    it('teacher GET /staff/me + /staff/me/payslips → only their own released payslips', async () => {
      const me = await as('teacher').get('/api/staff/me');
      expect(me.status).toBe(200);
      expect(me.body.id).toBe('t_rajesh');
      const slips = await as('teacher').get('/api/staff/me/payslips');
      expect(slips.status).toBe(200);
      expect(slips.body.length).toBeGreaterThan(0);
      expect(slips.body.every((p: { staffId: string; status: string }) => p.staffId === 't_rajesh' && p.status !== 'Draft')).toBe(true);
    });

    it('payslip PDF: own → 200 pdf, another staff member\'s → 403, payroll role → 200', async () => {
      const own = await prisma.payslip.findFirst({ where: { staffId: 't_rajesh', status: { in: ['Generated', 'Paid'] } } });
      const other = await prisma.payslip.findFirst({ where: { staffId: 't_meera' } });
      const mine = await as('teacher').get(`/api/staff/payslips/${own!.id}/pdf`);
      expect(mine.status).toBe(200);
      expect(mine.headers['content-type']).toContain('application/pdf');
      expect((await as('teacher').get(`/api/staff/payslips/${other!.id}/pdf`)).status).toBe(403);
      expect((await as('accounts').get(`/api/staff/payslips/${other!.id}/pdf`)).status).toBe(200);
    });

    it('unpaid days: negative / >31 / other-school staff → 400', async () => {
      expect((await as('hr').post('/api/staff/payslips/generate').send({ month: '2027-02', unpaid_leave_days: { t_rajesh: -5 } })).status).toBe(400);
      expect((await as('hr').post('/api/staff/payslips/generate').send({ month: '2027-02', unpaid_leave_days: { t_rajesh: 40 } })).status).toBe(400);
      expect((await as('hr').post('/api/staff/payslips/generate').send({ month: '2027-02', unpaid_leave_days: { g2_t_asha: 1 } })).status).toBe(400);
      expect(await prisma.payslip.count({ where: { monthYear: '2027-02' } })).toBe(0);
    });

    it('profile edit keeps maxPeriodsPerDay; phone + department saved', async () => {
      const c = await as('hr').post('/api/staff').send({ name: 'HSC Payroll', email: 'hsc-payroll@sainik01.edu', role: 'Teacher', department: 'Science', phone: '9876543210', max_periods_per_day: 4 });
      expect(c.status).toBe(201);
      const u = await as('hr').put(`/api/staff/${c.body.id}`).send({ phone: '9000000001' });
      expect(u.status).toBe(200);
      const row = await prisma.staff.findUnique({ where: { id: c.body.id } });
      expect(row).toMatchObject({ maxPeriodsPerDay: 4, phone: '9000000001', department: 'Science' });
    });

    it('Draft → Generated → Paid; quota overrun counted as unpaid days', async () => {
      const staff = await prisma.staff.findFirst({ where: { email: 'hsc-payroll@sainik01.edu' } });
      const sid = staff!.id;
      expect((await as('accounts').put(`/api/staff/salaries/${sid}`).send({ basic_salary: 30000, hra: 0, da: 0, tds_percent: 0, epf_percent: 0 })).status).toBe(200);
      // 14 approved Casual days in Jan 2027 against a quota of 12 → 2 unpaid; plus 1 Unpaid day.
      await prisma.staffLeave.createMany({
        data: [
          { branchId: staff!.branchId, staffId: sid, leaveType: 'Casual', startDate: '2027-01-04', endDate: '2027-01-17', status: 'Approved' },
          { branchId: staff!.branchId, staffId: sid, leaveType: 'Unpaid', startDate: '2027-01-20', endDate: '2027-01-20', status: 'Approved' },
          { branchId: staff!.branchId, staffId: sid, leaveType: 'Maternity', startDate: '2027-01-25', endDate: '2027-01-26', status: 'Approved' },
        ],
      });
      const preview = await as('hr').get('/api/staff/payslips/unpaid-preview?month=2027-01');
      expect(preview.body.unpaid[sid]).toEqual({ days: 3, byType: { Casual: 2, Unpaid: 1 } });

      const gen = await as('hr').post('/api/staff/payslips/generate').send({ month: '2027-01', as_draft: true });
      expect(gen.status).toBe(201);
      const slip = await prisma.payslip.findFirst({ where: { staffId: sid, monthYear: '2027-01' } });
      expect(slip).toMatchObject({ status: 'Draft', unpaidDays: 3, otherDeductions: 3000, netSalary: 27000 });

      expect((await as('hr').put(`/api/staff/payslips/${slip!.id}/mark-paid`)).status).toBe(409); // draft can't be paid
      // Drafts are invisible to the staff member
      expect((await as('hr').post('/api/staff/payslips/finalize').send({ month: '2027-01' })).status).toBe(201);
      const paid = await as('accounts').put(`/api/staff/payslips/${slip!.id}/mark-paid`);
      expect(paid.status).toBe(200);
      const after = await prisma.payslip.findUnique({ where: { id: slip!.id } });
      expect(after!.status).toBe('Paid');
      expect(after!.paidAt).toBeTruthy();
      expect((await as('accounts').put(`/api/staff/payslips/${slip!.id}/mark-paid`)).status).toBe(409);

      const rerun = await as('hr').post('/api/staff/payslips/generate').send({ month: '2027-01' });
      expect(rerun.body.generated).toBe(0); // everything released → skipped
    });
  });

  // ═══ CBT ═══════════════════════════════════════════════════════

  describe('cbt', () => {
    const q: Record<string, string> = {};
    let testId = '';
    let attemptId = '';

    beforeAll(async () => {
      const mk = async (body: object) => {
        const r = await as('teacher').post('/api/cbt/questions').send(body);
        expect(r.status).toBe(201);
        return r.body.id as string;
      };
      q.m1 = await mk({ question: 'HSC mcq 1', type: 'mcq', option_a: '1', option_b: '2', option_c: '3', option_d: '4', correct_option: 'B', marks: 2, class_id: 'cls_10a' });
      q.m2 = await mk({ question: 'HSC mcq 2', type: 'mcq', option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd', correct_option: 'C', marks: 1, class_id: 'cls_10a' });
      q.s1 = await mk({ question: 'HSC subjective 1', type: 'subjective', marks: 5, class_id: 'cls_10a' });
      q.s2 = await mk({ question: 'HSC subjective 2', type: 'subjective', marks: 3, class_id: 'cls_10a' });
      const t = await as('teacher').post('/api/cbt/tests').send({ title: 'HSC Test', class_id: 'cls_10a', duration_min: 30, question_ids: [q.m1, q.m2, q.s1, q.s2] });
      expect(t.status).toBe(201);
      testId = t.body.id;
      const pub = await as('teacher').put(`/api/cbt/tests/${testId}/publish`);
      expect(pub.status).toBe(200);
      const row = await prisma.cbtTest.findUnique({ where: { id: testId } });
      expect(row!.publishedAt).toBeTruthy();
    });

    it('teacher GET questions has answers; student GET questions 403, GET test has none', async () => {
      const bank = await as('teacher').get('/api/cbt/questions');
      expect(bank.body.find((x: { id: string }) => x.id === q.m1).correctOption).toBe('B');
      expect((await as('student').get('/api/cbt/questions')).status).toBe(403);
      const paper = await as('student').get(`/api/cbt/tests/${testId}`);
      expect(paper.status).toBe(200);
      expect(JSON.stringify(paper.body)).not.toContain('correctOption');
      expect(paper.body.questions).toBeUndefined();
      expect((await as('student').get('/api/cbt/tests')).status).toBe(403);
      const cross = await as('teacher').post('/api/cbt/questions').send({ question: 'x', type: 'subjective', class_id: 'g2_cls_5a' });
      expect(cross.status).toBe(404);
    });

    it('staff cannot start/submit as a student; student_id in the body is ignored', async () => {
      expect((await as('teacher').post(`/api/cbt/tests/${testId}/start`).send({ student_id: 'stu_001' })).status).toBe(403);
      expect((await as('admin').post(`/api/cbt/tests/${testId}/submit`).send({ student_id: 'stu_001', answers: {} })).status).toBe(403);
      const start = await as('student').post(`/api/cbt/tests/${testId}/start`).send({ student_id: 'stu_002' });
      expect(start.status).toBe(201);
      attemptId = start.body.attempt_id;
      const row = await prisma.cbtAttempt.findUnique({ where: { id: attemptId } });
      expect(row!.studentId).toBe('stu_001');
      expect(await prisma.cbtAttempt.count({ where: { testId, studentId: 'stu_002' } })).toBe(0);
      expect(start.body.status).toBe('In Progress');
      expect(JSON.stringify(start.body)).not.toContain('correctOption');
      expect(start.body.remaining_seconds).toBeGreaterThan(1700);
      expect(Date.parse(start.body.deadline) - Date.parse(start.body.started_at)).toBe(30 * 60_000);
      // resuming returns the same attempt, same deadline
      const again = await as('student').post(`/api/cbt/tests/${testId}/start`).send({});
      expect(again.body.attempt_id).toBe(attemptId);
      expect(again.body.deadline).toBe(start.body.deadline);
    });

    it('autosave merges, validates; another school\'s student gets 404', async () => {
      expect((await as('student').put(`/api/cbt/attempts/${attemptId}/answers`).send({ answers: { [q.m1]: 'B' } })).status).toBe(200);
      expect((await as('student').put(`/api/cbt/attempts/${attemptId}/answers`).send({ answers: { [q.s1]: 'Newton said so' } })).status).toBe(200);
      expect((await as('student').put(`/api/cbt/attempts/${attemptId}/answers`).send({ answers: { [q.m2]: 'E' } })).status).toBe(400);
      expect((await as('student').put(`/api/cbt/attempts/${attemptId}/answers`).send({ answers: { bogus: 'A' } })).status).toBe(400);
      const view = await as('student').get(`/api/cbt/attempts/${attemptId}`);
      expect(view.body.answers).toEqual({ [q.m1]: 'B', [q.s1]: 'Newton said so' });

      expect((await as('g2student').post(`/api/cbt/tests/${testId}/start`)).status).toBe(404);
      expect((await as('g2student').get(`/api/cbt/attempts/${attemptId}`)).status).toBe(404);
      expect((await as('g2student').put(`/api/cbt/attempts/${attemptId}/answers`).send({ answers: { [q.m1]: 'A' } })).status).toBe(404);
      expect((await as('g2student').get(`/api/cbt/tests/${testId}`)).status).toBe(404);
      const g2tests = await as('g2student').get('/api/cbt/my-tests');
      expect(g2tests.body.some((t: { id: string }) => t.id === testId)).toBe(false);
    });

    it('submit once (grades MCQ, queues subjective); double submit 409; autosave after submit 409', async () => {
      const sub = await as('student').post(`/api/cbt/attempts/${attemptId}/submit`).send({ answers: { [q.s2]: 'Second answer' } });
      expect(sub.status).toBe(201);
      expect(sub.body).toMatchObject({ status: 'Submitted', score: 2, max_score: 11, pending_manual_grading: true, auto_submitted: false });
      expect((await as('student').post(`/api/cbt/attempts/${attemptId}/submit`).send({})).status).toBe(409);
      expect((await as('student').post(`/api/cbt/tests/${testId}/submit`).send({})).status).toBe(409);
      expect((await as('student').put(`/api/cbt/attempts/${attemptId}/answers`).send({ answers: { [q.m2]: 'C' } })).status).toBe(409);
    });

    it('grading queue shows the answer text; grades MERGE (Q1 then Q2 both kept); out-of-range 400', async () => {
      const queue = await as('teacher').get(`/api/cbt/grading-queue?test_id=${testId}`);
      const items = queue.body.filter((i: { attempt_id: string }) => i.attempt_id === attemptId);
      expect(items.map((i: { answer: string }) => i.answer).sort()).toEqual(['Newton said so', 'Second answer']);

      expect((await as('teacher').put(`/api/cbt/attempts/${attemptId}/grade`).send({ question_id: q.s1, marks: 6 })).status).toBe(400);
      expect((await as('teacher').put(`/api/cbt/attempts/${attemptId}/grade`).send({ question_id: q.m1, marks: 1 })).status).toBe(400);
      const g1 = await as('teacher').put(`/api/cbt/attempts/${attemptId}/grade`).send({ question_id: q.s1, marks: 4 });
      expect(g1.body).toMatchObject({ score: 6, status: 'Submitted' });
      const g2 = await as('teacher').put(`/api/cbt/attempts/${attemptId}/grade`).send({ question_id: q.s2, marks: 2.5 });
      expect(g2.body).toMatchObject({ score: 8.5, status: 'Graded' });
      expect(g2.body.grades).toEqual({ [q.m1]: 2, [q.m2]: 0, [q.s1]: 4, [q.s2]: 2.5 });
      // re-grading one keeps the other
      const g3 = await as('teacher').put(`/api/cbt/attempts/${attemptId}/grade`).send({ question_id: q.s1, marks: 5 });
      expect(g3.body.grades[q.s2]).toBe(2.5);
      expect(g3.body.score).toBe(9.5);
      expect((await as('student').put(`/api/cbt/attempts/${attemptId}/grade`).send({ question_id: q.s1, marks: 5 })).status).toBe(403);
    });

    it('results: teacher sees answers; student sees own score + breakdown', async () => {
      const res = await as('teacher').get(`/api/cbt/tests/${testId}/results`);
      const row = res.body.find((r: { attempt_id: string }) => r.attempt_id === attemptId);
      expect(row.answers[q.s1]).toBe('Newton said so');
      expect(row.score).toBe(9.5);
      const mine = await as('student').get('/api/cbt/my-results');
      const r = mine.body.find((x: { attempt_id: string }) => x.attempt_id === attemptId);
      expect(r).toMatchObject({ status: 'Graded', score: 9.5, max_score: 11 });
      expect(r.breakdown).toHaveLength(4);
      // the test is still open → correct options are not revealed yet
      expect(r.breakdown.every((b: { correct_option: string | null }) => b.correct_option === null)).toBe(true);
      expect((await as('g2student').get('/api/cbt/my-results')).body).toEqual([]);
    });

    it('submit after the deadline keeps the autosaved answers and is marked auto-submitted', async () => {
      const t = await as('teacher').post('/api/cbt/tests').send({ title: 'HSC Late Test', class_id: 'cls_10a', duration_min: 1, question_ids: [q.m1, q.m2] });
      await as('teacher').put(`/api/cbt/tests/${t.body.id}/publish`);
      const start = await as('student').post(`/api/cbt/tests/${t.body.id}/start`);
      expect(start.status).toBe(201);
      await as('student').put(`/api/cbt/attempts/${start.body.attempt_id}/answers`).send({ answers: { [q.m1]: 'B' } });
      // Time travel: the attempt began 2 minutes ago (1-minute test).
      await prisma.cbtAttempt.update({ where: { id: start.body.attempt_id }, data: { startedAt: new Date(Date.now() - 120_000) } });
      const view = await as('student').get(`/api/cbt/attempts/${start.body.attempt_id}`);
      // GET after deadline+grace lazily auto-submits
      expect(view.body.status).toBe('Graded');
      expect(view.body.auto_submitted).toBe(true);

      // and an explicit late submit on a fresh late attempt: late answers ignored, saved ones graded
      const t2 = await as('teacher').post('/api/cbt/tests').send({ title: 'HSC Late Test 2', class_id: 'cls_10a', duration_min: 1, question_ids: [q.m1, q.m2] });
      await as('teacher').put(`/api/cbt/tests/${t2.body.id}/publish`);
      const s2 = await as('student').post(`/api/cbt/tests/${t2.body.id}/start`);
      await as('student').put(`/api/cbt/attempts/${s2.body.attempt_id}/answers`).send({ answers: { [q.m1]: 'B' } });
      await prisma.cbtAttempt.update({ where: { id: s2.body.attempt_id }, data: { startedAt: new Date(Date.now() - 70_000) } }); // 10 s past deadline, inside grace
      const lateSave = await as('student').put(`/api/cbt/attempts/${s2.body.attempt_id}/answers`).send({ answers: { [q.m2]: 'C' } });
      expect(lateSave.status).toBe(200); // within the 15 s grace
      await prisma.cbtAttempt.update({ where: { id: s2.body.attempt_id }, data: { startedAt: new Date(Date.now() - 90_000) } }); // 30 s past
      const tooLate = await as('student').put(`/api/cbt/attempts/${s2.body.attempt_id}/answers`).send({ answers: { [q.m1]: 'A' } });
      expect(tooLate.status).toBe(409);
      const sub = await as('student').post(`/api/cbt/attempts/${s2.body.attempt_id}/submit`).send({ answers: { [q.m1]: 'A' } });
      expect(sub.status).toBe(201);
      expect(sub.body).toMatchObject({ auto_submitted: true, late_answers_ignored: true, score: 3, status: 'Graded' });
    });

    it('scheduled window: not open yet → 409', async () => {
      const t = await as('teacher').post('/api/cbt/tests').send({
        title: 'HSC Future', class_id: 'cls_10a', duration_min: 30, question_ids: [q.m1], starts_at: new Date(Date.now() + 3_600_000).toISOString(),
      });
      await as('teacher').put(`/api/cbt/tests/${t.body.id}/publish`);
      expect((await as('student').post(`/api/cbt/tests/${t.body.id}/start`)).status).toBe(409);
      const my = await as('student').get('/api/cbt/my-tests');
      expect(my.body.find((x: { id: string }) => x.id === t.body.id).my_status).toBe('Upcoming');
    });
  });
});
