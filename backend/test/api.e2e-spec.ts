import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';

/**
 * Full-surface e2e suite.
 * Requires the backend database to be migrated + seeded:
 *   npx prisma db push && npx prisma db seed
 * The app is booted in-process; no external server needed.
 */

describe('Genesis ERP API (e2e) — full endpoint coverage', () => {
  let app: INestApplication;
  let token = '';
  let server: any;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();

    // Idempotency: remove rows left behind by a previous run of this suite.
    // dev.db is persistent, so leftover creates would fail with 409 on re-runs.
    const prisma = app.get(PrismaService);
    await prisma.student.deleteMany({ where: { admissionNo: 'S2026-999' } });
    await prisma.staff.deleteMany({ where: { email: 'testteacher@sainik01.edu' } });
    await prisma.substitution.deleteMany({ where: { date: '2026-09-28' } });

    // Module-e2e leftovers (persistent dev.db): children first, then parents.
    await prisma.offlinePayment.deleteMany({ where: { invoice: { term: 'E2E-Term' } } });
    await prisma.feeInvoice.deleteMany({ where: { term: 'E2E-Term' } });
    await prisma.cbtAttempt.deleteMany({ where: { test: { title: 'E2E CBT Test' } } });
    await prisma.cbtTest.deleteMany({ where: { title: 'E2E CBT Test' } });
    await prisma.cbtQuestion.deleteMany({ where: { question: { startsWith: 'E2E' } } });
    await prisma.visitorLog.deleteMany({ where: { visitorName: 'E2E Visitor' } });
    await prisma.hostelAllocation.deleteMany({ where: { room: { roomNumber: { in: ['E2E-101', 'E2E-102'] } } } });
    await prisma.room.deleteMany({ where: { roomNumber: { in: ['E2E-101', 'E2E-102'] } } });
    await prisma.hostel.deleteMany({ where: { name: 'E2E Hostel' } });
    await prisma.incident.deleteMany({ where: { description: { startsWith: 'E2E' } } });
    await prisma.staffLeave.deleteMany({ where: { staff: { email: 'e2e-staff@sainik01.edu' } } });
    await prisma.payslip.deleteMany({ where: { staff: { email: 'e2e-staff@sainik01.edu' } } });
    await prisma.salaryStructure.deleteMany({ where: { staff: { email: 'e2e-staff@sainik01.edu' } } });
    await prisma.staff.deleteMany({ where: { email: 'e2e-staff@sainik01.edu' } });
    await prisma.gatePass.deleteMany({ where: { type: 'E2E Check' } });
    await prisma.studentLeave.deleteMany({ where: { reason: 'E2E' } });
    await prisma.class.deleteMany({ where: { name: 'E2E Class' } });
    await prisma.admissionDocument.deleteMany({ where: { admission: { parentEmail: 'docs@test.com' } } });
    await prisma.admission.deleteMany({ where: { parentEmail: 'docs@test.com' } });
    await prisma.admission.deleteMany({ where: { parentEmail: { in: ['rollno@test.com', 'rollno2@test.com', 'public@test.com'] } } });
    await prisma.staffLeave.deleteMany({ where: { staff: { email: 'e2e-payroll@sainik01.edu' } } });
    await prisma.payslip.deleteMany({ where: { staff: { email: 'e2e-payroll@sainik01.edu' } } });
    await prisma.salaryStructure.deleteMany({ where: { staff: { email: 'e2e-payroll@sainik01.edu' } } });
    await prisma.staff.deleteMany({ where: { email: 'e2e-payroll@sainik01.edu' } });
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (url: string) => request(server).get(url).set('Authorization', `Bearer ${token}`);
  const post = (url: string, body?: object) =>
    request(server).post(url).set('Authorization', `Bearer ${token}`).send(body as object);
  const put = (url: string, body?: object) =>
    request(server).put(url).set('Authorization', `Bearer ${token}`).send(body as object);
  const del = (url: string) => request(server).delete(url).set('Authorization', `Bearer ${token}`);

  /** Request helpers bound to another role's token (most of this suite runs as the school admin). */
  const loginAs = async (email: string, password: string) => {
    const res = await request(server).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    const t = res.body.token as string;
    return {
      get: (url: string) => request(server).get(url).set('Authorization', `Bearer ${t}`),
      post: (url: string, body?: object) => request(server).post(url).set('Authorization', `Bearer ${t}`).send(body as object),
      put: (url: string, body?: object) => request(server).put(url).set('Authorization', `Bearer ${t}`).send(body as object),
      del: (url: string) => request(server).delete(url).set('Authorization', `Bearer ${t}`),
    };
  };

  // ─── AUTH ────────────────────────────────────────────────────

  it('POST /api/auth/login → 200 with token for valid credentials', async () => {
    const res = await request(server)
      .post('/api/auth/login')
      .send({ email: 'schooladmin@sainik01.edu', password: 'Demo@Admin1' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.role).toBe('branch_admin');
    expect(res.body.branch_id).toBe('sainik01');
    token = res.body.token;
  });

  it('POST /api/auth/login → 401 for invalid credentials', async () => {
    const res = await request(server)
      .post('/api/auth/login')
      .send({ email: 'schooladmin@sainik01.edu', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me → 200 with decoded payload', async () => {
    const res = await get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('branch_admin');
  });

  it('GET /api/auth/me → 401 without token', async () => {
    const res = await request(server).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /api/students → 401 with garbage token', async () => {
    const res = await request(server)
      .get('/api/students')
      .set('Authorization', 'Bearer garbage.token.here');
    expect(res.status).toBe(401);
  });

  // ─── CLASSES & STUDENTS ──────────────────────────────────────

  it('GET /api/classes → 200 with seeded classes', async () => {
    const res = await get('/api/classes');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
    expect(res.body.some((c: { id: string }) => c.id === 'cls_10a')).toBe(true);
  });

  it('GET /api/students → 200 paginated list', async () => {
    const res = await get('/api/students');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.total).toBeGreaterThanOrEqual(4);
  });

  it('GET /api/students?class_id → 200 filtered', async () => {
    const res = await get('/api/students?class_id=cls_10a');
    expect(res.status).toBe(200);
    expect(res.body.data.every((s: { classId: string }) => s.classId === 'cls_10a')).toBe(true);
  });

  it('POST /api/students → 201 creates student', async () => {
    const res = await post('/api/students', {
      admission_no: 'S2026-999',
      full_name: 'Test Student',
      gender: 'Male',
      class_id: 'cls_10b',
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });

  it('POST /api/students → 409 duplicate admission_no', async () => {
    const res = await post('/api/students', {
      admission_no: 'S2026-999',
      full_name: 'Duplicate Student',
      gender: 'Male',
      class_id: 'cls_10b',
    });
    expect(res.status).toBe(409);
  });

  it('POST /api/students → 400 invalid gender', async () => {
    const res = await post('/api/students', {
      admission_no: 'S2026-998',
      full_name: 'Bad Gender',
      gender: 'Alien',
      class_id: 'cls_10b',
    });
    expect(res.status).toBe(400);
  });

  // ─── ATTENDANCE ──────────────────────────────────────────────

  it('POST /api/attendance → 200 batch mark', async () => {
    const res = await post('/api/attendance', {
      class_id: 'cls_10a',
      date: '2026-09-29',
      records: [
        { student_id: 'stu_001', status: 'Present' },
        { student_id: 'stu_002', status: 'Absent' },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(2);
  });

  it('GET /api/attendance → 200 returns marked records', async () => {
    const res = await get('/api/attendance?class_id=cls_10a&date=2026-09-29');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  it('POST /api/attendance/notify-absent → 200 with notified count', async () => {
    const res = await post('/api/attendance/notify-absent', { date: '2026-09-29' });
    expect(res.status).toBe(201);
    expect(res.body.notified).toBeGreaterThanOrEqual(0);
  });

  it('POST /api/attendance → 400 missing records', async () => {
    const res = await post('/api/attendance', { class_id: 'cls_10a', date: '2026-09-29' });
    expect(res.status).toBe(400);
  });

  // ─── EXAMS ───────────────────────────────────────────────────

  it('GET /api/exams → 200 list', async () => {
    const res = await get('/api/exams');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it('GET /api/exams/subjects/:level → 200', async () => {
    const res = await get('/api/exams/subjects/Class 9-10');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
  });

  it('POST /api/exams/marks → 201 records marks', async () => {
    const res = await post('/api/exams/marks', {
      exam_id: 'ex_1',
      marks: [{ student_id: 'stu_001', subject_id: 'sub_mat', score: 88, max_score: 100 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.recorded).toBe(1);
  });

  it('GET /api/exams/reports/:studentId → 200 report card', async () => {
    const res = await get('/api/exams/reports/stu_001');
    expect(res.status).toBe(200);
    expect(res.body.student.full_name).toBe('Aditya Vardhan Singh');
    expect(res.body.results.length).toBeGreaterThanOrEqual(2);
    expect(res.body.results[0]).toHaveProperty('subject_code');
  });

  it('GET /api/exams/reports/:studentId → 404 unknown student', async () => {
    const res = await get('/api/exams/reports/stu_nope');
    expect(res.status).toBe(404);
  });

  // ─── TIMETABLE: teachers ─────────────────────────────────────

  it('GET /api/timetable/teachers → 200', async () => {
    const res = await get('/api/timetable/teachers');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(4);
  });

  it('POST /api/timetable/teachers → 201', async () => {
    const res = await post('/api/timetable/teachers', {
      name: 'Test Teacher',
      email: 'testteacher@sainik01.edu',
      subjects: 'Biology',
      max_periods_per_day: 5,
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });

  it('PUT /api/timetable/teachers/:id → 200 update', async () => {
    const teachers = await (await get('/api/timetable/teachers')).body;
    const t = teachers.find((x: { email: string }) => x.email === 'testteacher@sainik01.edu');
    const res = await put(`/api/timetable/teachers/${t.id}`, { name: 'Renamed Teacher', max_periods_per_day: 4 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ─── TIMETABLE: rooms & periods ──────────────────────────────

  it('POST /api/timetable/rooms → 201, GET → listed, DELETE → 200', async () => {
    const created = await post('/api/timetable/rooms', { name: 'Test Room', type: 'Classroom', capacity: 30 });
    expect(created.status).toBe(201);

    const list = await get('/api/timetable/rooms');
    expect(list.body.some((r: { name: string }) => r.name === 'Test Room')).toBe(true);

    const removed = await del(`/api/timetable/rooms/${created.body.id}`);
    expect(removed.status).toBe(200);
  });

  it('GET /api/timetable/periods → 200 seeded periods', async () => {
    const res = await get('/api/timetable/periods');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(6);
  });

  it('POST /api/timetable/periods → 200 replace config', async () => {
    const res = await post('/api/timetable/periods', {
      periods: [
        { period_number: 1, start_time: '08:00', end_time: '08:45' },
        { period_number: 2, start_time: '08:45', end_time: '09:30' },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const list = await get('/api/timetable/periods');
    expect(list.body.length).toBe(2);

    // restore original config
    await post('/api/timetable/periods', {
      periods: [
        { period_number: 1, start_time: '08:00', end_time: '08:45' },
        { period_number: 2, start_time: '08:45', end_time: '09:30' },
        { period_number: 3, start_time: '09:30', end_time: '10:15', is_break: true, break_name: 'Short Break' },
        { period_number: 4, start_time: '10:45', end_time: '11:30' },
        { period_number: 5, start_time: '11:30', end_time: '12:15' },
        { period_number: 6, start_time: '13:00', end_time: '13:45' },
      ],
    });
  });

  // ─── TIMETABLE: slot upsert + views ──────────────────────────

  it('PUT /api/timetable/slot → 200 upsert; conflict → 409', async () => {
    const ok = await put('/api/timetable/slot', {
      class_id: 'cls_10b',
      day_of_week: 'Tue',
      period_number: 1,
      subject: 'Mathematics',
      teacher_id: 't_meera',
    });
    expect(ok.status).toBe(200);

    // t_meera now busy Tue P1 with cls_10b → same slot for cls_12_sci must 409
    const conflict = await put('/api/timetable/slot', {
      class_id: 'cls_12_sci',
      day_of_week: 'Tue',
      period_number: 1,
      subject: 'Mathematics',
      teacher_id: 't_meera',
    });
    expect(conflict.status).toBe(409);
  });

  it('GET /api/timetable/master/:classId → 200', async () => {
    const res = await get('/api/timetable/master/cls_10a');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
    expect(res.body[0].teacher_name).toBeDefined();
  });

  it('GET /api/timetable/today/:classId → 200 with schedule', async () => {
    const res = await get('/api/timetable/today/cls_10a?date=2026-09-28'); // a Monday
    expect(res.status).toBe(200);
    expect(res.body.day).toBe('Mon');
    expect(res.body.schedule.length).toBeGreaterThanOrEqual(3);
  });

  it('GET /api/timetable/school-view → 200 grouped by class', async () => {
    const res = await get('/api/timetable/school-view?date=2026-09-28');
    expect(res.status).toBe(200);
    expect(res.body.classes.length).toBeGreaterThanOrEqual(1);
  });

  // ─── TIMETABLE: substitutions ────────────────────────────────

  it('POST /api/timetable/substitute → 200 assigns available teacher', async () => {
    const res = await post('/api/timetable/substitute', {
      date: '2026-09-28',
      class_id: 'cls_10a',
      period_number: 1,
      original_teacher_id: 't_meera',
      reason: 'Manual test sub',
    });
    expect(res.status).toBe(201);
    expect(res.body.assigned_to).toBeDefined();
    expect(res.body.substitution_id).toBeDefined();
  });

  it('GET /api/timetable/substitutions?date → 200 with entries', async () => {
    const res = await get('/api/timetable/substitutions?date=2026-09-28');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].substitute_name).toBeDefined();
  });

  it('POST /api/timetable/teachers/:id/absent → 200 bulk auto-sub', async () => {
    // t_rajesh teaches Mon P2 (cls_10a)
    const res = await post('/api/timetable/teachers/t_rajesh/absent', {
      date: '2026-09-28',
      reason: 'Sick leave',
    });
    expect(res.status).toBe(201);
    expect(res.body.substitutions.length).toBeGreaterThanOrEqual(1);
  });

  it('DELETE /api/timetable/substitutions/:id → 200 revoke', async () => {
    const subs = await (await get('/api/timetable/substitutions?date=2026-09-28')).body;
    expect(subs.length).toBeGreaterThanOrEqual(1);
    const res = await del(`/api/timetable/substitutions/${subs[0].id}`);
    expect(res.status).toBe(200);
  });

  // ─── TIMETABLE: CSP generator ────────────────────────────────

  it('POST /api/timetable/generate → 400 on slot mismatch', async () => {
    const res = await post('/api/timetable/generate', {
      class_id: 'cls_12_sci',
      periods_per_day: 2,
      working_days: ['Mon', 'Tue'],
      subjects: [{ name: 'Maths', teacher_id: 't_meera', periods_per_week: 5 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Slot mismatch');
  });

  it('POST /api/timetable/generate → 201 valid CSP solve', async () => {
    const res = await post('/api/timetable/generate', {
      class_id: 'cls_12_sci',
      periods_per_day: 2,
      working_days: ['Mon', 'Tue'],
      overwrite: true,
      subjects: [
        { name: 'Maths', teacher_id: 't_meera', periods_per_week: 2 },
        // Not t_rajesh: he already teaches his 4-period daily maximum elsewhere on Mon/Tue,
        // and the generator now (correctly) counts lessons in other classes.
        { name: 'English', teacher_id: 't_naveen', periods_per_week: 1 },
        { name: 'Physics', teacher_id: 't_arjun', periods_per_week: 1 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.generated).toBe(4);
    // verify no teacher double-booked
    const seen = new Set<string>();
    for (const a of res.body.timetable) {
      const key = `${a.day}:${a.period}:${a.teacher_id}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  // ─── TIMETABLE: exam scheduler ───────────────────────────────

  it('POST /api/timetable/exams/schedule → 201; conflict → 409; DELETE → 200', async () => {
    const created = await post('/api/timetable/exams/schedule', {
      exam_id: 'ex_1',
      date: '2026-07-20',
      period_number: 1,
      room_id: 'lab_402',
      invigilator_id: 't_arjun',
      subject: 'Science',
    });
    expect(created.status).toBe(201);

    const conflictRoom = await post('/api/timetable/exams/schedule', {
      exam_id: 'ex_2',
      date: '2026-07-20',
      period_number: 1,
      room_id: 'lab_402',
      subject: 'Maths',
    });
    expect(conflictRoom.status).toBe(409);

    const conflictTeacher = await post('/api/timetable/exams/schedule', {
      exam_id: 'ex_2',
      date: '2026-07-20',
      period_number: 1,
      invigilator_id: 't_arjun',
      subject: 'Maths',
    });
    expect(conflictTeacher.status).toBe(409);

    const list = await get('/api/timetable/exams');
    expect(list.body.length).toBeGreaterThanOrEqual(1);
    expect(list.body[0].exam_name).toBeDefined();

    const removed = await del(`/api/timetable/exams/schedule/${created.body.id}`);
    expect(removed.status).toBe(200);
  });

  // ─── ADMISSIONS ──────────────────────────────────────────────
  // The workflow is role-per-step (AO → parent via link → AO → payment → Accounts → OS
  // → VP → Principal sign-off) and is covered end to end, role by role, in
  // test/admissions.e2e-spec.ts. The walk-through that used to live here drove every
  // step as one admin and had staff submit the parent's form — both now forbidden.

  let applicationId = '';

  it('GET /api/admissions/fields → published template for the session', async () => {
    const res = await get('/api/admissions/fields');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('POST /api/admissions/trigger-links → 201 generates applications', async () => {
    const res = await post('/api/admissions/trigger-links', {
      parents: [
        { parent_name: 'Test Parent', parent_email: 'parent@test.com', parent_contact: '9999999999' },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.generated.length).toBe(1);
    expect(res.body.generated[0].login_id).toBeDefined();
    applicationId = res.body.generated[0].id;
  });

  it('staff cannot submit a form on the parent\'s behalf, and steps cannot be skipped', async () => {
    const submit = await post(`/api/admissions/${applicationId}/submit`, { student_name: 'Applicant Singh' });
    expect(submit.status).toBe(404); // route removed: only the parent's link submits
    const skip = await post(`/api/admissions/${applicationId}/validate`, { isValid: true });
    expect(skip.status).toBe(409); // still "Links Sent"
  });

  it('POST /api/admissions/999/validate → 404 unknown application', async () => {
    const res = await post('/api/admissions/does-not-exist/validate', { isValid: true });
    expect(res.status).toBe(404);
  });

  // ─── CLASSES CRUD ────────────────────────────────────────────

  it('POST /api/classes → 201 create; GET :id; PUT update; DELETE remove', async () => {
    const created = await post('/api/classes', { name: 'E2E Class', section: 'A' });
    expect(created.status).toBe(201);
    const upd = await put(`/api/classes/${created.body.id}`, { section: 'B' });
    expect(upd.status).toBe(200);
    const got = await get(`/api/classes/${created.body.id}`);
    expect(got.status).toBe(200);
    const removed = await del(`/api/classes/${created.body.id}`);
    expect(removed.status).toBe(200);
  });

  // ─── STUDENTS: pagination, update, status ────────────────────

  it('GET /api/students?page → 200 paginated envelope', async () => {
    const res = await get('/api/students?page=1&page_size=2');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(4);
    expect(res.body.data.length).toBeLessThanOrEqual(2);
  });

  it('PUT /api/students/:id → 200 update; PUT :id/status → 200', async () => {
    const list = await get('/api/students?class_id=cls_10b');
    const target = list.body.data.find((s: { admissionNo: string }) => s.admissionNo === 'S2026-999');
    expect(target).toBeDefined();
    const upd = await put(`/api/students/${target.id}`, { mother_name: 'E2E Mother' });
    expect(upd.status).toBe(200);
    const inactive = await put(`/api/students/${target.id}/status`, { status: 'Inactive' });
    expect(inactive.status).toBe(200);
    const back = await put(`/api/students/${target.id}/status`, { status: 'Active' });
    expect(back.status).toBe(200);
  });

  // ─── ACADEMICS ───────────────────────────────────────────────

  it('academics subjects → create, update, list', async () => {
    const created = await post('/api/academics/subjects', { name: 'E2E Subject', code: 'E2E', level: 'Secondary' });
    expect(created.status).toBe(201);
    ids.subjectId = created.body.id;

    const upd = await put(`/api/academics/subjects/${ids.subjectId}`, { name: 'E2E Subject Renamed' });
    expect(upd.status).toBe(200);

    const list = await get('/api/academics/subjects');
    expect(list.body.some((s: { id: string }) => s.id === ids.subjectId)).toBe(true);
  });

  it('academics syllabus → create + delete', async () => {
    const created = await post('/api/academics/syllabus', { class_id: 'cls_10a', subject_id: ids.subjectId, title: 'E2E Unit' });
    expect(created.status).toBe(201);
    const removed = await del(`/api/academics/syllabus/${created.body.id}`);
    expect(removed.status).toBe(200);
  });

  it('academics lesson plans → create, update, delete', async () => {
    const sy = await post('/api/academics/syllabus', { class_id: 'cls_10a', subject_id: ids.subjectId, title: 'E2E Unit LP' });
    const created = await post('/api/academics/lesson-plans', { syllabus_id: sy.body.id, teacher_id: 't_rajesh', topic: 'E2E Topic', date: '2026-10-05' });
    expect(created.status).toBe(201);
    const upd = await put(`/api/academics/lesson-plans/${created.body.id}`, { status: 'Completed' });
    expect(upd.status).toBe(200);
    await del(`/api/academics/lesson-plans/${created.body.id}`);
    await del(`/api/academics/syllabus/${sy.body.id}`);
  });

  it('academics assignments → create, list, delete; subject delete guard', async () => {
    const created = await post('/api/academics/assignments', { class_id: 'cls_10a', subject_id: ids.subjectId, teacher_id: 't_rajesh', title: 'E2E Homework', due_date: '2026-10-10' });
    expect(created.status).toBe(201);
    const list = await get('/api/academics/assignments?class_id=cls_10a');
    expect(list.body.some((a: { id: string }) => a.id === created.body.id)).toBe(true);
    const removed = await del(`/api/academics/assignments/${created.body.id}`);
    expect(removed.status).toBe(200);

    // subject with no marks/syllabus left can be deleted
    const subjectDel = await del(`/api/academics/subjects/${ids.subjectId}`);
    expect(subjectDel.status).toBe(200);
  });

  // ─── FEES ────────────────────────────────────────────────────

  it('fees structures → create, update, list, delete', async () => {
    const created = await post('/api/fees/structures', { class_id: 'cls_10a', fee_type: 'E2E Fee', amount: 500 });
    expect(created.status).toBe(201);
    const upd = await put(`/api/fees/structures/${created.body.id}`, { amount: 600 });
    expect(upd.status).toBe(200);
    const list = await get('/api/fees/structures?class_id=cls_10a');
    expect(list.body.some((s: { id: string }) => s.id === created.body.id)).toBe(true);
    const removed = await del(`/api/fees/structures/${created.body.id}`);
    expect(removed.status).toBe(200);
  });

  it('fees invoice lifecycle → create, partial pay, overpay 409, full pay, detail', async () => {
    const created = await post('/api/fees/invoices', { student_id: 'stu_001', term: 'E2E-Term', total_amount: 500, due_date: '2026-10-15' });
    expect(created.status).toBe(201);
    ids.invoiceId = created.body.id;

    const p1 = await post('/api/fees/payments', { invoice_id: ids.invoiceId, amount_paid: 200, payment_mode: 'Cash' });
    expect(p1.status).toBe(201);
    expect(p1.body.invoice_status).toBe('Partially Paid');

    const over = await post('/api/fees/payments', { invoice_id: ids.invoiceId, amount_paid: 999, payment_mode: 'Cash' });
    expect(over.status).toBe(409);

    const p2 = await post('/api/fees/payments', { invoice_id: ids.invoiceId, amount_paid: 300, payment_mode: 'UPI' });
    expect(p2.status).toBe(201);
    expect(p2.body.invoice_status).toBe('Paid');

    const detail = await get(`/api/fees/invoices/${ids.invoiceId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.balance).toBe(0);
  });

  // ─── HOSTEL ──────────────────────────────────────────────────

  it('hostel → hostel+room CRUD, auto-allocate, deallocate, visitor in/out, cleanup deletes', async () => {
    const h = await post('/api/hostel', { name: 'E2E Hostel', capacity: 10 });
    expect(h.status).toBe(201);
    ids.hostelId = h.body.id;

    const r = await post('/api/hostel/rooms', { hostel_id: ids.hostelId, room_number: 'E2E-101', capacity: 2 });
    expect(r.status).toBe(201);
    ids.roomId = r.body.id;

    const auto = await post('/api/hostel/allocations/auto', { student_id: 'stu_004' });
    expect(auto.status).toBe(201);
    expect(auto.body.room_number).toBeDefined();

    const allocs = await get('/api/hostel/allocations');
    const mine = allocs.body.find((a: { student: { id: string } }) => a.student.id === 'stu_004');
    const un = await del(`/api/hostel/allocations/${mine.id}`);
    expect(un.status).toBe(200);

    const v = await post('/api/hostel/visitors', { visitor_name: 'E2E Visitor', whom_to_meet: 'stu_004 guardian', purpose: 'Visit' });
    expect(v.status).toBe(201);
    expect(v.body.pass_no).toBeDefined();
    const co = await put(`/api/hostel/visitors/${v.body.id}/checkout`);
    expect(co.status).toBe(200);
    const dupOut = await put(`/api/hostel/visitors/${v.body.id}/checkout`);
    expect(dupOut.status).toBe(409);

    const dr = await del(`/api/hostel/rooms/${ids.roomId}`);
    expect(dr.status).toBe(200);
    const dh = await del(`/api/hostel/${ids.hostelId}`);
    expect(dh.status).toBe(200);
  });

  // ─── DISCIPLINE ──────────────────────────────────────────────

  it('discipline incidents → create, view (audited), status transitions, audit-log, delete', async () => {
    // Plan Phase 5: case records are visible to the safeguarding team + principal only.
    const lead = await loginAs('discipline@sainik01.edu', 'Demo@Discipline1');
    const principal = await loginAs('principal@sainik01.edu', 'Demo@Principal1');
    const created = await lead.post('/api/discipline/incidents', {
      student_id: 'stu_002', incident_date: '2026-09-30', description: 'E2E incident description', demerits: 2, confidential_notes: 'E2E confidential',
    });
    expect(created.status).toBe(201);
    ids.incidentId = created.body.id;

    const got = await lead.get(`/api/discipline/incidents/${ids.incidentId}`);
    expect(got.status).toBe(200);
    // School admin is not on the case team; 404 (not 403) so non-team staff can't even confirm a case exists.
    expect([403, 404]).toContain((await get(`/api/discipline/incidents/${ids.incidentId}`)).status);

    const st = await lead.put(`/api/discipline/incidents/${ids.incidentId}/status`, { status: 'Under Review' });
    expect(st.status).toBe(200);
    const bad = await lead.put(`/api/discipline/incidents/${ids.incidentId}/status`, { status: 'Bogus' });
    expect(bad.status).toBe(400);

    const audit = await lead.get('/api/discipline/audit-log?entity=incident');
    expect(audit.status).toBe(200);
    expect(audit.body.some((e: { action: string; entityId: string }) => e.action === 'VIEW' && e.entityId === ids.incidentId)).toBe(true);

    const removed = await principal.del(`/api/discipline/incidents/${ids.incidentId}`); // soft delete, principal only
    expect(removed.status).toBe(200);
  });

  // ─── STAFF & PAYROLL ─────────────────────────────────────────

  it('staff → create, update, salary upsert, payslip generate (leave-docked) + mark-paid, idempotency, soft delete', async () => {
    const created = await post('/api/staff', { name: 'E2E Staff', email: 'e2e-staff@sainik01.edu', role: 'Teacher', max_periods_per_day: 5 });
    expect(created.status).toBe(201);
    ids.staffId = created.body.id;

    const upd = await put(`/api/staff/${ids.staffId}`, { subjects: 'E2E Science' });
    expect(upd.status).toBe(200);

    const sal = await put(`/api/staff/salaries/${ids.staffId}`, { basic_salary: 30000, hra: 5000, da: 2000, tds_percent: 5, epf_percent: 12 });
    expect(sal.status).toBe(200);

    const gen = await post('/api/staff/payslips/generate', { month: '2026-09', unpaid_leave_days: { [ids.staffId]: 1 } });
    expect(gen.status).toBe(201);
    expect(gen.body.generated).toBeGreaterThanOrEqual(1);

    const slips = await get('/api/staff/payslips?month=2026-09');
    const mine = slips.body.find((p: { staffId: string }) => p.staffId === ids.staffId);
    expect(mine).toBeDefined();
    expect(mine.otherDeductions).toBe(1000); // 30000/30 × 1 unpaid day
    expect(mine.netSalary).toBe(30550); // 37000 gross − 1850 TDS − 3600 EPF − 1000 unpaid

    const paid = await put(`/api/staff/payslips/${mine.id}/mark-paid`);
    expect(paid.status).toBe(200);

    const gen2 = await post('/api/staff/payslips/generate', { month: '2026-09' });
    expect(gen2.body.skipped).toBeGreaterThanOrEqual(1); // idempotent per month

    const rem = await del(`/api/staff/${ids.staffId}`);
    expect(rem.status).toBe(200);
    expect(rem.body.deactivated).toBe(true); // has payslip history → soft-deactivate
  });

  it('staff leaves → apply, approve, double-decision 400, notification logged', async () => {
    const staffList = await get('/api/staff');
    const member = staffList.body.find((s: { email: string }) => s.email === 'e2e-staff@sainik01.edu');
    expect(member).toBeDefined();

    const created = await post('/api/staff-leaves', { staff_id: member.id, leave_type: 'E2E Leave', start_date: '2026-10-12', end_date: '2026-10-13', reason: 'E2E' });
    expect(created.status).toBe(201);
    ids.leaveId = created.body.id;

    const decide = await put(`/api/staff-leaves/${ids.leaveId}/decision`, { decision: 'Approved' });
    expect(decide.status).toBe(200);
    const again = await put(`/api/staff-leaves/${ids.leaveId}/decision`, { decision: 'Rejected' });
    expect(again.status).toBe(400); // already decided

    const notes = await get('/api/notifications?ref_type=staff_leave');
    expect(notes.body.some((n: { refId: string }) => n.refId === ids.leaveId)).toBe(true);
  });

  it('student leaves → create + decision', async () => {
    const created = await post('/api/student-leaves', { student_id: 'stu_001', leave_type: 'Sick', start_date: '2026-10-12', end_date: '2026-10-12', reason: 'E2E' });
    expect(created.status).toBe(201);
    const decide = await put(`/api/student-leaves/${created.body.id}/decision`, { decision: 'Rejected' });
    expect(decide.status).toBe(200);
  });

  it('gate passes → full lifecycle with parent OTP enforcement', async () => {
    const created = await post('/api/gate-passes', { student_id: 'stu_001', type: 'E2E Check', reason: 'E2E outing', out_time: '2026-10-02T10:00' });
    expect(created.status).toBe(201);
    ids.passId = created.body.id;

    const detail = await get(`/api/gate-passes/${ids.passId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.parentOtp).toBeUndefined(); // never exposed to staff

    const earlyCheckout = await put(`/api/gate-passes/${ids.passId}/checkout`, { otp: '123456' });
    expect(earlyCheckout.status).toBe(400); // must be fully approved first

    // The OTP goes only to the parent, on final approval: capture it from the dispatcher.
    const notify = jest.spyOn(NotificationsService.prototype, 'notify');
    await put(`/api/gate-passes/${ids.passId}/approve-warden`);
    const principal = await put(`/api/gate-passes/${ids.passId}/approve-principal`);
    expect(principal.status).toBe(200);
    const sent = notify.mock.calls.map((c) => c[0]).find((n) => n.ref_type === 'gate_pass' && n.ref_id === ids.passId && (n.redact?.length ?? 0) > 0);
    notify.mockRestore();
    const otp = sent?.redact?.[0] as string;
    expect(otp).toMatch(/^\d{6}$/);

    const badOtp = await put(`/api/gate-passes/${ids.passId}/checkout`, { otp: otp === '000000' ? '111111' : '000000' });
    expect([400, 403]).toContain(badOtp.status);

    const co = await put(`/api/gate-passes/${ids.passId}/checkout`, { otp });
    expect(co.status).toBe(200);

    const ci = await put(`/api/gate-passes/${ids.passId}/checkin`);
    expect(ci.status).toBe(200);
    expect(ci.body.status).toBe('Returned');
  });

  // ─── REPORTS ─────────────────────────────────────────────────

  it('GET /api/reports/dashboard → 200 cross-module counts', async () => {
    const res = await get('/api/reports/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.students_active).toBeGreaterThanOrEqual(4);
    expect(res.body.fees).toHaveProperty('collection_pct');
  });

  it('GET /api/reports/attendance → 200 per-class rows', async () => {
    const res = await get('/api/reports/attendance');
    expect(res.status).toBe(200);
    expect(res.body.some((r: { class_id: string }) => r.class_id === 'cls_10a')).toBe(true);
  });

  it('GET /api/reports/academics → 200 per-exam averages', async () => {
    const res = await get('/api/reports/academics');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/reports/summary → 200 hostel occupancy + payroll total', async () => {
    const res = await get('/api/reports/summary');
    expect(res.status).toBe(200);
    expect(res.body.hostel).toHaveProperty('capacity');
    expect(res.body).toHaveProperty('payroll_total_net');
  });

  it('GET /api/reports/fees → 200 collection summary', async () => {
    const res = await get('/api/reports/fees');
    expect(res.status).toBe(200);
    expect(res.body.invoiced).toBeGreaterThanOrEqual(500);
  });

  it('GET /api/notifications → 200 log list', async () => {
    const res = await get('/api/notifications');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // ─── CBT ─────────────────────────────────────────────────────

  it('cbt questions → mcq + subjective create, validation 400, update', async () => {
    const mcq = await post('/api/cbt/questions', {
      question: 'E2E MCQ: which option is correct?', type: 'mcq',
      option_a: '1', option_b: '2', option_c: '3', option_d: '4', correct_option: 'B', marks: 2,
    });
    expect(mcq.status).toBe(201);
    ids.q1 = mcq.body.id;

    const bad = await post('/api/cbt/questions', { question: 'E2E bad mcq', type: 'mcq', option_a: 'x' });
    expect(bad.status).toBe(400); // incomplete MCQ

    const subj = await post('/api/cbt/questions', { question: 'E2E subjective: explain gravity.', type: 'subjective', marks: 5 });
    expect(subj.status).toBe(201);
    ids.q2 = subj.body.id;

    const upd = await put(`/api/cbt/questions/${ids.q1}`, { marks: 3 });
    expect(upd.status).toBe(200);
  });

  it('cbt test lifecycle → create, answer-stripping, publish, start, submit (auto-grade), manual grade, results, delete guard', async () => {
    const created = await post('/api/cbt/tests', {
      title: 'E2E CBT Test', class_id: 'cls_10a', duration_min: 30,
      question_ids: [ids.q1, ids.q2], starts_at: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(created.status).toBe(201);
    ids.testId = created.body.id;

    const pub = await put(`/api/cbt/tests/${ids.testId}/publish`);
    expect(pub.status).toBe(200);

    // Staff can no longer start/submit on a student's behalf; the student logs in.
    expect((await post(`/api/cbt/tests/${ids.testId}/start`, { student_id: 'stu_001' })).status).toBe(403);
    const student = await loginAs('student@sainik01.edu', 'Demo@Student1'); // stu_001

    const start = await student.post(`/api/cbt/tests/${ids.testId}/start`);
    expect(start.status).toBe(201);
    ids.attemptId = start.body.attempt_id;
    const paper = await student.get(`/api/cbt/attempts/${ids.attemptId}`);
    expect(paper.status).toBe(200);
    expect(JSON.stringify(paper.body)).not.toContain('correctOption'); // answers stripped for students

    const submit = await student.post(`/api/cbt/attempts/${ids.attemptId}/submit`, {
      answers: { [ids.q1]: 'B', [ids.q2]: 'gravity pulls things down' },
    });
    expect(submit.status).toBe(201);
    expect(submit.body.score).toBe(3); // MCQ auto-graded; subjective not credited yet
    expect(submit.body.pending_manual_grading).toBe(true);

    const grade = await put(`/api/cbt/attempts/${ids.attemptId}/grade`, { question_id: ids.q2, marks: 4 });
    expect(grade.status).toBe(200);
    expect(grade.body.score).toBe(7); // 3 MCQ + 4 subjective

    const results = await get(`/api/cbt/tests/${ids.testId}/results`);
    expect(results.status).toBe(200);
    expect(results.body.length).toBeGreaterThanOrEqual(1);

    const delGuard = await del(`/api/cbt/tests/${ids.testId}`);
    expect(delGuard.status).toBe(409); // attempts exist
  });

  // ─── ADMISSIONS: documents & letter ──────────────────────────

  it('admissions documents → upload, list, download, delete; letter-data 403 pre-approval', async () => {
    const created = await post('/api/admissions/trigger-links', {
      parents: [{ parent_name: 'Doc Parent', parent_email: 'docs@test.com' }],
    });
    const appId = created.body.generated[0].id;

    const up = await post(`/api/admissions/${appId}/documents`, {
      doc_type: 'aadhaar', file_name: 'aadhaar.png', data_url: 'data:image/png;base64,iVBORw0KGgo=',
    });
    expect(up.status).toBe(201);
    const docId = up.body.id;

    const list = await get(`/api/admissions/${appId}/documents`);
    expect(list.body.length).toBe(1);

    const dl = await get(`/api/admissions/documents/${docId}/download`);
    expect(dl.status).toBe(200);
    // Documents live in object storage now: the API hands out a short-lived signed URL.
    expect(dl.body.url).toEqual(expect.any(String));
    const file = await request(server).get(new URL(dl.body.url, 'http://localhost').pathname);
    expect(file.status).toBe(200);

    const rm = await del(`/api/admissions/documents/${docId}`);
    expect(rm.status).toBe(200);

    const letterForbidden = await get(`/api/admissions/${appId}/letter-data`);
    expect(letterForbidden.status).toBe(403); // not VP-approved yet
  });

  it('admissions letter-data → 200 for a completed application', async () => {
    const list = await get('/api/admissions');
    const completed = list.body.find((a: { status: string }) => a.status === 'Admission Complete');
    expect(completed).toBeDefined();
    const res = await get(`/api/admissions/${completed.id}/letter-data`);
    expect(res.status).toBe(200);
    expect(res.body.roll_no).toBeDefined();
  });

  // ─── GAP-CLOSING PASS: true aggregates, spec rules, doc numbers ─

  it('students profile → attendance % computed over ALL records with count', async () => {
    const res = await get('/api/students/stu_001');
    expect(res.status).toBe(200);
    expect(typeof res.body.attendance_percentage).toBe('number');
    expect(res.body.attendance_records_counted).toBeGreaterThanOrEqual(1);
  });

  it('admissions allocate → spec roll no [CLASS][YEAR][SEQ] + house from the balanced set', async () => {
    const created = await post('/api/admissions/trigger-links', {
      parents: [
        { parent_name: 'Roll Parent 1', parent_email: 'rollno@test.com' },
        { parent_name: 'Roll Parent 2', parent_email: 'rollno2@test.com' },
      ],
    });
    expect(created.status).toBe(201);
    const [app1, app2] = created.body.generated;
    expect(app1.token).toBeDefined();

    // Put both straight at the OS step: the steps before it are covered per role in
    // admissions.e2e-spec.ts; this test is about the roll-number and house rules.
    await app.get(PrismaService).admission.updateMany({
      where: { id: { in: [app1.id, app2.id] } },
      data: { status: 'Fee Approved', studentName: 'Roll Test Student', paymentStatus: 'Verified' },
    });

    const alloc1 = await post(`/api/admissions/${app1.id}/allocate`, { class_id: 'cls_10a' });
    expect(alloc1.status).toBe(201);
    expect(alloc1.body.roll_no).toMatch(/^[A-Z0-9]+-\d{4}-\d{3}$/);
    expect(['Red', 'Blue', 'Green', 'Yellow']).toContain(alloc1.body.house);

    const alloc2 = await post(`/api/admissions/${app2.id}/allocate`, { class_id: 'cls_10a' });
    expect(alloc2.body.roll_no).toMatch(/^[A-Z0-9]+-\d{4}-\d{3}$/);
    // SEQ is sequential within class + year
    const seq = (r: string) => Number(r.split('-').pop());
    expect(seq(alloc2.body.roll_no)).toBe(seq(alloc1.body.roll_no) + 1);
  });

  it('public parent form → GET by token, submit without auth, office sees it', async () => {
    const created = await post('/api/admissions/trigger-links', {
      parents: [{ parent_name: 'Public Parent', parent_email: 'public@test.com' }],
    });
    const token = created.body.generated[0].token;

    const anon = await request(server).get(`/api/admissions/public/${token}`);
    expect(anon.status).toBe(200);
    expect(anon.body.already_submitted).toBe(false);
    expect(Array.isArray(anon.body.fields)).toBe(true);

    // Submissions are validated against the PUBLISHED template, so fill every field it has.
    const form: Record<string, string> = {};
    for (const f of anon.body.fields as { key: string; field_type: string; validation_rule: string | null }[]) {
      form[f.key] = f.field_type === 'date' ? '2015-06-06' : f.validation_rule ? '123456789012' : 'Public Kid';
    }
    const incomplete = await request(server).post(`/api/admissions/public/${token}/submit`).send({ student_name: 'Public Kid' });
    expect(incomplete.status).toBe(400); // required template fields missing
    const submitted = await request(server).post(`/api/admissions/public/${token}/submit`).send(form);
    expect(submitted.status).toBe(201);

    const bad = await request(server).get('/api/admissions/public/tok_does_not_exist');
    expect(bad.status).toBe(404);

    const list = await get('/api/admissions');
    const app = list.body.find((a: { id: string }) => a.id === created.body.generated[0].id);
    expect(app.status).toBe('Submitted by Parent');
  });

  it('notifications → log rows carry honest delivery status (mocked in dev)', async () => {
    const res = await get('/api/notifications');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(['mocked', 'sent', 'failed']).toContain(res.body[0].status);
    expect(res.body.some((n: { status: string }) => n.status === 'mocked')).toBe(true); // no NOTIFY_WEBHOOK_URL in dev
  });

  // Numbers are per school (INV-<SCHOOLCODE>-<YEAR>-NNNN): the column is globally unique.
  it('fees → invoices get INV- numbers and payments get RCPT- receipt numbers', async () => {
    const created = await post('/api/fees/invoices', { student_id: 'stu_002', term: 'E2E-Term', total_amount: 300, due_date: '2026-10-20' });
    expect(created.status).toBe(201);
    expect(created.body.invoice_no).toMatch(/^INV-[A-Z0-9]+-\d{4}-\d{4}$/);

    const paid = await post('/api/fees/payments', { invoice_id: created.body.id, amount_paid: 300, payment_mode: 'Cash' });
    expect(paid.status).toBe(201);
    expect(paid.body.receipt_no).toMatch(/^RCPT-[A-Z0-9]+-\d{4}-\d{4}$/);

    const detail = await get(`/api/fees/invoices/${created.body.id}`);
    expect(detail.body.payments[0].receiptNo).toMatch(/^RCPT-[A-Z0-9]+-\d{4}-\d{4}$/);
  });

  it('attendance register → per-student × per-day matrix for a month', async () => {
    const res = await get('/api/attendance/register?class_id=cls_10a&month=2026-09');
    expect(res.status).toBe(200);
    expect(res.body.month).toBe('2026-09');
    expect(res.body.dates).toContain('2026-09-29');
    expect(res.body.students.length).toBeGreaterThanOrEqual(2);
    const row = res.body.students.find((s: { id: string }) => s.id === 'stu_001');
    expect(row.days['2026-09-29']).toBe('Present');
    expect(row.present).toBeGreaterThanOrEqual(1);
  });

  it('leave balances → per-staff used/quota/remaining for the year', async () => {
    const res = await get('/api/balances');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      expect(res.body[0].leaves.Casual.quota).toBe(12);
      expect(res.body[0].leaves.Casual).toHaveProperty('remaining');
    }
  });

  it('discipline incident → parent SMS notification logged (no incident details)', async () => {
    const list = await get('/api/students?class_id=cls_10b');
    const target = list.body.data.find((s: { admissionNo: string }) => s.admissionNo === 'S2026-999');
    expect(target).toBeDefined();
    await put(`/api/students/${target.id}`, { mobile_number: '9999000011' });

    const created = await post('/api/discipline/incidents', {
      student_id: target.id, incident_date: '2026-09-30', description: 'E2E incident notify', demerits: 1,
    });
    expect(created.status).toBe(201);

    const notes = await get('/api/notifications?ref_type=incident');
    expect(notes.body.some((n: { recipient: string }) => n.recipient === '9999000011')).toBe(true);

    await (await loginAs('principal@sainik01.edu', 'Demo@Principal1')).del(`/api/discipline/incidents/${created.body.id}`);
  });

  it('reports CSV export → students / fees / attendance', async () => {
    for (const type of ['students', 'fees', 'attendance']) {
      const res = await get(`/api/reports/export/${type}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text.split('\n')[0].length).toBeGreaterThan(0);
    }
    const students = await get('/api/reports/export/students');
    expect(students.text).toContain('admission_no');
    expect(students.text).toContain('S2026-999');

    const bogus = await get('/api/reports/export/nope');
    expect(bogus.status).toBe(400);
  });

  it('hostel room move → audit trail entry written', async () => {
    const h = await post('/api/hostel', { name: 'E2E Hostel', capacity: 10 });
    ids.hostelId = h.body.id;
    const r1 = await post('/api/hostel/rooms', { hostel_id: ids.hostelId, room_number: 'E2E-101', capacity: 2 });
    const r2 = await post('/api/hostel/rooms', { hostel_id: ids.hostelId, room_number: 'E2E-102', capacity: 2 });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);

    const a1 = await post('/api/hostel/allocations', { student_id: 'stu_004', room_id: r1.body.id });
    expect(a1.status).toBe(201);
    const a2 = await post('/api/hostel/allocations', { student_id: 'stu_004', room_id: r2.body.id });
    expect(a2.status).toBe(201);

    const audit = await get('/api/audit-log?entity=hostel_allocation');
    expect(audit.status).toBe(200);
    expect(audit.body.some((e: { detail: string | null }) => (e.detail ?? '').includes('E2E-101'))).toBe(true);

    // cleanup: deallocate + delete rooms + hostel
    const allocs = await get('/api/hostel/allocations');
    const mine = allocs.body.find((a: { student: { id: string } }) => a.student.id === 'stu_004');
    if (mine) await del(`/api/hostel/allocations/${mine.id}`);
    await del(`/api/hostel/rooms/${r1.body.id}`);
    await del(`/api/hostel/rooms/${r2.body.id}`);
    await del(`/api/hostel/${ids.hostelId}`);
  });

  it('payroll → auto-pulls unpaid-leave days from approved Unpaid leaves', async () => {
    const staff = await post('/api/staff', { name: 'E2E Payroll Staff', email: 'e2e-payroll@sainik01.edu', role: 'Teacher' });
    expect(staff.status).toBe(201);
    const staffId = staff.body.id;
    await put(`/api/staff/salaries/${staffId}`, { basic_salary: 30000, hra: 0, da: 0, tds_percent: 0, epf_percent: 0 });

    // 3 unpaid days in Aug 2026 → docked automatically (30000/30 × 3 = 3000)
    const leave = await post('/api/staff-leaves', { staff_id: staffId, leave_type: 'Unpaid', start_date: '2026-08-10', end_date: '2026-08-12', reason: 'E2E' });
    await put(`/api/staff-leaves/${leave.body.id}/decision`, { decision: 'Approved' });

    const gen = await post('/api/staff/payslips/generate', { month: '2026-08' });
    expect(gen.status).toBe(201);
    expect(gen.body.generated).toBeGreaterThanOrEqual(1);

    const slips = await get('/api/staff/payslips?month=2026-08');
    const mine = slips.body.find((p: { staffId: string }) => p.staffId === staffId);
    expect(mine).toBeDefined();
    expect(mine.otherDeductions).toBe(3000);
    expect(mine.netSalary).toBe(27000);
  });
});
