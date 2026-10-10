import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import * as crypto from 'crypto';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

type ReqWithUser = { user: { sub: string; role: string; branch_id: string } };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class LeavesController {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  /** Leave balances for the current calendar year (approved leaves counted, inclusive days). */
  @Get('balances')
  async balances(@Req() req: ReqWithUser) {
    const year = new Date().getFullYear();
    const quotas: Record<string, number> = { Casual: 12, Sick: 8, Earned: 15, Duty: 10, Unpaid: 0 };
    const staff = await this.prisma.staff.findMany({
      where: { branchId: req.user.branch_id, isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
    const approved = await this.prisma.staffLeave.findMany({
      where: {
        branchId: req.user.branch_id,
        status: 'Approved',
        startDate: { lte: `${year}-12-31` },
        endDate: { gte: `${year}-01-01` },
      },
      select: { staffId: true, leaveType: true, startDate: true, endDate: true },
    });
    const inclusiveDays = (start: string, end: string) => {
      const s = new Date(start < `${year}-01-01` ? `${year}-01-01` : start);
      const e = new Date(end > `${year}-12-31` ? `${year}-12-31` : end);
      return Math.floor((e.getTime() - s.getTime()) / 86_400_000) + 1;
    };

    return staff.map((member) => {
      const leaves: Record<string, { used: number; quota: number; remaining: number }> = {};
      for (const [type, quota] of Object.entries(quotas)) {
        const used = approved
          .filter((l) => l.staffId === member.id && l.leaveType === type)
          .reduce((sum, l) => sum + Math.max(0, inclusiveDays(l.startDate, l.endDate)), 0);
        leaves[type] = { used, quota, remaining: Math.max(0, quota - used) };
      }
      return { staff_id: member.id, name: member.name, role: member.role, leaves };
    });
  }

  // ─── Staff leaves ──────────────────────────────────────

  @Get('staff-leaves')
  listStaffLeaves(@Req() req: ReqWithUser, @Query('staff_id') staffId?: string, @Query('status') status?: string) {
    return this.prisma.staffLeave.findMany({
      where: {
        branchId: req.user.branch_id,
        ...(staffId ? { staffId } : {}),
        ...(status ? { status } : {}),
      },
      include: { staff: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('staff-leaves')
  @Roles('super_admin', 'branch_admin', 'teacher', 'warden')
  async createStaffLeave(
    @Req() req: ReqWithUser,
    @Body() body: { staff_id?: string; leave_type?: string; start_date?: string; end_date?: string; reason?: string },
  ) {
    if (!body?.staff_id || !body?.leave_type || !DATE_RE.test(body.start_date ?? '') || !DATE_RE.test(body.end_date ?? '')) {
      throw new BadRequestException('staff_id, leave_type, start_date (YYYY-MM-DD) and end_date are required');
    }
    if (body.end_date! < body.start_date!) throw new BadRequestException('end_date must be on or after start_date');

    const staff = await this.prisma.staff.findFirst({
      where: { id: body.staff_id, branchId: req.user.branch_id },
    });
    if (!staff) throw new NotFoundException('Staff member not found in this branch');

    const leave = await this.prisma.staffLeave.create({
      data: {
        branchId: req.user.branch_id,
        staffId: staff.id,
        leaveType: body.leave_type,
        startDate: body.start_date!,
        endDate: body.end_date!,
        reason: body.reason ?? null,
        status: 'Pending',
      },
    });
    return { id: leave.id };
  }

  @Put('staff-leaves/:id/decision')
  @Roles('super_admin', 'branch_admin', 'principal')
  async decideStaffLeave(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: { decision?: string }) {
    if (!body?.decision || !['Approved', 'Rejected'].includes(body.decision)) {
      throw new BadRequestException("decision must be 'Approved' or 'Rejected'");
    }
    const leave = await this.prisma.staffLeave.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!leave) throw new NotFoundException('Leave request not found');
    if (leave.status !== 'Pending') throw new BadRequestException('Leave already decided');
    // approver is a Staff row; resolve it from the logged-in user (admins may have no staff row)
    const approver = await this.prisma.staff.findFirst({ where: { user: { id: req.user.sub } } });
    await this.prisma.staffLeave.update({
      where: { id },
      data: { status: body.decision, approvedBy: approver?.id ?? null },
    });
    // notify the applicant (plan: leave reuses parent-communication service)
    const staff = await this.prisma.staff.findUnique({ where: { id: leave.staffId } });
    if (staff?.email) {
      await this.notifications.notify({
        branch_id: req.user.branch_id,
        channel: 'email',
        recipient: staff.email,
        subject: `Leave ${body.decision}`,
        body: `Your ${leave.leaveType} leave (${leave.startDate} → ${leave.endDate}) was ${body.decision.toLowerCase()}.`,
        ref_type: 'staff_leave',
        ref_id: leave.id,
      });
    }
    return { success: true, status: body.decision };
  }

  // ─── Student leaves (parent/student-initiated) ─────────────

  @Get('student-leaves')
  listStudentLeaves(@Req() req: ReqWithUser, @Query('student_id') studentId?: string, @Query('status') status?: string) {
    return this.prisma.studentLeave.findMany({
      where: {
        branchId: req.user.branch_id,
        ...(studentId ? { studentId } : {}),
        ...(status ? { status } : {}),
      },
      include: { student: { select: { id: true, fullName: true, admissionNo: true, class: { select: { name: true, section: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('student-leaves')
  @Roles('super_admin', 'branch_admin', 'teacher', 'warden')
  async createStudentLeave(
    @Req() req: ReqWithUser,
    @Body() body: { student_id?: string; leave_type?: string; start_date?: string; end_date?: string; reason?: string },
  ) {
    if (!body?.student_id || !body?.leave_type || !DATE_RE.test(body.start_date ?? '') || !DATE_RE.test(body.end_date ?? '')) {
      throw new BadRequestException('student_id, leave_type, start_date and end_date are required');
    }
    if (body.end_date! < body.start_date!) throw new BadRequestException('end_date must be on or after start_date');

    const student = await this.prisma.student.findFirst({
      where: { id: body.student_id, branchId: req.user.branch_id },
    });
    if (!student) throw new NotFoundException('Student not found in this branch');

    const leave = await this.prisma.studentLeave.create({
      data: {
        branchId: req.user.branch_id,
        studentId: student.id,
        leaveType: body.leave_type,
        startDate: body.start_date!,
        endDate: body.end_date!,
        reason: body.reason ?? null,
        status: 'Pending',
      },
    });
    return { id: leave.id };
  }

  @Put('student-leaves/:id/decision')
  @Roles('super_admin', 'branch_admin', 'principal', 'warden')
  async decideStudentLeave(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: { decision?: string }) {
    if (!body?.decision || !['Approved', 'Rejected'].includes(body.decision)) {
      throw new BadRequestException("decision must be 'Approved' or 'Rejected'");
    }
    const leave = await this.prisma.studentLeave.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!leave) throw new NotFoundException('Leave request not found');
    if (leave.status !== 'Pending') throw new BadRequestException('Leave already decided');
    await this.prisma.studentLeave.update({
      where: { id },
      data: { status: body.decision, approvedBy: req.user.sub },
    });
    return { success: true, status: body.decision };
  }

  // ─── Gate passes ────────────────────────────────────────────

  @Get('gate-passes')
  listGatePasses(@Req() req: ReqWithUser, @Query('student_id') studentId?: string, @Query('status') status?: string) {
    return this.prisma.gatePass.findMany({
      where: {
        branchId: req.user.branch_id,
        ...(studentId ? { studentId } : {}),
        ...(status ? { status } : {}),
      },
      include: { student: { select: { id: true, fullName: true, admissionNo: true, class: { select: { name: true, section: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('gate-passes/:id')
  async getGatePass(@Req() req: ReqWithUser, @Param('id') id: string) {
    const pass = await this.prisma.gatePass.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: { student: { select: { id: true, fullName: true, admissionNo: true, class: { select: { name: true, section: true } } } } },
    });
    if (!pass) throw new NotFoundException('Gate pass not found');
    return pass;
  }

  @Post('gate-passes')
  @Roles('super_admin', 'branch_admin', 'warden', 'teacher')
  async createGatePass(
    @Req() req: ReqWithUser,
    @Body() body: { student_id?: string; type?: string; reason?: string; out_time?: string; expected_in_time?: string },
  ) {
    if (!body?.student_id || !body?.type || !body?.reason || !body?.out_time) {
      throw new BadRequestException('student_id, type, reason and out_time are required');
    }
    const student = await this.prisma.student.findFirst({ where: { id: body.student_id, branchId: req.user.branch_id } });
    if (!student) throw new NotFoundException('Student not found');

    const pass = await this.prisma.gatePass.create({
      data: {
        branchId: req.user.branch_id,
        studentId: body.student_id,
        type: body.type,
        reason: body.reason,
        outTime: body.out_time,
        expectedInTime: body.expected_in_time ?? null,
        status: 'Pending',
        parentOtp: String(Math.floor(100000 + Math.random() * 900000)), // demo OTP; SMS via NotificationsService in prod
      },
    });
    // plan: auto-notify parent when a gate pass is issued
    if (student.mobileNumber) {
      await this.notifications.notify({
        branch_id: req.user.branch_id,
        channel: 'sms',
        recipient: student.mobileNumber,
        body: `Gate pass issued for ${student.fullName} (${pass.type}) at ${body.out_time}. OTP: ${pass.parentOtp}`,
        ref_type: 'gate_pass',
        ref_id: pass.id,
      });
    }
    return { id: pass.id };
  }

  @Put('gate-passes/:id/approve-warden')
  @Roles('super_admin', 'branch_admin', 'warden')
  async approveWarden(@Req() req: ReqWithUser, @Param('id') id: string) {
    const pass = await this.prisma.gatePass.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!pass) throw new NotFoundException('Gate pass not found');
    if (pass.status !== 'Pending') throw new BadRequestException('Pass is not pending warden approval');
    await this.prisma.gatePass.update({
      where: { id },
      data: { status: 'Warden Approved', approvedByWarden: req.user.sub },
    });
    return { success: true, status: 'Warden Approved' };
  }

  @Put('gate-passes/:id/approve-principal')
  @Roles('super_admin', 'branch_admin', 'principal')
  async approvePrincipal(@Req() req: ReqWithUser, @Param('id') id: string) {
    const pass = await this.prisma.gatePass.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!pass) throw new NotFoundException('Gate pass not found');
    if (pass.status !== 'Warden Approved') throw new BadRequestException('Pass must be warden-approved first');
    await this.prisma.gatePass.update({
      where: { id },
      data: { status: 'Approved', approvedByPrincipal: req.user.sub },
    });
    return { success: true, status: 'Approved' };
  }

  @Put('gate-passes/:id/checkout')
  @Roles('super_admin', 'branch_admin', 'warden')
  async checkout(@Req() req: ReqWithUser, @Param('id') id: string) {
    const pass = await this.prisma.gatePass.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!pass) throw new NotFoundException('Gate pass not found');
    if (pass.status !== 'Approved') throw new BadRequestException('Pass must be fully approved before checkout');
    await this.prisma.gatePass.update({
      where: { id },
      data: { status: 'Checked Out' },
    });
    return { success: true, status: 'Checked Out' };
  }

  @Put('gate-passes/:id/checkin')
  @Roles('super_admin', 'branch_admin', 'warden')
  async checkin(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: { otp?: string }) {
    const pass = await this.prisma.gatePass.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!pass) throw new NotFoundException('Gate pass not found');
    if (pass.status !== 'Checked Out') throw new BadRequestException('Student has not checked out yet');
    if (pass.parentOtp) {
      const providedOtp = (body?.otp ?? '').trim();
      const expectedOtp = pass.parentOtp.trim();
      if (!providedOtp || providedOtp.length !== expectedOtp.length) {
        throw new BadRequestException('Invalid parent OTP');
      }
      // Constant-time comparison to prevent side-channel timing attacks
      const isMatch = crypto.timingSafeEqual(Buffer.from(providedOtp, 'utf8'), Buffer.from(expectedOtp, 'utf8'));
      if (!isMatch) {
        throw new BadRequestException('Invalid parent OTP');
      }
    }
    await this.prisma.gatePass.update({
      where: { id },
      data: { status: 'Returned', actualInTime: new Date().toISOString(), otpVerified: true },
    });
    return { success: true, status: 'Returned' };
  }
}
