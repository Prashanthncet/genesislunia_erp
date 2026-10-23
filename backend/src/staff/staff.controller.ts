import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Put, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { R } from '../auth/roles';
import { assertInBranch, audit, currentStaffId, ReqWithUser } from '../common/access';
import { buildPdf, sendPdf } from '../common/pdf';
import { PrismaService } from '../prisma/prisma.service';
import { computePayslip, deriveUnpaidDays, LEAVE_QUOTAS, monthBounds } from './payroll';
import {
  FY2025_26, monthlyTds, PT_PRESETS, PayrollRules, resolvePayrollRules, StoredPayrollConfig, validatePayrollConfig,
} from './payroll-tax';
import {
  CreateStaffDto, FinalizePayslipsDto, GeneratePayslipsDto, PayrollConfigDto, SalaryStructureDto, TaxPreviewDto, UpdateStaffDto,
} from './staff.dto';
import { textContains } from '../common/search';

/** Directory fields only — salary data never leaves through the directory. */
const DIRECTORY_SELECT = {
  id: true, name: true, email: true, role: true, department: true, phone: true, subjects: true,
  maxPeriodsPerDay: true, isActive: true,
  user: { select: { id: true, email: true, role: true, isActive: true } },
} as const;

const PAYSLIP_STAFF = { select: { id: true, name: true, email: true, role: true, department: true } } as const;
/** Payslips a staff member may see of their own: drafts stay with payroll until generated. */
const RELEASED = ['Generated', 'Paid'];

const isPayroll = (role: string) => (R.PAYROLL as string[]).includes(role);
const uniqueErr = (err: unknown) => err instanceof Error && err.message.includes('Unique constraint');

@Controller('staff')
@UseGuards(AuthGuard, RolesGuard)
export class StaffController {
  constructor(private prisma: PrismaService) {}

  // ─── Directory ──────────────────────────────────────────────

