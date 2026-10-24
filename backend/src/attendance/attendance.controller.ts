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
import { ATTENDANCE_RULE, AttendanceTally, addToTally, emptyTally, isSunday, tally } from './attendance-math';

/**
 * Who may READ class attendance. Teachers/HODs are further narrowed to the classes
 * they teach (see `classScope`); the other roles see the whole school.
 * Warden is deliberately NOT here (school decision 2026-10-24): the warden keeps the
 * hostel roll call, but class attendance belongs to academic staff.
 */
const ATTENDANCE_READ: string[] = [
  ...R.LEADERSHIP, ROLE.OFFICE_SUPERINTENDENT, ROLE.HOD, ROLE.TEACHER, ROLE.DISCIPLINE_OFFICER,
];
/** Per-student calendar: staff readers plus the portal (own child / self only). */
const CALENDAR_READ: string[] = [...ATTENDANCE_READ, ROLE.PARENT, ROLE.STUDENT];
/** Roles limited to the classes they teach. Everyone else in ATTENDANCE_MARK is leadership. */
const CLASS_SCOPED: string[] = [ROLE.TEACHER, ROLE.HOD];

const MONTH = /^\d{4}-\d{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Longest window the absentee list accepts (keeps the response bounded). */
const MAX_RANGE_DAYS = 186;

type AbsentRow = {
  id: string; date: string;
  student: { id: string; fullName: string; mobileNumber: string | null; email: string | null };
};

/** Shared class filter: a specific class (= one section), or every section of a class name, or one section name. */
type ClassFilterQuery = { class_id?: string; class_name?: string; section?: string };

const label = (c: { name: string; section: string | null } | null | undefined) =>
  c ? `${c.name}${c.section ? ` ${c.section}` : ''}` : null;

/** Tally fields as they appear in every API response (snake_case, stable order). */
const tallyOut = (t: AttendanceTally) => ({
  present: t.present, late: t.late, od: t.od, absent: t.absent, leave: t.leave,
  attended: t.attended, counted: t.counted, percentage: t.percentage,
});

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

  /**
   * Resolves the class/section filter bar to class ids inside the caller's scope.
   * null = no class filter (whole school, leadership only).
   * - class_id: that class (it already is one section); 403 outside a teacher's scope.
   * - class_name (+ optional section): every matching section, e.g. "Class 10" → 10 A + 10 B.
   * - section alone: that section letter across classes.
   */
  private async resolveClasses(user: AuthUser, q: ClassFilterQuery): Promise<string[] | null> {
    const classId = q.class_id?.trim() || undefined;
    const className = q.class_name?.trim() || undefined;
    const section = q.section?.trim() || undefined;
    if ((className && className.length > 60) || (section && section.length > 40)) {
      throw new BadRequestException('class_name / section is too long');
    }
    const scope = await this.classScope(user);
    if (classId) {
      await this.assertClassAllowed(user, classId);
      if (section) {
        const cls = await this.prisma.class.findFirst({ where: { id: classId, branchId: user.branch_id }, select: { section: true } });
        if ((cls?.section ?? '').toLowerCase() !== section.toLowerCase()) return [];
      }
      return [classId];
    }
    if (!className && !section) return scope;
    const all = await this.prisma.class.findMany({
      where: { branchId: user.branch_id }, select: { id: true, name: true, section: true },
    });
    const ids = all
      .filter((c) => !className || c.name.toLowerCase() === className.toLowerCase())
      .filter((c) => !section || (c.section ?? '').toLowerCase() === section.toLowerCase())
      .map((c) => c.id);
    return scope ? ids.filter((id) => scope.includes(id)) : ids;
  }

  private parseRange(from?: string, to?: string) {
    if ((from && !ISO_DATE.test(from)) || (to && !ISO_DATE.test(to))) {
      throw new BadRequestException('from/to must be YYYY-MM-DD');
    }
    if (from && to && from > to) throw new BadRequestException('from must be on or before to');
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

  /**
   * Monthly register: per-student × per-day matrix for a class in a given month, with
   * each student's counts and % under THE rule (attendance-math.ts), and class totals.
   * `notes` carries the OD reason / remark per date.
   */
  @Get('register')
  @Roles(...ATTENDANCE_READ)
  async register(@Req() req: ReqWithUser, @Query('class_id') classId?: string, @Query('month') month?: string) {
    if (!classId || !month || !MONTH.test(month)) {
      throw new BadRequestException('class_id and month (YYYY-MM) are required');
    }
    await this.assertClassAllowed(req.user, classId);
    const { start, end } = monthRange(month);

    const [students, records, cls] = await Promise.all([
      this.prisma.student.findMany({
        where: { branchId: req.user.branch_id, classId, status: 'Active' },
        orderBy: { rollNo: 'asc' },
        select: { id: true, fullName: true, rollNo: true, admissionNo: true },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { branchId: req.user.branch_id, classId, date: { gte: start, lte: end } },
        select: { studentId: true, date: true, status: true, note: true },
      }),
      this.prisma.class.findFirst({ where: { id: classId, branchId: req.user.branch_id }, select: { name: true, section: true } }),
    ]);

    const byStudent = new Map<string, { days: Record<string, string>; notes: Record<string, string>; t: AttendanceTally }>();
    const dates = new Set<string>();
    const classTally = emptyTally();
    for (const r of records) {
      dates.add(r.date);
      const row = byStudent.get(r.studentId) ?? { days: {}, notes: {}, t: emptyTally() };
      row.days[r.date] = r.status;
      if (r.note) row.notes[r.date] = r.note;
      addToTally(row.t, r.status, r.date);
      byStudent.set(r.studentId, row);
      addToTally(classTally, r.status, r.date);
    }

    return {
      month,
      class_id: classId,
      class_name: label(cls),
      rule: ATTENDANCE_RULE,
      dates: Array.from(dates).sort(),
      totals: tallyOut(classTally),
      students: students.map((s) => {
        const row = byStudent.get(s.id) ?? { days: {}, notes: {}, t: emptyTally() };
        return {
          ...s,
          days: row.days,
          notes: row.notes,
          ...tallyOut(row.t),
          /** number of records (any status) this month */
          marked: Object.keys(row.days).length,
        };
      }),
    };
  }

  /**
   * Roll-call sheet for one class on one date: every active student with the saved
   * status (if any), the OD reason / remark, an approved leave covering the date (the
   * UI pre-fills Leave from it), and whether an absence SMS/e-mail could reach a parent.
   */
  @Get('sheet')
  @Roles(...ATTENDANCE_READ)
  async sheet(@Req() req: ReqWithUser, @Query('class_id') classId?: string, @Query('date') date?: string) {
    if (!classId || !date || !ISO_DATE.test(date)) throw new BadRequestException('class_id and date (YYYY-MM-DD) are required');
    await this.assertClassAllowed(req.user, classId, date);
    const branchId = req.user.branch_id;
    const [cls, students, records, leaves] = await Promise.all([
      this.prisma.class.findFirst({ where: { id: classId, branchId }, select: { id: true, name: true, section: true } }),
      this.prisma.student.findMany({
        where: { branchId, classId, status: 'Active' },
        orderBy: [{ rollNo: 'asc' }, { fullName: 'asc' }],
        select: { id: true, fullName: true, rollNo: true, admissionNo: true, mobileNumber: true, email: true },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { branchId, classId, date }, select: { studentId: true, status: true, note: true, notified: true, markedBy: true },
      }),
      this.prisma.studentLeave.findMany({
        where: { branchId, status: 'Approved', startDate: { lte: date }, endDate: { gte: date }, student: { classId } },
        select: { studentId: true, leaveType: true, reason: true, startDate: true, endDate: true },
      }),
    ]);
    const parentLinks = await this.prisma.parentStudent.findMany({
      where: { branchId, studentId: { in: students.map((s) => s.id) } },
      select: { studentId: true, user: { select: { email: true, isActive: true } } },
    });
    const hasParentMail = new Set(parentLinks.filter((l) => l.user.isActive && l.user.email).map((l) => l.studentId));
    const rec = new Map(records.map((r) => [r.studentId, r]));
    const leave = new Map(leaves.map((l) => [l.studentId, l]));
    return {
      class: cls ? { id: cls.id, name: cls.name, section: cls.section, label: label(cls) } : null,
      date,
      is_sunday: isSunday(date),
      already_marked: records.length > 0,
      marked_count: records.length,
      rule: ATTENDANCE_RULE,
      students: students.map((s) => {
        const r = rec.get(s.id);
        const l = leave.get(s.id);
        return {
          id: s.id, full_name: s.fullName, roll_no: s.rollNo, admission_no: s.admissionNo,
          status: r?.status ?? null, note: r?.note ?? null, notified: r?.notified === 1,
          on_leave: l ? { leave_type: l.leaveType, reason: l.reason, from: l.startDate, to: l.endDate } : null,
          contact_reachable: !!(s.mobileNumber?.trim() || s.email?.trim() || hasParentMail.has(s.id)),
        };
      }),
    };
  }

  /** Per-day status for one student for a month, plus the month's and the overall attendance %. */
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
    const all = await this.prisma.attendanceRecord.findMany({
      where: { branchId: req.user.branch_id, studentId },
      select: { date: true, status: true, note: true },
      orderBy: { date: 'asc' },
    });
    const records = all.filter((r) => r.date >= start && r.date <= end);
    const byDate = new Map(records.map((r) => [r.date, r]));
    const month_ = tally(records);
    const overall = tally(all);

    return {
      student: {
        id: student.id, full_name: student.fullName, roll_no: student.rollNo, admission_no: student.admissionNo,
        class_id: student.classId, class_name: label(student.class),
      },
      month,
      rule: ATTENDANCE_RULE,
      days: Array.from({ length: days }, (_, i) => {
        const date = `${month}-${String(i + 1).padStart(2, '0')}`;
        const r = byDate.get(date);
        return { date, status: r?.status ?? null, note: r?.note ?? null, is_sunday: isSunday(date) };
      }),
      summary: { ...tallyOut(month_), marked: month_.counted },
      overall: { ...tallyOut(overall), marked: overall.counted },
    };
  }

  /**
   * Absentee list with filters: one date OR a from/to range, class / class name / section,
   * status Absent | Late | both, and `not_notified=1` (Absent records whose parent notice
   * has not gone out). Grouped by class, plus a flat `rows` list and counts.
   */
  @Get('absentees')
  @Roles(...ATTENDANCE_READ)
  async absentees(
    @Req() req: ReqWithUser,
    @Query('date') dateQ?: string,
    @Query('from') fromQ?: string,
    @Query('to') toQ?: string,
    @Query('class_id') classId?: string,
    @Query('class_name') className?: string,
    @Query('section') section?: string,
    @Query('status') statusQ?: string,
    @Query('not_notified') notNotifiedQ?: string,
  ) {
    const ranged = !!(fromQ || toQ);
    const date = dateQ ?? (ranged ? undefined : new Date().toISOString().slice(0, 10));
    if (date && !ISO_DATE.test(date)) throw new BadRequestException('date must be YYYY-MM-DD');
    const from = ranged ? (fromQ || toQ)! : date!;
    const to = ranged ? (toQ || fromQ)! : date!;
    this.parseRange(from, to);
    if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_RANGE_DAYS) {
      throw new BadRequestException(`date range is limited to ${MAX_RANGE_DAYS} days`);
    }
    const status = (statusQ ?? 'Absent').trim();
    const statuses = status === 'both' || status === 'all' ? ['Absent', 'Late'] : [status];
    if (!statuses.every((s) => s === 'Absent' || s === 'Late')) {
      throw new BadRequestException('status must be Absent, Late or both');
    }
    const notNotified = notNotifiedQ === '1' || notNotifiedQ === 'true';

    const classIds = await this.resolveClasses(req.user, { class_id: classId, class_name: className, section });
    const classFilter = classIds ? { classId: { in: classIds } } : {};
    const dateFilter = { date: { gte: from, lte: to } };

    const [rows, marked] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: {
          branchId: req.user.branch_id, ...dateFilter, ...classFilter,
          // "not yet notified" only makes sense for Absent (Late / OD never send a notice).
          ...(notNotified ? { status: 'Absent', notified: 0 } : { status: { in: statuses } }),
        },
        include: {
          student: { select: { id: true, fullName: true, rollNo: true, admissionNo: true, mobileNumber: true } },
          class: { select: { id: true, name: true, section: true } },
        },
        orderBy: [{ date: 'desc' }, { classId: 'asc' }],
        take: 5000,
      }),
      this.prisma.attendanceRecord.groupBy({
        by: ['classId'], where: { branchId: req.user.branch_id, ...dateFilter, ...classFilter }, _count: { _all: true },
      }),
    ]);
    const markedBy = new Map(marked.map((m) => [m.classId, m._count._all]));

    type Entry = {
      record_id: string; date: string; status: string; student_id: string; full_name: string; roll_no: string | null;
      admission_no: string; contact: string | null; notified: boolean; note: string | null;
      class_id: string; class_name: string; section: string | null;
    };
    const groups = new Map<string, { class_id: string; class_name: string; section: string | null; marked: number; absentees: Entry[] }>();
    const flat: Entry[] = [];
    for (const r of rows) {
      const e: Entry = {
        record_id: r.id, date: r.date, status: r.status, student_id: r.student.id, full_name: r.student.fullName,
        roll_no: r.student.rollNo, admission_no: r.student.admissionNo, contact: r.student.mobileNumber,
        notified: r.notified === 1, note: r.note ?? null,
        class_id: r.classId, class_name: label(r.class) ?? '', section: r.class.section,
      };
      flat.push(e);
      const g = groups.get(r.classId) ?? {
        class_id: r.classId, class_name: label(r.class) ?? '', section: r.class.section,
        marked: markedBy.get(r.classId) ?? 0, absentees: [],
      };
      g.absentees.push(e);
      groups.set(r.classId, g);
    }
    const classes = [...groups.values()].sort((a, b) => a.class_name.localeCompare(b.class_name));
    classes.forEach((c) => c.absentees.sort((a, b) => b.date.localeCompare(a.date) || (a.roll_no ?? '').localeCompare(b.roll_no ?? '', undefined, { numeric: true })));
    return {
      date: ranged ? null : date,
      from, to,
      status: notNotified ? 'Absent' : statuses.length === 2 ? 'both' : statuses[0],
      not_notified: notNotified,
      total: flat.length,
      total_absent: flat.filter((r) => r.status === 'Absent').length,
      total_late: flat.filter((r) => r.status === 'Late').length,
      pending_notices: flat.filter((r) => r.status === 'Absent' && !r.notified).length,
      classes,
      rows: flat,
    };
  }

  /** Students whose attendance % over [from, to] is below `threshold` (THE rule; Leave/Sundays not counted). */
  @Get('low')
  @Roles(...ATTENDANCE_READ)
  async low(
    @Req() req: ReqWithUser,
    @Query('threshold') thresholdQ?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('class_id') classId?: string,
    @Query('class_name') className?: string,
    @Query('section') section?: string,
  ) {
    const threshold = parseThreshold(thresholdQ);
    this.parseRange(from, to);
    const classIds = await this.resolveClasses(req.user, { class_id: classId, class_name: className, section });

    const where = {
      branchId: req.user.branch_id,
      ...(classIds ? { classId: { in: classIds } } : {}),
      ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };
    const grouped = await this.prisma.attendanceRecord.groupBy({ by: ['studentId', 'status', 'date'], where, _count: { _all: true } });

    const tallies = new Map<string, AttendanceTally>();
    for (const g of grouped) {
      const t = tallies.get(g.studentId) ?? emptyTally();
      addToTally(t, g.status, g.date, g._count._all);
      tallies.set(g.studentId, t);
    }
    const below = [...tallies.entries()]
      .filter(([, t]) => t.counted > 0 && (t.percentage ?? 0) < threshold)
      .map(([id, t]) => ({ id, t }));

    const students = await this.prisma.student.findMany({
      where: { id: { in: below.map((b) => b.id) }, branchId: req.user.branch_id },
      select: { id: true, fullName: true, rollNo: true, admissionNo: true, classId: true, class: { select: { name: true, section: true } } },
    });
    const info = new Map(students.map((s) => [s.id, s]));
    return {
      threshold, from: from ?? null, to: to ?? null, rule: ATTENDANCE_RULE,
      students: below
        .filter((b) => info.has(b.id))
        .map(({ id, t }) => {
          const s = info.get(id)!;
          return {
            student_id: id, full_name: s.fullName, roll_no: s.rollNo, admission_no: s.admissionNo,
            class_id: s.classId, class_name: label(s.class), section: s.class?.section ?? null,
            ...tallyOut(t),
            marked: t.counted,
            percentage: t.percentage ?? 0,
          };
        })
        .sort((a, b) => a.percentage - b.percentage),
    };
  }

  /**
   * Analytics for the filter bar (class / class name / section / from / to / threshold):
   * overall tally, per-class tallies, a daily (≤ 62 days) or monthly trend, the status mix
   * and how many students fall below the threshold. All under THE rule.
   */
  @Get('analytics')
  @Roles(...ATTENDANCE_READ)
  async analytics(
    @Req() req: ReqWithUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('class_id') classId?: string,
    @Query('class_name') className?: string,
    @Query('section') section?: string,
    @Query('threshold') thresholdQ?: string,
  ) {
    const threshold = parseThreshold(thresholdQ);
    this.parseRange(from, to);
    const classIds = await this.resolveClasses(req.user, { class_id: classId, class_name: className, section });
    const where = {
      branchId: req.user.branch_id,
      ...(classIds ? { classId: { in: classIds } } : {}),
      ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };
    const [byClassDate, byStudent, classes] = await Promise.all([
      this.prisma.attendanceRecord.groupBy({ by: ['classId', 'date', 'status'], where, _count: { _all: true } }),
      this.prisma.attendanceRecord.groupBy({ by: ['studentId', 'date', 'status'], where, _count: { _all: true } }),
      this.prisma.class.findMany({
        where: { branchId: req.user.branch_id, ...(classIds ? { id: { in: classIds } } : {}) },
        orderBy: [{ name: 'asc' }, { section: 'asc' }],
        select: { id: true, name: true, section: true, _count: { select: { students: { where: { status: 'Active' } } } } },
      }),
    ]);

    const overall = emptyTally();
    const perClass = new Map<string, AttendanceTally>();
    const perDate = new Map<string, AttendanceTally>();
    for (const g of byClassDate) {
      addToTally(overall, g.status, g.date, g._count._all);
      const c = perClass.get(g.classId) ?? emptyTally();
      addToTally(c, g.status, g.date, g._count._all);
      perClass.set(g.classId, c);
      const d = perDate.get(g.date) ?? emptyTally();
      addToTally(d, g.status, g.date, g._count._all);
      perDate.set(g.date, d);
    }
    const dates = [...perDate.keys()].sort();
    const span = dates.length ? (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86_400_000 : 0;
    const granularity: 'day' | 'month' = span <= 62 ? 'day' : 'month';
    const buckets = new Map<string, AttendanceTally>();
    for (const g of byClassDate) {
      const k = granularity === 'day' ? g.date : g.date.slice(0, 7);
      const b = buckets.get(k) ?? emptyTally();
      addToTally(b, g.status, g.date, g._count._all);
      buckets.set(k, b);
    }
    const studentTally = new Map<string, AttendanceTally>();
    for (const g of byStudent) {
      const t = studentTally.get(g.studentId) ?? emptyTally();
      addToTally(t, g.status, g.date, g._count._all);
      studentTally.set(g.studentId, t);
    }
    const rated = [...studentTally.values()].filter((t) => t.counted > 0);

    return {
      filters: {
        class_id: classId ?? null, class_name: className ?? null, section: section ?? null,
        from: from ?? null, to: to ?? null, threshold,
      },
      rule: ATTENDANCE_RULE,
      overall: tallyOut(overall),
      days_marked: dates.filter((d) => !isSunday(d)).length,
      students_rated: rated.length,
      below_threshold: rated.filter((t) => (t.percentage ?? 0) < threshold).length,
      by_class: classes.map((c) => ({
        class_id: c.id, class_name: c.name, section: c.section, label: label(c), students: c._count.students,
        ...tallyOut(perClass.get(c.id) ?? emptyTally()),
      })),
      trend: {
        granularity,
        points: [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, t]) => ({ period, ...tallyOut(t) })),
      },
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
   * OD (On Duty) needs a reason (validated in the DTO), is stored in `note`, counts as
   * present and NEVER triggers an absence notice.
   */
  @Post()
  @Roles(...R.ATTENDANCE_MARK)
  async mark(@Req() req: ReqWithUser, @Body() body: MarkClassAttendanceDto) {
    const { class_id, date, records } = body;
    const branchId = req.user.branch_id;
    await this.assertClassAllowed(req.user, class_id, date);

    const ids = [...new Set(records.map((r) => r.student_id))];
    if (ids.length !== records.length) throw new BadRequestException('Each student may appear only once');
    for (const r of records) {
      if (r.status === 'OD' && !r.reason?.trim()) throw new BadRequestException('reason is required for OD (On Duty)');
    }
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
        const note = r.reason?.trim() ? r.reason.trim() : null;
        return this.prisma.attendanceRecord.upsert({
          where: { studentId_date: { studentId: r.student_id, date } },
          create: { branchId, studentId: r.student_id, classId: class_id, date, status: r.status, markedBy, notified: 0, note },
          update: { classId: class_id, status: r.status, markedBy, notified, note },
        });
      }),
    ));

    const toNotify = saved.filter((s) => s.status === 'Absent' && s.notified === 0).map((s) => s.id);
    const result = await this.dispatchAbsenceNotices(branchId, toNotify);
    const t = tally(saved.map((s) => ({ status: s.status })));
    return {
      success: true, count: records.length,
      summary: tallyOut(t),
      notified: result.notified, notify_skipped: result.skipped, notify_failed: result.failed,
    };
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
   * notified=0 so the office can follow up. Only ever called with Absent records.
   */
  private async dispatchAbsenceNotices(branchId: string, recordIds: string[]) {
    if (recordIds.length === 0) return { notified: 0, skipped: 0, failed: 0 };
    const rows: AbsentRow[] = await this.prisma.attendanceRecord.findMany({
      where: { id: { in: recordIds }, branchId, status: 'Absent' },
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

function parseThreshold(q?: string): number {
  const threshold = q === undefined || q === '' ? 75 : Number(q);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    throw new BadRequestException('threshold must be a number between 0 and 100');
  }
  return threshold;
}

function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(days).padStart(2, '0')}`, days };
}
