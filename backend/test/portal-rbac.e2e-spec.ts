import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Parent / student portal isolation + a role-matrix smoke test.
 * Fresh DB per run (e2e-global-setup). Each role logs in ONCE in beforeAll.
 */

const LOGINS: Record<string, { email: string; password: string; role: string }> = {
  super_admin: { email: 'admin@sainik01.edu', password: 'Admin@123', role: 'super_admin' },
  branch_admin: { email: 'schooladmin@sainik01.edu', password: 'Demo@Admin1', role: 'branch_admin' },
  principal: { email: 'principal@sainik01.edu', password: 'Demo@Principal1', role: 'principal' },
  vice_principal: { email: 'vp@sainik01.edu', password: 'Demo@Vp1', role: 'vice_principal' },
  office_superintendent: { email: 'os@sainik01.edu', password: 'Demo@Os1', role: 'office_superintendent' },
  admission_officer: { email: 'ao@sainik01.edu', password: 'Demo@Ao1', role: 'admission_officer' },
  accounts: { email: 'accounts@sainik01.edu', password: 'Demo@Accounts1', role: 'accounts' },
  hr: { email: 'hr@sainik01.edu', password: 'Demo@Hr1', role: 'hr' },
  hod: { email: 'hod@sainik01.edu', password: 'Demo@Hod1', role: 'hod' },
  teacher: { email: 'teacher@sainik01.edu', password: 'Demo@Teacher1', role: 'teacher' },
  warden: { email: 'warden@sainik01.edu', password: 'Demo@Warden1', role: 'warden' },
  security: { email: 'security@sainik01.edu', password: 'Demo@Security1', role: 'security' },
  discipline_officer: { email: 'discipline@sainik01.edu', password: 'Demo@Discipline1', role: 'discipline_officer' },
  parent: { email: 'parent@sainik01.edu', password: 'Demo@Parent1', role: 'parent' },
  student: { email: 'student@sainik01.edu', password: 'Demo@Student1', role: 'student' },
  g2_parent: { email: 'parent@greenfield02.edu', password: 'Demo@Green1', role: 'parent' },
};

const CHILD_ENDPOINTS = ['attendance', 'fees', 'marks', 'timetable', 'leaves', 'messages'];

// Setup boots the app and logs in all 16 roles (16 bcrypt checks): beyond Jest's 5s default
// on a loaded machine.
jest.setTimeout(60_000);

