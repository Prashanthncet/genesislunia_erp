import * as crypto from 'crypto';
import type { Transporter } from 'nodemailer';

/**
 * Outbound delivery drivers. One driver is chosen per channel from env at send time
 * (so config changes need no code change and tests can point drivers at local stubs):
 *
 *   email     SMTP_HOST set ............................. smtp (nodemailer)
 *             else NOTIFY_WEBHOOK_URL ................... webhook
 *   sms       SMS_PROVIDER=msg91|twilio|textbee|vonage|webhook forces one, otherwise
 *             MSG91_AUTH_KEY + MSG91_TEMPLATE_ID ........ msg91
 *             TWILIO_ACCOUNT_SID + TWILIO_FROM .......... twilio
 *             TEXTBEE_API_KEY ........................... textbee
 *             VONAGE_API_KEY + VONAGE_API_SECRET ........ vonage
 *             else NOTIFY_WEBHOOK_URL ................... webhook
 *   whatsapp  WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID . whatsapp (Meta Cloud API)
 *             WHATSAPP_GATEWAY_URL ...................... wppconnect (self-hosted)
 *             TWILIO_ACCOUNT_SID + TWILIO_WHATSAPP_FROM . twilio (WhatsApp)
 *             VONAGE_API_KEY + VONAGE_API_SECRET ........ vonage (Messages API, WhatsApp-capable number)
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

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Builds a responsive, institutional HTML email template for all outbound ERP emails
 * (Admissions invites, OTPs, Fee instalment reminders, Gate pass alerts, Leave updates, Broadcasts).
 */
