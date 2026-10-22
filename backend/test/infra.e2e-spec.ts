import { Controller, Get, INestApplication, Param, UseGuards, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import Redis from 'ioredis';
import { SMTPServer } from 'smtp-server';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthGuard } from '../src/auth/auth.guard';
import { AlertingService } from '../src/common/alerting';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { runWithContext } from '../src/common/request-context';
import { JobsService } from '../src/jobs/jobs.service';
import { AdmissionRemindersService } from '../src/admissions/admission-reminders.service';
import { NotificationRetryJob } from '../src/notifications/notification-retry.job';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TENANT_MODELS } from '../src/prisma/tenant-extension';
import { ReportCacheService } from '../src/reports/report-cache.service';

/**
 * Round-2 infrastructure: central tenant scoping, DB run-locks, notification drivers +
 * retries, Redis cache/throttle, error alerting. External services are real where
 * possible (in-process SMTP server, a real redis-server.exe) and local HTTP stubs that
 * assert the exact request shape where not (Twilio, MSG91, alert webhook).
 */
jest.setTimeout(180_000);

const REDIS_BIN =
  process.env.REDIS_SERVER_BIN ??
  'C:/Users/princ/AppData/Local/Temp/claude/C--jay-projj-genesiserp-master/068b4062-8495-4253-baf8-ec5c893d4f86/scratchpad/infra/redis/redis-server.exe';

/** Deliberately UNSCOPED queries behind AuthGuard: only the tenant extension can filter them. */
@Controller('infra-probe')
class ProbeController {
  constructor(private prisma: PrismaService) {}

  @Get('students')
  @UseGuards(AuthGuard)
  students() {
    return this.prisma.student.findMany({ select: { id: true, branchId: true } });
  }

  @Get('student/:id')
  @UseGuards(AuthGuard)
  student(@Param('id') id: string) {
    return this.prisma.student.findUnique({ where: { id }, select: { id: true } }).then((s) => s ?? { none: true });
  }

  @Get('boom/:kind')
  boom(@Param('kind') kind: string) {
    throw new Error(`probe failure ${kind}`);
  }
}

async function boot(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers: [ProbeController] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter(app.get(AlertingService)));
  await app.init();
  return app;
}

async function login(server: unknown, email: string, password: string): Promise<string> {
  const res = await request(server as never).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token;
}

type Hit = { method: string; url: string; headers: http.IncomingHttpHeaders; body: string };

/** Local HTTP stub: records every request, answers from a queue (last answer repeats). */
async function stub(answers: { status: number; body: unknown }[]) {
  const hits: Hit[] = [];
  const queue = [...answers];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      hits.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      const a = queue.length > 1 ? queue.shift()! : queue[0];
      res.writeHead(a.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(a.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as net.AddressInfo).port;
  return { hits, url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((r) => server.close(() => r())) };
}

async function freePort(): Promise<number> {
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));
  const port = (s.address() as net.AddressInfo).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Env vars a test sets; restored after each test so app instances stay independent. */
const ENV_KEYS = [
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM', 'TWILIO_WHATSAPP_FROM', 'TWILIO_API_BASE',
  'MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID', 'MSG91_SENDER_ID', 'MSG91_API_BASE', 'SMS_PROVIDER',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_SECURE',
  'NOTIFY_WEBHOOK_URL', 'NOTIFY_WEBHOOK_SECRET', 'ALERT_WEBHOOK_URL', 'REDIS_URL', 'GLOBAL_RATE_LIMIT',
];
const savedEnv: Record<string, string | undefined> = {};
beforeEach(() => ENV_KEYS.forEach((k) => (savedEnv[k] = process.env[k])));
afterEach(() => ENV_KEYS.forEach((k) => (savedEnv[k] === undefined ? delete process.env[k] : (process.env[k] = savedEnv[k]))));