describe('Portal RBAC (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    for (const [key, l] of Object.entries(LOGINS)) {
      const res = await request(server).post('/api/auth/login').send({ email: l.email, password: l.password });
      if (res.status !== 200) throw new Error(`login failed for ${key}: ${res.status} ${JSON.stringify(res.body)}`);
      tokens[key] = res.body.token;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (who: string, url: string) => request(server).get(url).set('Authorization', `Bearer ${tokens[who]}`);
  const post = (who: string, url: string, body: object) =>
    request(server).post(url).set('Authorization', `Bearer ${tokens[who]}`).send(body);

  // ─── Role matrix ─────────────────────────────────────────────

  it.each(Object.keys(LOGINS))('%s: GET /api/auth/me returns the seeded role', async (key) => {
    const res = await get(key, '/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe(LOGINS[key].role);
    expect(res.body.password).toBeUndefined();
  });

  it('parent /auth/me lists exactly stu_001 and stu_004 as children', async () => {
    const res = await get('parent', '/api/auth/me');
    expect(res.body.children.map((c: { id: string }) => c.id).sort()).toEqual(['stu_001', 'stu_004']);
  });

  // /api/fees/invoices is deliberately open to portal roles but scoped to their own
  // children (fees module) — asserted separately below instead of expecting 403.
  it.each([['parent', ['stu_001', 'stu_004']], ['student', ['stu_001']]] as const)(
    '%s token on /api/fees/invoices: 403, or only own children\'s invoices',
    async (who, own) => {
      const res = await get(who, '/api/fees/invoices');
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      const ids = new Set((res.body as { studentId: string }[]).map((r) => r.studentId));
      for (const id of ids) expect(own).toContain(id);
      expect((await get(who, '/api/fees/invoices?student_id=stu_002')).status).toBe(403);
    },
  );

  const STAFF_SAMPLE = [
    '/api/students',
    '/api/staff',
    '/api/reports/summary',
    '/api/discipline/incidents',
    '/api/notifications',
  ];
  for (const who of ['parent', 'student']) {
    it.each(STAFF_SAMPLE)(`${who} token is refused on staff endpoint %s`, async (url) => {
      const res = await get(who, url);
      expect(res.status).toBe(403);
    });
  }

  // ─── Portal: who may call it ─────────────────────────────────

  it.each(['teacher', 'super_admin', 'branch_admin', 'accounts'])('%s (staff) gets 403 on every /portal route', async (who) => {
    for (const url of ['/api/portal/overview', '/api/portal/admission', ...CHILD_ENDPOINTS.map((e) => `/api/portal/children/stu_001/${e}`)]) {
      const res = await get(who, url);
      expect({ url, status: res.status }).toEqual({ url, status: 403 });
    }
    const res = await post(who, '/api/portal/children/stu_001/leave-request', {
      leave_type: 'Sick', start_date: '2026-12-01', end_date: '2026-12-02', reason: 'x',
    });
    expect(res.status).toBe(403);
  });

  it('no token → 401 on /portal/overview', async () => {
    const res = await request(server).get('/api/portal/overview');
    expect(res.status).toBe(401);
  });

  // ─── Parent scope ────────────────────────────────────────────

  it('parent overview shows stu_001 and stu_004 only, with the summary blocks', async () => {
    const res = await get('parent', '/api/portal/overview');
    expect(res.status).toBe(200);
    const ids = res.body.children.map((c: { id: string }) => c.id).sort();
    expect(ids).toEqual(['stu_001', 'stu_004']);
    const c = res.body.children.find((x: { id: string }) => x.id === 'stu_001');
    expect(c.class).toMatchObject({ id: 'cls_10a' });
    expect(c.attendance).toHaveProperty('attendance_pct');
    expect(c.fees).toHaveProperty('balance');
    expect(c).toHaveProperty('latest_marks');
    expect(Array.isArray(c.messages)).toBe(true);
    expect(c.messages.length).toBeLessThanOrEqual(5);
  });

  it.each(CHILD_ENDPOINTS)('parent can read own children: %s for stu_001 and stu_004 → 200', async (ep) => {
    for (const id of ['stu_001', 'stu_004']) {
      const res = await get('parent', `/api/portal/children/${id}/${ep}`);
      expect({ id, status: res.status }).toEqual({ id, status: 200 });
    }
  });

  it.each(CHILD_ENDPOINTS)('parent gets 403 for someone else\'s child: %s for stu_002', async (ep) => {
    const res = await get('parent', `/api/portal/children/stu_002/${ep}`);
    expect(res.status).toBe(403);
  });

  it('parent cannot file a leave for stu_002', async () => {
    const res = await post('parent', '/api/portal/children/stu_002/leave-request', {
      leave_type: 'Sick', start_date: '2026-12-01', end_date: '2026-12-02', reason: 'x',
    });
    expect(res.status).toBe(403);
  });

  // ─── Student scope ───────────────────────────────────────────

  it('student overview shows only stu_001', async () => {
    const res = await get('student', '/api/portal/overview');
    expect(res.status).toBe(200);
    expect(res.body.children.map((c: { id: string }) => c.id)).toEqual(['stu_001']);
  });

  it.each(CHILD_ENDPOINTS)('student: %s for self 200, for stu_004 403', async (ep) => {
    expect((await get('student', `/api/portal/children/stu_001/${ep}`)).status).toBe(200);
    expect((await get('student', `/api/portal/children/stu_004/${ep}`)).status).toBe(403);
  });

  it('student admission list is empty (admissions belong to parents)', async () => {
    const res = await get('student', '/api/portal/admission');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // ─── Cross-school ────────────────────────────────────────────

  it('greenfield parent sees only g2_stu_001 and is refused every sainik01 child', async () => {
    const ov = await get('g2_parent', '/api/portal/overview');
    expect(ov.status).toBe(200);
    expect(ov.body.children.map((c: { id: string }) => c.id)).toEqual(['g2_stu_001']);
    for (const ep of CHILD_ENDPOINTS) {
      const res = await get('g2_parent', `/api/portal/children/stu_001/${ep}`);
      expect([403, 404]).toContain(res.status);
    }
  });

  it('sainik01 parent is refused the greenfield child', async () => {
    const res = await get('parent', '/api/portal/children/g2_stu_001/fees');
    expect([403, 404]).toContain(res.status);
  });

  // ─── Leave request ───────────────────────────────────────────

  it('leave request creates a Pending StudentLeave with requestedBy = the parent', async () => {
    const res = await post('parent', '/api/portal/children/stu_004/leave-request', {
      leave_type: 'Family', start_date: '2026-12-10', end_date: '2026-12-12', reason: 'Portal e2e family function',
      status: 'Approved', requested_by: 'someone-else', // must be ignored (whitelist)
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('Pending');
    const row = await prisma.studentLeave.findUnique({ where: { id: res.body.id } });
    expect(row).toMatchObject({ studentId: 'stu_004', status: 'Pending', requestedBy: 'u_parent', branchId: 'sainik01' });

    const list = await get('parent', '/api/portal/children/stu_004/leaves');
    const mine = list.body.leaves.find((l: { id: string }) => l.id === res.body.id);
    expect(mine).toMatchObject({ status: 'Pending', requested_by_me: true });
  });

  it('leave request validation: bad dates and overlaps are 400', async () => {
    const bad = await post('parent', '/api/portal/children/stu_004/leave-request', {
      leave_type: 'Sick', start_date: '2026-12-20', end_date: '2026-12-18', reason: 'x',
    });
    expect(bad.status).toBe(400);
    const overlap = await post('parent', '/api/portal/children/stu_004/leave-request', {
      leave_type: 'Sick', start_date: '2026-12-11', end_date: '2026-12-11', reason: 'x',
    });
    expect(overlap.status).toBe(400);
    const badType = await post('parent', '/api/portal/children/stu_004/leave-request', {
      leave_type: 'Vacation-ish', start_date: '2026-12-25', end_date: '2026-12-25', reason: 'x',
    });
    expect(badType.status).toBe(400);
  });

  // ─── Secrets ─────────────────────────────────────────────────

  it('no OTP / pass-code field anywhere in /portal/children/:id/leaves', async () => {
    await prisma.gatePass.create({
      data: {
        branchId: 'sainik01', studentId: 'stu_001', type: 'Portal E2E', reason: 'Dentist',
        outTime: '2026-12-01 10:00', status: 'Approved', parentOtp: 'deadbeefhash', passCode: 'GP-E2E-PORTAL',
      },
    });
    const res = await get('parent', '/api/portal/children/stu_001/leaves');
    expect(res.status).toBe(200);
    expect(res.body.gate_passes.length).toBeGreaterThan(0);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/otp/i);
    expect(text).not.toContain('deadbeefhash');
    expect(text).not.toContain('GP-E2E-PORTAL');
    expect(text).not.toMatch(/pass_?code/i);
  });

  it('message bodies never contain a raw OTP', async () => {
    const pass = await prisma.gatePass.findFirst({ where: { studentId: 'stu_001', type: 'Portal E2E' } });
    await prisma.notificationLog.create({
      data: {
        branchId: 'sainik01', channel: 'sms', recipient: '9000000000', subject: 'Gate pass OTP',
        body: 'Gate pass approved for Aditya. Your OTP is 482913. Share it only at the gate.',
        refType: 'gate_pass', refId: pass!.id, status: 'mocked',
      },
    });
    for (const who of ['parent', 'student']) {
      const res = await get(who, '/api/portal/children/stu_001/messages');
      expect(res.status).toBe(200);
      const hit = res.body.find((m: { subject: string | null }) => m.subject === 'Gate pass OTP');
      expect(hit).toBeDefined();
      expect(hit.body).not.toContain('482913');
      expect(JSON.stringify(res.body)).not.toContain('482913');
      expect(hit).not.toHaveProperty('recipient');
    }
    const ov = await get('parent', '/api/portal/overview');
    expect(JSON.stringify(ov.body)).not.toContain('482913');
  });

  it('messages for stu_004 do not include stu_001\'s gate-pass message', async () => {
    const res = await get('parent', '/api/portal/children/stu_004/messages');
    expect(res.body.find((m: { subject: string | null }) => m.subject === 'Gate pass OTP')).toBeUndefined();
  });

  // ─── Admission status ────────────────────────────────────────

  it('admission: parent sees own application + timeline, no form token or login secrets', async () => {
    const app1 = await prisma.admission.create({
      data: {
        branchId: 'sainik01', studentName: 'Portal E2E Child', parentName: 'Mr. Devendra Singh',
        parentEmail: 'parent@sainik01.edu', status: 'Admission Complete', parentUserId: 'u_parent',
        token: 'secret-form-token-e2e', loginId: 'LOGIN-E2E', dynamicData: '{"aadhaar":"1234"}', classId: 'cls_10a',
        steps: {
          create: [
            { branchId: 'sainik01', fromStatus: null, toStatus: 'Links Sent', action: 'send_link', actorRole: 'admission_officer', actorId: 'u_ao' },
            { branchId: 'sainik01', fromStatus: 'VP Approved', toStatus: 'Admission Complete', action: 'principal_approve', actorRole: 'principal', actorId: 'u_principal' },
          ],
        },
      },
    });
    // Someone else's application must not show up.
    await prisma.admission.create({
      data: { branchId: 'sainik01', studentName: 'Other Family E2E', status: 'Links Sent', parentUserId: 'u_teacher' },
    });
    const res = await get('parent', '/api/portal/admission');
    expect(res.status).toBe(200);
    expect(res.body.map((a: { id: string }) => a.id)).toEqual([app1.id]);
    expect(res.body[0]).toMatchObject({ status: 'Admission Complete', confirmed: true });
    expect(res.body[0].timeline.map((t: { to_status: string }) => t.to_status)).toEqual(['Links Sent', 'Admission Complete']);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('secret-form-token-e2e');
    expect(text).not.toContain('LOGIN-E2E');
    expect(text).not.toContain('aadhaar');
    expect(text).not.toContain('u_ao');

    const g2 = await get('g2_parent', '/api/portal/admission');
    expect(g2.body).toEqual([]);
  });
});
