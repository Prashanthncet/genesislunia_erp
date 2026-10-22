import {
  BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { R, ROLE } from '../auth/roles';
import { ReqWithUser, assertCanSeeStudent, assertInBranch, audit, currentStaffId, portalStudentIds } from '../common/access';
import { CreateStaffLeaveDto, CreateStudentLeaveDto, LeaveDecisionDto } from './dto/leaves.dto';
import { inclusiveDays, notifyParents, resolveActor } from './leave-helpers';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
import { LEAVE_QUOTAS as QUOTAS } from '../common/leave-quotas';

/** May file staff leave for a colleague (everyone else files only for themselves). */
const LEAVE_ON_BEHALF: string[] = [...R.ADMINS, ROLE.HR];
/** See every staff leave / balance in the school. HOD sees their department; others only themselves. */
const LEAVE_VIEW_ALL: string[] = [...R.LEADERSHIP, ROLE.HR];
/** Approve any staff leave in the school (HOD is limited to their department). */
const LEAVE_APPROVE_ANY: string[] = [...R.LEADERSHIP, ROLE.HR];
/** May file a student leave. Parents file for their own children only. */
const STUDENT_LEAVE_FILE: string[] = [...R.STUDENT_LEAVE_APPROVE, ROLE.OFFICE_SUPERINTENDENT, ROLE.PARENT];
const STUDENT_LEAVE_READ: string[] = [...new Set([...R.STUDENT_READ, ...R.STUDENT_LEAVE_APPROVE, ROLE.PARENT, ROLE.STUDENT])];

const STUDENT_SUMMARY = { select: { id: true, fullName: true, admissionNo: true, class: { select: { id: true, name: true, section: true } } } } as const;

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class LeavesController {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  // ─── Balances ───────────────────────────────────────────────

  /**
   * Leave balances for the current calendar year (Approved leaves, inclusive days).
   * HR / leadership: every active staff member (optionally ?staff_id=). Everyone else: themselves only.
   */
  @Get('balances')
  @Roles(...R.STAFF)
  async balances(@Req() req: ReqWithUser, @Query('staff_id') staffIdQ?: string) {
    const year = new Date().getFullYear();
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    let scope: { id?: string | { in: string[] } } = {};
    if (LEAVE_VIEW_ALL.includes(req.user.role)) {
      if (staffIdQ) scope = { id: staffIdQ };
    } else {
      const own = await currentStaffId(this.prisma, req.user);
      if (!own) return [];
      if (staffIdQ && staffIdQ !== own) throw new ForbiddenException('You can only view your own leave balance');
      scope = { id: own };
    }
    const staff = await this.prisma.staff.findMany({
      where: { branchId: req.user.branch_id, isActive: true, ...scope },
      select: { id: true, name: true, role: true, department: true },
      orderBy: { name: 'asc' },
    });
    const approved = await this.prisma.staffLeave.findMany({
      where: {
        branchId: req.user.branch_id,
        staffId: { in: staff.map((s) => s.id) },
        status: 'Approved',
        startDate: { lte: to },
        endDate: { gte: from },
      },
      select: { staffId: true, leaveType: true, startDate: true, endDate: true },
    });
    return staff.map((member) => {
      const leaves: Record<string, { used: number; quota: number; remaining: number }> = {};
      for (const [type, quota] of Object.entries(QUOTAS)) {
        const used = approved
          .filter((l) => l.staffId === member.id && l.leaveType === type)
          .reduce((sum, l) => sum + inclusiveDays(l.startDate, l.endDate, from, to), 0);
        leaves[type] = { used, quota, remaining: Math.max(0, quota - used) };
      }
      return { staff_id: member.id, name: member.name, role: member.role, department: member.department, leaves };
    });
  }

  // ─── Staff leaves ───────────────────────────────────────────

  /**
   * ?view=mine → only the caller's own leave; ?view=queue → Pending leave the caller may decide.
   * Default: everything the caller may see (school for HR/leadership, department for HOD, own otherwise).
   * Every row carries `can_decide` for the caller.
   */
  @Get('staff-leaves')
  @Roles(...R.STAFF)
  async listStaffLeaves(
    @Req() req: ReqWithUser,
    @Query('staff_id') staffId?: string,
    @Query('status') status?: string,
    @Query('view') view?: string,
  ) {
    const me = await this.approverContext(req);
    const base = { branchId: req.user.branch_id, ...(status ? { status } : {}), ...(staffId ? { staffId } : {}) };
    let visibility: object;
    if (view === 'mine') {
      visibility = { staffId: me.staffId ?? '__none__' };
    } else if (LEAVE_VIEW_ALL.includes(req.user.role)) {
      visibility = {};
    } else if (req.user.role === ROLE.HOD && me.department) {
      visibility = { OR: [{ staffId: me.staffId ?? '__none__' }, { staff: { department: me.department } }] };
    } else {
      visibility = { staffId: me.staffId ?? '__none__' };
    }
    const rows = await this.prisma.staffLeave.findMany({
      where: { AND: [base, visibility] },
      include: {
        staff: { select: { id: true, name: true, role: true, department: true } },
        approver: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const withFlag = rows.map((l) => ({ ...l, can_decide: l.status === 'Pending' && this.canDecide(req, me, l.staffId, l.staff.department) }));
    return view === 'queue' ? withFlag.filter((l) => l.can_decide) : withFlag;
  }

  @Post('staff-leaves')
  @Roles(...R.STAFF)
  async createStaffLeave(@Req() req: ReqWithUser, @Body() body: CreateStaffLeaveDto) {
    if (body.end_date < body.start_date) throw new BadRequestException('end_date must be on or after start_date');
    const own = await currentStaffId(this.prisma, req.user);
    let staffId = own;
    if (body.staff_id && body.staff_id !== own) {
      if (!LEAVE_ON_BEHALF.includes(req.user.role)) {
        throw new ForbiddenException('You can only apply for your own leave');
      }
      staffId = body.staff_id;
    }
    if (!staffId) throw new BadRequestException('Your account has no staff record — specify staff_id');
    await assertInBranch(this.prisma, 'staff', staffId, req.user.branch_id);

    const overlap = await this.prisma.staffLeave.findFirst({
      where: {
        branchId: req.user.branch_id, staffId, status: { in: ['Pending', 'Approved'] },
        startDate: { lte: body.end_date }, endDate: { gte: body.start_date },
      },
      select: { id: true },
    });
    if (overlap) throw new BadRequestException('An overlapping leave request already exists');

    const leave = await this.prisma.staffLeave.create({
      data: {
        branchId: req.user.branch_id,
        staffId,
        leaveType: body.leave_type,
        startDate: body.start_date,
        endDate: body.end_date,
        reason: body.reason ?? null,
        status: 'Pending',
        remarks: staffId !== own ? `Filed on behalf by ${(await resolveActor(this.prisma, req.user)).name}` : null,
      },
    });
    await audit(this.prisma, req.user, 'CREATE', 'staff_leave', leave.id, staffId !== own ? `on behalf of ${staffId}` : undefined);
    return { id: leave.id, status: leave.status };
  }

  @Put('staff-leaves/:id/decision')
  @Roles(...R.LEAVE_APPROVE)
  async decideStaffLeave(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: LeaveDecisionDto) {
    const leave = await this.prisma.staffLeave.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: { staff: { select: { id: true, name: true, email: true, department: true } } },
    });
    if (!leave) throw new NotFoundException('Leave request not found');
    if (leave.status !== 'Pending') throw new BadRequestException('Leave already decided');
    const me = await this.approverContext(req);
    if (me.staffId && me.staffId === leave.staffId) throw new ForbiddenException('You cannot decide your own leave');
    if (!this.canDecide(req, me, leave.staffId, leave.staff.department)) {
      throw new ForbiddenException('HODs can only decide leave for staff in their own department');
    }
    const remarks = body.remarks?.trim() || '';
    if (body.decision === 'Rejected' && !remarks) throw new BadRequestException('remarks are required when rejecting');

    const actor = await resolveActor(this.prisma, req.user);
    const storedRemarks = me.staffId ? remarks || null : `Decided by ${actor.name} (${req.user.role})${remarks ? `: ${remarks}` : ''}`;
    await this.prisma.staffLeave.update({
      where: { id },
      data: { status: body.decision, approvedBy: me.staffId, remarks: storedRemarks },
    });
    await audit(this.prisma, req.user, body.decision === 'Approved' ? 'APPROVE' : 'REJECT', 'staff_leave', id, remarks || undefined);
    if (leave.staff.email) {
      await this.notifications.notify({
        branch_id: req.user.branch_id,
        channel: 'email',
        recipient: leave.staff.email,
        subject: `Leave ${body.decision}`,
        body: `Your ${leave.leaveType} leave (${leave.startDate} to ${leave.endDate}) was ${body.decision.toLowerCase()} by ${actor.name}.${remarks ? ` Remarks: ${remarks}` : ''}`,
        ref_type: 'staff_leave',
        ref_id: leave.id,
      });
    }
    return { success: true, status: body.decision };
  }

  /** Applicant withdraws their own Pending request. */
  @Put('staff-leaves/:id/withdraw')
  @Roles(...R.STAFF)
  async withdrawStaffLeave(@Req() req: ReqWithUser, @Param('id') id: string) {
    const leave = await this.prisma.staffLeave.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!leave) throw new NotFoundException('Leave request not found');
    const own = await currentStaffId(this.prisma, req.user);
    if (!own || own !== leave.staffId) throw new ForbiddenException('Only the applicant can withdraw this leave');
    if (leave.status !== 'Pending') throw new BadRequestException('Only pending leave can be withdrawn');
    await this.prisma.staffLeave.update({ where: { id }, data: { status: 'Withdrawn' } });
    await audit(this.prisma, req.user, 'UPDATE', 'staff_leave', id, 'withdrawn');
    return { success: true, status: 'Withdrawn' };
  }

  // ─── Student leaves ─────────────────────────────────────────

  @Get('student-leaves')
  @Roles(...STUDENT_LEAVE_READ)
  async listStudentLeaves(@Req() req: ReqWithUser, @Query('student_id') studentId?: string, @Query('status') status?: string) {
    const portal = await portalStudentIds(this.prisma, req.user);
    if (portal && studentId && !portal.includes(studentId)) throw new ForbiddenException('You can only view your own child');
    return this.prisma.studentLeave.findMany({
      where: {
        branchId: req.user.branch_id,
        ...(studentId ? { studentId } : portal ? { studentId: { in: portal } } : {}),
        ...(status ? { status } : {}),
      },
      include: { student: STUDENT_SUMMARY },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Approved student leave covering a date — for attendance marking ("On leave" instead of Absent). */
  @Get('student-leaves/on-date')
  @Roles(...R.STUDENT_READ)
  async studentLeavesOnDate(@Req() req: ReqWithUser, @Query('date') date?: string, @Query('class_id') classId?: string) {
    if (!date || !DATE_RE.test(date)) throw new BadRequestException('date (YYYY-MM-DD) is required');
    if (classId) await assertInBranch(this.prisma, 'class', classId, req.user.branch_id);
    return this.prisma.studentLeave.findMany({
      where: {
        branchId: req.user.branch_id,
        status: 'Approved',
        startDate: { lte: date },
        endDate: { gte: date },
        ...(classId ? { student: { classId } } : {}),
      },
      select: { id: true, studentId: true, leaveType: true, startDate: true, endDate: true, student: STUDENT_SUMMARY },
      orderBy: { startDate: 'asc' },
    });
  }

  @Post('student-leaves')
  @Roles(...STUDENT_LEAVE_FILE)
  async createStudentLeave(@Req() req: ReqWithUser, @Body() body: CreateStudentLeaveDto) {
    if (body.end_date < body.start_date) throw new BadRequestException('end_date must be on or after start_date');
    await assertInBranch(this.prisma, 'student', body.student_id, req.user.branch_id);
    await assertCanSeeStudent(this.prisma, req.user, body.student_id);
    const leave = await this.prisma.studentLeave.create({
      data: {
        branchId: req.user.branch_id,
        studentId: body.student_id,
        leaveType: body.leave_type,
        startDate: body.start_date,
        endDate: body.end_date,
        reason: body.reason ?? null,
        status: 'Pending',
        requestedBy: req.user.sub,
      },
    });
    await audit(this.prisma, req.user, 'CREATE', 'student_leave', leave.id);
    return { id: leave.id, status: leave.status };
  }

  @Put('student-leaves/:id/decision')
  @Roles(...R.STUDENT_LEAVE_APPROVE)
  async decideStudentLeave(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: LeaveDecisionDto) {
    const leave = await this.prisma.studentLeave.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: { student: { select: { fullName: true } } },
    });
    if (!leave) throw new NotFoundException('Leave request not found');
    if (leave.status !== 'Pending') throw new BadRequestException('Leave already decided');
    const actor = await resolveActor(this.prisma, req.user);
    const remarks = body.remarks?.trim() || '';
    await this.prisma.studentLeave.update({
      where: { id },
      data: {
        status: body.decision,
        approvedBy: actor.staffId,
        remarks: actor.staffId ? remarks || null : `Decided by ${actor.name} (${req.user.role})${remarks ? `: ${remarks}` : ''}`,
      },
    });
    await audit(this.prisma, req.user, body.decision === 'Approved' ? 'APPROVE' : 'REJECT', 'student_leave', id, remarks || undefined);
    await notifyParents(this.prisma, this.notifications, req.user.branch_id, leave.studentId, {
      subject: `Leave ${body.decision}`,
      body: `${leave.student.fullName}'s ${leave.leaveType} leave (${leave.startDate} to ${leave.endDate}) was ${body.decision.toLowerCase()}.${remarks ? ` Remarks: ${remarks}` : ''}`,
      ref_type: 'student_leave',
      ref_id: id,
    });
    return { success: true, status: body.decision };
  }

  /** The person who filed it (parent or staff) cancels a Pending request. */
  @Put('student-leaves/:id/cancel')
  @Roles(...STUDENT_LEAVE_FILE)
  async cancelStudentLeave(@Req() req: ReqWithUser, @Param('id') id: string) {
    const leave = await this.prisma.studentLeave.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!leave) throw new NotFoundException('Leave request not found');
    if (leave.requestedBy !== req.user.sub) throw new ForbiddenException('Only the person who filed this leave can cancel it');
    if (leave.status !== 'Pending') throw new BadRequestException('Only pending leave can be cancelled');
    await this.prisma.studentLeave.update({ where: { id }, data: { status: 'Cancelled' } });
    await audit(this.prisma, req.user, 'UPDATE', 'student_leave', id, 'cancelled');
    return { success: true, status: 'Cancelled' };
  }

  // ─── internals ──────────────────────────────────────────────

  private async approverContext(req: ReqWithUser) {
    const staffId = await currentStaffId(this.prisma, req.user);
    let department: string | null = null;
    if (staffId) {
      const s = await this.prisma.staff.findFirst({ where: { id: staffId, branchId: req.user.branch_id }, select: { department: true } });
      department = s?.department ?? null;
    }
    return { staffId, department };
  }

  /** HOD: same department only. HR / leadership: anyone. Nobody decides their own leave. */
  private canDecide(req: ReqWithUser, me: { staffId: string | null; department: string | null }, applicantStaffId: string, applicantDept: string | null) {
    if (me.staffId && me.staffId === applicantStaffId) return false;
    if (LEAVE_APPROVE_ANY.includes(req.user.role)) return true;
    if (req.user.role === ROLE.HOD) return !!me.department && me.department === applicantDept;
    return false;
  }
}