  @Get()
  @Roles(...R.STAFF_DIRECTORY)
  list(
    @Req() req: ReqWithUser,
    @Query('role') role?: string,
    @Query('department') department?: string,
    @Query('login_role') loginRole?: string,
    @Query('q') q?: string,
    @Query('active') active?: string,
  ) {
    return this.prisma.staff.findMany({
      where: {
        branchId: req.user.branch_id,
        ...(role ? { role } : {}),
        ...(department ? { department } : {}),
        ...(loginRole ? { user: { is: { role: loginRole } } } : {}),
        ...(active === 'true' ? { isActive: true } : active === 'false' ? { isActive: false } : {}),
        ...(q ? { OR: [{ name: textContains(q) }, { email: textContains(q) }, { phone: textContains(q) }] } : {}),
      },
      select: DIRECTORY_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  // NOTE: literal sub-routes MUST be declared before @Get(':id') or Nest shadows them.

  /** Distinct designations and departments, for the directory filters. */
  @Get('filters')
  @Roles(...R.STAFF_DIRECTORY)
  async filters(@Req() req: ReqWithUser) {
    const rows = await this.prisma.staff.findMany({ where: { branchId: req.user.branch_id }, select: { role: true, department: true } });
    const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();
    return { roles: uniq(rows.map((r) => r.role)), departments: uniq(rows.map((r) => r.department)) };
  }

  /** The caller's own staff profile (every staff role). */
  @Get('me')
  @Roles(...R.STAFF)
  async me(@Req() req: ReqWithUser) {
    const id = await currentStaffId(this.prisma, req.user);
    if (!id) throw new NotFoundException('Your login is not linked to a staff record');
    return this.prisma.staff.findUnique({
      where: { id },
      select: {
        ...DIRECTORY_SELECT,
        salaryStructure: true, // their own — fine to show them
        leaves: { orderBy: { startDate: 'desc' }, take: 20 },
      },
    });
  }

  /** The caller's own released payslips. */
  @Get('me/payslips')
  @Roles(...R.STAFF)
  async myPayslips(@Req() req: ReqWithUser) {
    const id = await currentStaffId(this.prisma, req.user);
    if (!id) return [];
    return this.prisma.payslip.findMany({
      where: { branchId: req.user.branch_id, staffId: id, status: { in: RELEASED } },
      orderBy: { monthYear: 'desc' },
    });
  }

  @Get('salaries')
  @Roles(...R.PAYROLL)
  listSalaries(@Req() req: ReqWithUser) {
    return this.prisma.salaryStructure.findMany({
      where: { staff: { branchId: req.user.branch_id } },
      include: { staff: PAYSLIP_STAFF },
      orderBy: { staffId: 'asc' },
    });
  }

  @Get('payslips')
  @Roles(...R.PAYROLL)
  listPayslips(@Req() req: ReqWithUser, @Query('month') month?: string, @Query('staff_id') staffId?: string, @Query('status') status?: string) {
    return this.prisma.payslip.findMany({
      where: {
        branchId: req.user.branch_id,
        ...(month ? { monthYear: month } : {}),
        ...(staffId ? { staffId } : {}),
        ...(status ? { status } : {}),
      },
      include: { staff: PAYSLIP_STAFF },
      orderBy: [{ monthYear: 'desc' }, { staffId: 'asc' }],
    });
  }

  /** Payslip PDF: payroll roles for anyone; everyone else only their own released slip. */
  @Get('payslips/:id/pdf')
  @Roles(...R.STAFF)
  async payslipPdf(@Req() req: ReqWithUser, @Param('id') id: string, @Res() res: Response) {
    const slip = await this.prisma.payslip.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: { staff: { select: { id: true, name: true, email: true, role: true, department: true } }, branch: { select: { name: true, location: true } } },
    });
    if (!slip) throw new NotFoundException('Payslip not found');
    if (!isPayroll(req.user.role)) {
      const mine = await currentStaffId(this.prisma, req.user);
      if (mine !== slip.staffId || !RELEASED.includes(slip.status)) throw new ForbiddenException('You can only download your own payslip');
    }
    const sal = await this.prisma.salaryStructure.findUnique({ where: { staffId: slip.staffId }, select: { taxMode: true, taxRegime: true } });
    const regime = !sal ? '' : sal.taxMode === 'flat' ? ' - flat rate' : ` - ${sal.taxRegime === 'old' ? 'old' : 'new'} regime`;
    const inr = (n: number) => `Rs. ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const pdf = await buildPdf({
      school: slip.branch.name,
      schoolLine: slip.branch.location ?? undefined,
      title: `Payslip — ${slip.monthYear}`,
      reference: `PAY-${slip.monthYear}-${slip.id.slice(0, 8).toUpperCase()}`,
      blocks: [
        { kind: 'fields', rows: [
          ['Employee', slip.staff.name], ['Employee ID', slip.staff.id],
          ['Designation', slip.staff.role], ['Department', slip.staff.department ?? '—'],
          ['Pay period', slip.monthYear], ['Status', slip.paidAt ? `Paid on ${slip.paidAt.toISOString().slice(0, 10)}` : slip.status],
        ] },
        { kind: 'heading', text: 'Earnings' },
        { kind: 'table', head: ['Component', 'Amount'], widths: [340, 159], rows: [
          ['Basic salary', inr(slip.basicSalary)], ['House rent allowance (HRA)', inr(slip.hra)],
          ['Dearness allowance (DA)', inr(slip.da)], ['Gross salary', inr(slip.grossSalary)],
        ] },
        { kind: 'heading', text: 'Deductions' },
        { kind: 'table', head: ['Component', 'Amount'], widths: [340, 159], rows: [
          [`Income tax (TDS)${regime}`, inr(slip.tdsDeduction)], ['Professional tax', inr(slip.professionalTax)],
          ['Provident fund (EPF)', inr(slip.epfDeduction)],
          [`Unpaid leave (${slip.unpaidDays} day${slip.unpaidDays === 1 ? '' : 's'})`, inr(slip.otherDeductions)],
          ['Total deductions', inr(slip.tdsDeduction + slip.professionalTax + slip.epfDeduction + slip.otherDeductions)],
        ] },
        { kind: 'fields', rows: [['Net pay', inr(slip.netSalary)]] },
        { kind: 'text', text: 'Unpaid days are approved Unpaid leave plus leave taken beyond the annual quota for its type (Casual 12, Sick 8, Earned 15, Duty 10), docked at basic / 30 per day. Slab-mode income tax is the projected annual tax on this month\'s gross x 12 (FY 2025-26 slabs, section 87A rebate, 4% cess) divided by 12; the year-end figure on Form 16 may differ.' },
      ],
    });
    await audit(this.prisma, req.user, 'EXPORT', 'payslip', slip.id, `payslip pdf ${slip.monthYear}`);
    return sendPdf(res, pdf, `payslip-${slip.monthYear}-${slip.staff.name}.pdf`);
  }

  // ─── Payroll settings (deduction rules) ─────────────────────

  /** The school's stored settings, the effective rules and the available presets. */
  @Get('payroll-config')
  @Roles(...R.PAYROLL)
  async getPayrollConfig(@Req() req: ReqWithUser) {
    const stored = await this.storedConfig(req.user.branch_id);
    return {
      stored,
      effective: resolvePayrollRules(stored),
      defaults_version: FY2025_26.version,
      notice: 'Rates as of FY 2025-26 — confirm with your CA before running payroll',
      pt_presets: Object.entries(PT_PRESETS).map(([id, p]) => ({ id, label: p.label, slabs: p.slabs })),
    };
  }

  @Put('payroll-config')
  @Roles(...R.PAYROLL)
  async putPayrollConfig(@Req() req: ReqWithUser, @Body() body: PayrollConfigDto) {
    const next: StoredPayrollConfig = { ...(await this.storedConfig(req.user.branch_id)) };
    if (body.professional_tax_preset !== undefined) next.professional_tax_preset = body.professional_tax_preset;
    if (body.professional_tax_slabs !== undefined) {
      next.professional_tax_slabs = body.professional_tax_slabs.map((s) => ({
        min: s.min, max: s.max ?? null, amount: s.amount, ...(s.februaryAmount !== undefined ? { februaryAmount: s.februaryAmount } : {}),
      }));
    }
    if (body.epf_wage_ceiling !== undefined) next.epf_wage_ceiling = body.epf_wage_ceiling ? body.epf_wage_ceiling : null;
    if (body.tax_overrides !== undefined) next.tax_overrides = body.tax_overrides as StoredPayrollConfig['tax_overrides'];
    if (next.professional_tax_preset !== 'custom') delete next.professional_tax_slabs;
    const err = validatePayrollConfig(next);
    if (err) throw new BadRequestException(err);
    const json = JSON.stringify(next);
    await this.prisma.payrollConfig.upsert({
      where: { branchId: req.user.branch_id },
      create: { branchId: req.user.branch_id, config: json },
      update: { config: json },
    });
    await audit(this.prisma, req.user, 'UPDATE', 'payroll_config', req.user.branch_id, json.slice(0, 500));
    return this.getPayrollConfig(req);
  }

  /** One month's TDS for a salary under this school's rules (helper for the salary form). */
  @Post('payroll/tax-preview')
  @Roles(...R.PAYROLL)
  async taxPreview(@Req() req: ReqWithUser, @Body() body: TaxPreviewDto) {
    const rules = await this.rules(req.user.branch_id);
    const t = monthlyTds(body.monthly_gross, body.tax_regime ?? 'new', body.annual_deductions ?? 0, rules);
    return { version: rules.version, monthly_tds: t.monthly, annual: t.annual };
  }

  @Get(':id')
  @Roles(...R.STAFF_DIRECTORY)
  async get(@Req() req: ReqWithUser, @Param('id') id: string) {
    const payroll = isPayroll(req.user.role);
    const staff = await this.prisma.staff.findFirst({
      where: { id, branchId: req.user.branch_id },
      select: {
        ...DIRECTORY_SELECT,
        leaves: { orderBy: { startDate: 'desc' }, take: 20 },
        ...(payroll ? { salaryStructure: true, payslips: { orderBy: { monthYear: 'desc' }, take: 12 } } : {}),
      },
    });
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff;
  }

  // ─── Profile management (HR / admins) ───────────────────────

  @Post()
  @Roles(...R.STAFF_ADMIN)
  async create(@Req() req: ReqWithUser, @Body() body: CreateStaffDto) {
    try {
      const staff = await this.prisma.staff.create({
        data: {
          branchId: req.user.branch_id,
          name: body.name.trim(),
          email: body.email.trim().toLowerCase(),
          role: body.role?.trim() || 'Teacher',
          department: body.department?.trim() || null,
          phone: body.phone?.trim() || null,
          subjects: body.subjects ?? null,
          maxPeriodsPerDay: body.max_periods_per_day ?? 6,
          isActive: true,
        },
      });
      await audit(this.prisma, req.user, 'CREATE', 'staff', staff.id, staff.name);
      return { id: staff.id };
    } catch (err: unknown) {
      if (uniqueErr(err)) throw new ConflictException('A staff member with this email already exists in this branch');
      throw err;
    }
  }

  /** Partial update: fields that are not sent are left alone (maxPeriodsPerDay included). */
  @Put(':id')
  @Roles(...R.STAFF_ADMIN)
  async update(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: UpdateStaffDto) {
    await assertInBranch(this.prisma, 'staff', id, req.user.branch_id);
    try {
      await this.prisma.staff.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.email !== undefined ? { email: body.email.trim().toLowerCase() } : {}),
          ...(body.role !== undefined ? { role: body.role.trim() } : {}),
          ...(body.department !== undefined ? { department: body.department.trim() || null } : {}),
          ...(body.phone !== undefined ? { phone: body.phone.trim() || null } : {}),
          ...(body.subjects !== undefined ? { subjects: body.subjects } : {}),
          ...(body.max_periods_per_day !== undefined ? { maxPeriodsPerDay: body.max_periods_per_day } : {}),
          ...(body.is_active !== undefined ? { isActive: body.is_active } : {}),
        },
      });
      await audit(this.prisma, req.user, 'UPDATE', 'staff', id, Object.keys(body).join(','));
      return { id, success: true };
    } catch (err: unknown) {
      if (uniqueErr(err)) throw new ConflictException('Email already in use in this branch');
      throw err;
    }
  }

  @Delete(':id')
  @Roles(...R.STAFF_ADMIN)
  async remove(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.staff.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: { _count: { select: { timetable: true, payslips: true } }, user: { select: { id: true } } },
    });
    if (!existing) throw new NotFoundException('Staff member not found');
    if (existing._count.timetable > 0 || existing._count.payslips > 0 || existing.user) {
      // Staff with history (or a login) must not be hard-deleted: deactivate instead.
      await this.prisma.staff.update({ where: { id }, data: { isActive: false } });
      await audit(this.prisma, req.user, 'UPDATE', 'staff', id, 'deactivated');
      return { success: true, deactivated: true };
    }
    await this.prisma.salaryStructure.deleteMany({ where: { staffId: id } });
    await this.prisma.staff.delete({ where: { id } });
    await audit(this.prisma, req.user, 'DELETE', 'staff', id, existing.name);
    return { success: true, deactivated: false };
  }

  // ─── Salary structures ──────────────────────────────────────

  @Put('salaries/:staffId')
  @Roles(...R.PAYROLL)
  async upsertSalary(@Req() req: ReqWithUser, @Param('staffId') staffId: string, @Body() body: SalaryStructureDto) {
    await assertInBranch(this.prisma, 'staff', staffId, req.user.branch_id);
    // Legacy clients send only tds_percent: that means a flat rate.
    const taxMode = body.tax_mode ?? (body.tds_percent !== undefined ? 'flat' : undefined);
    const tax = {
      ...(taxMode !== undefined ? { taxMode } : {}),
      ...(body.tax_regime !== undefined ? { taxRegime: body.tax_regime } : {}),
      ...(body.annual_deductions !== undefined ? { annualDeductions: body.annual_deductions } : {}),
    };
    const salary = await this.prisma.salaryStructure.upsert({
      where: { staffId },
      create: {
        staffId,
        basicSalary: body.basic_salary,
        hra: body.hra ?? 0,
        da: body.da ?? 0,
        tdsPercent: body.tds_percent ?? 0,
        epfPercent: body.epf_percent ?? 12,
        ...tax,
      },
      update: {
        basicSalary: body.basic_salary,
        ...(body.hra !== undefined ? { hra: body.hra } : {}),
        ...(body.da !== undefined ? { da: body.da } : {}),
        ...(body.tds_percent !== undefined ? { tdsPercent: body.tds_percent } : {}),
        ...(body.epf_percent !== undefined ? { epfPercent: body.epf_percent } : {}),
        ...tax,
      },
    });
    await audit(this.prisma, req.user, 'UPDATE', 'salary_structure', salary.id, `staff ${staffId}`);
    return { id: salary.id, success: true };
  }

  // ─── Payroll ────────────────────────────────────────────────

  /** What a run for `month` would dock, per staff — shown before generating. */
  @Get('payslips/unpaid-preview')
  @Roles(...R.PAYROLL)
  async unpaidPreview(@Req() req: ReqWithUser, @Query('month') month?: string) {
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('month is required in YYYY-MM format');
    const derived = await this.derivedUnpaid(req.user.branch_id, month);
    return { month, quotas: LEAVE_QUOTAS, unpaid: derived };
  }

  /**
   * Generate payslips for every active staff member with a salary structure.
   * Unpaid days default to the rule in payroll.ts (Unpaid leave + quota overrun);
   * `unpaid_leave_days` overrides it per staff. Existing Generated/Paid slips are skipped;
   * Draft slips for the month are recomputed.
   */
  @Post('payslips/generate')
  @Roles(...R.PAYROLL)
  async generatePayslips(@Req() req: ReqWithUser, @Body() body: GeneratePayslipsDto) {
    const branchId = req.user.branch_id;
    const { days: daysInMonth } = monthBounds(body.month);

    const overrides: Record<string, number> = {};
    if (body.unpaid_leave_days) {
      const entries = Object.entries(body.unpaid_leave_days);
      if (entries.length > 2000) throw new BadRequestException('Too many unpaid_leave_days entries');
      for (const [staffId, raw] of entries) {
        const v = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > daysInMonth || Math.round(v * 2) !== v * 2) {
          throw new BadRequestException(`unpaid_leave_days for ${staffId} must be between 0 and ${daysInMonth} (half days allowed)`);
        }
        overrides[staffId] = v;
      }
      const ids = Object.keys(overrides);
      const known = await this.prisma.staff.count({ where: { id: { in: ids }, branchId } });
      if (known !== ids.length) throw new BadRequestException('unpaid_leave_days contains staff that are not in this school');
    }

    const derived = await this.derivedUnpaid(branchId, body.month);
    const rules = await this.rules(branchId);
    const staff = await this.prisma.staff.findMany({
      where: { branchId, isActive: true, salaryStructure: { isNot: null } },
      include: { salaryStructure: true },
    });
    const existing = await this.prisma.payslip.findMany({ where: { branchId, monthYear: body.month }, select: { id: true, staffId: true, status: true } });
    const existingBy = new Map(existing.map((p) => [p.staffId, p]));

    const status = body.as_draft ? 'Draft' : 'Generated';
    const generated: string[] = [];
    let skipped = 0;
    let recomputed = 0;
    for (const member of staff) {
      const prior = existingBy.get(member.id);
      if (prior && prior.status !== 'Draft') {
        skipped++;
        continue; // idempotent per month once released
      }
      const unpaidDays = Math.min(daysInMonth, overrides[member.id] ?? derived[member.id]?.days ?? 0);
      const p = computePayslip(member.salaryStructure!, unpaidDays, body.month, rules);
      const data = {
        basicSalary: p.basic, hra: p.hra, da: p.da, grossSalary: p.gross,
        tdsDeduction: p.tds, epfDeduction: p.epf, professionalTax: p.pt, otherDeductions: p.unpaidDeduction, netSalary: p.net,
        unpaidDays, status, generatedAt: new Date(),
      };
      if (prior) {
        await this.prisma.payslip.update({ where: { id: prior.id }, data });
        generated.push(prior.id);
        recomputed++;
      } else {
        const slip = await this.prisma.payslip.create({ data: { ...data, branchId, staffId: member.id, monthYear: body.month } });
        generated.push(slip.id);
      }
    }
    await audit(this.prisma, req.user, 'CREATE', 'payroll_run', body.month, `${generated.length} ${status}, ${skipped} skipped, rules ${rules.version}`);
    return { generated: generated.length, recomputed, skipped, status, payslip_ids: generated, rules_version: rules.version };
  }

  /** Draft → Generated for a whole month (releases the slips to staff). */
  @Post('payslips/finalize')
  @Roles(...R.PAYROLL)
  async finalizeMonth(@Req() req: ReqWithUser, @Body() body: FinalizePayslipsDto) {
    const res = await this.prisma.payslip.updateMany({
      where: { branchId: req.user.branch_id, monthYear: body.month, status: 'Draft' },
      data: { status: 'Generated' },
    });
    await audit(this.prisma, req.user, 'APPROVE', 'payroll_run', body.month, `${res.count} finalized`);
    return { finalized: res.count };
  }

  /** Draft → Generated for one slip. */
  @Put('payslips/:id/finalize')
  @Roles(...R.PAYROLL)
  async finalizeOne(@Req() req: ReqWithUser, @Param('id') id: string) {
    const slip = await this.prisma.payslip.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!slip) throw new NotFoundException('Payslip not found');
    if (slip.status !== 'Draft') throw new ConflictException(`Payslip is already ${slip.status}`);
    await this.prisma.payslip.update({ where: { id }, data: { status: 'Generated' } });
    return { success: true, status: 'Generated' };
  }

  /** Generated → Paid (records paidAt). Drafts must be finalized first. */
  @Put('payslips/:id/mark-paid')
  @Roles(...R.PAYROLL)
  async markPaid(@Req() req: ReqWithUser, @Param('id') id: string) {
    const slip = await this.prisma.payslip.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!slip) throw new NotFoundException('Payslip not found');
    if (slip.status === 'Paid') throw new ConflictException('Payslip is already paid');
    if (slip.status !== 'Generated') throw new ConflictException('Finalize the draft before marking it paid');
    const paidAt = new Date();
    await this.prisma.payslip.update({ where: { id }, data: { status: 'Paid', paidAt } });
    await audit(this.prisma, req.user, 'APPROVE', 'payslip', id, `paid ${slip.monthYear}`);
    return { success: true, status: 'Paid', paid_at: paidAt };
  }

  private async storedConfig(branchId: string): Promise<StoredPayrollConfig> {
    const row = await this.prisma.payrollConfig.findUnique({ where: { branchId } });
    if (!row) return {};
    try {
      return JSON.parse(row.config) as StoredPayrollConfig;
    } catch {
      return {};
    }
  }

  private async rules(branchId: string): Promise<PayrollRules> {
    return resolvePayrollRules(await this.storedConfig(branchId));
  }

  private async derivedUnpaid(branchId: string, month: string) {
    const { year, end } = monthBounds(month);
    const leaves = await this.prisma.staffLeave.findMany({
      where: { branchId, status: 'Approved', leaveType: { in: Object.keys(LEAVE_QUOTAS) }, startDate: { lte: end }, endDate: { gte: `${year}-01-01` } },
      select: { staffId: true, leaveType: true, startDate: true, endDate: true },
    });
    return deriveUnpaidDays(month, leaves);
  }
}