export function buildEmailHtml(msg: OutboundMessage): string {
  const subject = escapeHtml(msg.subject ?? 'Institutional Notification');
  const rawBody = msg.body ?? '';
  const badgeLabel = escapeHtml((msg.ref_type ?? 'official_notice').replace(/_/g, ' ').toUpperCase());

  const urlMatch = rawBody.match(/https?:\/\/[^\s)>"]+/i);
  const actionUrl = urlMatch ? urlMatch[0].replace(/[.,;]+$/, '') : null;
  const actionLabel = actionUrl?.includes('admission-form')
    ? 'Complete Admission Form'
    : actionUrl?.includes('portal')
      ? 'Open Parent & Student Portal'
      : 'Open Official Link';

  const loginMatch = rawBody.match(/login\s*ID\s*[:=-]?\s*([A-Za-z0-9._-]+)/i);
  const passMatch = rawBody.match(/password\s*[:=-]?\s*([^\s,.)]+)/i);
  const otpMatch = rawBody.match(/\b(?:OTP|verification code|pass\s*code)\b[^0-9]*(\d{4,8})\b/i);

  const paragraphs = rawBody
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const safe = escapeHtml(line).replace(
        /(https?:\/\/[^\s&<]+)/gi,
        '<a href="$1" style="color:#1d4ed8;text-decoration:underline;font-weight:600;word-break:break-all;">$1</a>',
      );
      return `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#1e293b;">${safe}</p>`;
    })
    .join('');

  const credentialsBlock =
    loginMatch || passMatch || otpMatch
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#f8fafc;border:1px solid #cbd5e1;border-left:4px solid #1e3a8a;border-radius:10px;">
          <tr>
            <td style="padding:16px 20px;">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#475569;margin-bottom:8px;">
                ${otpMatch ? 'One-Time Verification Code' : 'Portal Access Credentials'}
              </div>
              ${
                otpMatch
                  ? `<div style="font-family:'Courier New',monospace;font-size:26px;font-weight:800;letter-spacing:0.18em;color:#0f172a;padding:6px 0;">${escapeHtml(otpMatch[1])}</div>`
                  : ''
              }
              ${
                loginMatch
                  ? `<div style="font-size:14px;color:#0f172a;margin:4px 0;"><strong>Login ID:</strong> <code style="font-family:'Courier New',monospace;background:#e2e8f0;padding:2px 8px;border-radius:4px;font-weight:700;">${escapeHtml(loginMatch[1])}</code></div>`
                  : ''
              }
              ${
                passMatch
                  ? `<div style="font-size:14px;color:#0f172a;margin:4px 0;"><strong>Temporary Password:</strong> <code style="font-family:'Courier New',monospace;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-weight:700;">${escapeHtml(passMatch[1])}</code></div>`
                  : ''
              }
            </td>
          </tr>
        </table>`
      : '';

  const ctaBlock = actionUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 18px 0;">
        <tr>
          <td align="center" bgcolor="#1e3a8a" style="border-radius:10px;">
            <a href="${escapeHtml(actionUrl)}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
              ${actionLabel} &rarr;
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 16px 0;font-size:12px;line-height:1.5;color:#64748b;">
        Or copy and paste this link into your browser:<br/>
        <a href="${escapeHtml(actionUrl)}" style="color:#1d4ed8;word-break:break-all;">${escapeHtml(actionUrl)}</a>
      </p>`
    : '';

  const refFooter = msg.ref_id
    ? `<span style="display:inline-block;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:3px 8px;font-family:'Courier New',monospace;font-size:11px;color:#475569;">Ref: ${escapeHtml(msg.ref_id.slice(0, 12))}</span>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 10px 25px -5px rgba(15,23,42,0.08);">
          <tr>
            <td style="height:6px;background:linear-gradient(90deg,#1e3a8a 0%,#2563eb 60%,#d97706 100%);font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="background-color:#0f172a;padding:24px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#93c5fd;margin-bottom:6px;">
                      Genesis Lumia ERP &bull; Institutional Desk
                    </div>
                    <h1 style="margin:0;font-size:20px;font-weight:800;line-height:1.3;color:#ffffff;">
                      ${subject}
                    </h1>
                  </td>
                  <td align="right" valign="top">
                    <span style="display:inline-block;background-color:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);color:#e0f2fe;font-size:10px;font-weight:700;letter-spacing:0.08em;padding:4px 10px;border-radius:999px;white-space:nowrap;">
                      ${badgeLabel}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              ${paragraphs}
              ${credentialsBlock}
              ${ctaBlock}
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 16px 0;" />
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:12px;color:#64748b;line-height:1.5;">
                    Need assistance? Contact the school administrative office or sign in to the Parent Portal.
                  </td>
                  <td align="right" valign="middle">
                    ${refFooter}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 28px;text-align:center;font-size:11px;color:#94a3b8;">
              This is an automated institutional communication from Genesis Lumia ERP. Please do not share one-time codes or temporary passwords with anyone.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const smtpDriver: Provider = {
  name: 'smtp',
  async send(msg) {
    const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;
    if (!from) throw new DeliveryError('not configured: SMTP_FROM missing', false);
    try {
      const info = await smtpTransport().sendMail({
        from, to: msg.recipient, subject: msg.subject ?? 'Notification', text: msg.body, html: buildEmailHtml(msg),
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
 * Vonage Messages API (v1): POST https://api.nexmo.com/v1.messages with Basic
 * auth (`api_key:api_secret`) and JSON { sender, recipient, type: "sms", message: { text } }.
 * Vonage also runs a WhatsApp product through the same Messages API, but that needs a
 * WhatsApp-enabled number + WABA and an MT1 endpoint; this driver covers SMS first.
 */
const vonageDriver: Provider = {
  name: 'vonage',
  async send(msg) {
    const apiKey = process.env.VONAGE_API_KEY as string;
    const apiSecret = process.env.VONAGE_API_SECRET;
    if (!apiKey || !apiSecret) throw new DeliveryError('not configured: VONAGE_API_KEY / VONAGE_API_SECRET missing', false);
    const base = (process.env.VONAGE_API_BASE ?? 'https://api.nexmo.com').replace(/\/$/, '');
    const from = process.env.VONAGE_NUMBER;
    if (!from) {
      // Without a sender number the driver cannot build a valid payload; the error is
      // non-retryable configuration, identical to the other provider missing-config errors.
      const agent = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : process.env.npm_config_user_agent ?? 'node';
      const acceptLanguage = agent.match(/(\([^)]+\))/)?.[1] ?? '*';
      throw new DeliveryError('not configured: VONAGE_NUMBER missing', false);
    }
    const isWA = msg.channel === 'whatsapp';
    const payload: Record<string, unknown> = {
      sender: from,
      recipient: isWA ? `whatsapp:${toE164(msg.recipient).slice(1)}` : toE164(msg.recipient),
      type: isWA ? 'whatsapp' : 'sms',
    };
    if (isWA) {
      // Vonage Messages API WhatsApp shape: message = { type: 'text', text { body } }.
      (payload as Record<string, unknown>).message = { type: 'text', text: { body: msg.body } };
    } else {
      payload.message = { text: msg.body };
    }
    const res = await post('vonage', `${base}/v1.messages`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) await httpFailure('vonage', res);
    const json = (await res.json().catch(() => ({}))) as { id?: string; message_uuid?: string };
    return { provider: 'vonage', providerId: json.id ?? json.message_uuid };
  },
};

/** MSG91 Flow API (v5): POST https://control.msg91.com/api/v5/flow/ with header `authkey` and JSON { template_id, short_url, [sender], recipients: [{ mobiles, <VAR>: value }] }. Success is `{ "type": "success", "message": "<request id>" }`. HONEST CAVEAT: Indian DLT rules mean MSG91 only delivers text matching an approved template; the free-form body is passed as ONE template variable whose name is MSG91_BODY_VAR (default "message"). Create the template as `##message##` (or set MSG91_BODY_VAR to your variable name). This was verified against a local stub of the documented request shape, not against the live MSG91 service. */
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

