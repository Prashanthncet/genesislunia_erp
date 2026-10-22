import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import {
  DeliveryError, MAX_ATTEMPTS, NOT_RETRYABLE_SECRETS, OutboundMessage, RETRY_BACKOFF_MS, resolveProvider,
} from './providers';
import { textContains } from '../common/search';

export type NotifyInput = {
  branch_id: string;
  channel: 'email' | 'sms' | 'whatsapp';
  recipient: string;
  subject?: string;
  body: string;
  ref_type?: string;
  ref_id?: string;
  /**
   * Secrets inside `body` (passwords, OTPs). They are delivered to the provider but
   * masked in notification_logs, which every office role can read.
   */
  redact?: string[];
};

/** An outbound batch. `audience` decides which contact field is used per recipient. */
export type BroadcastInput = {
  branch_id: string;
  channel: 'email' | 'sms' | 'whatsapp';
  subject?: string;
  body: string;
  audience: 'all_students' | 'all_staff' | 'class' | 'custom';
  class_id?: string;
  /** Required when audience is `custom`; each entry is a raw email / phone number. */
  recipients?: string[];
};

export type BroadcastResult = {
  dispatched: number;
  sent: number;
  failed: number;
  /** Dev-mode: no gateway configured, the message was logged but not transmitted. */
  mocked: number;
  /** Contacts that could not be reached on the chosen channel (e.g. staff have no phone). */
  skipped: number;
};

export { isSafeOutboundUrl } from './providers';

/**
 * Verifies HMAC-SHA256 signature of incoming webhooks.
 */
