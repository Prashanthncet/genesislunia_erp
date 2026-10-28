import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Phase 3 — Attendance & Timetable with Substitution.
 * Runs on its own fresh e2e DB (migrations + seed). Dates used here (2026-10-19 Mon,
 * 2026-10-20 Tue, 2026-10-26 Mon) have no seeded attendance or substitutions.
 */
describe('Attendance & Timetable (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;
  const tok: Record<string, string> = {};

  const LOGINS: Record<string, [string, string]> = {
    admin: ['schooladmin@sainik01.edu', 'Demo@Admin1'],
    teacher: ['teacher@sainik01.edu', 'Demo@Teacher1'], // t_rajesh
    hod: ['hod@sainik01.edu', 'Demo@Hod1'], // t_meera
    warden: ['warden@sainik01.edu', 'Demo@Warden1'],
    parent: ['parent@sainik01.edu', 'Demo@Parent1'], // stu_001 + stu_004
    student: ['student@sainik01.edu', 'Demo@Student1'], // stu_001
    g2admin: ['admin@greenfield02.edu', 'Demo@Green1'],
  };

  const as = (who: string) => ({
    get: (url: string) => request(server).get(url).set('Authorization', `Bearer ${tok[who]}`),
    post: (url: string, body?: object) => request(server).post(url).set('Authorization', `Bearer ${tok[who]}`).send(body ?? {}),
    put: (url: string, body?: object) => request(server).put(url).set('Authorization', `Bearer ${tok[who]}`).send(body ?? {}),
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    for (const [who, [email, password]] of Object.entries(LOGINS)) {
      const res = await request(server).post('/api/auth/login').send({ email, password });
      expect([200, 201]).toContain(res.status);
      tok[who] = res.body.token;
    }

    // A class nobody teaches (every seeded class has t_rajesh somewhere in its week).
    await prisma.class.create({ data: { id: 'cls_p3_other', branchId: 'sainik01', name: 'P3 Other', section: 'Z' } });
    await prisma.student.create({
      data: { id: 'stu_p3_x', branchId: 'sainik01', admissionNo: 'P3-X-1', fullName: 'P3 Test Pupil', classId: 'cls_p3_other', mobileNumber: '9000011111' },
    });
    await prisma.class.create({ data: { id: 'cls_p3_gen', branchId: 'sainik01', name: 'P3 Generated', section: 'G' } });
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Attendance: roles ───────────────────────────────────────

  it('teacher marks a class they teach → 201; markedBy comes from the login, not the body', async () => {
    const res = await as('teacher').post('/api/attendance', {
      class_id: 'cls_10a',
      date: '2026-10-19',
      marked_by: 'someone-else',
      records: [
        { student_id: 'stu_001', status: 'Present' },
        { student_id: 'stu_002', status: 'Absent' },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.count).toBe(2);
    expect(res.body.notified).toBe(1);

    const rec = await prisma.attendanceRecord.findUnique({ where: { studentId_date: { studentId: 'stu_001', date: '2026-10-19' } } });
    expect(rec?.markedBy).toBe('t_rajesh');
  });

  it('absence auto-creates a notification log row and sets notified=1', async () => {
    const rec = await prisma.attendanceRecord.findUnique({ where: { studentId_date: { studentId: 'stu_002', date: '2026-10-19' } } });
    expect(rec?.status).toBe('Absent');
    expect(rec?.notified).toBe(1);
    const log = await prisma.notificationLog.findFirst({ where: { refType: 'attendance', refId: rec!.id } });
    expect(log).toBeTruthy();
    expect(log!.channel).toBe('sms');
    expect(log!.branchId).toBe('sainik01');

    // Re-saving the same Absent does not notify again; the manual re-send finds nothing pending.
    const again = await as('teacher').post('/api/attendance', {
      class_id: 'cls_10a', date: '2026-10-19', records: [{ student_id: 'stu_002', status: 'Absent' }],
    });
    expect(again.body.notified).toBe(0);
    expect(await prisma.notificationLog.count({ where: { refType: 'attendance', refId: rec!.id } })).toBe(1);
    const resend = await as('teacher').post('/api/attendance/notify-absent', { date: '2026-10-19', class_id: 'cls_10a' });
    expect(resend.status).toBe(201);
    expect(resend.body.notified).toBe(0);
  });

  it('teacher marking a class they do not teach → 403', async () => {
    const res = await as('teacher').post('/api/attendance', {
      class_id: 'cls_p3_other', date: '2026-10-19', records: [{ student_id: 'stu_p3_x', status: 'Present' }],
    });
    expect(res.status).toBe(403);
    const read = await as('teacher').get('/api/attendance?class_id=cls_p3_other&date=2026-10-19');
    expect(read.status).toBe(403);
  });

  it('admin can mark any class; warden can neither mark nor read class attendance (403)', async () => {
    const ok = await as('admin').post('/api/attendance', {
      class_id: 'cls_p3_other', date: '2026-10-19', records: [{ student_id: 'stu_p3_x', status: 'Absent' }],
    });
    expect(ok.status).toBe(201);
    const rec = await prisma.attendanceRecord.findUnique({ where: { studentId_date: { studentId: 'stu_p3_x', date: '2026-10-19' } } });
    // School admin has no staff row → markedBy is the user id.
    const adminUser = await prisma.user.findUnique({ where: { email: 'schooladmin@sainik01.edu' } });
    expect(rec?.markedBy).toBe(adminUser!.staffId ?? adminUser!.id);

    const w = await as('warden').post('/api/attendance', {
      class_id: 'cls_10a', date: '2026-10-19', records: [{ student_id: 'stu_001', status: 'Absent' }],
    });
    expect(w.status).toBe(403);
    // Warden = hostel + gate desk + student list; no class attendance (school decision 2026-10-24).
    expect((await as('warden').get('/api/attendance?class_id=cls_10a&date=2026-10-19')).status).toBe(403);
    expect((await as('parent').get('/api/attendance?class_id=cls_10a&date=2026-10-19')).status).toBe(403);
  });

  it('cross-school: marking g2_stu_001 from sainik01 → 404 and the greenfield record is unchanged', async () => {
    const before = await prisma.attendanceRecord.findUnique({ where: { studentId_date: { studentId: 'g2_stu_001', date: '2026-10-01' } } });
    expect(before?.status).toBe('Present');

    const res = await as('admin').post('/api/attendance', {
      class_id: 'cls_10a', date: '2026-10-01', records: [{ student_id: 'g2_stu_001', status: 'Absent' }],
    });
    expect(res.status).toBe(404);
    const res2 = await as('admin').post('/api/attendance', {
      class_id: 'g2_cls_5a', date: '2026-10-01', records: [{ student_id: 'g2_stu_001', status: 'Absent' }],
    });
    expect(res2.status).toBe(404);

    const after = await prisma.attendanceRecord.findUnique({ where: { studentId_date: { studentId: 'g2_stu_001', date: '2026-10-01' } } });
    expect(after).toEqual(before);
  });

  // ─── Attendance: calendar & reports ──────────────────────────

  it('parent reads own child calendar; other child 403; other school 404', async () => {
    const own = await as('parent').get('/api/attendance/student/stu_001/calendar?month=2026-10');
    expect(own.status).toBe(200);
    expect(own.body.days).toHaveLength(31);
    expect(own.body.days.find((d: { date: string }) => d.date === '2026-10-19').status).toBe('Present');
    expect(typeof own.body.summary.percentage).toBe('number');

    expect((await as('parent').get('/api/attendance/student/stu_002/calendar?month=2026-10')).status).toBe(403);
    expect((await as('parent').get('/api/attendance/student/g2_stu_001/calendar?month=2026-10')).status).toBe(404);
    expect((await as('student').get('/api/attendance/student/stu_001/calendar?month=2026-10')).status).toBe(200);
    expect((await as('student').get('/api/attendance/student/stu_004/calendar?month=2026-10')).status).toBe(403);
  });

  it('absentee report groups absentees by class', async () => {
    const res = await as('admin').get('/api/attendance/absentees?date=2026-10-19');
    expect(res.status).toBe(200);
    const c10a = res.body.classes.find((c: { class_id: string }) => c.class_id === 'cls_10a');
    expect(c10a.absentees.map((a: { student_id: string }) => a.student_id)).toContain('stu_002');
    // Teacher only sees classes they teach.
    const t = await as('teacher').get('/api/attendance/absentees?date=2026-10-19');
    expect(t.body.classes.some((c: { class_id: string }) => c.class_id === 'cls_p3_other')).toBe(false);
  });

  it('low-attendance report filters by threshold and class', async () => {
    const all = await as('admin').get('/api/attendance/low?threshold=100&class_id=cls_10a');
    expect(all.status).toBe(200);
    expect(all.body.students.length).toBeGreaterThan(0);
    expect(all.body.students.every((s: { class_id: string }) => s.class_id === 'cls_10a')).toBe(true);
    const none = await as('admin').get('/api/attendance/low?threshold=0');
    expect(none.body.students).toHaveLength(0);
    const p3 = await as('admin').get('/api/attendance/low?threshold=75&from=2026-10-19&to=2026-10-19&class_id=cls_p3_other');
    expect(p3.body.students[0]).toMatchObject({ student_id: 'stu_p3_x', percentage: 0 });
    expect((await as('admin').get('/api/attendance/low?threshold=abc')).status).toBe(400);
  });

  // ─── Timetable: generator ────────────────────────────────────

  it('generator never uses a break period and stays branch-scoped', async () => {
    const res = await as('admin').post('/api/timetable/generate', {
      class_id: 'cls_p3_gen',
      periods_per_day: 7,
      working_days: ['Mon'],
      overwrite: true,
      subjects: [
        { name: 'Chemistry', teacher_id: 't_kavya', periods_per_week: 3 },
        { name: 'English', teacher_id: 't_naveen', periods_per_week: 2 },
        { name: 'Hindi', teacher_id: 't_rekha', periods_per_week: 2 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.generated).toBe(7);
    const breaks = (await prisma.periodConfig.findMany({ where: { branchId: 'sainik01', isBreak: true } })).map((p) => p.periodNumber);
    expect(breaks).toContain(3);
    for (const a of res.body.timetable) expect(breaks).not.toContain(a.period);

    // Teacher from another school → 404.
    const g2 = await as('admin').post('/api/timetable/generate', {
      class_id: 'cls_p3_gen', periods_per_day: 1, working_days: ['Tue'],
      subjects: [{ name: 'Maths', teacher_id: 'g2_t_asha', periods_per_week: 1 }],
    });
    expect(g2.status).toBe(404);
  });

  it('generator respects max periods per day counting other classes', async () => {
    // t_rajesh (max 4) already teaches 4 periods every Monday in other classes.
    const res = await as('admin').post('/api/timetable/generate', {
      class_id: 'cls_p3_gen', periods_per_day: 1, working_days: ['Mon'], overwrite: true,
      subjects: [{ name: 'English', teacher_id: 't_rajesh', periods_per_week: 1 }],
    });
    expect(res.status).toBe(409);
  });

  it('timetable writes are admin-only; break periods cannot hold a manual lesson', async () => {
    const body = { class_id: 'cls_p3_gen', day_of_week: 'Wed', period_number: 1, subject: 'Maths', teacher_id: 't_divya' };
    expect((await as('teacher').put('/api/timetable/slot', body)).status).toBe(403);
    expect((await as('parent').put('/api/timetable/slot', body)).status).toBe(403);
    expect((await as('admin').put('/api/timetable/slot', { ...body, period_number: 3 })).status).toBe(400);
    expect((await as('admin').put('/api/timetable/slot', { ...body, class_id: 'g2_cls_5a' })).status).toBe(404);
    expect((await as('teacher').post('/api/timetable/teachers/t_meera/absent', { date: '2026-10-19' })).status).toBe(403);
    expect((await as('teacher').post('/api/timetable/generate', {})).status).toBe(403);
  });

  it('teacher list carries the class + subject each teacher is timetabled in', async () => {
    const admin = as('admin');
    const classes = (await admin.get('/api/timetable/classes')).body as { id: string; name: string; section: string | null }[];
    expect(classes.length).toBeGreaterThan(0);

    // Any slot already in the master grid is proof: read one, then demand it on the card.
    type Slot = { subject: string; teacher_id: string };
    let found: { cls: (typeof classes)[number]; slot: Slot } | null = null;
    for (const cls of classes) {
      const slots = (await admin.get(`/api/timetable/master/${cls.id}`)).body as Slot[];
      if (slots?.length) { found = { cls, slot: slots[0] }; break; }
    }
    expect(found).toBeTruthy();

    const teachers = (await admin.get('/api/timetable/teachers')).body as {
      id: string; classes: { class_id: string; class_label: string; subject: string }[];
    }[];
    // Everyone carries the field, so the card never has to guess.
    expect(teachers.every((t) => Array.isArray(t.classes))).toBe(true);
    const teacher = teachers.find((t) => t.id === found!.slot.teacher_id);
    expect(teacher).toBeTruthy();
    expect(teacher!.classes).toContainEqual({
      class_id: found!.cls.id,
      class_label: `${found!.cls.name}${found!.cls.section ? ` ${found!.cls.section}` : ''}`,
      subject: found!.slot.subject,
    });
  });

  // ─── Timetable: substitution conflicts & notifications ───────

  it('manual substitute: assignment notifies substitute (email) and the class (notice)', async () => {
    const res = await as('admin').post('/api/timetable/substitute', {
      date: '2026-10-19', class_id: 'cls_10a', period_number: 1, substitute_teacher_id: 't_sangeeta', reason: 'Meeting',
    });
    expect(res.status).toBe(201);
    expect(res.body.assigned_to.id).toBe('t_sangeeta');
    const id = res.body.substitution_id;
    const row = await prisma.substitution.findUnique({ where: { id } });
    expect(row?.originalTeacherId).toBe('t_meera'); // derived from the slot
    const logs = await prisma.notificationLog.findMany({ where: { refType: 'substitution', refId: id } });
    expect(logs.find((l) => l.channel === 'email')?.recipient).toBe('sangeeta.m@sainik01.edu');
    expect(logs.find((l) => l.channel === 'notice')?.recipient).toBe('class:cls_10a');
  });

  it('double booking prevented: regular slot, existing substitution, approved leave', async () => {
    // Someone with a regular lesson on Monday P1 in another class.
    const busy = await prisma.timetableSlot.findFirst({
      where: { branchId: 'sainik01', dayOfWeek: 'Mon', periodNumber: 1, classId: { not: 'cls_10b' }, teacherId: { not: 't_sneha' } },
    });
    const slotClash = await as('admin').post('/api/timetable/substitute', {
      date: '2026-10-19', class_id: 'cls_10b', period_number: 1, substitute_teacher_id: busy!.teacherId,
    });
    expect(slotClash.status).toBe(409);
    expect(slotClash.body.message).toMatch(/Teaches/);

    // t_sangeeta already covers cls_10a P1 that day.
    const subClash = await as('admin').post('/api/timetable/substitute', {
      date: '2026-10-19', class_id: 'cls_10b', period_number: 1, substitute_teacher_id: 't_sangeeta',
    });
    expect(subClash.status).toBe(409);
    expect(subClash.body.message).toMatch(/Already covering/);

    // t_sneha is on approved maternity leave until 2026-10-31.
    const leaveClash = await as('admin').post('/api/timetable/substitute', {
      date: '2026-10-19', class_id: 'cls_10b', period_number: 1, substitute_teacher_id: 't_sneha',
    });
    expect(leaveClash.status).toBe(409);
    expect(leaveClash.body.message).toMatch(/leave/);

    // Auto-suggest never offers those three as available.
    const sug = await as('admin').get('/api/timetable/substitutions/suggest?date=2026-10-19&class_id=cls_10b&period=1');
    expect(sug.status).toBe(200);
    const avail = sug.body.candidates.filter((c: { available: boolean }) => c.available).map((c: { id: string }) => c.id);
    expect(avail).not.toContain(busy!.teacherId);
    expect(avail).not.toContain('t_sangeeta');
    expect(avail).not.toContain('t_sneha');
    const loads = sug.body.candidates.filter((c: { available: boolean }) => c.available).map((c: { load: number; over_limit: boolean }) => (c.over_limit ? 99 : c.load));
    expect([...loads].sort((a, b) => a - b)).toEqual(loads);

    // Manual timetable slot ignores nobody: teacher already teaching elsewhere at that period → 409.
    const slot = await as('admin').put('/api/timetable/slot', {
      class_id: 'cls_p3_gen', day_of_week: 'Mon', period_number: 1, subject: 'X', teacher_id: busy!.teacherId,
    });
    expect(slot.status).toBe(409);
  });

  it('request flow: teacher requests own lesson, admin auto-assigns; others 403', async () => {
    // t_rajesh teaches cls_10a Mon P2; t_meera teaches Mon P1.
    expect((await as('teacher').post('/api/timetable/substitutions/request', {
      date: '2026-10-26', class_id: 'cls_10a', period_number: 1, reason: 'Not mine',
    })).status).toBe(403);
    expect((await as('warden').post('/api/timetable/substitutions/request', {
      date: '2026-10-26', class_id: 'cls_10a', period_number: 2, reason: 'x',
    })).status).toBe(403);

    const req1 = await as('teacher').post('/api/timetable/substitutions/request', {
      date: '2026-10-26', class_id: 'cls_10a', period_number: 2, reason: 'Medical appointment',
    });
    expect(req1.status).toBe(201);
    expect(req1.body.status).toBe('Requested');
    const dup = await as('teacher').post('/api/timetable/substitutions/request', {
      date: '2026-10-26', class_id: 'cls_10a', period_number: 2, reason: 'again',
    });
    expect(dup.status).toBe(409);

    const list = await as('admin').get('/api/timetable/substitutions?date=2026-10-26');
    const row = list.body.find((s: { id: string }) => s.id === req1.body.id);
    expect(row.status).toBe('Requested');
    expect(row.substitute_name).toBeNull();

    expect((await as('teacher').post(`/api/timetable/substitutions/${req1.body.id}/assign`, {})).status).toBe(403);
    const assigned = await as('admin').post(`/api/timetable/substitutions/${req1.body.id}/assign`, {});
    expect(assigned.status).toBe(201);
    expect(assigned.body.assigned_to.id).not.toBe('t_rajesh');
    expect((await prisma.substitution.findUnique({ where: { id: req1.body.id } }))?.status).toBe('Assigned');
    expect(await prisma.notificationLog.count({ where: { refType: 'substitution', refId: req1.body.id } })).toBe(2);

    // Rajesh's own day shows P2 handed over.
    const day = await as('teacher').get('/api/timetable/me/today?date=2026-10-26');
    expect(day.status).toBe(200);
    const p2 = day.body.schedule.find((e: { period_number: number; class_id: string }) => e.period_number === 2 && e.class_id === 'cls_10a');
    expect(p2.kind).toBe('relieved');

    const cancelled = await as('admin').post(`/api/timetable/substitutions/${req1.body.id}/cancel`, {});
    expect(cancelled.status).toBe(201);
    const day2 = await as('teacher').get('/api/timetable/me/today?date=2026-10-26');
    expect(day2.body.schedule.find((e: { period_number: number; class_id: string }) => e.period_number === 2 && e.class_id === 'cls_10a').kind).toBe('lesson');
  });

  it("teacher today view includes covers assigned to them; weekly grid shows them too", async () => {
    const res = await as('admin').post('/api/timetable/substitute', {
      date: '2026-10-20', class_id: 'cls_10a', period_number: 1, substitute_teacher_id: 't_rajesh', reason: 'Cover',
    });
    expect(res.status).toBe(201);

    const day = await as('teacher').get('/api/timetable/me/today?date=2026-10-20');
    expect(day.status).toBe(200);
    expect(day.body.day).toBe('Tue');
    const cover = day.body.schedule.find((e: { kind: string }) => e.kind === 'cover');
    expect(cover).toMatchObject({ period_number: 1, class_id: 'cls_10a' });
    expect(day.body.schedule.some((e: { kind: string }) => e.kind === 'break')).toBe(true);
    expect(day.body.counts.lessons).toBeGreaterThan(0);

    const week = await as('hod').get('/api/timetable/teacher/t_rajesh/week?date=2026-10-20');
    expect(week.status).toBe(200);
    expect(week.body.week.from).toBe('2026-10-19');
    expect(week.body.covers.some((c: { date: string; period_number: number }) => c.date === '2026-10-20' && c.period_number === 1)).toBe(true);
    expect(week.body.slots.length).toBeGreaterThan(0);
    expect((await as('admin').get('/api/timetable/teacher/g2_t_asha/week')).status).toBe(404);
    expect((await as('parent').get('/api/timetable/teacher/t_rajesh/week')).status).toBe(403);
    expect((await as('admin').get('/api/timetable/me/today')).status).toBe(404); // admin has no staff row
  });

  it('portal: parent sees own child class timetable only', async () => {
    expect((await as('parent').get('/api/timetable/master/cls_10a')).status).toBe(200);
    expect((await as('parent').get('/api/timetable/master/cls_09a')).status).toBe(403);
    expect((await as('student').get('/api/timetable/today/cls_10a?date=2026-10-19')).status).toBe(200);
    const cls = await as('parent').get('/api/timetable/classes');
    expect(cls.body.map((c: { id: string }) => c.id).sort()).toEqual(['cls_10a', 'cls_10b']);
    expect((await as('admin').get('/api/timetable/master/g2_cls_5a')).status).toBe(404);
    expect((await as('parent').get('/api/timetable/substitutions')).status).toBe(403);
  });
});
