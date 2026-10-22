import {
  BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { R, ROLE } from '../auth/roles';
import { AuthUser, ReqWithUser, assertCanSeeStudent, assertInBranch, currentStaffId } from '../common/access';
import { NotificationsService } from '../notifications/notifications.service';
import { MarkClassAttendanceDto, NotifyAbsentDto } from './dto/attendance.dto';
import { retryOnUniqueRace } from '../common/retry';

/**
 * Who may READ class attendance. Teachers/HODs are further narrowed to the classes
 * they teach (see `classScope`); the other roles see the whole school.
 */
const ATTENDANCE_READ: string[] = [
  ...R.LEADERSHIP, ROLE.OFFICE_SUPERINTENDENT, ROLE.HOD, ROLE.TEACHER, ROLE.WARDEN, ROLE.DISCIPLINE_OFFICER,
];
/** Per-student calendar: staff readers plus the portal (own child / self only). */
const CALENDAR_READ: string[] = [...ATTENDANCE_READ, ROLE.PARENT, ROLE.STUDENT];
/** Roles limited to the classes they teach. Everyone else in ATTENDANCE_MARK is leadership. */
const CLASS_SCOPED: string[] = [ROLE.TEACHER, ROLE.HOD];

const MONTH = /^\d{4}-\d{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Present and Late both mean the student was in school. */
const ATTENDED = new Set(['Present', 'Late']);
const pct = (attended: number, marked: number) => (marked > 0 ? Math.round((attended / marked) * 1000) / 10 : null);

type AbsentRow = {
  id: string; date: string;
  student: { id: string; fullName: string; mobileNumber: string | null; email: string | null };
};

@Controller('attendance')
@UseGuards(AuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  // ─── Scope helpers ───────────────────────────────────────────

  /**
   * Classes a teacher/HOD may work with: classes they are the CLASS TEACHER of, every
   * class they have a timetable slot in, plus classes they are assigned to cover (on
   * `date`, if given). null = no limit (leadership and other whole-school readers).
   */
  private async classScope(user: AuthUser, date?: string): Promise<string[] | null> {
    if (!CLASS_SCOPED.includes(user.role)) return null;
    const staffId = await currentStaffId(this.prisma, user);
    if (!staffId) return [];
    const [own, slots, covers] = await Promise.all([
      this.prisma.class.findMany({ where: { branchId: user.branch_id, classTeacherId: staffId }, select: { id: true } }),
      this.prisma.timetableSlot.findMany({
        where: { branchId: user.branch_id, teacherId: staffId }, select: { classId: true }, distinct: ['classId'],
      }),
      this.prisma.substitution.findMany({
        where: { branchId: user.branch_id, substituteTeacherId: staffId, status: 'Assigned', ...(date ? { date } : {}) },
        select: { classId: true }, distinct: ['classId'],
      }),
    ]);
    return [...new Set([...own.map((c) => c.id), ...slots.map((s) => s.classId), ...covers.map((s) => s.classId)])];
  }

  private async assertClassAllowed(user: AuthUser, classId: string, date?: string) {
    await assertInBranch(this.prisma, 'class', classId, user.branch_id);
    const scope = await this.classScope(user, date);
    if (scope && !scope.includes(classId)) {
      throw new ForbiddenException('You can only work with attendance for classes you teach or are the class teacher of');
    }
  }

  // ─── Reads ───────────────────────────────────────────────────

  /**
   * Classes the caller can see in the attendance screens, with whether they may mark them.
   * The caller's own class-teacher classes come first (`is_class_teacher: true`).
   */
  @Get('my-classes')
  @Roles(...ATTENDANCE_READ)
  async myClasses(@Req() req: ReqWithUser) {
    const [scope, staffId] = await Promise.all([this.classScope(req.user), currentStaffId(this.prisma, req.user)]);
    const classes = await this.prisma.class.findMany({
      where: { branchId: req.user.branch_id, ...(scope ? { id: { in: scope } } : {}) },
      orderBy: [{ name: 'asc' }, { section: 'asc' }],
      select: {
        id: true, name: true, section: true, classTeacherId: true,
        classTeacher: { select: { id: true, name: true } },
        _count: { select: { students: { where: { status: 'Active' } } } },
      },
    });
    const canMark = (R.ATTENDANCE_MARK as string[]).includes(req.user.role);
    const mine = (c: { classTeacherId: string | null }) => !!staffId && c.classTeacherId === staffId;
    return classes
      .map(({ classTeacherId, ...c }) => ({ ...c, can_mark: canMark, is_class_teacher: mine({ classTeacherId }) }))
      .sort((a, b) => Number(b.is_class_teacher) - Number(a.is_class_teacher));
  }

  /** Monthly register: per-student × per-day matrix for a class in a given month. */
  @Get('register')
  @Roles(...ATTENDANCE_READ)
  async register(@Req() req: ReqWithUser, @Query('class_id') classId?: string, @Query('month') month?: string) {
    if (!classId || !month || !MONTH.test(month)) {
      throw new BadRequestException('class_id and month (YYYY-MM) are required');
    }
    await this.assertClassAllowed(req.user, classId);
    const { start, end } = monthRange(month);

    const students = await this.prisma.student.findMany({
      where: { branchId: req.user.branch_id, classId, status: 'Active' },
      orderBy: { rollNo: 'asc' },
      select: { id: true, fullName: true, rollNo: true },
    });
    const records = await this.prisma.attendanceRecord.findMany({
      where: { branchId: req.user.branch_id, classId, date: { gte: start, lte: end } },
      select: { studentId: true, date: true, status: true },
    });

    const byStudent = new Map<string, Record<string, string>>();
    const dates = new Set<string>();
    for (const r of records) {
      dates.add(r.date);
      const row = byStudent.get(r.studentId) ?? {};
      row[r.date] = r.status;
      byStudent.set(r.studentId, row);
    }

    return {
      month,
      class_id: classId,
      dates: Array.from(dates).sort(),
      students: students.map((s) => {
        const days = byStudent.get(s.id) ?? {};
        const values = Object.values(days);
        return { ...s, days, present: values.filter((v) => v === 'Present').length, marked: values.length };
      }),
    };
  }

  /** Per-day status for one student for a month, plus the month's attendance %. */
  @Get('student/:id/calendar')
  @Roles(...CALENDAR_READ)
  async calendar(@Req() req: ReqWithUser, @Param('id') studentId: string, @Query('month') monthQ?: string) {
    const month = monthQ ?? new Date().toISOString().slice(0, 7);
    if (!MONTH.test(month)) throw new BadRequestException('month must be YYYY-MM');
    await assertInBranch(this.prisma, 'student', studentId, req.user.branch_id);
    await assertCanSeeStudent(this.prisma, req.user, studentId);

    const student = await this.prisma.student.findFirst({
      where: { id: studentId, branchId: req.user.branch_id },
      select: { id: true, fullName: true, rollNo: true, admissionNo: true, classId: true, class: { select: { name: true, section: true } } },
    });
    if (!student) throw new NotFoundException('student not found');
    const scope = await this.classScope(req.user);
    if (scope && (!student.classId || !scope.includes(student.classId))) {
      throw new ForbiddenException('You can only view students in classes you teach');
    }

    const { start, end, days } = monthRange(month);
    const [records, overall] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: { branchId: req.user.branch_id, studentId, date: { gte: start, lte: end } },
        select: { date: true, status: true },
        orderBy: { date: 'asc' },
      }),
      this.prisma.attendanceRecord.groupBy({
        by: ['status'], where: { branchId: req.user.branch_id, studentId }, _count: { _all: true },
      }),
    ]);
    const byDate = new Map(records.map((r) => [r.date, r.status]));
    const count = (s: string) => records.filter((r) => r.status === s).length;
    const attended = records.filter((r) => ATTENDED.has(r.status)).length;
    const overallMarked = overall.reduce((s, g) => s + g._count._all, 0);
    const overallAttended = overall.filter((g) => ATTENDED.has(g.status)).reduce((s, g) => s + g._count._all, 0);

    return {
      student: {
        id: student.id, full_name: student.fullName, roll_no: student.rollNo, admission_no: student.admissionNo,
        class_id: student.classId, class_name: student.class ? `${student.class.name}${student.class.section ? ` ${student.class.section}` : ''}` : null,
      },
      month,
      days: Array.from({ length: days }, (_, i) => {
        const date = `${month}-${String(i + 1).padStart(2, '0')}`;
        return { date, status: byDate.get(date) ?? null };
      }),
      summary: {
        present: count('Present'), absent: count('Absent'), late: count('Late'), leave: count('Leave'),
        marked: records.length, percentage: pct(attended, records.length),
      },
      overall: { marked: overallMarked, percentage: pct(overallAttended, overallMarked) },
    };
  }

  /** Class-wise absentee list for one date. */
  @Get('absentees')
  @Roles(...ATTENDANCE_READ)
  async absentees(@Req() req: ReqWithUser, @Query('date') dateQ?: string, @Query('class_id') classId?: string) {
    const date = dateQ ?? new Date().toISOString().slice(0, 10);
    if (!ISO_DATE.test(date)) throw new BadRequestException('date must be YYYY-MM-DD');
    if (classId) await this.assertClassAllowed(req.user, classId);
    const scope = await this.classScope(req.user);
    const classFilter = classId ? { classId } : scope ? { classId: { in: scope } } : {};

    const [absent, marked] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: { branchId: req.user.branch_id, date, status: 'Absent', ...classFilter },
        include: {
          student: { select: { id: true, fullName: true, rollNo: true, admissionNo: true, mobileNumber: true } },
          class: { select: { id: true, name: true, section: true } },
        },
        orderBy: [{ classId: 'asc' }],
      }),
      this.prisma.attendanceRecord.groupBy({
        by: ['classId'], where: { branchId: req.user.branch_id, date, ...classFilter }, _count: { _all: true },
      }),
    ]);
    const markedBy = new Map(marked.map((m) => [m.classId, m._count._all]));

    const groups = new Map<string, {
      class_id: string; class_name: string; marked: number;
      absentees: Array<{ record_id: string; student_id: string; full_name: string; roll_no: string | null; admission_no: string; contact: string | null; notified: boolean }>;
    }>();
    for (const r of absent) {
      const g = groups.get(r.classId) ?? {
        class_id: r.classId,
        class_name: `${r.class.name}${r.class.section ? ` ${r.class.section}` : ''}`,
        marked: markedBy.get(r.classId) ?? 0,
        absentees: [],
      };
      g.absentees.push({
        record_id: r.id, student_id: r.student.id, full_name: r.student.fullName, roll_no: r.student.rollNo,
        admission_no: r.student.admissionNo, contact: r.student.mobileNumber, notified: r.notified === 1,
      });
      groups.set(r.classId, g);
    }
    const classes = [...groups.values()].sort((a, b) => a.class_name.localeCompare(b.class_name));
    classes.forEach((c) => c.absentees.sort((a, b) => (a.roll_no ?? '').localeCompare(b.roll_no ?? '')));
    return { date, total_absent: absent.length, classes };
  }

  /** Students whose attendance % over [from, to] is below `threshold`. */
  @Get('low')
  @Roles(...ATTENDANCE_READ)
  async low(
    @Req() req: ReqWithUser,
    @Query('threshold') thresholdQ?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('class_id') classId?: string,
  ) {
    const threshold = thresholdQ === undefined || thresholdQ === '' ? 75 : Number(thresholdQ);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      throw new BadRequestException('threshold must be a number between 0 and 100');
    }
    if ((from && !ISO_DATE.test(from)) || (to && !ISO_DATE.test(to))) {
      throw new BadRequestException('from/to must be YYYY-MM-DD');
    }
    if (classId) await this.assertClassAllowed(req.user, classId);
    const scope = await this.classScope(req.user);

    const where = {
      branchId: req.user.branch_id,
      ...(classId ? { classId } : scope ? { classId: { in: scope } } : {}),
      ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };
    const grouped = await this.prisma.attendanceRecord.groupBy({ by: ['studentId', 'status'], where, _count: { _all: true } });

    const tally = new Map<string, { marked: number; attended: number; absent: number }>();
    for (const g of grouped) {
      const t = tally.get(g.studentId) ?? { marked: 0, attended: 0, absent: 0 };
      t.marked += g._count._all;
      if (ATTENDED.has(g.status)) t.attended += g._count._all;
      if (g.status === 'Absent') t.absent += g._count._all;
      tally.set(g.studentId, t);
    }
    const below = [...tally.entries()]
      .map(([id, t]) => ({ id, ...t, percentage: pct(t.attended, t.marked) ?? 0 }))
      .filter((s) => s.percentage < threshold);

    const students = await this.prisma.student.findMany({
      where: { id: { in: below.map((b) => b.id) }, branchId: req.user.branch_id },
      select: { id: true, fullName: true, rollNo: true, admissionNo: true, classId: true, class: { select: { name: true, section: true } } },
    });
    const info = new Map(students.map((s) => [s.id, s]));
    return {
      threshold, from: from ?? null, to: to ?? null,
      students: below
        .filter((b) => info.has(b.id))
        .map((b) => {
          const s = info.get(b.id)!;
          return {
            student_id: b.id, full_name: s.fullName, roll_no: s.rollNo, admission_no: s.admissionNo,
            class_id: s.classId, class_name: s.class ? `${s.class.name}${s.class.section ? ` ${s.class.section}` : ''}` : null,
            marked: b.marked, attended: b.attended, absent: b.absent, percentage: b.percentage,
          };
        })
        .sort((a, b) => a.percentage - b.percentage),
    };
  }

  /** Records for one class on one date. */
  @Get()
  @Roles(...ATTENDANCE_READ)
  async get(@Req() req: ReqWithUser, @Query('class_id') classId?: string, @Query('date') date?: string) {
    if (!classId || !date) return [];
    await this.assertClassAllowed(req.user, classId, date);
    return this.prisma.attendanceRecord.findMany({
      where: { branchId: req.user.branch_id, classId, date },
      include: { student: { select: { fullName: true, admissionNo: true } } },
    });
  }

  // ─── Writes ──────────────────────────────────────────────────

  /**
   * Bulk roll call. Every student must belong to this class in the caller's school
   * (the upsert key is the global studentId+date, so an unchecked id would overwrite
   * another school's register). Parents are notified for every record that becomes
   * Absent; `notified` is set only for the notices that were actually dispatched.
   */
  @Post()
  @Roles(...R.ATTENDANCE_MARK)
  async mark(@Req() req: ReqWithUser, @Body() body: MarkClassAttendanceDto) {
    const { class_id, date, records } = body;
    const branchId = req.user.branch_id;
    await this.assertClassAllowed(req.user, class_id, date);

    const ids = [...new Set(records.map((r) => r.student_id))];
    if (ids.length !== records.length) throw new BadRequestException('Each student may appear only once');
    const found = await this.prisma.student.findMany({
      where: { id: { in: ids }, branchId, classId: class_id }, select: { id: true },
    });
    if (found.length !== ids.length) throw new NotFoundException('student not found in this class');

    const markedBy = (await currentStaffId(this.prisma, req.user)) ?? req.user.sub;
    const existing = await this.prisma.attendanceRecord.findMany({
      where: { studentId: { in: ids }, date }, select: { studentId: true, status: true, notified: true },
    });
    const prev = new Map(existing.map((e) => [e.studentId, e]));

    // Two people saving the same roll call at once both see "no record" and both insert;
    // the loser hits the (student, date) unique key. Retrying turns its insert into an
    // update of the row that now exists. (Prisma can't use a native atomic upsert here
    // because the tenant layer adds branchId to the unique where.)
    const saved = await retryOnUniqueRace(() => this.prisma.$transaction(
      records.map((r) => {
        const before = prev.get(r.student_id);
        // A record that stays Absent keeps its notified flag; anything else resets it,
        // so a later change back to Absent notifies the parent again.
        const notified = r.status === 'Absent' && before?.status === 'Absent' ? before.notified : 0;
        return this.prisma.attendanceRecord.upsert({
          where: { studentId_date: { studentId: r.student_id, date } },
          create: { branchId, studentId: r.student_id, classId: class_id, date, status: r.status, markedBy, notified: 0 },
          update: { classId: class_id, status: r.status, markedBy, notified },
        });
      }),
    ));

    const toNotify = saved.filter((s) => s.status === 'Absent' && s.notified === 0).map((s) => s.id);
    const result = await this.dispatchAbsenceNotices(branchId, toNotify);
    return { success: true, count: records.length, notified: result.notified, notify_skipped: result.skipped, notify_failed: result.failed };
  }

  /** Manual re-send for Absent records on a date that have not been notified yet. */
  @Post('notify-absent')
  @Roles(...R.ATTENDANCE_MARK)
  async notifyAbsent(@Req() req: ReqWithUser, @Body() body: NotifyAbsentDto) {
    const { date, class_id } = body;
    if (class_id) await this.assertClassAllowed(req.user, class_id, date);
    const scope = await this.classScope(req.user, undefined);
    const pending = await this.prisma.attendanceRecord.findMany({
      where: {
        branchId: req.user.branch_id, date, status: 'Absent', notified: 0,
        ...(class_id ? { classId: class_id } : scope ? { classId: { in: scope } } : {}),
      },
      select: { id: true },
    });
    return this.dispatchAbsenceNotices(req.user.branch_id, pending.map((p) => p.id));
  }

  /**
   * Sends one absence notice per record via the central NotificationsService:
   * SMS to the student's registered mobile, else e-mail to the student / a linked
   * parent login. Records with no reachable contact are counted as skipped and stay
   * notified=0 so the office can follow up.
   */
  private async dispatchAbsenceNotices(branchId: string, recordIds: string[]) {
    if (recordIds.length === 0) return { notified: 0, skipped: 0, failed: 0 };
    const rows: AbsentRow[] = await this.prisma.attendanceRecord.findMany({
      where: { id: { in: recordIds }, branchId },
      select: { id: true, date: true, student: { select: { id: true, fullName: true, mobileNumber: true, email: true } } },
    });
    const parentLinks = await this.prisma.parentStudent.findMany({
      where: { branchId, studentId: { in: rows.map((r) => r.student.id) } },
      select: { studentId: true, user: { select: { email: true, isActive: true } } },
    });
    const parentEmail = new Map<string, string>();
    for (const l of parentLinks) if (l.user.isActive && !parentEmail.has(l.studentId)) parentEmail.set(l.studentId, l.user.email);

    const sent: string[] = [];
    let skipped = 0;
    let failed = 0;
    for (const r of rows) {
      const mobile = r.student.mobileNumber?.trim();
      const email = r.student.email?.trim() || parentEmail.get(r.student.id);
      const channel: 'sms' | 'email' | null = mobile ? 'sms' : email ? 'email' : null;
      if (!channel) { skipped++; continue; }
      const log = await this.notifications.notify({
        branch_id: branchId,
        channel,
        recipient: channel === 'sms' ? mobile! : email!,
        subject: 'Absence notice',
        body: `${r.student.fullName} was marked ABSENT on ${r.date}. Please contact the school if this is unexpected.`,
        ref_type: 'attendance',
        ref_id: r.id,
      });
      if (log.status === 'failed') failed++;
      else sent.push(r.id);
    }
    if (sent.length) {
      await this.prisma.attendanceRecord.updateMany({ where: { id: { in: sent }, branchId }, data: { notified: 1 } });
    }
    return { notified: sent.length, skipped, failed };
  }
}

function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(days).padStart(2, '0')}`, days };
}

