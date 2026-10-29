import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JobsService, minuteKey } from '../jobs/jobs.service';
import { NotificationsService } from './notifications.service';

/**
 * Every minute: re-send failed notifications whose backoff has elapsed
 * (NotificationsService.retryDue — 1m, 5m, 30m, 2h, then give up after 5 attempts).
 * Guarded by a per-minute JobRun lock so only one API instance runs each tick.
 */
@Injectable()
export class NotificationRetryJob {
  private readonly log = new Logger('NotificationRetry');

  constructor(private jobs: JobsService, private notifications: NotificationsService) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'notification-retry', disabled: process.env.NODE_ENV === 'test' })
  async tick(now = new Date()) {
    const out = await this.jobs.runOnce('notification-retry', minuteKey(now), () => this.notifications.retryDue(now), { leaseMs: 5 * 60_000 });
    if (out.ran && 'result' in out && out.result.due > 0) {
      const r = out.result;
      this.log.log(`due=${r.due} sent=${r.sent} failed=${r.failed} gave_up=${r.gave_up}`);
    }
    // Once an hour, drop lock rows older than 2 days (this job writes one per minute).
    if (now.getUTCMinutes() === 0 && out.ran) await this.jobs.prune('notification-retry', 2).catch(() => undefined);
    return out;
  }
}
