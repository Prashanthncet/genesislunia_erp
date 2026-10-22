import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { hostname } from 'os';
import { PrismaService } from '../prisma/prisma.service';

export type RunOnceResult<T> =
  | { ran: true; result: T }
  | { ran: true; error: Error }
  | { ran: false; reason: string };

/** Default lease: a 'running' row older than this is treated as crashed and can be taken over. */
const DEFAULT_LEASE_MS = 15 * 60_000;

/** YYYY-MM-DD in the school's timezone (run key for daily jobs). */
export function schoolDateKey(d = new Date(), tz = process.env.TZ_SCHOOL ?? 'Asia/Kolkata'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** YYYY-MM-DDTHH:MM (UTC) — run key for per-minute jobs. */
export function minuteKey(d = new Date()): string {
  return d.toISOString().slice(0, 16);
}

/**
 * Distributed "run this once" lock backed by the JobRun table's UNIQUE(name, runKey).
 *
 * Every instance's cron fires; each tries to INSERT the (name, runKey) row. Exactly one
 * insert succeeds — the others get a unique violation and skip. The winner marks the row
 * done/failed when fn settles. If an instance crashes mid-run its row stays 'running';
 * once older than the lease another instance can take it over (compare-and-set on the
 * row's startedAt, so only one taker wins). A 'failed' row can also be retried.
 *
 * Works on any database Prisma supports (no Redis needed) — the DB is already shared.
 */
@Injectable()
export class JobsService {
  private readonly log = new Logger('Jobs');
  /** hostname:pid:random — unique per instance even when two apps share a process (tests). */
  readonly owner = `${hostname()}:${process.pid}:${randomBytes(3).toString('hex')}`;

  constructor(private prisma: PrismaService) {}

  async runOnce<T>(name: string, runKey: string, fn: () => Promise<T>, opts: { leaseMs?: number } = {}): Promise<RunOnceResult<T>> {
    const leaseMs = opts.leaseMs ?? DEFAULT_LEASE_MS;
    let id: string;
    try {
      const row = await this.prisma.jobRun.create({ data: { name, runKey, owner: this.owner, status: 'running' } });
      id = row.id;
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      const existing = await this.prisma.jobRun.findUnique({ where: { name_runKey: { name, runKey } } });
      if (!existing) return { ran: false, reason: 'lock row vanished' };
      const stale = existing.status === 'running' && Date.now() - existing.startedAt.getTime() > leaseMs;
      if (!stale && existing.status !== 'failed') {
        return { ran: false, reason: existing.status === 'done' ? 'already done' : `held by ${existing.owner}` };
      }
      const took = await this.prisma.jobRun.updateMany({
        where: { id: existing.id, status: existing.status, startedAt: existing.startedAt },
        data: { status: 'running', owner: this.owner, startedAt: new Date(), finishedAt: null, detail: `took over from ${existing.owner} (${existing.status})` },
      });
      if (took.count !== 1) return { ran: false, reason: 'lost takeover race' };
      this.log.warn(`${name}/${runKey}: took over ${existing.status} run of ${existing.owner}`);
      id = existing.id;
    }

    try {
      const result = await fn();
      await this.prisma.jobRun.update({
        where: { id },
        data: { status: 'done', finishedAt: new Date(), detail: summarize(result) },
      });
      return { ran: true, result };
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      this.log.error(`${name}/${runKey} failed: ${err.message}`);
      await this.prisma.jobRun
        .update({ where: { id }, data: { status: 'failed', finishedAt: new Date(), detail: err.message.slice(0, 500) } })
        .catch(() => undefined);
      return { ran: true, error: err };
    }
  }

  /** Drops finished lock rows older than `days` for one job (per-minute jobs write 1,440/day). */
  prune(name: string, days: number) {
    return this.prisma.jobRun.deleteMany({
      where: { name, status: { in: ['done', 'failed'] }, startedAt: { lt: new Date(Date.now() - days * 86_400_000) } },
    });
  }
}

function summarize(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  try {
    return JSON.stringify(v).slice(0, 500);
  } catch {
    return null;
  }
}

@Global()
@Module({ providers: [JobsService], exports: [JobsService] })
export class JobsModule {}