describe('Infra (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaService;
  const tok: Record<string, string> = {};

  beforeAll(async () => {
    app = await boot();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    tok.sainik = await login(server, 'schooladmin@sainik01.edu', 'Demo@Admin1');
    tok.green = await login(server, 'admin@greenfield02.edu', 'Demo@Green1');
  });

  afterAll(async () => {
    await app.close();
  });

  // ── 1. central tenant layer ────────────────────────────────────────────────
  describe('tenant extension', () => {
    // PrismaPromises are lazy: the query (and the tenant hook) runs when awaited, so the
    // await must happen INSIDE the context — exactly as in a request handler.
    const inSainik = <T>(fn: () => Promise<T>) => runWithContext({ userId: 'u', role: 'branch_admin', branchId: 'sainik01' }, async () => await fn());

    it('derives the scoped model list from the DMMF (models without branchId are untouched)', () => {
      for (const m of ['Student', 'Class', 'Staff', 'FeeInvoice', 'NotificationLog', 'User', 'AuditLog']) expect(TENANT_MODELS.has(m)).toBe(true);
      for (const m of ['Room', 'HostelAllocation', 'Bed', 'SalaryStructure', 'JobRun', 'Branch']) expect(TENANT_MODELS.has(m)).toBe(false);
    });

    it('an unscoped findMany inside a school-A context returns only school A', async () => {
      const all = await prisma.student.findMany({ select: { branchId: true } }); // no context: everything
      expect(new Set(all.map((s) => s.branchId))).toEqual(new Set(['sainik01', 'greenfield02']));
      const scoped = await inSainik(() => prisma.student.findMany({ select: { branchId: true } }));
      expect(scoped.length).toBeGreaterThan(0);
      expect(scoped.every((s) => s.branchId === 'sainik01')).toBe(true);
      expect(scoped.length).toBe(all.filter((s) => s.branchId === 'sainik01').length);
      // count / aggregate / groupBy / findFirst are scoped too
      expect(await inSainik(() => prisma.student.count())).toBe(scoped.length);
      expect(await inSainik(() => prisma.student.findFirst({ where: { id: 'g2_stu_001' } }))).toBeNull();
      const groups = await inSainik(() => prisma.student.groupBy({ by: ['branchId'], _count: true }));
      expect(groups.map((g) => g.branchId)).toEqual(['sainik01']);
      // a caller-supplied foreign branch filter can't widen the scope
      expect(await inSainik(() => prisma.student.count({ where: { branchId: 'greenfield02' } }))).toBe(0);
    });

    it('findUnique of a school-B id returns null; OrThrow throws; school-A id still found', async () => {
      expect(await inSainik(() => prisma.student.findUnique({ where: { id: 'g2_stu_001' } }))).toBeNull();
      await expect(inSainik(() => prisma.student.findUniqueOrThrow({ where: { id: 'g2_stu_001' } }))).rejects.toThrow();
      expect((await inSainik(() => prisma.student.findUnique({ where: { id: 'stu_001' } })))?.id).toBe('stu_001');
      expect((await prisma.student.findUnique({ where: { id: 'g2_stu_001' } }))?.id).toBe('g2_stu_001'); // no context
    });

    it('create with a school-B branchId throws; a missing branchId is filled from the context', async () => {
      await expect(
        inSainik(() => prisma.auditLog.create({ data: { branchId: 'greenfield02', actorId: 'x', action: 'CREATE', entity: 'probe', entityId: 'p1' } })),
      ).rejects.toThrow(/Cross-school write refused/);
      await expect(
        inSainik(() => prisma.auditLog.createMany({ data: [{ branchId: 'greenfield02', actorId: 'x', action: 'CREATE', entity: 'probe', entityId: 'p2' }] })),
      ).rejects.toThrow(/Cross-school/);
      const filled = await inSainik(() =>
        prisma.auditLog.create({ data: { actorId: 'x', action: 'CREATE', entity: 'probe', entityId: 'p3' } as never }),
      );
      expect(filled.branchId).toBe('sainik01');
    });

    it('update/delete/upsert of a school-B row are refused; moving a row to school B is refused', async () => {
      const before = await prisma.student.findUnique({ where: { id: 'g2_stu_001' } });
      await expect(inSainik(() => prisma.student.update({ where: { id: 'g2_stu_001' }, data: { fullName: 'HACKED' } }))).rejects.toThrow();
      await expect(inSainik(() => prisma.student.delete({ where: { id: 'g2_stu_001' } }))).rejects.toThrow();
      expect((await inSainik(() => prisma.student.updateMany({ where: { id: 'g2_stu_001' }, data: { fullName: 'HACKED' } }))).count).toBe(0);
      expect((await inSainik(() => prisma.student.deleteMany({ where: { id: 'g2_stu_001' } }))).count).toBe(0);
      await expect(inSainik(() => prisma.student.update({ where: { id: 'stu_001' }, data: { branchId: 'greenfield02' } }))).rejects.toThrow(/Cross-school/);
      expect(await prisma.student.findUnique({ where: { id: 'g2_stu_001' } })).toEqual(before);
    });

    it('interactive and batch transactions inside a context are scoped; Room (no branchId) is not', async () => {
      const n = await inSainik(() => prisma.$transaction(async (tx) => tx.student.count()));
      expect(n).toBe(await prisma.student.count({ where: { branchId: 'sainik01' } }));
      const [a] = await inSainik(() => prisma.$transaction([prisma.student.count()]));
      expect(a).toBe(n);
      expect(await inSainik(() => prisma.room.count())).toBe(await prisma.room.count());
      // reviewed escape hatch
      expect(await inSainik(() => prisma.unscoped.student.count())).toBe(await prisma.student.count());
    });

    it('end to end: middleware + AuthGuard scope a deliberately unscoped endpoint per school', async () => {
      const s = await request(server).get('/api/infra-probe/students').set('Authorization', `Bearer ${tok.sainik}`);
      const g = await request(server).get('/api/infra-probe/students').set('Authorization', `Bearer ${tok.green}`);
      expect(s.status).toBe(200);
      expect(s.body.length).toBeGreaterThan(0);
      expect(s.body.every((r: { branchId: string }) => r.branchId === 'sainik01')).toBe(true);
      expect(g.body.length).toBeGreaterThan(0);
      expect(g.body.every((r: { branchId: string }) => r.branchId === 'greenfield02')).toBe(true);
      const foreign = await request(server).get('/api/infra-probe/student/g2_stu_001').set('Authorization', `Bearer ${tok.sainik}`);
      expect(foreign.body).toEqual({ none: true });
      // concurrent requests from both schools never bleed context into each other
      const mixed = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          request(server).get('/api/infra-probe/students').set('Authorization', `Bearer ${i % 2 ? tok.green : tok.sainik}`).then((r) => ({ i, r })),
        ),
      );
      for (const { i, r } of mixed) {
        const want = i % 2 ? 'greenfield02' : 'sainik01';
        expect(r.body.every((x: { branchId: string }) => x.branchId === want)).toBe(true);
      }
    });

    it('overhead (measured, reported)', async () => {
      // Interleaved rounds so drift (GC, disk cache) hits every variant equally; median per variant.
      const ROUNDS = 7;
      const PER = 300;
      const variants: Record<string, () => Promise<unknown>> = {
        findMany_raw: () => prisma.unscoped.student.findMany({ where: { branchId: 'sainik01' }, take: 20 }),
        findMany_ext_no_ctx: () => prisma.student.findMany({ where: { branchId: 'sainik01' }, take: 20 }),
        findMany_scoped: () => inSainik(() => prisma.student.findMany({ take: 20 })),
        findUnique_raw: () => prisma.unscoped.student.findUnique({ where: { id: 'stu_001' } }),
        findUnique_scoped: () => inSainik(() => prisma.student.findUnique({ where: { id: 'stu_001' } })),
        count_raw: () => prisma.unscoped.attendanceRecord.count({ where: { branchId: 'sainik01' } }),
        count_scoped: () => inSainik(() => prisma.attendanceRecord.count()),
      };
      const samples: Record<string, number[]> = Object.fromEntries(Object.keys(variants).map((k) => [k, []]));
      for (const fn of Object.values(variants)) for (let i = 0; i < 50; i++) await fn(); // warm-up
      for (let r = 0; r < ROUNDS; r++) {
        for (const [k, fn] of Object.entries(variants)) {
          const t = process.hrtime.bigint();
          for (let i = 0; i < PER; i++) await fn();
          samples[k].push(Number(process.hrtime.bigint() - t) / 1e3 / PER);
        }
      }
      const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
      const report: Record<string, number> = { ops_per_variant: ROUNDS * PER };
      for (const k of Object.keys(variants)) report[`${k}_us`] = Math.round(median(samples[k]));
      process.stdout.write(`TENANT_OVERHEAD ${JSON.stringify(report)}
`);
      if (process.env.TENANT_OVERHEAD_OUT) fs.writeFileSync(process.env.TENANT_OVERHEAD_OUT, JSON.stringify(report, null, 2));
      // sanity: scoped results really are scoped
      const rows = await inSainik(() => prisma.student.findMany({ take: 500 }));
      expect(rows.every((r) => r.branchId === 'sainik01')).toBe(true);
    });
  });

  // ── 2. jobs ────────────────────────────────────────────────────────────────
  describe('JobsService.runOnce', () => {
    it('two instances (separate DB connections) racing on the same key: fn runs exactly once', async () => {
      const other = new PrismaService();
      await other.$connect();
      try {
        const a = new JobsService(prisma);
        const b = new JobsService(other);
        expect(a.owner).not.toBe(b.owner);
        let runs = 0;
        const fn = async () => { runs += 1; await wait(100); return { ok: true }; };
        const results = await Promise.all([a.runOnce('race-test', 'k1', fn), b.runOnce('race-test', 'k1', fn), a.runOnce('race-test', 'k1', fn), b.runOnce('race-test', 'k1', fn)]);
        expect(runs).toBe(1);
        expect(results.filter((r) => r.ran)).toHaveLength(1);
        const row = await prisma.jobRun.findUnique({ where: { name_runKey: { name: 'race-test', runKey: 'k1' } } });
        expect(row?.status).toBe('done');
        // finished: later attempts skip
        expect(await b.runOnce('race-test', 'k1', fn)).toEqual({ ran: false, reason: 'already done' });
      } finally {
        await other.$disconnect();
      }
    });

    it('a crashed "running" row older than the lease is taken over; a fresh one is not', async () => {
      const jobs = app.get(JobsService);
      await prisma.jobRun.create({ data: { name: 'lease-test', runKey: 'old', owner: 'dead:1', status: 'running', startedAt: new Date(Date.now() - 60 * 60_000) } });
      await prisma.jobRun.create({ data: { name: 'lease-test', runKey: 'fresh', owner: 'alive:1', status: 'running' } });
      const old = await jobs.runOnce('lease-test', 'old', async () => 'recovered', { leaseMs: 60_000 });
      expect(old).toEqual({ ran: true, result: 'recovered' });
      const fresh = await jobs.runOnce('lease-test', 'fresh', async () => 'nope', { leaseMs: 60_000 });
      expect(fresh).toEqual({ ran: false, reason: 'held by alive:1' });
      const row = await prisma.jobRun.findUnique({ where: { name_runKey: { name: 'lease-test', runKey: 'old' } } });
      expect(row?.owner).toBe(jobs.owner);
      expect(row?.detail).toContain('recovered');
    });

    it('admission reminders cron runs once per school day across repeated firings', async () => {
      const reminders = app.get(AdmissionRemindersService);
      await reminders.daily();
      await reminders.daily();
      const rows = await prisma.jobRun.findMany({ where: { name: 'admission-reminders' } });
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('done');
      expect(rows[0].runKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  // ── 3. notification drivers + retry ────────────────────────────────────────
  describe('notification providers', () => {
    const notifications = () => app.get(NotificationsService);

    function twilioEnv(base: string) {
      process.env.TWILIO_ACCOUNT_SID = 'ACtest123';
      process.env.TWILIO_AUTH_TOKEN = 'tok_secret';
      process.env.TWILIO_FROM = '+15550001111';
      process.env.TWILIO_WHATSAPP_FROM = '+14155238886';
      process.env.TWILIO_API_BASE = base;
    }

    it('without config: honest "mocked", nothing sent', async () => {
      const log = await notifications().notify({ branch_id: 'sainik01', channel: 'sms', recipient: '9876543210', body: 'hello' });
      expect(log.status).toBe('mocked');
      expect(log.retryAfter).toBeNull();
    });

    it('Twilio SMS + WhatsApp: method, path, Basic auth and form body', async () => {
      const s = await stub([{ status: 201, body: { sid: 'SM123' } }]);
      try {
        twilioEnv(s.url);
        const sms = await notifications().notify({ branch_id: 'sainik01', channel: 'sms', recipient: '98765 43210', body: 'Fee due' });
        const wa = await notifications().notify({ branch_id: 'sainik01', channel: 'whatsapp', recipient: '+919876543210', body: 'Hi on WA' });
        expect(sms.status).toBe('sent');
        expect(wa.status).toBe('sent');
        expect(s.hits).toHaveLength(2);
        for (const h of s.hits) {
          expect(h.method).toBe('POST');
          expect(h.url).toBe('/2010-04-01/Accounts/ACtest123/Messages.json');
          expect(h.headers.authorization).toBe(`Basic ${Buffer.from('ACtest123:tok_secret').toString('base64')}`);
          expect(h.headers['content-type']).toContain('application/x-www-form-urlencoded');
        }
        const f1 = new URLSearchParams(s.hits[0].body);
        expect(Object.fromEntries(f1)).toEqual({ To: '+919876543210', From: '+15550001111', Body: 'Fee due' });
        const f2 = new URLSearchParams(s.hits[1].body);
        expect(Object.fromEntries(f2)).toEqual({ To: 'whatsapp:+919876543210', From: 'whatsapp:+14155238886', Body: 'Hi on WA' });
      } finally {
        await s.close();
      }
    });

    it('MSG91 flow API: path, authkey header and JSON body shape', async () => {
      const s = await stub([{ status: 200, body: { type: 'success', message: 'req-42' } }]);
      try {
        process.env.MSG91_AUTH_KEY = 'msg91-key';
        process.env.MSG91_TEMPLATE_ID = 'tmpl-1';
        process.env.MSG91_SENDER_ID = 'GENSIS';
        process.env.MSG91_API_BASE = s.url;
        const log = await notifications().notify({ branch_id: 'sainik01', channel: 'sms', recipient: '9876543210', body: 'Your ward was absent' });
        expect(log.status).toBe('sent');
        expect(s.hits).toHaveLength(1);
        const h = s.hits[0];
        expect(h.method).toBe('POST');
        expect(h.url).toBe('/api/v5/flow/');
        expect(h.headers.authkey).toBe('msg91-key');
        expect(JSON.parse(h.body)).toEqual({
          template_id: 'tmpl-1', short_url: '0', sender: 'GENSIS',
          recipients: [{ mobiles: '919876543210', message: 'Your ward was absent' }],
        });
      } finally {
        await s.close();
      }
    });

    it('SMTP (real in-process server, AUTH): mail arrives with recipient/subject and the secret; the LOG is masked', async () => {
      const received: { from?: string; to: string[]; raw: string; user?: string }[] = [];
      const smtp = new SMTPServer({
        disabledCommands: ['STARTTLS'],
        allowInsecureAuth: true,
        onAuth(auth, _session, cb) {
          if (auth.username === 'mailer' && auth.password === 'pw') return cb(null, { user: 'mailer' });
          return cb(new Error('bad credentials'));
        },
        onData(stream, session, cb) {
          let raw = '';
          stream.on('data', (c: Buffer) => (raw += c.toString()));
          stream.on('end', () => {
            received.push({ from: session.envelope.mailFrom ? session.envelope.mailFrom.address : undefined, to: session.envelope.rcptTo.map((r) => r.address), raw, user: session.user as string });
            cb();
          });
        },
      });
      const port = await freePort();
      await new Promise<void>((r) => smtp.listen(port, '127.0.0.1', () => r()));
      try {
        Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), SMTP_USER: 'mailer', SMTP_PASS: 'pw', SMTP_FROM: 'erp@school.test', SMTP_SECURE: 'false' });
        const log = await notifications().notify({
          branch_id: 'sainik01', channel: 'email', recipient: 'parent@family.test', subject: 'Gate pass OTP',
          body: 'Your OTP is 482913. Do not share it.', redact: ['482913'],
        });
        expect(log.status).toBe('sent');
        expect(received).toHaveLength(1);
        expect(received[0].to).toEqual(['parent@family.test']);
        expect(received[0].from).toBe('erp@school.test');
        expect(received[0].user).toBe('mailer');
        expect(received[0].raw).toMatch(/^Subject: Gate pass OTP/m);
        expect(received[0].raw).toContain('482913'); // delivered body has the real secret
        expect(log.body).not.toContain('482913'); // the log does not
        expect(log.body).toContain('••••••');
        const stored = await prisma.notificationLog.findUnique({ where: { id: log.id } });
        expect(stored?.body).not.toContain('482913');
      } finally {
        await new Promise<void>((r) => smtp.close(() => r()));
      }
    });

    it('failed send → retry job re-sends it after the backoff (stub fails, then succeeds)', async () => {
      const s = await stub([{ status: 503, body: { message: 'busy' } }, { status: 201, body: { sid: 'SM2' } }]);
      try {
        twilioEnv(s.url);
        const log = await notifications().notify({ branch_id: 'sainik01', channel: 'sms', recipient: '9876543210', body: 'Retry me' });
        expect(log.status).toBe('failed');
        expect(log.attempts).toBe(1);
        expect(log.lastError).toContain('HTTP 503');
        const delay = log.retryAfter!.getTime() - Date.now();
        expect(delay).toBeGreaterThan(50_000);
        expect(delay).toBeLessThanOrEqual(60_000);

        const job = app.get(NotificationRetryJob);
        const early = await job.tick(new Date()); // not due yet
        expect(early.ran && 'result' in early && early.result.due).toBe(0);
        expect(s.hits).toHaveLength(1);

        const later = new Date(Date.now() + 61_000);
        const out = await job.tick(later);
        expect(out.ran && 'result' in out && out.result.sent).toBe(1);
        expect(s.hits).toHaveLength(2);
        expect(new URLSearchParams(s.hits[1].body).get('Body')).toBe('Retry me');
        const row = await prisma.notificationLog.findUnique({ where: { id: log.id } });
        expect(row).toMatchObject({ status: 'sent', attempts: 2, retryAfter: null });
        // same minute again: the run-lock skips it
        const again = await job.tick(later);
        expect(again).toEqual({ ran: false, reason: 'already done' });
      } finally {
        await s.close();
      }
    });

    it('backoff 1m → 5m → 30m → 2h, gives up after 5 attempts; redacted messages are never retried', async () => {
      const s = await stub([{ status: 500, body: {} }]);
      try {
        twilioEnv(s.url);
        const svc = notifications();
        const log = await svc.notify({ branch_id: 'sainik01', channel: 'sms', recipient: '9876543210', body: 'Always fails' });
        const secret = await svc.notify({ branch_id: 'sainik01', channel: 'sms', recipient: '9876543210', body: 'OTP 771122', redact: ['771122'] });
        expect(secret.status).toBe('failed');
        expect(secret.retryAfter).toBeNull();
        expect(secret.lastError).toMatch(/^not retryable: contains secrets/);
        expect(secret.body).not.toContain('771122');

        let t = log.retryAfter!.getTime();
        const gaps: number[] = [];
        for (let attempt = 2; attempt <= 5; attempt++) {
          const now = new Date(t + 1);
          await svc.retryDue(now);
          const row = await prisma.notificationLog.findUniqueOrThrow({ where: { id: log.id } });
          expect(row.attempts).toBe(attempt);
          if (attempt < 5) {
            gaps.push(row.retryAfter!.getTime() - now.getTime());
            t = row.retryAfter!.getTime();
          } else {
            expect(row.retryAfter).toBeNull();
            expect(row.status).toBe('failed');
          }
        }
        expect(gaps).toEqual([5 * 60_000, 30 * 60_000, 2 * 60 * 60_000]);
        const sentBodies = s.hits.map((h) => new URLSearchParams(h.body).get('Body'));
        expect(sentBodies.filter((b) => b === 'Always fails')).toHaveLength(5);
        expect(sentBodies.filter((b) => b?.includes('OTP'))).toHaveLength(1); // the original attempt only
      } finally {
        await s.close();
      }
    });
  });

  // ── 5. alerting ────────────────────────────────────────────────────────────
  describe('error alerting', () => {
    it('repeated identical 500s hit the alert webhook exactly once; a different error alerts again', async () => {
      const s = await stub([{ status: 200, body: {} }]);
      try {
        process.env.ALERT_WEBHOOK_URL = `${s.url}/alert`;
        for (let i = 0; i < 4; i++) {
          const r = await request(server).get('/api/infra-probe/boom/same');
          expect(r.status).toBe(500);
          expect(r.body.message).toBe('Internal server error'); // nothing leaked to the client
        }
        await wait(300);
        expect(s.hits).toHaveLength(1);
        const alert = JSON.parse(s.hits[0].body);
        expect(alert).toMatchObject({ source: 'server', status: 500, method: 'GET', error: 'Error', message: 'probe failure same' });
        expect(s.hits[0].headers.authorization).toBeUndefined();

        await request(server).get('/api/infra-probe/boom/other');
        await wait(300);
        expect(s.hits).toHaveLength(2);
        // 4xx never alerts
        await request(server).get('/api/students').expect(401);
        await wait(100);
        expect(s.hits).toHaveLength(2);
      } finally {
        await s.close();
      }
    });

    it('POST /api/telemetry/client-error: public, validated, size-capped, alerts once per signature', async () => {
      const s = await stub([{ status: 200, body: {} }]);
      try {
        process.env.ALERT_WEBHOOK_URL = s.url;
        const ok = await request(server).post('/api/telemetry/client-error').send({ name: 'TypeError', message: 'x is undefined', url: '/students?token=abc', digest: 'd1' });
        expect(ok.status).toBe(202);
        await request(server).post('/api/telemetry/client-error').send({ name: 'TypeError', message: 'x is undefined', url: '/students' }).expect(202);
        await wait(300);
        expect(s.hits).toHaveLength(1);
        const alert = JSON.parse(s.hits[0].body);
        expect(alert).toMatchObject({ source: 'client', error: 'TypeError', path: '/students' });
        expect(s.hits[0].body).not.toContain('token=abc');
        expect((await request(server).post('/api/telemetry/client-error').send({ name: 'x' })).status).toBe(400);
        const big = await request(server).post('/api/telemetry/client-error').send({ message: 'm', stack: 'y'.repeat(7000), name: 'z'.repeat(100), padding: 'p'.repeat(20_000) });
        expect(big.status).toBe(413);
      } finally {
        await s.close();
      }
    });

    it('client-error endpoint is throttled', async () => {
      const limit = Number(process.env.CLIENT_ERROR_RATE_LIMIT ?? 20);
      const codes: number[] = [];
      for (let i = 0; i < limit + 3; i++) {
        codes.push((await request(server).post('/api/telemetry/client-error').send({ message: `t${i}` })).status);
      }
      expect(codes).toContain(429);
    });
  });
});