/** textbee (https://textbee.dev, MIT) — an open-source gateway that sends SMS through an Android phone and its own SIM: POST {base}/api/v1/gateway/send-sms with header `x-api-key` and JSON { recipients: [E.164], message, deviceId? }. It is the free option (no per-message fee, no rented number, no DLT paperwork for the volumes a school actually sends); the cost is that the phone must stay online and each message leaves from its SIM. A 200 means QUEUED TO THE PHONE, not delivered — the phone can still refuse (SMS permission switched off, no credit, no SIM). textbee reports exactly that in `data.warning`, and the message is then recorded as failed rather than "sent", so the log never claims a parent was texted when the phone never sent anything. */
const textbeeDriver: Provider = {
  name: 'textbee',
  async send(msg) {
    const apiKey = process.env.TEXTBEE_API_KEY as string;
    if (!apiKey) throw new DeliveryError('not configured: TEXTBEE_API_KEY missing', false);
    const base = (process.env.TEXTBEE_API_BASE ?? 'https://api.textbee.dev').replace(/\/$/, '');
    const payload: Record<string, unknown> = { recipients: [toE164(msg.recipient)], message: msg.body };
    if (process.env.TEXTBEE_DEVICE_ID) payload.deviceId = process.env.TEXTBEE_DEVICE_ID;
    const res = await post('textbee', `${base}/api/v1/gateway/send-sms`, {
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) await httpFailure('textbee', res);
    const json = (await res.json().catch(() => ({}))) as {
      data?: { success?: boolean; message?: string; smsBatchId?: string; warning?: { code?: string; message?: string } };
    };
    const data = json.data;
    if (data?.warning?.code) {
      // Queued but undeliverable (e.g. SMS_PERMISSION_MISSING): retrying cannot help either,
      // the phone has to be fixed.
      throw new DeliveryError(`textbee: ${data.warning.message ?? data.warning.code}`, false);
    }
    if (data && data.success === false) {
      throw new DeliveryError(`textbee rejected: ${data.message ?? 'unknown error'}`, false);
    }
    return { provider: 'textbee', providerId: data?.smsBatchId };
  },
};

/** Any self-hosted WhatsApp Web gateway that speaks the WPPConnect REST shape (WPPConnect Server, and most Baileys/wwebjs wrappers clone it): POST {base}/api/{session}/send-message with JSON { phone: <digits>, message } and, when WHATSAPP_GATEWAY_TOKEN is set, `Authorization: Bearer <token>`. This is the free/un-official route: it is a real WhatsApp account linked by QR code, not a business number, so WhatsApp can rate-limit or ban the linked account — use it for school alerts on a dedicated number, not on a personal one. Unlike the generic webhook, the URL is NOT run through the SSRF guard on purpose: the gateway is a service this deployment operates (usually http://localhost:21465), exactly like SMTP_HOST. */
const wppconnectDriver: Provider = {
  name: 'wppconnect',
  async send(msg) {
    const base = (process.env.WHATSAPP_GATEWAY_URL ?? '').replace(/\/$/, '');
    if (!base) throw new DeliveryError('not configured: WHATSAPP_GATEWAY_URL missing', false);
    const session = process.env.WHATSAPP_GATEWAY_SESSION ?? 'genesis';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.WHATSAPP_GATEWAY_TOKEN) headers.Authorization = `Bearer ${process.env.WHATSAPP_GATEWAY_TOKEN}`;
    const res = await post('wppconnect', `${base}/api/${encodeURIComponent(session)}/send-message`, {
      headers,
      body: JSON.stringify({ phone: toE164(msg.recipient).slice(1), message: msg.body }),
    });
    if (!res.ok) await httpFailure('wppconnect', res);
    const json = (await res.json().catch(() => ({}))) as { response?: string | { id?: string }; id?: string };
    const providerId = typeof json.response === 'string' ? json.response : (json.response?.id ?? json.id);
    return { provider: 'wppconnect', providerId };
  },
};