export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expected = hmac.digest('hex');
  const cleanSig = signature.replace(/^sha256=/, '');
  try {
    return crypto.timingSafeEqual(Buffer.from(cleanSig, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

export function maskSecrets(body: string, secrets?: string[]): string {
  let out = body;
  for (const s of secrets ?? []) if (s) out = out.split(s).join('••••••');
  return out;
}

/**
 * Central notification dispatcher. Delivery goes through the driver chosen per channel
 * by env (providers.ts: SMTP, MSG91, Twilio SMS/WhatsApp, signed webhook). With no driver
 * configured the message is logged as `mocked` — never pretended sent.
 *
 * Every attempt is logged in notification_logs. A failed send records attempts,
 * lastError and retryAfter; NotificationRetryJob re-sends it with backoff (1m, 5m, 30m,
 * 2h). Messages carrying redacted secrets (OTPs, passwords) are NEVER retried: their
 * stored body is masked, so a retry would deliver "••••••" — they get retryAfter null and
 * lastError "not retryable: contains secrets".
 */
@Injectable()
export class NotificationsService implements OnApplicationBootstrap {
  private readonly log = new Logger('Notifications');

  constructor(private prisma: PrismaService) {}

  /** Production boot check: say loudly which channels will only be mocked. */
  onApplicationBootstrap() {
    if (process.env.NODE_ENV !== 'production') return;
    for (const ch of ['email', 'sms', 'whatsapp']) {
      if (!resolveProvider(ch)) this.log.warn(`No delivery provider configured for "${ch}" — messages on this channel are only logged (status "mocked").`);
    }
  }

  /** One delivery attempt through the configured driver. */
  async deliver(msg: OutboundMessage): Promise<
    | { status: 'sent' | 'mocked'; provider?: string }
    | { status: 'failed'; error: string; retryable: boolean }
  > {
    const provider = resolveProvider(msg.channel);
    if (!provider) return { status: 'mocked' };
    try {
      const r = await provider.send(msg);
      return { status: 'sent', provider: r.provider };
    } catch (e) {
      const retryable = e instanceof DeliveryError ? e.retryable : true;
      return { status: 'failed', error: (e as Error).message || String(e), retryable };
    }
  }

  async notify(input: NotifyInput) {
    const secrets = (input.redact ?? []).filter(Boolean);
    const hasSecrets = secrets.some((s) => input.body.includes(s) || (input.subject ?? '').includes(s));
    const outcome = await this.deliver({
      channel: input.channel, recipient: input.recipient, subject: input.subject ?? null, body: input.body,
      ref_type: input.ref_type ?? null, ref_id: input.ref_id ?? null, branch_id: input.branch_id,
    });

    let lastError: string | null = null;
    let retryAfter: Date | null = null;
    if (outcome.status === 'mocked') {
      console.log(`[MOCK ${input.channel.toUpperCase()}] → ${input.recipient}: ${maskSecrets(input.body, secrets).slice(0, 80)}`);
    } else if (outcome.status === 'failed') {
      const err = maskSecrets(outcome.error, secrets).slice(0, 500);
      if (hasSecrets) lastError = `${NOT_RETRYABLE_SECRETS} (${err})`;
      else if (!outcome.retryable) lastError = `not retryable: ${err}`;
      else {
        lastError = err;
        retryAfter = new Date(Date.now() + RETRY_BACKOFF_MS[0]);
      }
      this.log.warn(`${input.channel} to ${maskRecipient(input.recipient)} failed: ${lastError}`);
    }

    return this.prisma.notificationLog.create({
      data: {
        branchId: input.branch_id,
        channel: input.channel,
        recipient: input.recipient,
        subject: input.subject ? maskSecrets(input.subject, secrets) : null,
        body: maskSecrets(input.body, secrets),
        refType: input.ref_type ?? null,
        refId: input.ref_id ?? null,
        status: outcome.status,
        attempts: 1,
        lastError,
        retryAfter,
      },
    });
  }

  /**
   * Re-sends failed messages whose retryAfter has passed (called by NotificationRetryJob).
   * Each row is claimed with a compare-and-set on retryAfter first, so two overlapping
   * runs can never send the same row twice.
   */
  async retryDue(now = new Date(), limit = 50) {
    const due = await this.prisma.notificationLog.findMany({
      where: { status: 'failed', attempts: { lt: MAX_ATTEMPTS }, retryAfter: { not: null, lte: now } },
      orderBy: { retryAfter: 'asc' },
      take: limit,
    });
    const result = { due: due.length, sent: 0, failed: 0, gave_up: 0 };
    for (const row of due) {
      const claim = await this.prisma.notificationLog.updateMany({
        where: { id: row.id, status: 'failed', retryAfter: row.retryAfter },
        data: { retryAfter: new Date(now.getTime() + 10 * 60_000) }, // lease while sending
      });
      if (claim.count !== 1) continue;
      const outcome = await this.deliver({
        channel: row.channel, recipient: row.recipient, subject: row.subject, body: row.body,
        ref_type: row.refType, ref_id: row.refId, branch_id: row.branchId,
      });
      const attempts = row.attempts + 1;
      if (outcome.status !== 'failed') {
        await this.prisma.notificationLog.update({
          where: { id: row.id },
          data: { status: outcome.status, attempts, retryAfter: null },
        });
        result.sent += 1;
        continue;
      }
      const giveUp = !outcome.retryable || attempts >= MAX_ATTEMPTS;
      await this.prisma.notificationLog.update({
        where: { id: row.id },
        data: {
          attempts,
          lastError: (giveUp && !outcome.retryable ? `not retryable: ${outcome.error}` : outcome.error).slice(0, 500),
          retryAfter: giveUp ? null : new Date(now.getTime() + RETRY_BACKOFF_MS[Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1)]),
        },
      });
      if (giveUp) result.gave_up += 1;
      else result.failed += 1;
    }
    return result;
  }

  /**
   * Resolves an audience to concrete destinations for the chosen channel.
   * Returns the addresses plus a count of contacts that are unreachable on that
   * channel — reported honestly rather than silently dropped.
   */
  private async resolveRecipients(input: BroadcastInput) {
    const recipients = new Set<string>();
    let skipped = 0;
    const wantsEmail = input.channel === 'email';

    if (input.audience === 'custom') {
      for (const r of input.recipients ?? []) {
        const clean = r.trim();
        if (clean) recipients.add(clean);
      }
      return { recipients: Array.from(recipients), skipped };
    }

    if (input.audience === 'all_staff') {
      const staff = await this.prisma.staff.findMany({
        where: { branchId: input.branch_id, isActive: true },
        select: { email: true },
      });
      if (!wantsEmail) {
        // Staff records carry no phone number, so SMS/WhatsApp cannot reach them.
        return { recipients: [], skipped: staff.length };
      }
      for (const s of staff) {
        if (s.email) recipients.add(s.email);
        else skipped += 1;
      }
      return { recipients: Array.from(recipients), skipped };
    }

    const students = await this.prisma.student.findMany({
      where: {
        branchId: input.branch_id,
        status: 'Active',
        ...(input.audience === 'class' && input.class_id ? { classId: input.class_id } : {}),
      },
      select: { email: true, mobileNumber: true },
    });
    for (const s of students) {
      const contact = wantsEmail ? s.email : s.mobileNumber;
      if (contact) recipients.add(contact);
      else skipped += 1;
    }
    return { recipients: Array.from(recipients), skipped };
  }

  /**
   * Sends one message per resolved contact and logs each attempt, so the
   * notifications page always reflects real delivery outcomes.
   */
  async broadcast(input: BroadcastInput): Promise<BroadcastResult> {
    const { recipients, skipped } = await this.resolveRecipients(input);
    const result: BroadcastResult = { dispatched: 0, sent: 0, failed: 0, mocked: 0, skipped };

    for (const recipient of recipients) {
      const log = await this.notify({
        branch_id: input.branch_id,
        channel: input.channel,
        recipient,
        subject: input.subject,
        body: input.body,
        ref_type: 'broadcast',
      });
      result.dispatched += 1;
      if (log.status === 'sent') result.sent += 1;
      else if (log.status === 'failed') result.failed += 1;
      else result.mocked += 1;
    }

    return result;
  }

  async list(branchId: string, filters: ListFilters) {
    const rows = await this.prisma.notificationLog.findMany({
      where: {
        branchId,
        ...(filters.ref_type ? { refType: filters.ref_type } : {}),
        ...(filters.ref_id ? { refId: filters.ref_id } : {}),
        ...(filters.recipient ? { recipient: textContains(filters.recipient) } : {}),
        ...(filters.channel ? { channel: filters.channel } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.q ? { OR: [{ subject: textContains(filters.q) }, { body: textContains(filters.q) }, { recipient: textContains(filters.q) }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(500, Math.max(1, filters.take ?? 200)),
    });
    return rows.map(maskLog);
  }

  /**
   * Every message about a set of students: sent to their contact details (student
   * mobile/email, linked parent logins, the admission application's parent contact)
   * or referencing one of their records (student, admission, gate pass, leave, invoice,
   * payment). Backs both the staff "per-student history" view and the parent portal.
   */
  async forStudents(branchId: string, studentIds: string[], extraRecipients: string[] = []) {
    if (studentIds.length === 0 && extraRecipients.length === 0) return [];
    const students = await this.prisma.student.findMany({
      where: { branchId, id: { in: studentIds } },
      select: {
        id: true, email: true, mobileNumber: true, admissionId: true,
        parentLinks: { select: { user: { select: { email: true } } } },
        gatePasses: { select: { id: true } },
        studentLeaves: { select: { id: true } },
        feeInvoices: { select: { id: true, payments: { select: { id: true } } } },
      },
    });
    const admissions = await this.prisma.admission.findMany({
      where: {
        branchId,
        OR: [{ studentId: { in: studentIds } }, { id: { in: students.map((s) => s.admissionId).filter((x): x is string => !!x) } }],
      },
      select: { id: true, parentEmail: true, parentContact: true },
    });
    const recipients = new Set<string>(extraRecipients.filter(Boolean));
    const refIds = new Set<string>();
    for (const s of students) {
      refIds.add(s.id);
      if (s.email) recipients.add(s.email);
      if (s.mobileNumber) recipients.add(s.mobileNumber);
      s.parentLinks.forEach((l) => recipients.add(l.user.email));
      s.gatePasses.forEach((g) => refIds.add(g.id));
      s.studentLeaves.forEach((l) => refIds.add(l.id));
      s.feeInvoices.forEach((i) => { refIds.add(i.id); i.payments.forEach((p) => refIds.add(p.id)); });
    }
    for (const a of admissions) {
      refIds.add(a.id);
      if (a.parentEmail) recipients.add(a.parentEmail);
      if (a.parentContact) recipients.add(a.parentContact);
    }
    const rows = await this.prisma.notificationLog.findMany({
      where: {
        branchId,
        OR: [
          ...(recipients.size ? [{ recipient: { in: [...recipients] } }] : []),
          ...(refIds.size ? [{ refId: { in: [...refIds] } }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return rows.map(maskLog);
  }
}

export type ListFilters = {
  ref_type?: string; ref_id?: string; recipient?: string; channel?: string; status?: string; q?: string; take?: number;
};

/**
 * Read-time masking for rows logged before write-time redaction existed: OTPs and
 * passwords must never be served back, whoever is reading the log.
 */
export function maskLegacySecrets(text: string | null): string | null {
  if (text === null || text === undefined) return text;
  return text
    .replace(/(OTP\s*(?:is)?\s*[:=-]?\s*)\d{4,8}/gi, '$1••••••')
    .replace(/(Password\s*[:=]\s*)(?!••••••)\S+/gi, '$1••••••');
}

function maskLog<T extends { body: string; subject: string | null }>(row: T): T {
  return { ...row, body: maskLegacySecrets(row.body) as string, subject: maskLegacySecrets(row.subject) };
}

/** a***@x.com / ******1234 — enough to correlate in logs without printing contacts. */
function maskRecipient(r: string): string {
  if (r.includes('@')) return r.replace(/^(.).*(@.*)$/, '$1***$2');
  return r.length > 4 ? `${'*'.repeat(r.length - 4)}${r.slice(-4)}` : '****';
}
