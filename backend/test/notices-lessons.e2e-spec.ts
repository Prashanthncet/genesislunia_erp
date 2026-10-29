import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Round 3: student notices (targeting, per-child labels, per-user read state, teacher scope,
 * isolation, also_send) and lesson-plan PDF attachments (magic bytes, 10 MB cap, signed-URL
 * download, owner-only replace, portal can't upload) + the plan's own PDF export.
 */
describe('Notices + lesson-plan PDFs (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;
  const tok: Record<string, string> = {};

  const LOGINS: Record<string, [string, string]> = {
    principal: ['principal@sainik01.edu', 'Demo@Principal1'],
    os: ['os@sainik01.edu', 'Demo@Os1'],
    hod: ['hod@sainik01.edu', 'Demo@Hod1'],
    teacher: ['teacher@sainik01.edu', 'Demo@Teacher1'],
    teacher2: ['teacher2.e2e@sainik01.edu', 'Demo@Teacher2'],
    warden: ['warden@sainik01.edu', 'Demo@Warden1'],
    parent: ['parent@sainik01.edu', 'Demo@Parent1'],
    student: ['student@sainik01.edu', 'Demo@Student1'],
    g2admin: ['admin@greenfield02.edu', 'Demo@Green1'],
  };

  let teacherStaff = '';
  let otherClass = ''; // a class teacher@ neither teaches nor is class teacher of
  let otherClassStudent = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    // A second teacher login (seed has one teacher login) on a staff row without a user.
    const free = await prisma.staff.findFirst({
      where: { branchId: 'sainik01', isActive: true, user: null, NOT: { id: 't_rajesh' } },
      select: { id: true },
    });
    if (!free) throw new Error('no free staff row for teacher2');
    await prisma.user.create({
      data: {
        branchId: 'sainik01', email: 'teacher2.e2e@sainik01.edu', password: await bcrypt.hash('Demo@Teacher2', 10),
        role: 'teacher', name: 'Second Teacher', staffId: free.id,
      },
    });

    for (const [k, [email, password]] of Object.entries(LOGINS)) {
      const res = await request(server).post('/api/auth/login').send({ email, password });
      if (res.status !== 200) throw new Error(`login ${k} failed: ${res.status}`);
      tok[k] = res.body.token;
    }

    teacherStaff = 't_rajesh';
    const taught = await prisma.timetableSlot.findMany({ where: { branchId: 'sainik01', teacherId: teacherStaff }, select: { classId: true }, distinct: ['classId'] });
    const own = await prisma.class.findMany({ where: { branchId: 'sainik01', classTeacherId: teacherStaff }, select: { id: true } });
    const scope = new Set([...taught.map((t) => t.classId), ...own.map((c) => c.id)]);
    expect(scope.has('cls_10a')).toBe(true);
    // The seed timetable puts teacher@ in every class, so build one it has nothing to do with.
    const cls = await prisma.class.create({ data: { branchId: 'sainik01', name: 'E2E Notice', section: 'Z' } });
    expect(scope.has(cls.id)).toBe(false);
    const stu = await prisma.student.create({ data: { branchId: 'sainik01', admissionNo: 'E2E-NOTICE-1', fullName: 'Notice Outsider', classId: cls.id } });
    otherClass = cls.id;
    otherClassStudent = stu.id;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  const as = (who: string) => ({
    get: (u: string) => request(server).get(u).set('Authorization', `Bearer ${tok[who]}`),
    post: (u: string, b?: object) => request(server).post(u).set('Authorization', `Bearer ${tok[who]}`).send(b ?? {}),
    put: (u: string, b?: object) => request(server).put(u).set('Authorization', `Bearer ${tok[who]}`).send(b ?? {}),
    del: (u: string) => request(server).delete(u).set('Authorization', `Bearer ${tok[who]}`),
    upload: (u: string, bytes: Buffer, name: string) =>
      request(server).post(u).set('Authorization', `Bearer ${tok[who]}`).attach('file', bytes, { filename: name, contentType: 'application/pdf' }),
  });

  // ─── Notices ─────────────────────────────────────────────────

  const ids: Record<string, string> = {};

  it('principal posts all-students, class 10A, class 10B and personal notices', async () => {
    const all = await as('principal').post('/api/notices', { title: 'E2E All', body: 'School closed Friday', audience: 'all_students', priority: 'important' });
    expect(all.status).toBe(201);
    ids.all = all.body.id;
    const a = await as('principal').post('/api/notices', { title: 'E2E 10A', body: 'Bring lab coats', audience: 'class', class_id: 'cls_10a' });
    expect(a.status).toBe(201);
    ids.c10a = a.body.id;
    const b = await as('principal').post('/api/notices', { title: 'E2E 10B', body: 'Trip forms due', audience: 'class', class_id: 'cls_10b' });
    expect(b.status).toBe(201);
    ids.c10b = b.body.id;
    const p = await as('os').post('/api/notices', { title: 'E2E Personal 004', body: 'See the office', audience: 'student', student_id: 'stu_004' });
    expect(p.status).toBe(201);
    ids.p004 = p.body.id;
    const past = await as('principal').post('/api/notices', { title: 'E2E Past', body: 'x', audience: 'all_students', expires_at: '2020-01-01' });
    expect(past.status).toBe(400);
  });

  it('validates audience fields', async () => {
    expect((await as('principal').post('/api/notices', { title: 'x', body: 'y', audience: 'class' })).status).toBe(400);
    expect((await as('principal').post('/api/notices', { title: 'x', body: 'y', audience: 'everyone' })).status).toBe(400);
    expect((await as('principal').post('/api/notices', { title: '', body: 'y', audience: 'all_students' })).status).toBe(400);
  });

  it('student sees all-students + own class + own, not another class or another child', async () => {
    const r = await as('student').get('/api/notices/mine');
    expect(r.status).toBe(200);
    const titles = r.body.map((n: any) => n.title);
    expect(titles).toEqual(expect.arrayContaining(['E2E All', 'E2E 10A']));
    expect(titles).not.toContain('E2E 10B');
    expect(titles).not.toContain('E2E Personal 004');
    expect(r.body.every((n: any) => n.read === false)).toBe(true);
    // newest first
    const times = r.body.map((n: any) => new Date(n.created_at).getTime());
    expect([...times].sort((x, y) => y - x)).toEqual(times);
  });

  it('student gets a personal notice', async () => {
    const r = await as('principal').post('/api/notices', { title: 'E2E Personal 001', body: 'Well done', audience: 'student', student_id: 'stu_001' });
    expect(r.status).toBe(201);
    ids.p001 = r.body.id;
    const mine = await as('student').get('/api/notices/mine');
    const n = mine.body.find((x: any) => x.id === ids.p001);
    expect(n).toBeTruthy();
    expect(n.audience_label).toBe('Personal');
  });

  it('parent sees notices for each child, labelled per child', async () => {
    const r = await as('parent').get('/api/notices/mine');
    expect(r.status).toBe(200);
    const by = (id: string) => r.body.find((n: any) => n.id === id);
    expect(by(ids.all).children.map((c: any) => c.id).sort()).toEqual(['stu_001', 'stu_004']);
    expect(by(ids.c10a).children.map((c: any) => c.id)).toEqual(['stu_001']);
    expect(by(ids.c10b).children.map((c: any) => c.id)).toEqual(['stu_004']);
    expect(by(ids.p004).children.map((c: any) => c.name)).toEqual(['Vikram Malhotra']);
  });

  it('unread count + mark read are per user', async () => {
    const before = (await as('student').get('/api/notices/unread-count')).body.count;
    const parentBefore = (await as('parent').get('/api/notices/unread-count')).body.count;
    expect(before).toBeGreaterThanOrEqual(3);
    expect((await as('student').post(`/api/notices/${ids.all}/read`)).status).toBe(201);
    expect((await as('student').post(`/api/notices/${ids.all}/read`)).status).toBe(201); // idempotent
    expect((await as('student').get('/api/notices/unread-count')).body.count).toBe(before - 1);
    expect((await as('parent').get('/api/notices/unread-count')).body.count).toBe(parentBefore); // parent unaffected
    const mine = await as('student').get('/api/notices/mine');
    expect(mine.body.find((n: any) => n.id === ids.all).read).toBe(true);
    // a notice the student can't see can't be marked read
    expect((await as('student').post(`/api/notices/${ids.c10b}/read`)).status).toBe(404);
    // staff badge contract is always 0
    expect((await as('teacher').get('/api/notices/unread-count')).body).toEqual({ count: 0 });
  });

  it('staff list carries read counts; portal and warden cannot list or post', async () => {
    const list = await as('principal').get('/api/notices?audience=all_students');
    expect(list.status).toBe(200);
    const n = list.body.find((x: any) => x.id === ids.all);
    expect(n.read_count).toBe(1);
    expect(n.audience_size).toBeGreaterThan(1);
    expect(list.body.every((x: any) => x.audience === 'all_students')).toBe(true);
    const byClass = await as('principal').get('/api/notices?class_id=cls_10b');
    expect(byClass.body.map((x: any) => x.id)).toEqual([ids.c10b]);
    expect((await as('student').get('/api/notices')).status).toBe(403);
    expect((await as('parent').post('/api/notices', { title: 'x', body: 'y', audience: 'all_students' })).status).toBe(403);
    expect((await as('warden').post('/api/notices', { title: 'x', body: 'y', audience: 'all_students' })).status).toBe(403);
  });

  it('teacher can notify own class / own student, 403 for another class, all students or its student', async () => {
    const own = await as('teacher').post('/api/notices', { title: 'E2E Teacher 10A', body: 'Homework', audience: 'class', class_id: 'cls_10a' });
    expect(own.status).toBe(201);
    ids.t10a = own.body.id;
    expect((await as('teacher').post('/api/notices', { title: 'E2E T stu', body: 'Hi', audience: 'student', student_id: 'stu_001' })).status).toBe(201);
    expect((await as('teacher').post('/api/notices', { title: 'x', body: 'y', audience: 'class', class_id: otherClass })).status).toBe(403);
    expect((await as('teacher').post('/api/notices', { title: 'x', body: 'y', audience: 'student', student_id: otherClassStudent })).status).toBe(403);
    expect((await as('teacher').post('/api/notices', { title: 'x', body: 'y', audience: 'all_students' })).status).toBe(403);
    const targets = await as('teacher').get('/api/notices/targets');
    expect(targets.body.school_wide).toBe(false);
    expect(targets.body.classes.map((c: any) => c.id)).toContain('cls_10a');
    expect(targets.body.classes.map((c: any) => c.id)).not.toContain(otherClass);
    // teacher list: own + own classes only
    const tl = await as('teacher').get('/api/notices');
    expect(tl.body.map((x: any) => x.id)).toEqual(expect.arrayContaining([ids.t10a, ids.c10a]));
    const outside = await as('principal').post('/api/notices', { title: 'E2E Outside', body: 'x', audience: 'class', class_id: otherClass });
    expect(outside.status).toBe(201);
    expect((await as('teacher').get('/api/notices')).body.map((x: any) => x.id)).not.toContain(outside.body.id);
  });

  it('cross-school ids are 404 and other-school notices are invisible', async () => {
    expect((await as('principal').post('/api/notices', { title: 'x', body: 'y', audience: 'class', class_id: 'g2_cls_5a' })).status).toBe(404);
    expect((await as('principal').post('/api/notices', { title: 'x', body: 'y', audience: 'student', student_id: 'g2_stu_001' })).status).toBe(404);
    const g2 = await as('g2admin').post('/api/notices', { title: 'E2E Green', body: 'g2 only', audience: 'all_students' });
    expect(g2.status).toBe(201);
    expect((await as('student').get('/api/notices/mine')).body.map((n: any) => n.title)).not.toContain('E2E Green');
    expect((await as('principal').get('/api/notices')).body.map((n: any) => n.id)).not.toContain(g2.body.id);
    expect((await as('student').post(`/api/notices/${g2.body.id}/read`)).status).toBe(404);
    expect((await as('principal').del(`/api/notices/${g2.body.id}`)).status).toBe(404);
    expect((await as('g2admin').del(`/api/notices/${ids.all}`)).status).toBe(404);
  });

  it('also_send dispatches to students and linked parents with ref_type notice', async () => {
    const r = await as('principal').post('/api/notices', {
      title: 'E2E Mail 10B', body: 'Parent meeting', audience: 'class', class_id: 'cls_10b', also_send: 'email',
    });
    expect(r.status).toBe(201);
    expect(r.body.delivery.dispatched).toBeGreaterThan(0);
    const logs = await prisma.notificationLog.findMany({ where: { refType: 'notice', refId: r.body.id } });
    expect(logs.length).toBe(r.body.delivery.dispatched);
    expect(logs.map((l) => l.recipient)).toContain('parent@sainik01.edu'); // stu_004's linked parent
    expect(logs.every((l) => l.channel === 'email' && l.branchId === 'sainik01')).toBe(true);
    const sms = await as('principal').post('/api/notices', { title: 'E2E SMS', body: 'Hi', audience: 'student', student_id: 'stu_001', also_send: 'sms' });
    expect(sms.status).toBe(201);
    const smsLogs = await prisma.notificationLog.findMany({ where: { refType: 'notice', refId: sms.body.id } });
    expect(smsLogs.every((l) => l.channel === 'sms')).toBe(true);
    expect(smsLogs.length + sms.body.delivery.skipped).toBeGreaterThan(0);
    // none → nothing logged
    const none = await as('principal').post('/api/notices', { title: 'E2E none', body: 'x', audience: 'all_students', also_send: 'none' });
    expect(await prisma.notificationLog.count({ where: { refType: 'notice', refId: none.body.id } })).toBe(0);
  });

  it('expire hides a notice; only author or leadership may expire/delete', async () => {
    expect((await as('hod').post(`/api/notices/${ids.t10a}/expire`)).status).toBe(403); // HOD is not leadership nor author
    expect((await as('teacher').post(`/api/notices/${ids.t10a}/expire`)).status).toBe(201);
    expect((await as('student').get('/api/notices/mine')).body.map((n: any) => n.id)).not.toContain(ids.t10a);
    expect((await as('teacher').del(`/api/notices/${ids.c10a}`)).status).toBe(403);
    expect((await as('principal').del(`/api/notices/${ids.all}`)).status).toBe(200);
    expect(await prisma.noticeRead.count({ where: { noticeId: ids.all } })).toBe(0);
    expect((await as('student').get('/api/notices/mine')).body.map((n: any) => n.id)).not.toContain(ids.all);
  });

  // ─── Lesson-plan PDFs ────────────────────────────────────────

  const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('lesson plan body '.repeat(200)), Buffer.from('\n%%EOF\n')]);
  let planId = '';

  const fetchSigned = async (url: string) => {
    const r = await request(server).get(url).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    return r;
  };

  it('teacher creates a plan and attaches a PDF; anyone with plan access downloads the same bytes', async () => {
    const syl = await prisma.syllabus.findFirst({ where: { branchId: 'sainik01', classId: 'cls_10a' }, select: { id: true } });
    const created = await as('teacher').post('/api/academics/lesson-plans', { syllabus_id: syl!.id, topic: 'E2E PDF plan', date: '2026-11-02' });
    expect(created.status).toBe(201);
    planId = created.body.id;

    const up = await as('teacher').upload(`/api/academics/lesson-plans/${planId}/attachment`, PDF, 'chapter-1 notes.pdf');
    expect(up.status).toBe(201);
    expect(up.body.attachment_size).toBe(PDF.length);
    const row = await prisma.lessonPlan.findUnique({ where: { id: planId } });
    expect(row!.attachmentKey).toMatch(new RegExp(`^branches/sainik01/lesson-plans/${planId}/`));
    expect(row!.attachmentName).toBe('chapter-1 notes.pdf');

    for (const who of ['teacher', 'hod', 'principal']) {
      const link = await as(who).get(`/api/academics/lesson-plans/${planId}/attachment`);
      expect(link.status).toBe(200);
      expect(link.body.file_name).toBe('chapter-1 notes.pdf');
      const file = await fetchSigned(link.body.url);
      expect(file.status).toBe(200);
      expect(Buffer.compare(file.body as Buffer, PDF)).toBe(0);
    }
    // the plan list exposes the attachment metadata
    const list = await as('teacher').get('/api/academics/lesson-plans');
    expect(list.body.find((p: any) => p.id === planId).attachmentName).toBe('chapter-1 notes.pdf');
  });

  it('rejects non-PDF bytes and files over 10 MB with 400', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARAAI/wH+p6cSAAAAAElFTkSuQmCC', 'base64');
    expect((await as('teacher').upload(`/api/academics/lesson-plans/${planId}/attachment`, png, 'fake.pdf')).status).toBe(400);
    expect((await as('teacher').upload(`/api/academics/lesson-plans/${planId}/attachment`, Buffer.from('hello world'), 'x.pdf')).status).toBe(400);
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10 * 1024 * 1024 + 10, 0x20)]);
    expect((await as('teacher').upload(`/api/academics/lesson-plans/${planId}/attachment`, big, 'big.pdf')).status).toBe(400);
    expect((await as('teacher').post(`/api/academics/lesson-plans/${planId}/attachment`)).status).toBe(400); // no file
    // still the original
    expect((await prisma.lessonPlan.findUnique({ where: { id: planId } }))!.attachmentSize).toBe(PDF.length);
  });

  it('other teacher cannot replace or remove it (403); portal/warden cannot upload or read', async () => {
    expect((await as('teacher2').upload(`/api/academics/lesson-plans/${planId}/attachment`, PDF, 'mine.pdf')).status).toBe(403);
    expect((await as('teacher2').del(`/api/academics/lesson-plans/${planId}/attachment`)).status).toBe(403);
    expect((await as('student').upload(`/api/academics/lesson-plans/${planId}/attachment`, PDF, 's.pdf')).status).toBe(403);
    expect((await as('parent').upload(`/api/academics/lesson-plans/${planId}/attachment`, PDF, 'p.pdf')).status).toBe(403);
    expect((await as('student').get(`/api/academics/lesson-plans/${planId}/attachment`)).status).toBe(403);
    expect((await as('warden').get(`/api/academics/lesson-plans/${planId}/attachment`)).status).toBe(403);
    expect((await as('g2admin').get(`/api/academics/lesson-plans/${planId}/attachment`)).status).toBe(404);
  });

  it('owner replaces the PDF (old object removed), exports the plan PDF, then removes the attachment', async () => {
    const oldKey = (await prisma.lessonPlan.findUnique({ where: { id: planId } }))!.attachmentKey!;
    const v2 = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('version two'), Buffer.from('\n%%EOF\n')]);
    const up = await as('teacher').upload(`/api/academics/lesson-plans/${planId}/attachment`, v2, 'v2');
    expect(up.status).toBe(201);
    expect(up.body.attachment_name).toBe('v2.pdf');
    const link = await as('teacher').get(`/api/academics/lesson-plans/${planId}/attachment`);
    expect(Buffer.compare((await fetchSigned(link.body.url)).body as Buffer, v2)).toBe(0);
    const { StorageService } = await import('../src/storage/storage.service');
    expect(await app.get(StorageService).exists(oldKey)).toBe(false);

    const pdf = await as('hod').get(`/api/academics/lesson-plans/${planId}/plan.pdf`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const newKey = (await prisma.lessonPlan.findUnique({ where: { id: planId } }))!.attachmentKey!;
    expect((await as('teacher').del(`/api/academics/lesson-plans/${planId}/attachment`)).status).toBe(200);
    expect((await prisma.lessonPlan.findUnique({ where: { id: planId } }))!.attachmentKey).toBeNull();
    expect(await app.get(StorageService).exists(newKey)).toBe(false);
    expect((await as('teacher').get(`/api/academics/lesson-plans/${planId}/attachment`)).status).toBe(404);
  });
});