// ── 4. Redis (real redis-server) ─────────────────────────────────────────────
const describeRedis = fs.existsSync(REDIS_BIN) ? describe : describe.skip;
describeRedis('Redis-backed cache, throttle and health (real redis-server)', () => {
  let redisProc: ChildProcess;
  let redisUrl: string;
  const apps: INestApplication[] = [];

  beforeAll(async () => {
    const port = await freePort();
    redisProc = spawn(REDIS_BIN, ['--port', String(port), '--bind', '127.0.0.1', '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
    redisUrl = `redis://127.0.0.1:${port}`;
    const probe = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null });
    for (let i = 0; i < 50; i++) {
      try {
        await probe.connect();
        if ((await probe.ping()) === 'PONG') break;
      } catch {
        await wait(100);
      }
    }
    await probe.quit().catch(() => undefined);
  });

  afterAll(async () => {
    for (const a of apps) await a.close().catch(() => undefined);
    if (redisProc && redisProc.exitCode === null) redisProc.kill();
  });

  async function pair(rateLimit?: number) {
    process.env.REDIS_URL = redisUrl;
    if (rateLimit) process.env.GLOBAL_RATE_LIMIT = String(rateLimit);
    const a = await boot();
    const b = await boot();
    apps.push(a, b);
    return [a, b] as const;
  }

  it('report cache: MISS on instance A, HIT on instance B; per-branch invalidation is shared', async () => {
    const [a, b] = await pair();
    const tokS = await login(a.getHttpServer(), 'schooladmin@sainik01.edu', 'Demo@Admin1');
    const tokG = await login(a.getHttpServer(), 'admin@greenfield02.edu', 'Demo@Green1');
    expect(a.get(ReportCacheService).driver).toBe('redis');
    const get = (app: INestApplication, t: string) => request(app.getHttpServer()).get('/api/reports/dashboard').set('Authorization', `Bearer ${t}`);

    const r1 = await get(a, tokS);
    expect(r1.status).toBe(200);
    expect(r1.headers['x-cache']).toBe('MISS');
    const r2 = await get(b, tokS);
    expect(r2.headers['x-cache']).toBe('HIT');
    expect(r2.body).toEqual(r1.body);
    await get(a, tokG).expect('x-cache', 'MISS');
    await get(b, tokG).expect('x-cache', 'HIT');

    await a.get(ReportCacheService).invalidateBranch('sainik01');
    await get(b, tokS).expect('x-cache', 'MISS'); // instance B sees A's invalidation
    await get(b, tokG).expect('x-cache', 'HIT'); // the other school's entry survives
    await get(a, tokS).expect('x-cache', 'HIT');
  });

  it('rate limit is counted across two instances sharing Redis', async () => {
    const [a, b] = await pair(4);
    const hit = (app: INestApplication) => request(app.getHttpServer()).get('/api/auth/me').then((r) => r.status);
    const first = [await hit(a), await hit(b), await hit(a), await hit(b)];
    expect(first).toEqual([401, 401, 401, 401]); // 4 allowed in total, not 4 per instance
    expect(await hit(a)).toBe(429);
    expect(await hit(b)).toBe(429);
  });

  it('health reports redis ok, then down (503) when Redis stops', async () => {
    const a = apps[0];
    const ok = await request(a.getHttpServer()).get('/api/health');
    expect(ok.status).toBe(200);
    expect(ok.body.redis).toBe('ok');
    redisProc.kill();
    await wait(500);
    const down = await request(a.getHttpServer()).get('/api/health');
    expect(down.status).toBe(503);
    expect(JSON.stringify(down.body)).toContain('down');
  });
});
