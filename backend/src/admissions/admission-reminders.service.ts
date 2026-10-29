import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JobsService, schoolDateKey } from '../jobs/jobs.service';
import { AdmissionsService } from './admissions.service';

/**
 * Daily job (@nestjs/schedule cron, 09:00 school time): Day-7 and Day-13 reminders for
 * unsubmitted forms, and marks links past 15 days as "Link Expired".
 *
 * Every API instance's cron fires, but JobsService.runOnce takes a DB run-lock keyed on
 * the school-timezone date, so exactly one instance does the work per day (a crashed
 * run can be taken over after the lease). The compare-and-set updates inside
 * runReminders remain as a second guard against double-sends.
 */
@Injectable()
export class AdmissionRemindersService {
  private readonly log = new Logger('AdmissionReminders');

  constructor(private admissions: AdmissionsService, private jobs: JobsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { name: 'admission-reminders', timeZone: process.env.TZ_SCHOOL ?? 'Asia/Kolkata', disabled: process.env.NODE_ENV === 'test' })
  async daily() {
    const out = await this.jobs.runOnce('admission-reminders', schoolDateKey(), () => this.admissions.runReminders());
    if (!out.ran) this.log.log(`skipped: ${out.reason}`);
    else if ('error' in out) this.log.error(`reminder run failed: ${out.error.message}`);
    else {
      const r = out.result;
      this.log.log(`checked=${r.checked} day7=${r.reminded_day7} day13=${r.reminded_day13} expired=${r.expired}`);
    }
  }
}
