import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
 * Central notification dispatcher.
 * Set NOTIFY_WEBHOOK_URL to point at a real gateway (MSG91/Twilio/SES wrapper, Zapier
 * bridge, in-house relay…). The payload POSTed is exactly the NotifyInput shape plus
 * branch id. Without the env var, messages are logged to the console and the log row
 * records status 'mocked' — callers and the audit trail never change.
 */
@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async notify(input: NotifyInput) {
    const webhook = process.env.NOTIFY_WEBHOOK_URL;
    let status = 'mocked';

    if (webhook) {
      try {
        const res = await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: input.channel,
            recipient: input.recipient,
            subject: input.subject ?? null,
            body: input.body,
            ref_type: input.ref_type ?? null,
            ref_id: input.ref_id ?? null,
            branch_id: input.branch_id,
          }),
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
