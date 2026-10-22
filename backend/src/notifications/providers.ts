import * as crypto from 'crypto';
import type { Transporter } from 'nodemailer';

/**
 * Outbound delivery drivers. One driver is chosen per channel from env at send time
 * (so config changes need no code change and tests can point drivers at local stubs):
 *
 *   email     SMTP_HOST set ............................. smtp (nodemailer)
 *             else NOTIFY_WEBHOOK_URL ................... webhook
 *   sms       SMS_PROVIDER=msg91|twilio|webhook forces one, otherwise
 *             MSG91_AUTH_KEY + MSG91_TEMPLATE_ID ........ msg91
 *             TWILIO_ACCOUNT_SID + TWILIO_FROM .......... twilio
 *             else NOTIFY_WEBHOOK_URL ................... webhook
 *   whatsapp  TWILIO_ACCOUNT_SID + TWILIO_WHATSAPP_FROM . twilio (WhatsApp)
 *             else NOTIFY_WEBHOOK_URL ................... webhook
 *
 * No driver for a channel = the message is logged as `mocked` (dev behaviour, unchanged).
 * A driver throws DeliveryError on failure; `retryable: false` means retrying cannot help
 * (bad config, provider rejected the request with a 4xx other than 429).
 */

export type OutboundMessage = {
  channel: string;
  recipient: string;
  subject?: string | null;
  body: string;
  ref_type?: string | null;
  ref_id?: string | null;
  branch_id: string;
};

export type DeliveryResult = { provider: string; providerId?: string };

export type Provider = { name: string; send(msg: OutboundMessage): Promise<DeliveryResult> };

export class DeliveryError extends Error {
  constructor(message: string, readonly retryable = true) {
    super(message);
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Mostly-Indian numbers arrive as 10 digits; providers want E.164. */
export function toE164(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  if (trimmed.startsWith('+')) return `+${digits}`;
  const cc = (process.env.SMS_DEFAULT_COUNTRY_CODE ?? '91').replace(/[^\d]/g, '');
  if (digits.length === 10) return `+${cc}${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+${cc}${digits.slice(1)}`;
  return `+${digits}`;
}

async function httpFailure(provider: string, res: Response): Promise<never> {
  let text = '';
  try { text = (await res.text()).slice(0, 300); } catch { /* ignore */ }
  const retryable = res.status >= 500 || res.status === 429 || res.status === 408;
  throw new DeliveryError(`${provider} HTTP ${res.status}${text ? `: ${text}` : ''}`, retryable);
}

async function post(provider: string, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, method: 'POST', signal: AbortSignal.timeout(Number(process.env.NOTIFY_TIMEOUT_MS ?? 10_000)) });
  } catch (e) {
    throw new DeliveryError(`${provider} unreachable: ${(e as Error).message}`, true);
  }
}

// ── SSRF guard for the generic webhook (moved from notifications.service.ts) ──

