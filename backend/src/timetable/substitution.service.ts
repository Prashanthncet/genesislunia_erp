import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { assertInBranch } from '../common/access';
import { classLabel, dayOfWeek } from './timetable.util';

/** One teacher's suitability to cover `period` on `date`. */
export type CoverCandidate = {
  id: string;
  name: string;
  max_periods: number;
  /** Regular lessons that weekday + covers already assigned that date. */
  load: number;
  over_limit: boolean;
  /** No hard conflict (double booking, leave, invigilation, inactive). */
  available: boolean;
  conflicts: string[];
};

/**
 * Substitution engine shared by manual assignment, auto-assignment, the request flow
 * and "mark teacher absent". A teacher is double-booked when, for that date+period,
 * they have a regular lesson, already cover another class (status Assigned), are on
 * APPROVED leave, or invigilate an exam. Requested/Cancelled rows never count as busy.
 */
@Injectable()
export class SubstitutionService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  async evaluate(
    branchId: string,
    date: string,
    periodNumber: number,
    opts: { staffIds?: string[]; exclude?: string[]; excludeSubId?: string } = {},
  ): Promise<CoverCandidate[]> {
    const dow = dayOfWeek(date);
    const staff = await this.prisma.staff.findMany({
      where: opts.staffIds ? { branchId, id: { in: opts.staffIds } } : { branchId, role: 'Teacher', isActive: true },
      select: { id: true, name: true, maxPeriodsPerDay: true, isActive: true },
      orderBy: { name: 'asc' },
    });
    const ids = staff.map((s) => s.id);
    if (ids.length === 0) return [];

    const [slots, covers, leaves, exams] = await Promise.all([
      this.prisma.timetableSlot.findMany({
        where: { branchId, dayOfWeek: dow, teacherId: { in: ids } },
        select: { teacherId: true, periodNumber: true, class: { select: { name: true, section: true } } },
      }),
      this.prisma.substitution.findMany({
        where: {
          branchId, date, status: 'Assigned', substituteTeacherId: { in: ids },
          ...(opts.excludeSubId ? { id: { not: opts.excludeSubId } } : {}),
        },
        select: { substituteTeacherId: true, periodNumber: true, class: { select: { name: true, section: true } } },
      }),
      this.prisma.staffLeave.findMany({
        where: { branchId, staffId: { in: ids }, status: 'Approved', startDate: { lte: date }, endDate: { gte: date } },
        select: { staffId: true, leaveType: true, startDate: true, endDate: true },
      }),
      this.prisma.examSchedule.findMany({
        where: { branchId, date, periodNumber, invigilatorId: { in: ids } },
        select: { invigilatorId: true, subject: true },
      }),
    ]);

    const exclude = new Set(opts.exclude ?? []);
    const list = staff.map((s) => {
      const conflicts: string[] = [];
      if (exclude.has(s.id)) conflicts.push('Is the teacher being covered');
      if (!s.isActive) conflicts.push('Inactive');
      const mySlots = slots.filter((x) => x.teacherId === s.id);
      const myCovers = covers.filter((x) => x.substituteTeacherId === s.id);
      const lesson = mySlots.find((x) => x.periodNumber === periodNumber);
      if (lesson) conflicts.push(`Teaches ${classLabel(lesson.class)} in period ${periodNumber} (regular timetable)`);
      const cover = myCovers.find((x) => x.periodNumber === periodNumber);
      if (cover) conflicts.push(`Already covering ${classLabel(cover.class)} in period ${periodNumber} on ${date}`);
      const leave = leaves.find((l) => l.staffId === s.id);
      if (leave) conflicts.push(`On approved ${leave.leaveType} leave (${leave.startDate} to ${leave.endDate})`);
      const exam = exams.find((e) => e.invigilatorId === s.id);
      if (exam) conflicts.push(`Invigilating ${exam.subject} exam in period ${periodNumber}`);
      const load = mySlots.length + myCovers.length;
      return {
        id: s.id, name: s.name, max_periods: s.maxPeriodsPerDay, load,
        over_limit: load >= s.maxPeriodsPerDay, available: conflicts.length === 0, conflicts,
      };
    });

    return list.sort(
      (a, b) =>
        Number(b.available) - Number(a.available) ||
        Number(a.over_limit) - Number(b.over_limit) ||
        a.load - b.load ||
        a.name.localeCompare(b.name),
    );
  }

  /**
   * Assigns cover for one class period and notifies. With `substituteTeacherId` the
   * pick is validated (409 with the reasons on any conflict); without it, the
   * least-loaded free teacher under their daily limit is chosen.
   */
  async assignCover(args: {
    branchId: string;
    createdBy: string;
    date: string;
    classId: string;
    periodNumber: number;
    originalTeacherId?: string | null;
    substituteTeacherId?: string;
    reason?: string;
    subId?: string;
  }) {
    const { branchId, date, classId, periodNumber, substituteTeacherId } = args;
    const exclude = args.originalTeacherId ? [args.originalTeacherId] : [];

    let chosen: CoverCandidate | undefined;
    if (substituteTeacherId) {
      await assertInBranch(this.prisma, 'staff', substituteTeacherId, branchId);
      [chosen] = await this.evaluate(branchId, date, periodNumber, {
        staffIds: [substituteTeacherId], exclude, excludeSubId: args.subId,
      });
      if (!chosen) throw new NotFoundException('teacher not found');
      if (!chosen.available) throw new ConflictException(`${chosen.name} cannot cover: ${chosen.conflicts.join('; ')}`);
    } else {
      const ranked = await this.evaluate(branchId, date, periodNumber, { exclude, excludeSubId: args.subId });
      chosen = ranked.find((c) => c.available && !c.over_limit);
      if (!chosen) throw new ConflictException('No available teacher found for this period.');
    }

    const saved = await this.prisma.substitution.upsert({
      where: { date_classId_periodNumber: { date, classId, periodNumber } },
      create: {
        branchId, date, classId, periodNumber,
        originalTeacherId: args.originalTeacherId ?? null,
        substituteTeacherId: chosen.id,
        reason: args.reason ?? 'Manual Substitution',
        status: 'Assigned',
        createdBy: args.createdBy,
      },
      update: {
        substituteTeacherId: chosen.id,
        status: 'Assigned',
        ...(args.originalTeacherId ? { originalTeacherId: args.originalTeacherId } : {}),
        ...(args.reason ? { reason: args.reason } : {}),
      },
    });

    const notifications = await this.notifyAssignment(saved.id);
    return {
      substitution_id: saved.id,
      assigned_to: { id: chosen.id, name: chosen.name },
      warnings: chosen.over_limit ? [`${chosen.name} is at/over their daily limit (${chosen.load}/${chosen.max_periods})`] : [],
      notifications,
    };
  }

  /**
   * Substitute teacher: e-mail through NotificationsService.
   * Affected class: ONE class-notice row in notification_logs (channel `notice`,
   * recipient `class:<id>`) rather than an SMS to every family — a change of teacher
   * for one period is a notice-board item, not something to text 40 parents about.
   * It is written straight to the log because it is not an outbound message, so it
   * must never go through the SMS/e-mail gateway.
   */
  async notifyAssignment(subId: string) {
    const sub = await this.prisma.substitution.findUnique({
      where: { id: subId },
      include: {
        class: { select: { name: true, section: true } },
        substitute: { select: { name: true, email: true } },
        original: { select: { name: true } },
      },
    });
    if (!sub) return { substitute_notified: false, class_notice: false };
    const cls = classLabel(sub.class);
    const lesson = await this.prisma.timetableSlot.findFirst({
      where: { branchId: sub.branchId, classId: sub.classId, dayOfWeek: dayOfWeek(sub.date), periodNumber: sub.periodNumber },
      select: { subject: true },
    });

    let substituteNotified = false;
    const email = sub.substitute.email;
    if (email && !email.endsWith('@placeholder.local')) {
      const log = await this.notifications.notify({
        branch_id: sub.branchId,
        channel: 'email',
        recipient: email,
        subject: `Cover assigned: ${cls}, period ${sub.periodNumber} on ${sub.date}`,
        body:
          `You have been assigned to cover ${cls}${lesson ? ` (${lesson.subject})` : ''} in period ${sub.periodNumber} on ${sub.date}` +
          `${sub.original ? `, in place of ${sub.original.name}` : ''}. Reason: ${sub.reason ?? 'not given'}.`,
        ref_type: 'substitution',
        ref_id: sub.id,
      });
      substituteNotified = log.status !== 'failed';
    }

    await this.prisma.notificationLog.create({
      data: {
        branchId: sub.branchId,
        channel: 'notice',
        recipient: `class:${sub.classId}`,
        subject: `${cls}: substitute teacher on ${sub.date}`,
        body:
          `Period ${sub.periodNumber}${lesson ? ` (${lesson.subject})` : ''} on ${sub.date} will be taken by ${sub.substitute.name}` +
          `${sub.original ? ` instead of ${sub.original.name}` : ''}.`,
        refType: 'substitution',
        refId: sub.id,
        status: 'posted',
      },
    });
    return { substitute_notified: substituteNotified, class_notice: true };
  }

  async notifyCancellation(subId: string) {
    const sub = await this.prisma.substitution.findUnique({
      where: { id: subId },
      include: { class: { select: { name: true, section: true } }, substitute: { select: { email: true } } },
    });
    const email = sub?.substitute.email;
    if (!sub || !email || email.endsWith('@placeholder.local')) return false;
    const log = await this.notifications.notify({
      branch_id: sub.branchId,
      channel: 'email',
      recipient: email,
      subject: `Cover cancelled: ${classLabel(sub.class)}, period ${sub.periodNumber} on ${sub.date}`,
      body: `Your cover of ${classLabel(sub.class)} in period ${sub.periodNumber} on ${sub.date} has been cancelled.`,
      ref_type: 'substitution',
      ref_id: sub.id,
    });
    return log.status !== 'failed';
  }
}
