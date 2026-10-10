import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

export type NotifyInput = {
  branch_id: string;
  channel: 'email' | 'sms' | 'whatsapp';
  recipient: string;
  subject?: string;
  body: string;
  ref_type?: string;
  ref_id?: string;
};

/**
 * Validates a destination URL against SSRF attacks (blocks loopback, cloud metadata, private RFC1918 IPs).
 */
export function isSafeOutboundUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    const hostname = parsed.hostname.toLowerCase();
    // Block loopback and local hostnames
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
      return false;
    }
    // Block AWS/GCP/Azure cloud metadata endpoint
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
      return false;
    }
    // Block private RFC1918 IP ranges in production
    if (process.env.NODE_ENV === 'production') {
      if (
        /^10\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal')
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

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

/**
 * Central notification dispatcher.
 * Set NOTIFY_WEBHOOK_URL to point at a real gateway (MSG91/Twilio/SES wrapper, Zapier
 * bridge, in-house relay…). The payload POSTed is signed with HMAC-SHA256 using NOTIFY_WEBHOOK_SECRET.
 */
@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async notify(input: NotifyInput) {
    const webhook = process.env.NOTIFY_WEBHOOK_URL;
    const webhookSecret = process.env.NOTIFY_WEBHOOK_SECRET || 'genesis-webhook-secret';
    let status = 'mocked';

    if (webhook && isSafeOutboundUrl(webhook)) {
      try {
        const payloadString = JSON.stringify({
          channel: input.channel,
          recipient: input.recipient,
          subject: input.subject ?? null,
          body: input.body,
          ref_type: input.ref_type ?? null,
          ref_id: input.ref_id ?? null,
          branch_id: input.branch_id,
          timestamp: new Date().toISOString(),
        });

        const signature = crypto
          .createHmac('sha256', webhookSecret)
          .update(payloadString)
          .digest('hex');

        const res = await fetch(webhook, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Genesis-Signature': `sha256=${signature}`,
            'X-Genesis-Timestamp': new Date().toISOString(),
          },
          body: payloadString,
        });
        status = res.ok ? 'sent' : 'failed';
      } catch {
        status = 'failed';
      }
    } else {
      console.log(`[MOCK ${input.channel.toUpperCase()}] → ${input.recipient}: ${input.body.slice(0, 80)}`);
    }

    return this.prisma.notificationLog.create({
      data: {
        branchId: input.branch_id,
        channel: input.channel,
        recipient: input.recipient,
        subject: input.subject ?? null,
        body: input.body,
        refType: input.ref_type ?? null,
        refId: input.ref_id ?? null,
        status,
      },
    });
  }

  async list(branchId: string, filters: { ref_type?: string; recipient?: string; channel?: string }) {
    return this.prisma.notificationLog.findMany({
      where: {
        branchId,
        ...(filters.ref_type ? { refType: filters.ref_type } : {}),
        ...(filters.recipient ? { recipient: { contains: filters.recipient } } : {}),
        ...(filters.channel ? { channel: filters.channel } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
