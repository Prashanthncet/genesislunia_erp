import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService, NotifyInput } from '../src/notifications/notifications.service';

/** Phase 4 (leave / gate pass) + Phase 5 (discipline & safeguarding) access rules. */
describe('Leaves, gate passes & safeguarding (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;
  const tok: Record<string, string> = {};
  const sent: NotifyInput[] = [];

  const LOGINS: Record<string, [string, string]> = {
    super: ['admin@sainik01.edu', 'Admin@123'],
    badmin: ['schooladmin@sainik01.edu', 'Demo@Admin1'],
    principal: ['principal@sainik01.edu', 'Demo@Principal1'],
    hr: ['hr@sainik01.edu', 'Demo@Hr1'],
    hod: ['hod@sainik01.edu', 'Demo@Hod1'],
    teacher: ['teacher@sainik01.edu', 'Demo@Teacher1'],
    warden: ['warden@sainik01.edu', 'Demo@Warden1'],
    security: ['security@sainik01.edu', 'Demo@Security1'],
    discipline: ['discipline@sainik01.edu', 'Demo@Discipline1'],
    parent: ['parent@sainik01.edu', 'Demo@Parent1'],
    g2admin: ['admin@greenfield02.edu', 'Demo@Green1'],
    g2teacher: ['teacher@greenfield02.edu', 'Demo@Green1'],
  };

  beforeAll(async () => {
    // Capture outbound messages (the raw OTP only exists here — the DB holds a hash, the log a mask).
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
    del: (url: string) => request(server).delete(url).set('Authorization', `Bearer ${tok[who]}`),
  });
  const leave = (extra: object = {}) => ({ leave_type: 'Casual', start_date: '2026-12-01', end_date: '2026-12-02', reason: 'LD-E2E', ...extra });

  // ─── Staff leave ────────────────────────────────────────────

  describe('staff leave', () => {
    let teacherLeave = '';
    let mathsLeave = '';
    let hodLeave = '';

    it('teacher files own leave (staff id from the session, not the body)', async () => {
      const res = await as('teacher').post('/api/staff-leaves', leave());
      expect(res.status).toBe(201);
      teacherLeave = res.body.id;
      const row = await prisma.staffLeave.findUnique({ where: { id: teacherLeave } });
      expect(row?.staffId).toBe('t_rajesh');
    });

    it('teacher cannot file for a colleague → 403; HR can file on behalf', async () => {
      const bad = await as('teacher').post('/api/staff-leaves', leave({ staff_id: 't_divya' }));
      expect(bad.status).toBe(403);
      const ok = await as('hr').post('/api/staff-leaves', leave({ staff_id: 't_divya' }));
      expect(ok.status).toBe(201);
      mathsLeave = ok.body.id;
    });

    it('teacher sees only own leave; HOD queue shows only own-department pending', async () => {
      const mine = await as('teacher').get('/api/staff-leaves');
      expect(mine.status).toBe(200);
      expect(mine.body.every((l: { staffId: string }) => l.staffId === 't_rajesh')).toBe(true);
      const queue = await as('hod').get('/api/staff-leaves?view=queue');
      expect(queue.body.some((l: { id: string }) => l.id === mathsLeave)).toBe(true);
      expect(queue.body.some((l: { id: string }) => l.id === teacherLeave)).toBe(false);
    });

    it('HOD approves own-department leave; other department → 403', async () => {
      const other = await as('hod').put(`/api/staff-leaves/${teacherLeave}/decision`, { decision: 'Approved' });
      expect(other.status).toBe(403);
      const ok = await as('hod').put(`/api/staff-leaves/${mathsLeave}/decision`, { decision: 'Approved' });
      expect(ok.status).toBe(200);
      const row = await prisma.staffLeave.findUnique({ where: { id: mathsLeave } });
      expect(row?.approvedBy).toBe('t_meera'); // always a Staff id
    });

    it('self-approval → 403; reject without remarks → 400; teacher cannot decide → 403', async () => {
      const own = await as('hod').post('/api/staff-leaves', leave());
      expect(own.status).toBe(201);
      hodLeave = own.body.id;
      expect((await as('hod').put(`/api/staff-leaves/${hodLeave}/decision`, { decision: 'Approved' })).status).toBe(403);
      expect((await as('teacher').put(`/api/staff-leaves/${teacherLeave}/decision`, { decision: 'Approved' })).status).toBe(403);
      expect((await as('principal').put(`/api/staff-leaves/${hodLeave}/decision`, { decision: 'Rejected' })).status).toBe(400);
      const rej = await as('principal').put(`/api/staff-leaves/${hodLeave}/decision`, { decision: 'Rejected', remarks: 'Exam week' });
      expect(rej.status).toBe(200);
    });

    it('applicant withdraws own pending leave; others cannot', async () => {
      expect((await as('hod').put(`/api/staff-leaves/${teacherLeave}/withdraw`)).status).toBe(403);
      const w = await as('teacher').put(`/api/staff-leaves/${teacherLeave}/withdraw`);
      expect(w.status).toBe(200);
      expect(w.body.status).toBe('Withdrawn');
    });

    it('balances: teacher sees only self, HR sees everyone', async () => {
      const self = await as('teacher').get('/api/balances');
      expect(self.body).toHaveLength(1);
      expect(self.body[0].staff_id).toBe('t_rajesh');
      expect((await as('teacher').get('/api/balances?staff_id=t_divya')).status).toBe(403);
      const all = await as('hr').get('/api/balances');
      expect(all.body.length).toBeGreaterThan(5);
    });

    it('parents cannot touch staff leave', async () => {
      expect((await as('parent').get('/api/staff-leaves')).status).toBe(403);
      expect((await as('parent').get('/api/balances')).status).toBe(403);
    });

    it('cross-school decision → 404', async () => {
      const r = await as('hr').post('/api/staff-leaves', leave({ staff_id: 't_kavya', start_date: '2026-12-10', end_date: '2026-12-10' }));
      expect((await as('g2admin').put(`/api/staff-leaves/${r.body.id}/decision`, { decision: 'Approved' })).status).toBe(404);
      expect((await as('g2admin').post('/api/staff-leaves', leave({ staff_id: 't_kavya' }))).status).toBe(404);
    });
  });

  // ─── Student leave ──────────────────────────────────────────

  describe('student leave', () => {
    let parentLeave = '';
    it('parent requests leave for own child ok; for another child → 403', async () => {
      const ok = await as('parent').post('/api/student-leaves', { ...leave(), student_id: 'stu_001' });
      expect(ok.status).toBe(201);
      parentLeave = ok.body.id;
      const row = await prisma.studentLeave.findUnique({ where: { id: parentLeave } });
      expect(row?.requestedBy).toBe('u_parent');
      expect((await as('parent').post('/api/student-leaves', { ...leave(), student_id: 'stu_002' })).status).toBe(403);
    });

    it('parent sees only own children; cannot decide', async () => {
      const list = await as('parent').get('/api/student-leaves');
      expect(list.status).toBe(200);
      expect(list.body.length).toBeGreaterThan(0);
      expect(list.body.every((l: { studentId: string }) => ['stu_001', 'stu_004'].includes(l.studentId))).toBe(true);
      expect((await as('parent').get('/api/student-leaves?student_id=stu_002')).status).toBe(403);
      expect((await as('parent').put(`/api/student-leaves/${parentLeave}/decision`, { decision: 'Approved' })).status).toBe(403);
    });

    it('teacher approves; approved leave shows up for attendance on-date', async () => {
      const d = await as('teacher').put(`/api/student-leaves/${parentLeave}/decision`, { decision: 'Approved' });
      expect(d.status).toBe(200);
      const row = await prisma.studentLeave.findUnique({ where: { id: parentLeave } });
      expect(row?.approvedBy).toBe('t_rajesh');
      const on = await as('teacher').get('/api/student-leaves/on-date?date=2026-12-01&class_id=cls_10a');
      expect(on.status).toBe(200);
      expect(on.body.some((l: { id: string }) => l.id === parentLeave)).toBe(true);
      expect((await as('parent').get('/api/student-leaves/on-date?date=2026-12-01')).status).toBe(403);
    });
  });

  // ─── Gate pass ──────────────────────────────────────────────

  describe('gate pass', () => {
    let passId = '';
    let passCode = '';
    let otp = '';
    const noOtp = (body: unknown) => expect(JSON.stringify(body)).not.toMatch(/parentOtp|parent_otp/);

    it('parent requests a pass for own child (no parent message yet); other child → 403', async () => {
      const before = sent.length;
      const res = await as('parent').post('/api/gate-passes', { student_id: 'stu_001', type: 'Local Outing', reason: 'LD-E2E dentist', out_time: '2026-12-05T10:00', expected_in_time: '2026-12-05T13:00' });
      expect(res.status).toBe(201);
      passId = res.body.id;
      expect(sent.slice(before).some((n) => n.ref_type === 'gate_pass')).toBe(false);
      expect((await as('parent').post('/api/gate-passes', { student_id: 'stu_002', type: 'Local Outing', reason: 'x', out_time: '2026-12-05T10:00' })).status).toBe(403);
    });

    it('approval chain: principal before warden 400, teacher cannot approve', async () => {
      expect((await as('principal').put(`/api/gate-passes/${passId}/approve-principal`)).status).toBe(400);
      expect((await as('teacher').put(`/api/gate-passes/${passId}/approve-warden`)).status).toBe(403);
      expect((await as('warden').put(`/api/gate-passes/${passId}/approve-warden`)).status).toBe(200);
      const p = await as('principal').put(`/api/gate-passes/${passId}/approve-principal`);
      expect(p.status).toBe(200);
      passCode = p.body.passCode;
      expect(passCode).toMatch(/^[A-Z0-9]{10}$/);
      const msg = sent.find((n) => n.ref_type === 'gate_pass' && n.ref_id === passId && n.redact?.length);
      expect(msg).toBeDefined();
      otp = msg!.redact![0];
      expect(otp).toMatch(/^\d{6}$/);
      const row = await prisma.gatePass.findUnique({ where: { id: passId } });
      expect(row?.parentOtp).toMatch(/^[0-9a-f]{64}$/);
      expect(row?.parentOtp).not.toBe(otp);
      const log = await prisma.notificationLog.findFirst({ where: { refType: 'gate_pass', refId: passId } });
      expect(log?.body ?? '').not.toContain(otp);
    });

    it('parentOtp never appears in any GET', async () => {
      for (const [who, url] of [
        ['teacher', '/api/gate-passes'], ['warden', `/api/gate-passes/${passId}`], ['parent', '/api/gate-passes'],
        ['security', `/api/gate-passes/by-code/${passCode}`], ['security', '/api/gate-passes/out'], ['badmin', '/api/gate-passes?status=Returned'],
      ] as const) {
        const res = await as(who).get(url);
        expect(res.status).toBe(200);
        noOtp(res.body);
      }
    });

    it('printable pass PDF with QR (security + parent); teacher 403', async () => {
      const pdf = await as('security').get(`/api/gate-passes/${passId}/pass.pdf`).buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(pdf.status).toBe(200);
      expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
      expect((await as('parent').get(`/api/gate-passes/${passId}/pass.pdf`)).status).toBe(200);
      expect((await as('teacher').get(`/api/gate-passes/${passId}/pass.pdf`)).status).toBe(403);
    });

    it('security desk: lookup by code, wrong OTP 400, right OTP checks out, check-in returns', async () => {
      const look = await as('security').get(`/api/gate-passes/by-code/${passCode.toLowerCase()}`);
      expect(look.status).toBe(200);
      expect(look.body.id).toBe(passId);
      expect(look.body.student.fullName).toBeDefined();
      expect((await as('teacher').get(`/api/gate-passes/by-code/${passCode}`)).status).toBe(403);
      expect((await as('teacher').put(`/api/gate-passes/${passId}/checkout`, { otp })).status).toBe(403);

      const wrong = otp === '000000' ? '111111' : '000000';
      expect((await as('security').put(`/api/gate-passes/${passId}/checkout`, { otp: wrong })).status).toBe(400);
      const out = await as('security').put(`/api/gate-passes/${passId}/checkout`, { otp });
      expect(out.status).toBe(200);
      expect(out.body.status).toBe('Checked Out');
      const row = await prisma.gatePass.findUnique({ where: { id: passId } });
      expect(row?.actualOutTime).toBeTruthy();
      expect(row?.checkedOutBy).toBe('t_security');

      const live = await as('security').get('/api/gate-passes/out');
      expect(live.body.some((p: { id: string }) => p.id === passId)).toBe(true);

      const back = await as('security').put(`/api/gate-passes/${passId}/checkin`);
      expect(back.status).toBe(200);
      expect(back.body.status).toBe('Returned');
      const after = await prisma.gatePass.findUnique({ where: { id: passId } });
      expect(after?.actualInTime).toBeTruthy();
      expect(after?.checkedInBy).toBe('t_security');
      expect(sent.filter((n) => n.ref_id === passId && /campus/.test(n.subject ?? '')).length).toBeGreaterThanOrEqual(2);
    });

    it('reject path: warden rejects with reason; principal cannot approve a rejected pass', async () => {
      const r = await as('warden').post('/api/gate-passes', { student_id: 'stu_003', type: 'Local Outing', reason: 'LD-E2E', out_time: '2026-12-06T10:00' });
      expect(r.status).toBe(201);
      expect((await as('warden').put(`/api/gate-passes/${r.body.id}/reject`, {})).status).toBe(400);
      expect((await as('principal').put(`/api/gate-passes/${r.body.id}/reject`, { reason: 'x' })).status).toBe(403); // warden's step
      const rej = await as('warden').put(`/api/gate-passes/${r.body.id}/reject`, { reason: 'Exams this week' });
      expect(rej.status).toBe(200);
      expect((await as('principal').put(`/api/gate-passes/${r.body.id}/approve-principal`)).status).toBe(400);
      const got = await as('warden').get(`/api/gate-passes/${r.body.id}`);
      expect(got.body.status).toBe('Rejected');
      expect(got.body.rejectedReason).toBe('Exams this week');
      expect((await as('security').get(`/api/gate-passes/${r.body.id}/pass.pdf`)).status).toBe(400);
    });

    it('cross-school → 404', async () => {
      expect((await as('g2admin').get(`/api/gate-passes/${passId}`)).status).toBe(404);
      expect((await as('g2admin').get(`/api/gate-passes/by-code/${passCode}`)).status).toBe(404);
      expect((await as('g2admin').put(`/api/gate-passes/${passId}/approve-warden`)).status).toBe(404);
    });
  });

  // ─── Discipline & safeguarding ──────────────────────────────

  describe('incidents', () => {
    let teacherInc = '';
    const auditCount = (actorId: string, action: string) =>
      prisma.auditLog.count({ where: { actorId, action, entity: 'incident' } });

    it('teacher reports an incident; parent SMS is generic', async () => {
      const res = await as('teacher').post('/api/discipline/incidents', {
        student_id: 'stu_002', incident_date: '2026-10-20', description: 'LD-E2E pushed a classmate', confidential_notes: 'LD-E2E secret note',
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('Open');
      teacherInc = res.body.id;
      const sms = sent.find((n) => n.ref_type === 'incident' && n.ref_id === teacherInc);
      expect(sms?.body).not.toContain('pushed');
      expect(await auditCount('u_teacher', 'CREATE')).toBeGreaterThanOrEqual(1);
    });

    it('teacher: case list 403, own list only own and without confidential notes', async () => {
      expect((await as('teacher').get('/api/discipline/incidents')).status).toBe(403);
      const before = await auditCount('u_teacher', 'LIST');
      const mine = await as('teacher').get('/api/discipline/incidents/mine');
      expect(mine.status).toBe(200);
      expect(mine.body.map((i: { id: string }) => i.id)).toEqual([teacherInc]);
      expect(JSON.stringify(mine.body)).not.toMatch(/confidential/i);
      expect(await auditCount('u_teacher', 'LIST')).toBe(before + 1);

      const one = await as('teacher').get(`/api/discipline/incidents/${teacherInc}`);
      expect(one.status).toBe(200);
      expect(one.body.confidentialNotes).toBeUndefined();
      const seeded = await prisma.incident.findFirst({ where: { studentId: 'stu_004' } });
      expect((await as('teacher').get(`/api/discipline/incidents/${seeded!.id}`)).status).toBe(404);
      expect((await as('teacher').put(`/api/discipline/incidents/${teacherInc}/status`, { status: 'Under Review' })).status).toBe(403);
    });

    it('branch_admin is not on the case team → 403 on case list and audit log', async () => {
      expect((await as('badmin').get('/api/discipline/incidents')).status).toBe(403);
      expect((await as('badmin').get('/api/discipline/audit-log')).status).toBe(403);
    });

    it('discipline officer sees all incl. notes; every list and detail read is audited', async () => {
      const listsBefore = await auditCount('u_discipline', 'LIST');
      const viewsBefore = await auditCount('u_discipline', 'VIEW');
      const all = await as('discipline').get('/api/discipline/incidents');
      expect(all.status).toBe(200);
      expect(all.body.length).toBeGreaterThanOrEqual(5);
      const mineRow = all.body.find((i: { id: string }) => i.id === teacherInc);
      expect(mineRow.confidentialNotes).toBe('LD-E2E secret note');
      const detail = await as('discipline').get(`/api/discipline/incidents/${teacherInc}`);
      expect(detail.status).toBe(200);
      expect(detail.body.confidentialNotes).toBe('LD-E2E secret note');
      expect(Array.isArray(detail.body.history)).toBe(true);
      expect(await auditCount('u_discipline', 'LIST')).toBe(listsBefore + 1);
      expect(await auditCount('u_discipline', 'VIEW')).toBe(viewsBefore + 1);
      const log = await as('discipline').get(`/api/discipline/audit-log?entity_id=${teacherInc}`);
      expect(log.status).toBe(200);
      expect(log.body.some((e: { action: string; actorId: string }) => e.action === 'VIEW' && e.actorId === 'u_discipline')).toBe(true);
    });

    it('status machine: Open→Closed 400, Open→Under Review→Closed ok; re-open principal-only with remarks', async () => {
      const d = as('discipline');
      expect((await d.put(`/api/discipline/incidents/${teacherInc}/status`, { status: 'Closed' })).status).toBe(400);
      expect((await d.put(`/api/discipline/incidents/${teacherInc}/status`, { status: 'Under Review' })).status).toBe(200);
      expect((await d.put(`/api/discipline/incidents/${teacherInc}/status`, { status: 'Closed' })).status).toBe(200);
      expect((await d.put(`/api/discipline/incidents/${teacherInc}/status`, { status: 'Open', remarks: 'new info' })).status).toBe(403);
      expect((await as('principal').put(`/api/discipline/incidents/${teacherInc}/status`, { status: 'Open' })).status).toBe(400);
      expect((await as('principal').put(`/api/discipline/incidents/${teacherInc}/status`, { status: 'Open', remarks: 'Parent raised new info' })).status).toBe(200);
    });

    it('escalation: manual escalate notifies the principal; High severity auto-escalates', async () => {
      const before = sent.length;
      const esc = await as('discipline').post(`/api/discipline/incidents/${teacherInc}/escalate`, { reason: 'Pattern of behaviour' });
      expect(esc.status).toBe(201);
      const row = await prisma.incident.findUnique({ where: { id: teacherInc } });
      expect(row?.status).toBe('Escalated');
      expect(row?.escalatedBy).toBe('u_discipline');
      expect(row?.escalatedAt).toBeTruthy();
      const note = sent.slice(before).find((n) => n.ref_type === 'incident_escalation' && n.recipient === 'principal@sainik01.edu');
      expect(note).toBeDefined();
      expect(note!.body).not.toContain('pushed');
      expect(await auditCount('u_discipline', 'ESCALATE')).toBeGreaterThanOrEqual(1);

      const high = await as('teacher').post('/api/discipline/incidents', { student_id: 'stu_003', incident_date: '2026-10-21', description: 'LD-E2E serious', severity: 'High' });
      expect(high.status).toBe(201);
      expect(high.body.status).toBe('Escalated');
    });

    it('assign case owner: only case-team users', async () => {
      expect((await as('discipline').put(`/api/discipline/incidents/${teacherInc}`, { assigned_to: 'u_teacher' })).status).toBe(400);
      expect((await as('discipline').put(`/api/discipline/incidents/${teacherInc}`, { assigned_to: 'u_discipline' })).status).toBe(200);
      const d = await as('principal').get(`/api/discipline/incidents/${teacherInc}`);
      expect(d.body.assignedTo).toBe('u_discipline');
    });

    it('soft delete: discipline officer 403, principal ok; hidden from lists, row kept, audited', async () => {
      expect((await as('discipline').del(`/api/discipline/incidents/${teacherInc}`)).status).toBe(403);
      expect((await as('badmin').del(`/api/discipline/incidents/${teacherInc}`)).status).toBe(403);
      expect((await as('principal').del(`/api/discipline/incidents/${teacherInc}`)).status).toBe(200);
      const row = await prisma.incident.findUnique({ where: { id: teacherInc } });
      expect(row?.deletedAt).toBeTruthy();
      const list = await as('discipline').get('/api/discipline/incidents');
      expect(list.body.some((i: { id: string }) => i.id === teacherInc)).toBe(false);
      expect((await as('discipline').get(`/api/discipline/incidents/${teacherInc}`)).status).toBe(404);
      expect(await prisma.auditLog.count({ where: { entityId: teacherInc, action: 'DELETE', actorId: 'u_principal' } })).toBe(1);
    });

    it('cross-school → 404 / nothing leaks', async () => {
      const seeded = await prisma.incident.findFirst({ where: { branchId: 'sainik01', deletedAt: null } });
      expect((await as('g2teacher').get(`/api/discipline/incidents/${seeded!.id}`)).status).toBe(404);
      expect((await as('super').get('/api/discipline/incidents')).status).toBe(200);
      expect((await as('g2teacher').post('/api/discipline/incidents', { student_id: 'stu_001', incident_date: '2026-10-20', description: 'x' })).status).toBe(404);
      const g2mine = await as('g2teacher').get('/api/discipline/incidents/mine');
      expect(g2mine.body).toEqual([]);
    });
  });
});
