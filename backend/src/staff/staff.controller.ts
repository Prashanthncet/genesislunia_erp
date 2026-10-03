import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { GeneratePayslipsDto, SalaryStructureDto } from '../discipline/dto/discipline.dto';

type ReqWithUser = { user: { sub: string; role: string; branch_id: string } };

const MONTH_RE = /^\d{4}-\d{2}$/;

@Controller('staff')
@UseGuards(AuthGuard, RolesGuard)
export class StaffController {
  constructor(private prisma: PrismaService) {}

  // ─── Staff management CRUD ──────────────────────────────────

  @Get()
  list(@Req() req: ReqWithUser, @Query('role') role?: string, @Query('q') q?: string) {
    return this.prisma.staff.findMany({
      where: {
        branchId: req.user.branch_id,
        ...(role ? { role } : {}),
        ...(q ? { name: { contains: q } } : {}),
      },
      include: { salaryStructure: true, user: { select: { id: true, email: true, role: true } } },
      orderBy: { name: 'asc' },
    });
  }

  // NOTE: literal sub-routes MUST be declared before @Get(':id') or Nest shadows them.
  @Get('salaries')
  listSalaries(@Req() req: ReqWithUser) {
    return this.prisma.salaryStructure.findMany({
      where: { staff: { branchId: req.user.branch_id } },
      include: { staff: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { staffId: 'asc' },
    });
  }

  @Get('payslips')
  listPayslips(@Req() req: ReqWithUser, @Query('month') month?: string, @Query('staff_id') staffId?: string) {
    return this.prisma.payslip.findMany({
      where: {
        branchId: req.user.branch_id,
        ...(month ? { monthYear: month } : {}),
        ...(staffId ? { staffId } : {}),
      },
      include: { staff: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { monthYear: 'desc' },
    });
  }

  @Get(':id')
  async get(@Req() req: ReqWithUser, @Param('id') id: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: {
        salaryStructure: true,
        leaves: { orderBy: { startDate: 'desc' }, take: 20 },
        payslips: { orderBy: { monthYear: 'desc' }, take: 12 },
      },
    });
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff;
  }

  @Post()
  @Roles('super_admin', 'branch_admin')
  async create(
    @Req() req: ReqWithUser,
    @Body() body: { name?: string; email?: string; role?: string; subjects?: string; max_periods_per_day?: number; phone?: string; department?: string },
  ) {
    if (!body?.name || !body?.email) throw new BadRequestException('name and email are required');
    try {
      const staff = await this.prisma.staff.create({
        data: {
          branchId: req.user.branch_id,
          name: body.name,
          email: body.email,
          role: body.role ?? 'Teacher',
          subjects: body.subjects ?? null,
          maxPeriodsPerDay: body.max_periods_per_day ?? 6,
          isActive: true,
        },
      });
      return { id: staff.id };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Unique constraint')) throw new ConflictException('A staff member with this email already exists in this branch');
      throw err;
    }
  }

