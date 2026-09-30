import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

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

  // ─── AUTH ────────────────────────────────────────────────────

  it('POST /api/auth/login → 200 with token for valid credentials', async () => {
    const res = await request(server)
      .post('/api/auth/login')
      .send({ email: 'principal@sainik01.edu', password: 'Demo@Principal1' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.role).toBe('branch_admin');
    expect(res.body.branch_id).toBe('sainik01');
    token = res.body.token;
  });

  it('POST /api/auth/login → 401 for invalid credentials', async () => {
    const res = await request(server)
      .post('/api/auth/login')
      .send({ email: 'principal@sainik01.edu', password: 'wrong' });
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

  it('GET /api/students → 200 list', async () => {
    const res = await get('/api/students');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(4);
  });

  it('GET /api/students?class_id → 200 filtered', async () => {
    const res = await get('/api/students?class_id=cls_10a');
    expect(res.status).toBe(200);
    expect(res.body.every((s: { classId: string }) => s.classId === 'cls_10a')).toBe(true);
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
        { name: 'English', teacher_id: 't_rajesh', periods_per_week: 1 },
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

  let applicationId = '';

  it('POST /api/admissions/fields → 201 create field; GET → listed; DELETE → 200', async () => {
    const created = await post('/api/admissions/fields', {
      label: 'Aadhar Number',
      field_type: 'text',
      is_required: true,
    });
    expect(created.status).toBe(201);

    const list = await get('/api/admissions/fields');
    expect(list.body.some((f: { label: string }) => f.label === 'Aadhar Number')).toBe(true);

    const removed = await del(`/api/admissions/fields/${created.body.id}`);
    expect(removed.status).toBe(200);
  });

  it('POST /api/admissions/setup-fields → 200', async () => {
    const res = await post('/api/admissions/setup-fields');
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
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

  it('POST /api/admissions/:id/submit → 200', async () => {
    const res = await post(`/api/admissions/${applicationId}/submit`, {
      student_name: 'Applicant Singh',
      dob: '2014-05-01',
    });
    expect(res.status).toBe(201);
  });

  it('POST /api/admissions/:id/validate → 200', async () => {
    const res = await post(`/api/admissions/${applicationId}/validate`, { isValid: true });
    expect(res.status).toBe(201);
  });

  it('POST /api/admissions/:id/pay → 200', async () => {
    const res = await post(`/api/admissions/${applicationId}/pay`);
    expect(res.status).toBe(201);
  });

  it('POST /api/admissions/:id/verify-receipt → 200', async () => {
    const res = await post(`/api/admissions/${applicationId}/verify-receipt`);
    expect(res.status).toBe(201);
    expect(res.body.message).toContain('verified');
  });

  it('POST /api/admissions/:id/allocate → 200 with roll no & house', async () => {
    const res = await post(`/api/admissions/${applicationId}/allocate`);
    expect(res.status).toBe(201);
    expect(res.body.roll_no).toBeDefined();
    expect(['Red', 'Blue', 'Green', 'Yellow']).toContain(res.body.house);
  });

  it('POST /api/admissions/:id/vp-approve → 200', async () => {
    const res = await post(`/api/admissions/${applicationId}/vp-approve`);
    expect(res.status).toBe(201);
  });

  it('POST /api/admissions/:id/principal-approve → 200 and student created', async () => {
    const res = await post(`/api/admissions/${applicationId}/principal-approve`);
    expect(res.status).toBe(201);
    expect(res.body.student_id).toBeDefined();

    // The student should now exist in the master table
    const students = await get('/api/students');
    expect(students.body.some((s: { id: string }) => s.id === res.body.student_id)).toBe(true);
  });

  it('POST /api/admissions/999/validate → 404 unknown application', async () => {
    const res = await post('/api/admissions/does-not-exist/validate', { isValid: true });
    expect(res.status).toBe(404);
  });
});
