import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService, NotifyInput } from '../src/notifications/notifications.service';

/**
 * Round 3 — Gate Desk (issue → approve → verify/exit → return), pass records + CSV,
 * Warden/Security role scope, and the change-password flow.
 */
describe('Gate desk, role scope & change password (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;
  const tok: Record<string, string> = {};
  const sent: NotifyInput[] = [];

  const LOGINS: Record<string, [string, string]> = {
    badmin: ['schooladmin@sainik01.edu', 'Demo@Admin1'],
    principal: ['principal@sainik01.edu', 'Demo@Principal1'],
    teacher: ['teacher@sainik01.edu', 'Demo@Teacher1'],
    warden: ['warden@sainik01.edu', 'Demo@Warden1'],
    security: ['security@sainik01.edu', 'Demo@Security1'],
    parent: ['parent@sainik01.edu', 'Demo@Parent1'],
    hr: ['hr@sainik01.edu', 'Demo@Hr1'],
    g2admin: ['admin@greenfield02.edu', 'Demo@Green1'],
  };

  beforeAll(async () => {
    // The raw parent OTP only exists in the outbound message (DB has a hash, the log a mask).
    const original = NotificationsService.prototype.notify;
    jest.spyOn(NotificationsService.prototype, 'notify').mockImplementation(function (this: NotificationsService, input: NotifyInput) {
      sent.push(input);
      return original.call(this, input);
    });
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
    jest.restoreAllMocks();
    await app.close();
  });

  const as = (who: string) => ({
    get: (url: string) => request(server).get(url).set('Authorization', `Bearer ${tok[who]}`),
    post: (url: string, body?: object) => request(server).post(url).set('Authorization', `Bearer ${tok[who]}`).send(body ?? {}),
    put: (url: string, body?: object) => request(server).put(url).set('Authorization', `Bearer ${tok[who]}`).send(body ?? {}),
  });
  const noSecrets = (body: unknown) => expect(JSON.stringify(body)).not.toMatch(/passCode|parentOtp|parent_otp|pass_code/);

  // ─── Issue → approve → exit → return ────────────────────────

  describe('gate desk lifecycle', () => {
    const DAY = '2026-12-09';
    let passId = '';
    let passCode = '';
    let otp = '';

    it('student picker: warden 200 (hostel residents first, active only); security 403', async () => {
      const res = await as('warden').get('/api/gate-passes/students');
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      const firstDay = res.body.findIndex((s: { hostel: unknown }) => !s.hostel);
      if (firstDay > 0) expect(res.body.slice(firstDay).every((s: { hostel: unknown }) => !s.hostel)).toBe(true);
      expect(res.body[0].hostel).not.toBeNull();
      const one = await as('warden').get('/api/gate-passes/students?q=stu');
      expect(one.status).toBe(200);
      expect((await as('security').get('/api/gate-passes/students')).status).toBe(403);
    });

    it('warden issues a pass: created AND warden-approved in one action', async () => {
      const res = await as('warden').post('/api/gate-passes', {
        student_id: 'stu_001', type: 'Home Visit', reason: 'GD-E2E family function', out_time: `${DAY}T09:00`, expected_in_time: `${DAY}T18:00`, issue: true,
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('Warden Approved');
      expect(res.body.next_step).toBe('principal_approval');
      passId = res.body.id;
      const row = await prisma.gatePass.findUnique({ where: { id: passId } });
      expect(row?.approvedByWarden).toBe('t_amit');
      expect(row?.passCode).toBeNull(); // the code is only generated at the principal's approval
      const audits = await prisma.auditLog.findMany({ where: { entity: 'gate_pass', entityId: passId } });
      expect(audits.map((a) => a.action).sort()).toEqual(['APPROVE', 'CREATE']);
    });

    it('issue flag is the warden step only; other school student 404; plain request stays Pending', async () => {
      const body = { student_id: 'stu_001', type: 'Local Outing', reason: 'GD-E2E', out_time: `${DAY}T10:00`, issue: true };
      expect((await as('teacher').post('/api/gate-passes', body)).status).toBe(403);
      expect((await as('principal').post('/api/gate-passes', body)).status).toBe(403);
      expect((await as('warden').post('/api/gate-passes', { ...body, student_id: 'g2_stu_001' })).status).toBe(404);
      const plain = await as('teacher').post('/api/gate-passes', { ...body, issue: undefined });
      expect(plain.status).toBe(201);
      expect(plain.body.status).toBe('Pending');
    });

    it('principal approval still follows: issues the code and sends the parent OTP', async () => {
      const p = await as('principal').put(`/api/gate-passes/${passId}/approve-principal`);
      expect(p.status).toBe(200);
      passCode = p.body.passCode;
      expect(passCode).toMatch(/^[A-Z0-9]{10}$/);
      const msg = sent.find((n) => n.ref_type === 'gate_pass' && n.ref_id === passId && n.redact?.length);
      otp = msg!.redact![0];
      expect(otp).toMatch(/^\d{6}$/);
    });

    it('security verifies by code, wrong OTP 400, right OTP checks out, then checks in', async () => {
      const look = await as('security').get(`/api/gate-passes/by-code/${passCode}`);
      expect(look.status).toBe(200);
      expect(look.body.student.id).toBe('stu_001');
      const wrong = otp === '000000' ? '111111' : '000000';
      expect((await as('security').put(`/api/gate-passes/${passId}/checkout`, { otp: wrong })).status).toBe(400);
      const out = await as('security').put(`/api/gate-passes/${passId}/checkout`, { otp });
      expect(out.status).toBe(200);
      expect(out.body.status).toBe('Checked Out');
      const live = await as('security').get('/api/gate-passes/out');
      expect(live.body.some((g: { id: string }) => g.id === passId)).toBe(true);
      const back = await as('security').put(`/api/gate-passes/${passId}/checkin`);
      expect(back.status).toBe(200);
      expect(back.body.status).toBe('Returned');
    });

    // ─── Pass records ──────────────────────────────────────────

    it('records: status/date/class/student filters; no passCode / OTP in the payload', async () => {
      const base = `/api/gate-passes/records?from=${DAY}&to=${DAY}`;
      const all = await as('security').get(base);
      expect(all.status).toBe(200);
      expect(all.body.total).toBe(all.body.rows.length);
      expect(all.body.rows.some((r: { id: string }) => r.id === passId)).toBe(true);
      noSecrets(all.body);
      expect(JSON.stringify(all.body)).not.toContain(passCode);

      const returned = await as('warden').get(`${base}&status=Returned`);
      expect(returned.body.rows.map((r: { id: string }) => r.id)).toContain(passId);
      expect(returned.body.rows.every((r: { status: string }) => r.status === 'Returned')).toBe(true);
      const pending = await as('warden').get(`${base}&status=Pending`);
      expect(pending.body.rows.map((r: { id: string }) => r.id)).not.toContain(passId);
      expect(pending.body.rows.length).toBeGreaterThan(0); // the teacher's plain request

      const other = await as('principal').get(`/api/gate-passes/records?from=2026-12-10&to=2026-12-31`);
      expect(other.body.rows.map((r: { id: string }) => r.id)).not.toContain(passId);

      const stu = await prisma.student.findUnique({ where: { id: 'stu_001' }, select: { classId: true, fullName: true, admissionNo: true } });
      const inClass = await as('security').get(`${base}&class_id=${stu!.classId}`);
      expect(inClass.body.rows.map((r: { id: string }) => r.id)).toContain(passId);
      const otherClass = await prisma.class.findFirst({ where: { branchId: 'sainik01', id: { not: stu!.classId! } } });
      const notInClass = await as('security').get(`${base}&class_id=${otherClass!.id}`);
      expect(notInClass.body.rows.map((r: { id: string }) => r.id)).not.toContain(passId);

      const byName = await as('security').get(`${base}&q=${encodeURIComponent(stu!.fullName.split(' ')[0])}`);
      expect(byName.body.rows.map((r: { id: string }) => r.id)).toContain(passId);
      const byAdm = await as('security').get(`${base}&q=${encodeURIComponent(stu!.admissionNo)}`);
      expect(byAdm.body.rows.map((r: { id: string }) => r.id)).toContain(passId);
      const nobody = await as('security').get(`${base}&q=zzzz-no-such-student`);
      expect(nobody.body.total).toBe(0);
      const byStudent = await as('security').get(`/api/gate-passes/records?student_id=stu_001`);
      expect(byStudent.body.rows.every((r: { studentId: string }) => r.studentId === 'stu_001')).toBe(true);

      const asc = await as('security').get('/api/gate-passes/records?sort=asc');
      const outs = asc.body.rows.map((r: { outTime: string }) => r.outTime);
      expect([...outs].sort()).toEqual(outs);
    });

    it('filter options (class + hostel names) for the desk; teacher 403; own school only', async () => {
      const res = await as('security').get('/api/gate-passes/filters');
      expect(res.status).toBe(200);
      expect(res.body.classes.length).toBeGreaterThan(0);
      expect(res.body.hostels.length).toBeGreaterThan(0);
      expect(res.body.classes.some((c: { id: string }) => c.id === 'g2_cls_5a')).toBe(false);
      expect((await as('teacher').get('/api/gate-passes/filters')).status).toBe(403);
    });

    it('records: bad filters 400, foreign class 404, roles (teacher/parent 403)', async () => {
      expect((await as('security').get('/api/gate-passes/records?status=Bogus')).status).toBe(400);
      expect((await as('security').get('/api/gate-passes/records?from=12-12-2026')).status).toBe(400);
      expect((await as('security').get('/api/gate-passes/records?from=2026-12-10&to=2026-12-01')).status).toBe(400);
      expect((await as('security').get('/api/gate-passes/records?class_id=g2_cls_5a')).status).toBe(404);
      expect((await as('teacher').get('/api/gate-passes/records')).status).toBe(403);
      expect((await as('parent').get('/api/gate-passes/records')).status).toBe(403);
      const g2 = await as('g2admin').get('/api/gate-passes/records');
      expect(g2.status).toBe(200);
      expect(g2.body.rows.map((r: { id: string }) => r.id)).not.toContain(passId);
    });

    it('records CSV: text/csv attachment, header + row, no pass code, audited EXPORT', async () => {
      const res = await as('warden').get(`/api/gate-passes/records?from=${DAY}&to=${DAY}&format=csv`).buffer(true).parse((r, cb) => {
        let data = '';
        r.setEncoding('utf8');
        r.on('data', (c: string) => { data += c; });
        r.on('end', () => cb(null, data));
      });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="gate-pass-records-/);
      const text = res.body as string;
      expect(text.replace(/^﻿/, '').split('\r\n')[0]).toMatch(/^Student,Admission No,Class,Hostel,Type,Reason/);
      expect(text).toContain('GD-E2E family function');
      expect(text).not.toContain(passCode);
      const audit = await prisma.auditLog.findFirst({ where: { entity: 'gate_pass', action: 'EXPORT', entityId: 'records' }, orderBy: { createdAt: 'desc' } });
      expect(audit?.detail).toMatch(/pass records csv/);
    });
  });

  // ─── Role scope (school decision 2026-10-24) ────────────────

  describe('warden / security scope', () => {
    it('security: 403 on students, classes, hostel rooms/allocations/roll-call; 200 on visitors + hostel names', async () => {
      const hostel = await prisma.hostel.findFirst({ where: { branchId: 'sainik01' } });
      for (const url of [
        '/api/students', '/api/classes', '/api/hostel/rooms', '/api/hostel/allocations', '/api/hostel/unallocated-students',
        `/api/hostel/roll-call?hostel_id=${hostel!.id}&date=2026-10-12&session=Night`, '/api/hostel/roll-call/report',
      ]) {
        expect([url, (await as('security').get(url)).status]).toEqual([url, 403]);
      }
      expect((await as('security').get('/api/hostel/visitors')).status).toBe(200);
      const names = await as('security').get('/api/hostel');
      expect(names.status).toBe(200);
      expect(names.body.length).toBeGreaterThan(0);
      // Visitor desk still works end to end for security.
      const v = await as('security').post('/api/hostel/visitors', { hostel_id: hostel!.id, visitor_name: 'GD Visitor', whom_to_meet: 'stu_004', purpose: 'Visit' });
      expect(v.status).toBe(201);
    });

    it('warden keeps hostel admin reads + student list; leadership reads hostel too', async () => {
      const hostel = await prisma.hostel.findFirst({ where: { branchId: 'sainik01' } });
      for (const url of ['/api/hostel/rooms', '/api/hostel/allocations', `/api/hostel/roll-call?hostel_id=${hostel!.id}&date=2026-10-12&session=Night`, '/api/students']) {
        expect([url, (await as('warden').get(url)).status]).toEqual([url, 200]);
      }
      expect((await as('principal').get('/api/hostel/rooms')).status).toBe(200);
    });

    it('warden: 403 on fees, academics, timetable, exams, classes', async () => {
      for (const url of ['/api/fees/invoices', '/api/fees/structures', '/api/academics/subjects', '/api/timetable/periods', '/api/exams', '/api/classes']) {
        expect([url, (await as('warden').get(url)).status]).toEqual([url, 403]);
      }
    });
  });

  // ─── Change password ────────────────────────────────────────

  describe('change password', () => {
    const OLD = 'Demo@Hr1';
    const NEW = 'NewHr@2026x';

    it('wrong current 400, same password 400, weak new password 400', async () => {
      const wrong = await as('hr').post('/api/auth/change-password', { current_password: 'Nope@1234', new_password: NEW });
      expect(wrong.status).toBe(400);
      expect(wrong.body.message).toMatch(/current password is incorrect/i);
      const same = await as('hr').post('/api/auth/change-password', { current_password: OLD, new_password: OLD });
      expect(same.status).toBe(400);
      expect(same.body.message).toMatch(/different/i);
      expect((await as('hr').post('/api/auth/change-password', { current_password: OLD, new_password: 'alllowercase1' })).status).toBe(400);
      expect((await as('hr').post('/api/auth/change-password', { current_password: OLD, new_password: 'Sh0rt' })).status).toBe(400);
    });

    it('success → old password no longer logs in, new one does; last change recorded; flag cleared', async () => {
      await prisma.user.update({ where: { email: 'hr@sainik01.edu' }, data: { mustChangePassword: true } });
      const before = await as('hr').get('/api/auth/me');
      expect(before.body.must_change_password).toBe(true);
      const ok = await as('hr').post('/api/auth/change-password', { current_password: OLD, new_password: NEW });
      expect(ok.status).toBe(200);
      expect((await request(server).post('/api/auth/login').send({ email: 'hr@sainik01.edu', password: OLD })).status).toBe(401);
      const fresh = await request(server).post('/api/auth/login').send({ email: 'hr@sainik01.edu', password: NEW });
      expect(fresh.status).toBe(200);
      expect(fresh.body.must_change_password).toBe(false);
      const me = await request(server).get('/api/auth/me').set('Authorization', `Bearer ${fresh.body.token}`);
      expect(me.body.password_changed_at).toBeTruthy();
      expect(JSON.stringify(me.body)).not.toContain(NEW);
      // The audit row never holds the password.
      const row = await prisma.auditLog.findFirst({ where: { entity: 'user', action: 'UPDATE', detail: 'password changed' } });
      expect(row).toBeTruthy();
      expect(row?.detail).not.toContain(NEW);
    });
  });
});