/** Validates a destination URL against SSRF (blocks loopback, cloud metadata, private ranges in prod). */
export function isSafeOutboundUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') return false;
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') return false;
    if (process.env.NODE_ENV === 'production') {
      if (
        /^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
        hostname.endsWith('.local') || hostname.endsWith('.internal')
      ) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ── drivers ──────────────────────────────────────────────────────────────────

/** Generic signed JSON webhook (HMAC-SHA256 over the exact body, X-Genesis-Signature). */
const webhookDriver: Provider = {
  name: 'webhook',
  async send(msg) {
    const url = process.env.NOTIFY_WEBHOOK_URL as string;
    const secret = process.env.NOTIFY_WEBHOOK_SECRET;
    // An unsigned webhook would let anyone who learns the URL forge deliveries.
    if (!secret) throw new DeliveryError('not configured: NOTIFY_WEBHOOK_SECRET missing', false);
    if (!isSafeOutboundUrl(url)) throw new DeliveryError('not configured: NOTIFY_WEBHOOK_URL is not an allowed outbound URL', false);
    const timestamp = new Date().toISOString();
    const payload = JSON.stringify({
      channel: msg.channel, recipient: msg.recipient, subject: msg.subject ?? null, body: msg.body,
      ref_type: msg.ref_type ?? null, ref_id: msg.ref_id ?? null, branch_id: msg.branch_id, timestamp,
    });
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const res = await post('webhook', url, {
      headers: { 'Content-Type': 'application/json', 'X-Genesis-Signature': `sha256=${signature}`, 'X-Genesis-Timestamp': timestamp },
      body: payload,
    });
    if (!res.ok) await httpFailure('webhook', res);
    return { provider: 'webhook' };
  },
};

const transporters = new Map<string, Transporter>();
function smtpTransport(): Transporter {
  const cfg = {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    // true = implicit TLS (port 465). false = plain connect, upgraded with STARTTLS when offered.
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' } : undefined,
    connectionTimeout: Number(process.env.NOTIFY_TIMEOUT_MS ?? 10_000),
  };
  const key = JSON.stringify(cfg);
  let t = transporters.get(key);
  if (!t) {
    // Loaded lazily so environments without SMTP never pay for it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodemailer = require('nodemailer') as typeof import('nodemailer');
    t = nodemailer.createTransport(cfg);
    transporters.set(key, t);
  }
  return t;
}

const smtpDriver: Provider = {
  name: 'smtp',
  async send(msg) {
    const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;
    if (!from) throw new DeliveryError('not configured: SMTP_FROM missing', false);
    try {
      const info = await smtpTransport().sendMail({
        from, to: msg.recipient, subject: msg.subject ?? 'Notification', text: msg.body,
      });
      return { provider: 'smtp', providerId: info.messageId };
    } catch (e) {
      const err = e as Error & { responseCode?: number };
      // 5xx SMTP replies are permanent (bad mailbox, rejected sender); 4xx and network errors are transient.
      const permanent = typeof err.responseCode === 'number' && err.responseCode >= 500;
      throw new DeliveryError(`smtp: ${err.message}`, !permanent);
    }
  },
};

/** Twilio Programmable Messaging: POST /2010-04-01/Accounts/{SID}/Messages.json, Basic auth, form body. */
function twilioDriver(kind: 'sms' | 'whatsapp'): Provider {
  return {
    name: kind === 'sms' ? 'twilio' : 'twilio-whatsapp',
    async send(msg) {
      const sid = process.env.TWILIO_ACCOUNT_SID as string;
      const token = process.env.TWILIO_AUTH_TOKEN;
      if (!token) throw new DeliveryError('not configured: TWILIO_AUTH_TOKEN missing', false);
      const base = (process.env.TWILIO_API_BASE ?? 'https://api.twilio.com').replace(/\/$/, '');
      const prefix = kind === 'whatsapp' ? 'whatsapp:' : '';
      const fromRaw = (kind === 'whatsapp' ? process.env.TWILIO_WHATSAPP_FROM : process.env.TWILIO_FROM) as string;
      const from = fromRaw.startsWith('whatsapp:') || !prefix ? fromRaw : `${prefix}${fromRaw}`;
      const form = new URLSearchParams({ To: `${prefix}${toE164(msg.recipient)}`, From: from, Body: msg.body });
      const res = await post('twilio', `${base}/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });
      if (!res.ok) await httpFailure('twilio', res);
      const json = (await res.json().catch(() => ({}))) as { sid?: string };
      return { provider: this.name, providerId: json.sid };
    },
  };
}

/**
 * MSG91 Flow API (v5): POST https://control.msg91.com/api/v5/flow/ with header `authkey`
 * and JSON { template_id, short_url, [sender], recipients: [{ mobiles, <VAR>: value }] }.
 * Success is `{ "type": "success", "message": "<request id>" }`.
 *
 * HONEST CAVEAT: Indian DLT rules mean MSG91 only delivers text matching an approved
 * template; the free-form body is passed as ONE template variable whose name is
 * MSG91_BODY_VAR (default "message"). Create the template as `##message##` (or set
 * MSG91_BODY_VAR to your variable name). This was verified against a local stub of the
 * documented request shape, not against the live MSG91 service.
 */
const msg91Driver: Provider = {
  name: 'msg91',
  async send(msg) {
    const authKey = process.env.MSG91_AUTH_KEY as string;
    const templateId = process.env.MSG91_TEMPLATE_ID;
    if (!templateId) throw new DeliveryError('not configured: MSG91_TEMPLATE_ID missing', false);
    const base = (process.env.MSG91_API_BASE ?? 'https://control.msg91.com').replace(/\/$/, '');
    const bodyVar = process.env.MSG91_BODY_VAR ?? 'message';
    const payload: Record<string, unknown> = {
      template_id: templateId,
      short_url: '0',
      recipients: [{ mobiles: toE164(msg.recipient).slice(1), [bodyVar]: msg.body }],
    };
    if (process.env.MSG91_SENDER_ID) payload.sender = process.env.MSG91_SENDER_ID;
    const res = await post('msg91', `${base}/api/v5/flow/`, {
      headers: { authkey: authKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) await httpFailure('msg91', res);
    const json = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    // MSG91 answers HTTP 200 with type "error" for bad template/auth — not worth retrying.
    if (json.type !== 'success') throw new DeliveryError(`msg91 rejected: ${json.message ?? 'unknown error'}`, false);
    return { provider: 'msg91', providerId: json.message };
  },
};

/** The driver for a channel under the current env, or null (= mocked). */
export function resolveProvider(channel: string): Provider | null {
  const env = process.env;
  const webhook = env.NOTIFY_WEBHOOK_URL ? webhookDriver : null;
  if (channel === 'email') return env.SMTP_HOST ? smtpDriver : webhook;
  if (channel === 'sms') {
    const forced = env.SMS_PROVIDER?.toLowerCase();
    if (forced === 'msg91') return msg91Driver;
    if (forced === 'twilio') return twilioDriver('sms');
    if (forced === 'webhook') return webhook;
    if (env.MSG91_AUTH_KEY && env.MSG91_TEMPLATE_ID) return msg91Driver;
    if (env.TWILIO_ACCOUNT_SID && env.TWILIO_FROM) return twilioDriver('sms');
    return webhook;
  }
  if (channel === 'whatsapp') {
    if (env.TWILIO_ACCOUNT_SID && env.TWILIO_WHATSAPP_FROM) return twilioDriver('whatsapp');
    return webhook;
  }
  return null;
}

/** Backoff after the Nth failed attempt (1-based): 1m, 5m, 30m, 2h. Attempt 5 is final. */
export const RETRY_BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
export const MAX_ATTEMPTS = 5;
export const NOT_RETRYABLE_SECRETS = 'not retryable: contains secrets';