/** Meta WhatsApp Cloud API: POST {base}/{version}/{phone_number_id}/messages with `Authorization: Bearer <token>` and { messaging_product, to, type: "text", text: { body } }. Success is `{ messages: [{ id }] }`; failures come back as an HTTP error body. HONEST CAVEAT: WhatsApp only accepts a free-form text message inside the 24-hour customer-service window (i.e. after the parent messaged the school number). Outside it Meta rejects the send and the notification is logged as failed; business-initiated messages need an approved message template, which this driver does not send. */
const whatsappCloudDriver: Provider = {
  name: 'whatsapp-cloud',
  async send(msg) {
    const token = process.env.WHATSAPP_TOKEN as string;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) throw new DeliveryError('not configured: WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID missing', false);
    const base = (process.env.WHATSAPP_API_BASE ?? 'https://graph.facebook.com').replace(/\/$/, '');
    const version = process.env.WHATSAPP_API_VERSION ?? 'v21.0';
    const res = await post('whatsapp-cloud', `${base}/${version}/${encodeURIComponent(phoneNumberId)}/messages`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toE164(msg.recipient).slice(1),
        type: 'text',
        text: { preview_url: false, body: msg.body },
      }),
    });
    if (!res.ok) await httpFailure('whatsapp-cloud', res);
    const json = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[] };
    return { provider: 'whatsapp-cloud', providerId: json.messages?.[0]?.id };
  },
};

/** The driver for a channel under the current env, or null (= mocked). */
export function resolveProvider(channel: string): Provider | null {
  const env = process.env;
  const webhook = env.NOTIFY_WEBHOOK_URL ? webhookDriver : null;
  if (channel === 'email') return env.SMTP_HOST ? smtpDriver : webhook;
  if (channel === 'sms') {
    const forced = env.SMS_PROVIDER?.toLowerCase?.();
    if (forced === 'msg91') return msg91Driver;
    if (forced === 'twilio') return twilioDriver('sms');
    if (forced === 'textbee') return textbeeDriver;
    if (forced === 'vonage') return vonageDriver;
    if (forced === 'webhook') return webhook;
    if (env.MSG91_AUTH_KEY && env.MSG91_TEMPLATE_ID) return msg91Driver;
    if (env.TWILIO_ACCOUNT_SID && env.TWILIO_FROM) return twilioDriver('sms');
    if (env.TEXTBEE_API_KEY) return textbeeDriver;
    if (env.VONAGE_API_KEY && env.VONAGE_API_SECRET) return vonageDriver;
    return webhook;
  }
  if (channel === 'whatsapp') {
    const forced = env.WHATSAPP_PROVIDER?.toLowerCase?.();
    if (forced === 'cloud') return whatsappCloudDriver;
    if (forced === 'wppconnect' || forced === 'gateway') return wppconnectDriver;
    if (forced === 'twilio') return twilioDriver('whatsapp');
    if (forced === 'vonage') return vonageDriver;
    if (forced === 'webhook') return webhook;
    if (env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) return whatsappCloudDriver;
    if (env.WHATSAPP_GATEWAY_URL) return wppconnectDriver;
    if (env.TWILIO_ACCOUNT_SID && env.TWILIO_WHATSAPP_FROM) return twilioDriver('whatsapp');
    if (env.VONAGE_API_KEY && env.VONAGE_API_SECRET) return vonageDriver;
    return webhook;
  }
  return null;
}

/** Backoff after the Nth failed attempt (1-based): 1m, 5m, 30m, 2h. Attempt 5 is final. */
export const RETRY_BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
export const MAX_ATTEMPTS = 5;
export const NOT_RETRYABLE_SECRETS = 'not retryable: contains secrets';
