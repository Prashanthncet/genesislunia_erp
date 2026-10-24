import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { ROLE } from '../auth/roles';
import { AuthUser, ReqWithUser, assertCanSeeStudent, portalStudentIds } from '../common/access';
import { PortalLeaveRequestDto } from './portal.dto';
import { ATTENDANCE_RULE, isSunday, tally } from '../attendance/attendance-math';
import { sortPeriods } from '../timetable/timetable.util';

/** Today as YYYY-MM-DD in local time (school dates are stored as plain strings). */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Last line of defence for anything secret that slipped into a notification body:
 * OTPs, passwords, PINs and codes are replaced with dots. NotificationsService already
 * masks the values it was told about (`redact`); this covers legacy rows and callers
 * that forgot to pass them.
 */
export function maskSecrets(body: string): string {
  let out = body.replace(
    /\b(otp|one[- ]time (?:pass(?:word|code)?|code)|pass ?code|password|passwd|pin|code)\b(\s*(?:is|:|=|-)?\s*)([A-Za-z0-9@#$%^&*!._-]{4,})/gi,
    (_m, word: string, sep: string) => `${word}${sep}••••••`,
  );
  // If the message talks about an OTP at all, any standalone 4–8 digit number in it is one.
  if (/\botp\b|one[- ]time/i.test(out)) out = out.replace(/\b\d{4,8}\b/g, '••••••');
  return out;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

/**
 * Parent / student portal. Every route is limited to portal roles, and every
 * child-scoped route checks the child belongs to the caller (`assertCanSeeStudent`).
 * Responses are hand-picked fields — never whole rows — so secrets such as gate-pass
 * OTP hashes, pass codes and admission form tokens can't leak by accident.
 */
@Controller('portal')
@UseGuards(AuthGuard, RolesGuard)
@Roles(ROLE.PARENT, ROLE.STUDENT)
export class PortalController {
  constructor(private prisma: PrismaService) {}

  // ─── helpers ───────────────────────────────────────────────

  /** 403 if not the caller's child, 404 if it no longer exists in this school. */
  private async child(user: AuthUser, studentId: string) {
    await assertCanSeeStudent(this.prisma, user, studentId);
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, branchId: user.branch_id },
      select: {
        id: true, fullName: true, admissionNo: true, rollNo: true, house: true, status: true,
        mobileNumber: true, email: true, classId: true,
        class: { select: { id: true, name: true, section: true } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }

  /** Month view + overall, under THE attendance rule (attendance/attendance-math.ts). */
  private async attendanceFor(studentId: string, month: string) {
    const all = await this.prisma.attendanceRecord.findMany({
      where: { studentId },
      select: { date: true, status: true, note: true },
      orderBy: { date: 'asc' },
    });
    const rows = all.filter((r) => r.date.startsWith(month));
    const t = tally(rows);
    const overall = tally(all);
    return {
      month,
      rule: ATTENDANCE_RULE,
      days: rows.map((r) => ({ date: r.date, status: r.status, note: r.note ?? null, is_sunday: isSunday(r.date) })),
      /** attended = Present + Late + OD */
      present: t.attended,
      present_only: t.present,
      absent: t.absent,
      late: t.late,
      od: t.od,
      leave: t.leave,
      /** counted days = Present + Late + OD + Absent (Leave, Sundays excluded) */
      total: t.counted,
      attendance_pct: t.percentage,
      overall: { attended: overall.attended, counted: overall.counted, percentage: overall.percentage },
    };
  }

  private async feesFor(studentId: string, branchId: string) {
    const invoices = await this.prisma.feeInvoice.findMany({
      where: { studentId, branchId },
      select: {
        id: true, invoiceNo: true, term: true, totalAmount: true, dueDate: true, status: true,
        payments: {
          select: { id: true, amountPaid: true, paymentMode: true, paymentDate: true, receiptNo: true, referenceNo: true },
          orderBy: { paymentDate: 'asc' },
        },
      },
      orderBy: { dueDate: 'desc' },
    });
    const today = todayISO();
    const rows = invoices.map((inv) => {
      const paid = inv.payments.reduce((s, p) => s + p.amountPaid, 0);
      const balance = Math.max(0, inv.totalAmount - paid);
      return {
        id: inv.id,
        invoice_no: inv.invoiceNo,
        term: inv.term,
        total_amount: inv.totalAmount,
        due_date: inv.dueDate,
        status: inv.status,
        paid_amount: paid,
        balance,
        overdue: balance > 0 && inv.dueDate < today,
        payments: inv.payments.map((p) => ({
          id: p.id,
          amount: p.amountPaid,
          mode: p.paymentMode,
          date: p.paymentDate,
          receipt_no: p.receiptNo,
          reference_no: p.referenceNo,
          receipt_url: `/api/fees/payments/${p.id}/receipt.pdf`,
        })),
      };
    });
    return {
      invoices: rows,
      total: rows.reduce((s, r) => s + r.total_amount, 0),
      paid: rows.reduce((s, r) => s + r.paid_amount, 0),
      balance: rows.reduce((s, r) => s + r.balance, 0),
    };
  }

  private async marksFor(studentId: string, branchId: string) {
    const [marks, bands] = await Promise.all([
      this.prisma.examMark.findMany({
        where: { studentId, branchId },
        select: {
          score: true, maxScore: true,
          exam: { select: { id: true, name: true, date: true, term: true, academicYear: true } },
          subject: { select: { id: true, name: true, code: true } },
        },
      }),
      this.prisma.gradeBand.findMany({ where: { branchId }, orderBy: { minPercent: 'desc' } }),
    ]);
    const gradeOf = (p: number | null) => (p === null ? null : bands.find((b) => p >= b.minPercent)?.grade ?? null);

    const byExam = new Map<string, { exam: (typeof marks)[number]['exam']; subjects: { subject: string; code: string; score: number; max_score: number; pct: number | null; grade: string | null }[] }>();
    for (const m of marks) {
      const e = byExam.get(m.exam.id) ?? { exam: m.exam, subjects: [] };
      const p = pct(m.score, m.maxScore);
      e.subjects.push({ subject: m.subject.name, code: m.subject.code, score: m.score, max_score: m.maxScore, pct: p, grade: gradeOf(p) });
      byExam.set(m.exam.id, e);
    }
    return Array.from(byExam.values())
      .map(({ exam, subjects }) => {
        const score = subjects.reduce((s, x) => s + x.score, 0);
        const max = subjects.reduce((s, x) => s + x.max_score, 0);
        const p = pct(score, max);
        return {
          exam_id: exam.id,
          exam_name: exam.name,
          date: exam.date,
          term: exam.term,
          academic_year: exam.academicYear,
          subjects: subjects.sort((a, b) => a.subject.localeCompare(b.subject)),
          total: score,
          max_total: max,
          pct: p,
          grade: gradeOf(p),
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  /** Notification rows that are about this child: sent to its contacts or referencing its records. */
  private async messagesFor(user: AuthUser, student: { id: string; mobileNumber: string | null; email: string | null }, take = 50) {
    const [me, passes, leaves, invoices, admissions] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: user.sub }, select: { email: true } }),
      this.prisma.gatePass.findMany({ where: { studentId: student.id }, select: { id: true } }),
      this.prisma.studentLeave.findMany({ where: { studentId: student.id }, select: { id: true } }),
      this.prisma.feeInvoice.findMany({ where: { studentId: student.id }, select: { id: true, payments: { select: { id: true } } } }),
      this.prisma.admission.findMany({
        where: { branchId: user.branch_id, OR: [{ studentId: student.id }, ...(user.role === ROLE.PARENT ? [{ parentUserId: user.sub }] : [])] },
        select: { id: true, parentContact: true, parentEmail: true },
      }),
    ]);
    const contacts = new Set<string>();
    [student.mobileNumber, student.email, me?.email, ...admissions.flatMap((a) => [a.parentContact, a.parentEmail])]
      .forEach((c) => { if (c && c.trim()) contacts.add(c.trim()); });
    const refIds = [
      student.id,
      ...passes.map((p) => p.id),
      ...leaves.map((l) => l.id),
      ...invoices.flatMap((i) => [i.id, ...i.payments.map((p) => p.id)]),
      ...admissions.map((a) => a.id),
    ];
    const rows = await this.prisma.notificationLog.findMany({
      where: {
        branchId: user.branch_id,
        OR: [
          ...(contacts.size ? [{ recipient: { in: Array.from(contacts) } }] : []),
          { refId: { in: refIds } },
        ],
      },
      select: { id: true, channel: true, subject: true, body: true, refType: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map((r) => ({
      id: r.id,
      channel: r.channel,
      subject: r.subject ? maskSecrets(r.subject) : null,
      body: maskSecrets(r.body),
      ref_type: r.refType,
      status: r.status,
      created_at: r.createdAt,
    }));
  }

  // ─── routes ────────────────────────────────────────────────

  /** Everything the portal home needs, for every child the caller may see. */
  @Get('overview')
  async overview(@Req() req: ReqWithUser) {
    const ids = (await portalStudentIds(this.prisma, req.user)) ?? [];
    const month = todayISO().slice(0, 7);
    const children = await Promise.all(
      ids.map(async (id) => {
        const s = await this.prisma.student.findFirst({
          where: { id, branchId: req.user.branch_id },
          select: {
            id: true, fullName: true, admissionNo: true, rollNo: true, house: true, status: true,
            mobileNumber: true, email: true,
            class: { select: { id: true, name: true, section: true } },
          },
        });
        if (!s) return null;
        const [att, fees, marks, pendingLeaves, pendingPasses, messages] = await Promise.all([
          this.attendanceFor(id, month),
          this.feesFor(id, req.user.branch_id),
          this.marksFor(id, req.user.branch_id),
          this.prisma.studentLeave.count({ where: { studentId: id, status: 'Pending' } }),
          this.prisma.gatePass.count({ where: { studentId: id, status: { in: ['Pending', 'Warden Approved'] } } }),
          this.messagesFor(req.user, s, 5),
        ]);
        const latest = marks[0] ?? null;
        return {
          id: s.id,
          full_name: s.fullName,
          admission_no: s.admissionNo,
          roll_no: s.rollNo,
          house: s.house,
          status: s.status,
          class: s.class,
          attendance: { month, present: att.present, total: att.total, od: att.od, attendance_pct: att.attendance_pct, overall_pct: att.overall.percentage },
          fees: { total: fees.total, paid: fees.paid, balance: fees.balance, overdue: fees.invoices.filter((i) => i.overdue).length },
          latest_marks: latest
            ? { exam_id: latest.exam_id, exam_name: latest.exam_name, date: latest.date, pct: latest.pct, grade: latest.grade, subjects: latest.subjects }
            : null,
          pending_leaves: pendingLeaves,
          pending_gate_passes: pendingPasses,
          messages,
        };
      }),
    );
    return { role: req.user.role, month, children: children.filter((c) => c !== null) };
  }

  @Get('children/:id/attendance')
  async attendance(@Req() req: ReqWithUser, @Param('id') id: string, @Query('month') month?: string) {
    await this.child(req.user, id);
    const m = month && /^\d{4}-\d{2}$/.test(month) ? month : todayISO().slice(0, 7);
    return this.attendanceFor(id, m);
  }

  @Get('children/:id/fees')
  async fees(@Req() req: ReqWithUser, @Param('id') id: string) {
    await this.child(req.user, id);
    return this.feesFor(id, req.user.branch_id);
  }

  @Get('children/:id/marks')
  async marks(@Req() req: ReqWithUser, @Param('id') id: string) {
    await this.child(req.user, id);
    const [exams, cards] = await Promise.all([this.marksFor(id, req.user.branch_id), this.publishedCards(id, req.user.branch_id)]);
    return {
      exams,
      report_cards: cards,
      // Latest PUBLISHED card only; null until the school publishes a term.
      report_card_url: cards[0]?.pdf_url ?? null,
    };
  }

  /** Report cards the school has published (frozen per term) for this child, newest first. */
  @Get('children/:id/report-cards')
  async reportCards(@Req() req: ReqWithUser, @Param('id') id: string) {
    await this.child(req.user, id);
    return this.publishedCards(id, req.user.branch_id);
  }

  private async publishedCards(studentId: string, branchId: string) {
    const snaps = await this.prisma.reportCardSnapshot.findMany({
      where: { studentId, branchId },
      select: { term: true, academicYear: true, publishedAt: true, data: true },
      orderBy: { publishedAt: 'desc' },
    });
    return snaps.map((s) => {
      let d: { overall_pct?: number | null; overall_grade?: string | null; grade_point?: number | null; rank?: number | null; class_size?: number; passed?: boolean | null } = {};
      try { d = JSON.parse(s.data); } catch { /* corrupt row: still listed */ }
      const qs = new URLSearchParams({ term: s.term, academic_year: s.academicYear }).toString();
      return {
        term: s.term,
        academic_year: s.academicYear,
        published_at: s.publishedAt,
        overall_pct: d.overall_pct ?? null,
        overall_grade: d.overall_grade ?? null,
        grade_point: d.grade_point ?? null,
        rank: d.rank ?? null,
        class_size: d.class_size ?? null,
        passed: d.passed ?? null,
        card_url: `/api/exams/report-card/${studentId}?${qs}`,
        pdf_url: `/api/exams/report-card/${studentId}/pdf?${qs}`,
      };
    });
  }

  @Get('children/:id/timetable')
  async timetable(@Req() req: ReqWithUser, @Param('id') id: string) {
    const s = await this.child(req.user, id);
    const date = todayISO();
    const day = DOW[new Date(`${date}T00:00:00`).getDay()];
    if (!s.classId) return { class: null, date, day, periods: [], slots: [], substitutions: [] };
    const [slots, periods, subs] = await Promise.all([
      this.prisma.timetableSlot.findMany({
        where: { branchId: req.user.branch_id, classId: s.classId },
        select: { dayOfWeek: true, periodNumber: true, subject: true, teacher: { select: { name: true } }, room: { select: { name: true } } },
      }),
      this.prisma.periodConfig.findMany({
        where: { branchId: req.user.branch_id },
        select: { periodNumber: true, startTime: true, endTime: true, isBreak: true, breakName: true },
        orderBy: { periodNumber: 'asc' },
      }),
      this.prisma.substitution.findMany({
        where: { branchId: req.user.branch_id, classId: s.classId, date, status: { not: 'Cancelled' } },
        select: { periodNumber: true, reason: true, substitute: { select: { name: true } }, room: { select: { name: true } } },
      }),
    ]);
    return {
      class: s.class,
      date,
      day,
      /** Bell schedule incl. breaks (Short Break, Lunch Break…) in the order the day runs. */
      periods: sortPeriods(periods).map((p) => ({ ...p, breakName: p.isBreak ? (p.breakName ?? 'Break') : null })),
      pdf_url: `/api/timetable/class/${s.classId}/pdf`,
      slots: slots.map((x) => ({
        day_of_week: x.dayOfWeek,
        period_number: x.periodNumber,
        subject: x.subject,
        teacher_name: x.teacher.name,
        room_name: x.room?.name ?? null,
      })),
      substitutions: subs.map((x) => ({
        period_number: x.periodNumber,
        substitute_name: x.substitute.name,
        room_name: x.room?.name ?? null,
        reason: x.reason,
      })),
    };
  }

  /** Student leaves + gate passes. No OTP, OTP hash or pass code — ever. */
  @Get('children/:id/leaves')
  async leaves(@Req() req: ReqWithUser, @Param('id') id: string) {
    await this.child(req.user, id);
    const [leaves, passes] = await Promise.all([
      this.prisma.studentLeave.findMany({
        where: { studentId: id, branchId: req.user.branch_id },
        select: { id: true, leaveType: true, startDate: true, endDate: true, reason: true, status: true, remarks: true, requestedBy: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.gatePass.findMany({
        where: { studentId: id, branchId: req.user.branch_id },
        select: {
          id: true, type: true, reason: true, outTime: true, expectedInTime: true,
          actualOutTime: true, actualInTime: true, status: true, rejectedReason: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      leaves: leaves.map((l) => ({
        id: l.id, leave_type: l.leaveType, start_date: l.startDate, end_date: l.endDate, reason: l.reason,
        status: l.status, remarks: l.remarks, requested_by_me: l.requestedBy === req.user.sub, created_at: l.createdAt,
      })),
      gate_passes: passes.map((p) => ({
        id: p.id, type: p.type, reason: p.reason, out_time: p.outTime, expected_in_time: p.expectedInTime,
        actual_out_time: p.actualOutTime, actual_in_time: p.actualInTime, status: p.status,
        rejected_reason: p.rejectedReason, created_at: p.createdAt,
      })),
    };
  }

  @Post('children/:id/leave-request')
  async requestLeave(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: PortalLeaveRequestDto) {
    await this.child(req.user, id);
    if (body.end_date < body.start_date) throw new BadRequestException('end_date cannot be before start_date');
    const overlap = await this.prisma.studentLeave.findFirst({
      where: {
        studentId: id,
        status: { in: ['Pending', 'Approved'] },
        startDate: { lte: body.end_date },
        endDate: { gte: body.start_date },
      },
      select: { id: true },
    });
    if (overlap) throw new BadRequestException('There is already a leave request covering these dates');
    const leave = await this.prisma.studentLeave.create({
      data: {
        branchId: req.user.branch_id,
        studentId: id,
        leaveType: body.leave_type,
        startDate: body.start_date,
        endDate: body.end_date,
        reason: body.reason.trim(),
        remarks: body.remarks?.trim() || null,
        status: 'Pending',
        requestedBy: req.user.sub,
      },
      select: { id: true, leaveType: true, startDate: true, endDate: true, reason: true, status: true, requestedBy: true, createdAt: true },
    });
    return {
      id: leave.id, leave_type: leave.leaveType, start_date: leave.startDate, end_date: leave.endDate,
      reason: leave.reason, status: leave.status, requested_by: leave.requestedBy, created_at: leave.createdAt,
    };
  }

  @Get('children/:id/messages')
  async messages(@Req() req: ReqWithUser, @Param('id') id: string) {
    const s = await this.child(req.user, id);
    return this.messagesFor(req.user, s);
  }

  /** The parent's own admission application(s) and their status timeline. Read-only. */
  @Get('admission')
  async admission(@Req() req: ReqWithUser) {
    if (req.user.role !== ROLE.PARENT) return [];
    const apps = await this.prisma.admission.findMany({
      where: { branchId: req.user.branch_id, parentUserId: req.user.sub },
      select: {
        id: true, studentName: true, status: true, rollNo: true, house: true, paymentStatus: true,
        feeAmount: true, receiptNo: true, submittedAt: true, paidAt: true, academicYear: true,
        studentId: true, remarks: true, createdAt: true, updatedAt: true,
        class: { select: { id: true, name: true, section: true } },
        steps: {
          select: { id: true, fromStatus: true, toStatus: true, action: true, actorRole: true, remarks: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return apps.map((a) => ({
      id: a.id,
      student_name: a.studentName,
      status: a.status,
      class: a.class,
      roll_no: a.rollNo,
      house: a.house,
      payment_status: a.paymentStatus,
      fee_amount: a.feeAmount,
      receipt_no: a.receiptNo,
      submitted_at: a.submittedAt,
      paid_at: a.paidAt,
      academic_year: a.academicYear,
      student_id: a.studentId,
      remarks: a.remarks,
      created_at: a.createdAt,
      updated_at: a.updatedAt,
      confirmed: ['Admission Complete', 'Admission Confirmed'].includes(a.status),
      timeline: a.steps.map((st) => ({
        id: st.id, from_status: st.fromStatus, to_status: st.toStatus, action: st.action,
        actor_role: st.actorRole, remarks: st.remarks, at: st.createdAt,
      })),
    }));
  }
}
