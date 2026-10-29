import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Round 3 — OD attendance, ONE attendance rule everywhere, absentee/section filters,
 * analytics filters, timetable breaks + PDFs, warden no longer reads class attendance.
 *
 * Known records for a dedicated student (stu_od_1, class cls_od_t) in Nov 2026:
 *   Mon 02 Present · Tue 03 Late · Wed 04 OD · Thu 05 Absent · Fri 06 Leave · Sun 08 Present
 * THE rule: attended = P + Late + OD = 3; counted = P + Late + OD + Absent = 4 (Leave and
 * the Sunday record are not counted) → 75%. Every endpoint must say 75.
 */
describe('Attendance OD + one rule + timetable breaks/PDF (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;
  const tok: Record<string, string> = {};

  const LOGINS: Record<string, [string, string]> = {
    admin: ['schooladmin@sainik01.edu', 'Demo@Admin1'],
    principal: ['principal@sainik01.edu', 'Demo@Principal1'],
    teacher: ['teacher@sainik01.edu', 'Demo@Teacher1'], // t_rajesh
    warden: ['warden@sainik01.edu', 'Demo@Warden1'],
    parent: ['parent@sainik01.edu', 'Demo@Parent1'], // stu_001 (10 A) + stu_004 (10 B)
    student: ['student@sainik01.edu', 'Demo@Student1'], // stu_001
  };

  const as = (who: string) => ({
    get: (url: string) => request(server).get(url).set('Authorization', `Bearer ${tok[who]}`),
    post: (url: string, body?: object) => request(server).post(url).set('Authorization', `Bearer ${tok[who]}`).send(body ?? {}),
  });
  /** Binary GET (PDF) — buffers the body. */
  const pdf = (who: string, url: string) =>
    request(server).get(url).set('Authorization', `Bearer ${tok[who]}`)
      .buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

  const STU = 'stu_od_1';
  const CLS = 'cls_od_t';
  const mark = (date: string, status: string, reason?: string) =>
    as('admin').post('/api/attendance', { class_id: CLS, date, records: [{ student_id: STU, status, ...(reason !== undefined ? { reason } : {}) }] });

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

    await prisma.class.create({ data: { id: CLS, branchId: 'sainik01', name: 'OD Test', section: 'A' } });
    await prisma.student.create({
      data: { id: STU, branchId: 'sainik01', admissionNo: 'OD-T-1', fullName: 'Odette Dutta', classId: CLS, mobileNumber: '9000022222', status: 'Active' },
    });
    // The parent login also sees this child (portal endpoints must agree too).
    const parent = await prisma.user.findUnique({ where: { email: 'parent@sainik01.edu' } });
    await prisma.parentStudent.create({ data: { branchId: 'sainik01', userId: parent!.id, studentId: STU } });
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── OD validation + storage + no SMS ────────────────────────

  it('OD without a reason → 400; blank reason → 400; with reason → stored in note', async () => {
    expect((await mark('2026-11-04', 'OD')).status).toBe(400);
    expect((await mark('2026-11-04', 'OD', '   ')).status).toBe(400);
    expect((await mark('2026-11-04', 'Bogus')).status).toBe(400);
    const ok = await mark('2026-11-04', 'OD', 'Inter-school athletics meet');
    expect(ok.status).toBe(201);
    expect(ok.body.summary).toMatchObject({ od: 1, attended: 1, counted: 1 });
    const rec = await prisma.attendanceRecord.findUnique({ where: { studentId_date: { studentId: STU, date: '2026-11-04' } } });
    expect(rec).toMatchObject({ status: 'OD', note: 'Inter-school athletics meet', notified: 0 });
  });

  it('records the known month; OD sends no parent notice, Absent does', async () => {
    for (const [d, s] of [['2026-11-02', 'Present'], ['2026-11-03', 'Late'], ['2026-11-05', 'Absent'], ['2026-11-06', 'Leave'], ['2026-11-08', 'Present']]) {
      const r = await mark(d, s);
      expect(r.status).toBe(201);
    }
    const od = await prisma.attendanceRecord.findUnique({ where: { studentId_date: { studentId: STU, date: '2026-11-04' } } });
    const ab = await prisma.attendanceRecord.findUnique({ where: { studentId_date: { studentId: STU, date: '2026-11-05' } } });
    expect(await prisma.notificationLog.count({ where: { refType: 'attendance', refId: od!.id } })).toBe(0);
    expect(await prisma.notificationLog.count({ where: { refType: 'attendance', refId: ab!.id } })).toBe(1);
    expect(ab!.notified).toBe(1);
  });

  // ─── ONE rule: every endpoint gives the same % ───────────────

  it('every attendance % endpoint agrees: 75% (OD counts present; Leave + Sunday not counted)', async () => {
    const month = '2026-11';
    const results: Record<string, unknown> = {};

    const cal = await as('admin').get(`/api/attendance/student/${STU}/calendar?month=${month}`);
    expect(cal.status).toBe(200);
    expect(cal.body.summary).toMatchObject({ present: 1, late: 1, od: 1, absent: 1, leave: 1, attended: 3, counted: 4 }) // Sunday's Present is not counted;
    expect(cal.body.days.find((d: { date: string }) => d.date === '2026-11-04')).toMatchObject({ status: 'OD', note: 'Inter-school athletics meet' });
    expect(cal.body.days.find((d: { date: string }) => d.date === '2026-11-08').is_sunday).toBe(true);
    results.calendar_month = cal.body.summary.percentage;
    results.calendar_overall = cal.body.overall.percentage;

    const reg = await as('admin').get(`/api/attendance/register?class_id=${CLS}&month=${month}`);
    const row = reg.body.students.find((s: { id: string }) => s.id === STU);
    expect(row).toMatchObject({ od: 1, attended: 3, counted: 4 });
    expect(row.notes['2026-11-04']).toBe('Inter-school athletics meet');
    expect(reg.body.totals.od).toBe(1);
    results.register = row.percentage;

    const low = await as('admin').get(`/api/attendance/low?threshold=100&class_id=${CLS}`);
    results.low = low.body.students.find((s: { student_id: string }) => s.student_id === STU)?.percentage;

    const an = await as('admin').get(`/api/attendance/analytics?class_id=${CLS}`);
    expect(an.status).toBe(200);
    expect(an.body.overall.od).toBe(1);
    results.analytics = an.body.overall.percentage;

    const rep = await as('admin').get(`/api/reports/attendance?class_id=${CLS}&fresh=1`);
    expect(rep.status).toBe(200);
    expect(rep.body[0]).toMatchObject({ od: 1, total_records: 4 });
    results.reports_by_class = rep.body[0].attendance_pct;
    const trend = await as('admin').get(`/api/reports/attendance-trend?class_id=${CLS}&fresh=1`);
    results.reports_trend = trend.body.overall_pct;

    const profile = await as('admin').get(`/api/students/${STU}/profile`);
    expect(profile.status).toBe(200);
    expect(profile.body.attendance).toMatchObject({ od: 1, records_counted: 4 });
    results.student_profile = profile.body.attendance.percentage;
    const legacy = await as('admin').get(`/api/students/${STU}`);
    results.student_detail = legacy.body.attendance_percentage;

    const card = await as('admin').get(`/api/exams/report-card/${STU}?from=2026-11-01&to=2026-11-30`);
    expect(card.status).toBe(200);
    expect(card.body.attendance).toMatchObject({ present: 3, total: 4, od: 1 });
    results.report_card = card.body.attendance.pct;

    const portal = await as('parent').get(`/api/portal/children/${STU}/attendance?month=${month}`);
    expect(portal.status).toBe(200);
    expect(portal.body).toMatchObject({ present: 3, total: 4, od: 1, leave: 1 });
    results.portal_month = portal.body.attendance_pct;
    const overview = await as('parent').get('/api/portal/overview');
    results.portal_overview_overall = overview.body.children.find((c: { id: string }) => c.id === STU)?.attendance.overall_pct;

    // TC (only once the student has left)
    await prisma.student.update({ where: { id: STU }, data: { status: 'Left' } });
    const tc = await as('admin').get(`/api/students/${STU}/export/tc`);
    expect(tc.status).toBe(200);
    results.transfer_certificate = tc.body.attendance.percentage;
    await prisma.student.update({ where: { id: STU }, data: { status: 'Active' } });

    for (const [k, v] of Object.entries(results)) expect({ [k]: v }).toEqual({ [k]: 75 });
  });

  // ─── Filters ─────────────────────────────────────────────────

  it('section filter: class_name + section narrows to that section only', async () => {
    expect((await as('admin').post('/api/attendance', { class_id: 'cls_10b', date: '2026-10-26', records: [{ student_id: 'stu_004', status: 'Absent' }] })).status).toBe(201);
    expect((await as('admin').post('/api/attendance', { class_id: 'cls_10a', date: '2026-10-26', records: [{ student_id: 'stu_001', status: 'Late' }] })).status).toBe(201);

    const b = await as('admin').get('/api/attendance/absentees?date=2026-10-26&class_name=Class 10&section=B&status=both');
    expect(b.status).toBe(200);
    expect(b.body.total).toBeGreaterThan(0);
    expect(b.body.rows.every((r: { class_id: string }) => r.class_id === 'cls_10b')).toBe(true);

    const both = await as('admin').get('/api/attendance/absentees?date=2026-10-26&class_name=Class 10&status=both');
    const classIds = new Set(both.body.rows.map((r: { class_id: string }) => r.class_id));
    expect([...classIds].sort()).toEqual(['cls_10a', 'cls_10b']);

    const low = await as('admin').get('/api/attendance/low?threshold=100&class_name=Class 10&section=A');
    expect(low.body.students.length).toBeGreaterThan(0);
    expect(low.body.students.every((s: { class_id: string }) => s.class_id === 'cls_10a')).toBe(true);
    const an = await as('admin').get('/api/attendance/analytics?class_name=Class 10&section=B&from=2026-10-01&to=2026-10-31');
    expect(an.body.by_class.map((c: { class_id: string }) => c.class_id)).toEqual(['cls_10b']);
  });

  it('absentee filters: status Absent / Late / both, date range, not yet notified', async () => {
    const late = await as('admin').get('/api/attendance/absentees?date=2026-10-26&status=Late');
    expect(late.body.rows.length).toBeGreaterThan(0);
    expect(late.body.rows.every((r: { status: string }) => r.status === 'Late')).toBe(true);
    const absent = await as('admin').get('/api/attendance/absentees?date=2026-10-26');
    expect(absent.body.rows.every((r: { status: string }) => r.status === 'Absent')).toBe(true);
    expect(absent.body.rows.some((r: { student_id: string }) => r.student_id === 'stu_004')).toBe(true);

    const range = await as('admin').get(`/api/attendance/absentees?from=2026-11-01&to=2026-11-30&class_id=${CLS}&status=both`);
    expect(range.status).toBe(200);
    expect(range.body.rows.map((r: { date: string; status: string }) => `${r.date}:${r.status}`).sort()).toEqual(['2026-11-03:Late', '2026-11-05:Absent']);

    // A record with no reachable contact stays "not notified".
    await prisma.student.update({ where: { id: STU }, data: { mobileNumber: null } });
    await prisma.parentStudent.deleteMany({ where: { studentId: STU } });
    expect((await mark('2026-11-09', 'Absent')).status).toBe(201);
    const pending = await as('admin').get(`/api/attendance/absentees?from=2026-11-01&to=2026-11-30&class_id=${CLS}&not_notified=1`);
    expect(pending.body.rows.map((r: { date: string }) => r.date)).toEqual(['2026-11-09']);
    expect(pending.body.pending_notices).toBe(1);

    expect((await as('admin').get('/api/attendance/absentees?status=Present')).status).toBe(400);
    expect((await as('admin').get('/api/attendance/absentees?from=2026-11-30&to=2026-11-01')).status).toBe(400);
    // teacher outside their scope
    expect((await as('teacher').get('/api/attendance/absentees?class_id=' + CLS)).status).toBe(403);
  });

  it('roll-call sheet pre-fills approved leave and reports saved status', async () => {
    // Seed: stu_001 has an Approved Medical leave 2026-10-05..07.
    const s = await as('admin').get('/api/attendance/sheet?class_id=cls_10a&date=2026-10-06');
    expect(s.status).toBe(200);
    const st = s.body.students.find((x: { id: string }) => x.id === 'stu_001');
    expect(st.on_leave).toMatchObject({ leave_type: 'Medical' });
    expect(s.body.already_marked).toBe(true);
    expect((await as('admin').get('/api/attendance/sheet?class_id=cls_10a')).status).toBe(400);
  });

  // ─── Roles ───────────────────────────────────────────────────

  it('warden is no longer an attendance reader (403 on every class-attendance read)', async () => {
    for (const url of [
      '/api/attendance?class_id=cls_10a&date=2026-10-26',
      '/api/attendance/my-classes',
      '/api/attendance/register?class_id=cls_10a&month=2026-10',
      '/api/attendance/absentees?date=2026-10-26',
      '/api/attendance/low',
      '/api/attendance/analytics',
      '/api/attendance/sheet?class_id=cls_10a&date=2026-10-26',
      '/api/attendance/student/stu_001/calendar?month=2026-10',
    ]) {
      expect({ url, status: (await as('warden').get(url)).status }).toEqual({ url, status: 403 });
    }
    // teacher still reads their own classes
    expect((await as('teacher').get('/api/attendance/my-classes')).status).toBe(200);
  });

  // ─── Timetable: breaks in time order ─────────────────────────

  it('break periods (Short Break, Lunch Break) appear in every timetable response, in time order', async () => {
    const isTimeOrdered = (rows: { start: string }[]) => rows.every((r, i) => i === 0 || rows[i - 1].start <= r.start);

    const periods = await as('admin').get('/api/timetable/periods');
    const rows = periods.body.map((p: { startTime: string; isBreak: boolean; breakName: string | null }) => ({ start: p.startTime, brk: p.isBreak ? p.breakName : null }));
    expect(isTimeOrdered(rows)).toBe(true);
    expect(rows.map((r: { brk: string | null }) => r.brk).filter(Boolean)).toEqual(['Short Break', 'Lunch Break']);

    const today = await as('admin').get('/api/timetable/today/cls_10a?date=2026-10-26');
    const tp = today.body.periods as { start_time: string; is_break: boolean; break_name: string | null }[];
    expect(isTimeOrdered(tp.map((p) => ({ start: p.start_time })))).toBe(true);
    expect(tp.find((p) => p.break_name === 'Lunch Break')).toMatchObject({ start_time: '13:00', end_time: '14:00', is_break: true });

    const week = await as('admin').get('/api/timetable/teacher/t_rajesh/week?date=2026-10-26');
    expect(week.body.periods.filter((p: { is_break: boolean }) => p.is_break).map((p: { break_name: string }) => p.break_name)).toEqual(['Short Break', 'Lunch Break']);

    const myDay = await as('teacher').get('/api/timetable/me/today?date=2026-10-26');
    const sched = myDay.body.schedule as { kind: string; start_time: string; note: string | null }[];
    expect(isTimeOrdered(sched.map((e) => ({ start: e.start_time })))).toBe(true);
    expect(sched.filter((e) => e.kind === 'break').map((e) => e.note)).toEqual(['Short Break', 'Lunch Break']);

    const portal = await as('student').get('/api/portal/children/stu_001/timetable');
    const pp = portal.body.periods as { startTime: string; isBreak: boolean; breakName: string | null }[];
    expect(isTimeOrdered(pp.map((p) => ({ start: p.startTime })))).toBe(true);
    expect(pp.filter((p) => p.isBreak).map((p) => p.breakName)).toEqual(['Short Break', 'Lunch Break']);
    expect(portal.body.pdf_url).toBe('/api/timetable/class/cls_10a/pdf');
  });

  it('slot editor still refuses a break period', async () => {
    const res = await request(server).put('/api/timetable/slot').set('Authorization', `Bearer ${tok.admin}`)
      .send({ class_id: 'cls_10a', day_of_week: 'Mon', period_number: 7, subject: 'Maths', teacher_id: 't_rajesh' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Lunch Break/);
  });

  // ─── Timetable PDFs ──────────────────────────────────────────

  it('class timetable PDF: parent/student own class ok, other class 403; staff ok', async () => {
    for (const who of ['parent', 'student', 'teacher', 'admin']) {
      const r = await pdf(who, '/api/timetable/class/cls_10a/pdf');
      expect({ who, status: r.status }).toEqual({ who, status: 200 });
      expect(r.headers['content-type']).toMatch(/application\/pdf/);
      expect((r.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    }
    expect((await pdf('student', '/api/timetable/class/cls_10b/pdf')).status).toBe(403);
    expect((await pdf('parent', '/api/timetable/class/cls_12_sci/pdf')).status).toBe(403);
    expect((await pdf('warden', '/api/timetable/class/cls_10a/pdf')).status).toBe(403);
    expect((await pdf('admin', '/api/timetable/class/g2_cls_5a/pdf')).status).toBe(404);
  });

  it('teacher timetable PDF: self ok, another teacher 403, admins any, portal 403', async () => {
    const self = await pdf('teacher', '/api/timetable/teacher/t_rajesh/pdf');
    expect(self.status).toBe(200);
    expect((self.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    expect((await pdf('teacher', '/api/timetable/teacher/t_meera/pdf')).status).toBe(403);
    expect((await pdf('principal', '/api/timetable/teacher/t_meera/pdf')).status).toBe(200);
    expect((await pdf('parent', '/api/timetable/teacher/t_rajesh/pdf')).status).toBe(403);
    expect((await pdf('admin', '/api/timetable/teacher/g2_t_asha/pdf')).status).toBe(404);
  });
});
