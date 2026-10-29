import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { createHash } from 'crypto';
import { RedisService } from '../redis/redis.service';

/**
 * Error alerting for 5xx responses and client-side crashes.
 *
 *  - SENTRY_DSN set: the exception goes to Sentry (initSentry() in main.ts; no PII —
 *    auth headers, cookies and request bodies are stripped in beforeSend).
 *  - ALERT_WEBHOOK_URL set: a JSON POST (Slack/Teams/PagerDuty bridge, n8n…) — at most
 *    ONE per error signature per ALERT_DEDUP_MS (default 5 min). With REDIS_URL the
 *    de-dup is shared by all instances (SET NX PX), otherwise per instance.
 */

let sentry: typeof import('@sentry/node') | null = null;

const SENSITIVE_HEADERS = ['authorization', 'cookie', 'set-cookie', 'x-signature', 'x-razorpay-signature', 'x-api-key'];

/** Initialises Sentry when SENTRY_DSN is set. Loaded lazily: the SDK is heavy. */
export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sentry = require('@sentry/node') as typeof import('@sentry/node');
  sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE ?? process.env.APP_VERSION,
    // No sendDefaultPii in this SDK version: PII is off by default; beforeSend strips the rest.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    beforeSend(event) {
      if (event.request) {
        const headers = event.request.headers ?? {};
        for (const h of Object.keys(headers)) if (SENSITIVE_HEADERS.includes(h.toLowerCase())) delete headers[h];
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.query_string) event.request.query_string = '[stripped]';
      }
      if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
      return event;
    },
  });
  return true;
}

export type AlertInput = {
  source: 'server' | 'client';
  status?: number;
  method?: string;
  path?: string;
  name: string;
  message: string;
  requestId?: string;
};

/** Replace ids in a path so /students/abc-123 and /students/def-456 share a signature. */
export function normalisePath(path: string): string {
  return path
    .split('?')[0]
    .split('/')
    .map((seg) => (/\d/.test(seg) && seg.length > 3 ? ':id' : seg))
    .join('/');
}

@Injectable()
export class AlertingService {
  private readonly log = new Logger('Alerting');
  private readonly recent = new Map<string, number>();

  constructor(private redis: RedisService) {}

  get dedupMs(): number {
    const v = Number(process.env.ALERT_DEDUP_MS);
    return Number.isFinite(v) && v > 0 ? v : 5 * 60_000;
  }

  signature(a: AlertInput): string {
    const raw = [a.source, a.status ?? '', a.method ?? '', a.path ? normalisePath(a.path) : '', a.name, a.message.split('\n')[0].slice(0, 200)].join('|');
    return createHash('sha256').update(raw).digest('hex').slice(0, 24);
  }

  /** Server 5xx: Sentry (if configured) + de-duplicated webhook. Never throws. */
  async reportServerError(exception: unknown, a: Omit<AlertInput, 'source' | 'name' | 'message'>): Promise<boolean> {
    const err = exception instanceof Error ? exception : new Error(String(exception));
    if (sentry) {
      try {
        sentry.captureException(err, { tags: { path: a.path ? normalisePath(a.path) : undefined, request_id: a.requestId } });
      } catch { /* never let reporting break the response */ }
    }
    return this.alert({ ...a, source: 'server', name: err.name, message: err.message });
  }

  /** Client-side crash reported by the frontend error boundary. */
  async reportClientError(a: Omit<AlertInput, 'source'>): Promise<boolean> {
    if (sentry) {
      try {
        sentry.captureMessage(`[client] ${a.name}: ${a.message}`, { level: 'error', tags: { path: a.path ? normalisePath(a.path) : undefined } });
      } catch { /* ignore */ }
    }
    return this.alert({ ...a, source: 'client' });
  }

  /** Posts to ALERT_WEBHOOK_URL unless this signature alerted within the de-dup window. */
  async alert(a: AlertInput): Promise<boolean> {
    const url = process.env.ALERT_WEBHOOK_URL;
    if (!url) return false;
    const sig = this.signature(a);
    if (!(await this.firstInWindow(sig))) return false;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `[${process.env.NODE_ENV ?? 'dev'}] ${a.source} ${a.status ?? ''} ${a.method ?? ''} ${a.path ? normalisePath(a.path) : ''} — ${a.name}: ${a.message.slice(0, 300)}`.replace(/\s+/g, ' '),
          signature: sig,
          source: a.source,
          status: a.status ?? null,
          method: a.method ?? null,
          path: a.path ? normalisePath(a.path) : null,
          error: a.name,
          message: a.message.slice(0, 1000),
          request_id: a.requestId ?? null,
          environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
          release: process.env.SENTRY_RELEASE ?? process.env.APP_VERSION ?? null,
          at: new Date().toISOString(),
          dedup_window_ms: this.dedupMs,
        }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) this.log.warn(`alert webhook HTTP ${res.status}`);
      return res.ok;
    } catch (e) {
      this.log.warn(`alert webhook unreachable: ${(e as Error).message}`);
      return false;
    }
  }

  private async firstInWindow(sig: string): Promise<boolean> {
    const now = Date.now();
    if (this.redis.client) {
      try {
        const ok = await this.redis.client.set(`alert:${sig}`, '1', 'PX', this.dedupMs, 'NX');
        return ok === 'OK';
      } catch {
        /* fall back to local de-dup */
      }
    }
    const last = this.recent.get(sig);
    if (last !== undefined && now - last < this.dedupMs) return false;
    this.recent.set(sig, now);
    if (this.recent.size > 1000) for (const [k, t] of this.recent) if (now - t >= this.dedupMs) this.recent.delete(k);
    return true;
  }
}

@Global()
@Module({ providers: [AlertingService], exports: [AlertingService] })
export class AlertingModule {}