  @Put(':id')
  @Roles('super_admin', 'branch_admin')
  async update(
    @Req() req: ReqWithUser,
    @Param('id') id: string,
    @Body() body: { name?: string; email?: string; role?: string; subjects?: string; max_periods_per_day?: number; is_active?: boolean },
  ) {
    const existing = await this.prisma.staff.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Staff member not found');
    try {
      const staff = await this.prisma.staff.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.email !== undefined ? { email: body.email } : {}),
          ...(body.role !== undefined ? { role: body.role } : {}),
          ...(body.subjects !== undefined ? { subjects: body.subjects } : {}),
          ...(body.max_periods_per_day !== undefined ? { maxPeriodsPerDay: body.max_periods_per_day } : {}),
          ...(body.is_active !== undefined ? { isActive: body.is_active } : {}),
        },
      });
      return { id: staff.id, success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Unique constraint')) throw new ConflictException('Email already in use in this branch');
      throw err;
    }
  }

  @Delete(':id')
  @Roles('super_admin', 'branch_admin')
  async remove(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.staff.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: { _count: { select: { timetable: true, payslips: true } } },
    });
    if (!existing) throw new NotFoundException('Staff member not found');
    if (existing._count.timetable > 0 || existing._count.payslips > 0) {
      // soft-deactivate: staff with history must not be hard-deleted
      await this.prisma.staff.update({ where: { id }, data: { isActive: false } });
      return { success: true, deactivated: true };
    }
    await this.prisma.staff.delete({ where: { id } });
    return { success: true, deactivated: false };
  }

  // ─── Salary structures ──────────────────────────────────────

  @Put('salaries/:staffId')
  @Roles('super_admin', 'branch_admin')
  async upsertSalary(
    @Req() req: ReqWithUser,
    @Param('staffId') staffId: string,
    @Body() body: SalaryStructureDto,
  ) {
    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, branchId: req.user.branch_id } });
    if (!staff) throw new NotFoundException('Staff member not found');
    const salary = await this.prisma.salaryStructure.upsert({
      where: { staffId },
      create: {
        staffId,
        basicSalary: body.basic_salary,
        hra: body.hra ?? 0,
        da: body.da ?? 0,
        tdsPercent: body.tds_percent ?? 0,
        epfPercent: body.epf_percent ?? 12,
      },
      update: {
        ...(body.basic_salary !== undefined ? { basicSalary: body.basic_salary } : {}),
        ...(body.hra !== undefined ? { hra: body.hra } : {}),
        ...(body.da !== undefined ? { da: body.da } : {}),
        ...(body.tds_percent !== undefined ? { tdsPercent: body.tds_percent } : {}),
        ...(body.epf_percent !== undefined ? { epfPercent: body.epf_percent } : {}),
      },
    });
    return { id: salary.id, success: true };
  }

  // ─── Payroll ────────────────────────────────────────────────

  /**
   * Generate payslips for all staff with a salary structure.
   * Unpaid-leave days dock basic/30 per day. If `unpaid_leave_days` is not supplied,
   * they are AUTO-PULLED from Approved 'Unpaid' leaves overlapping the month.
   */
  @Post('payslips/generate')
  @Roles('super_admin', 'branch_admin')
  async generatePayslips(@Req() req: ReqWithUser, @Body() body: { month?: string; unpaid_leave_days?: Record<string, number> }) {
    if (!body?.month || !MONTH_RE.test(body.month)) {
      throw new BadRequestException('month is required in YYYY-MM format');
    }
    const staff = await this.prisma.staff.findMany({
      where: { branchId: req.user.branch_id, isActive: true, salaryStructure: { isNot: null } },
      include: { salaryStructure: true },
    });

    // Auto-pull unpaid-leave days from approved leaves unless an explicit map was passed.
    let unpaidDaysByStaff = body.unpaid_leave_days;
    if (!unpaidDaysByStaff) {
      const [y, m] = body.month.split('-').map(Number);
      const monthStart = `${body.month}-01`;
      const monthEnd = `${body.month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
      const unpaidLeaves = await this.prisma.staffLeave.findMany({
        where: {
          branchId: req.user.branch_id,
          status: 'Approved',
          leaveType: 'Unpaid',
          startDate: { lte: monthEnd },
          endDate: { gte: monthStart },
        },
        select: { staffId: true, startDate: true, endDate: true },
      });
      unpaidDaysByStaff = {};
      for (const l of unpaidLeaves) {
        const s = new Date(l.startDate < monthStart ? monthStart : l.startDate);
        const e = new Date(l.endDate > monthEnd ? monthEnd : l.endDate);
        const days = Math.max(0, Math.floor((e.getTime() - s.getTime()) / 86_400_000) + 1);
        unpaidDaysByStaff[l.staffId] = (unpaidDaysByStaff[l.staffId] ?? 0) + days;
      }
    }

    const generated: string[] = [];
    const skipped: string[] = [];
    for (const member of staff) {
      const dup = await this.prisma.payslip.findFirst({
        where: { staffId: member.id, monthYear: body.month },
      });
      if (dup) {
        skipped.push(member.id);
        continue; // idempotent per month
      }
      const sal = member.salaryStructure!;
      const basic = sal.basicSalary;
      const gross = basic + sal.hra + sal.da;
      const unpaidDays = unpaidDaysByStaff[member.id] ?? 0;
      const unpaidDeduction = Math.round((basic / 30) * unpaidDays * 100) / 100;
      const tds = Math.round(((gross * sal.tdsPercent) / 100) * 100) / 100;
      const epf = Math.round(((basic * sal.epfPercent) / 100) * 100) / 100;
      const net = Math.round((gross - tds - epf - unpaidDeduction) * 100) / 100;

      const payslip = await this.prisma.payslip.create({
        data: {
          branchId: req.user.branch_id,
          staffId: member.id,
          monthYear: body.month,
          basicSalary: basic,
          hra: sal.hra,
          da: sal.da,
          grossSalary: gross,
          tdsDeduction: tds,
          epfDeduction: epf,
          otherDeductions: unpaidDeduction,
          netSalary: net,
          status: 'Generated',
        },
      });
      generated.push(payslip.id);
    }
    return { generated: generated.length, skipped: skipped.length, payslip_ids: generated };
  }

  @Put('payslips/:id/mark-paid')
  @Roles('super_admin', 'branch_admin')
  async markPaid(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.payslip.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Payslip not found');
    await this.prisma.payslip.update({ where: { id }, data: { status: 'Paid' } });
    return { success: true, status: 'Paid' };
  }
}
