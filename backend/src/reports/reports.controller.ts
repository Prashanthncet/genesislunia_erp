import { BadRequestException, Controller, ForbiddenException, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { R, ROLE } from '../auth/roles';
import { audit, AuthUser } from '../common/access';
import { PrismaService } from '../prisma/prisma.service';
import { ReportCacheService } from './report-cache.service';
import { CONTENT_TYPES, ExportFormat, FilterQuery, parseFilters, renderTable } from './report-utils';
import { ReportsService } from './reports.service';

type Req_ = { user: AuthUser };
type Q = FilterQuery & { fresh?: string; format?: string };

/** Who may export which report. Student PII is narrower than the aggregate reports. */
const EXPORT_ROLES: Record<string, string[]> = {
  students: [...R.LEADERSHIP, ROLE.OFFICE_SUPERINTENDENT],
  fees: R.FEES_READ,
  'fee-summary': R.FEES_READ,
  defaulters: R.FEES_READ,
  attendance: R.REPORTS,
  'attendance-summary': R.REPORTS,
  'attendance-trend': R.REPORTS,
  performance: R.REPORTS,
  exams: R.REPORTS,
  payroll: R.PAYROLL,
};
const ANY_EXPORT = [...new Set(Object.values(EXPORT_ROLES).flat())];
/** Per-class attendance % is also what teachers see on the attendance page. */
const ATTENDANCE_READ = [...new Set([...R.REPORTS, ...R.ATTENDANCE_MARK])];
const SUMMARY_READ = [...new Set([...R.REPORTS, ...R.PAYROLL])];

/**
 * Reports & dashboards. Every aggregate is branch-scoped, takes the shared filter bar
 * (class_id, section, from, to), and is served through the in-process TTL cache:
 * `X-Cache: HIT|MISS` + `X-Cache-Generated-At` headers, `?fresh=1` to recompute.
 * Fee numbers are only ever returned to R.FEES_READ, payroll only to R.PAYROLL.
 */
@Controller('reports')
@UseGuards(AuthGuard, RolesGuard)
export class ReportsController {
  constructor(private prisma: PrismaService, private reports: ReportsService, private cache: ReportCacheService) {}

  private async cached<T>(req: Req_, res: Response, name: string, q: Q, scope: Record<string, unknown>, compute: (f: Awaited<ReturnType<typeof parseFilters>>) => Promise<T>): Promise<T> {
    const f = await parseFilters(this.prisma, req.user.branch_id, q);
    const key = this.cache.key(req.user.branch_id, name, { ...f.key, ...scope });
    const fresh = q.fresh === '1' || q.fresh === 'true';
    const out = await this.cache.wrap(key, fresh, () => compute(f));
    res.setHeader('X-Cache', out.hit ? 'HIT' : 'MISS');
    res.setHeader('X-Cache-Generated-At', out.at);
    return out.value;
  }

  private canFees = (u: AuthUser) => (R.FEES_READ as string[]).includes(u.role);
  private canPayroll = (u: AuthUser) => (R.PAYROLL as string[]).includes(u.role);

  /** Per-class attendance % (legacy array shape). */
  @Get('attendance')
  @Roles(...ATTENDANCE_READ)
  attendance(@Req() req: Req_, @Query() q: Q, @Res({ passthrough: true }) res: Response) {
    return this.cached(req, res, 'attendance', q, {}, (f) => this.reports.attendanceByClass(req.user.branch_id, f));
  }

  @Get('attendance-trend')
  @Roles(...R.REPORTS)
  attendanceTrend(@Req() req: Req_, @Query() q: Q, @Res({ passthrough: true }) res: Response) {
    return this.cached(req, res, 'attendance-trend', q, {}, (f) => this.reports.attendanceTrend(req.user.branch_id, f));
  }

  @Get('trends')
  @Roles(...R.REPORTS)
  trends(@Req() req: Req_, @Query() q: Q, @Res({ passthrough: true }) res: Response) {
    const fees = this.canFees(req.user);
    return this.cached(req, res, 'trends', q, { fees }, (f) => this.reports.trends(req.user.branch_id, f, fees));
  }

  @Get('fees')
  @Roles(...R.FEES_READ)
  fees(@Req() req: Req_, @Query() q: Q, @Res({ passthrough: true }) res: Response) {
    return this.cached(req, res, 'fees', q, {}, (f) => this.reports.fees(req.user.branch_id, f));
  }

  @Get('defaulters')
  @Roles(...R.FEES_READ)
  defaulters(@Req() req: Req_, @Query() q: Q, @Res({ passthrough: true }) res: Response) {
    return this.cached(req, res, 'defaulters', q, {}, (f) => this.reports.defaulters(req.user.branch_id, f));
  }

  /** Grade-engine performance by class and subject. */
  @Get('performance')
  @Roles(...R.REPORTS)
  performance(@Req() req: Req_, @Query() q: Q, @Res({ passthrough: true }) res: Response) {
    return this.cached(req, res, 'performance', q, {}, (f) => this.reports.performance(req.user.branch_id, f));
  }

  /** Average raw score % per exam (legacy array shape). */
  @Get('academics')
  @Roles(...R.REPORTS)
  academics(@Req() req: Req_, @Query() q: Q, @Res({ passthrough: true }) res: Response) {
    return this.cached(req, res, 'academics', q, {}, (f) => this.reports.examAverages(req.user.branch_id, f));
  }

  @Get('exam-scores')
  @Roles(...R.REPORTS)
  examScores(@Req() req: Req_, @Query() q: Q, @Res({ passthrough: true }) res: Response) {
    return this.cached(req, res, 'exam-scores', q, {}, (f) => this.reports.examScores(req.user.branch_id, f));
  }

  /** Headline counts; `fees` is null unless the caller may read fees. */
  @Get('dashboard')
  @Roles(...R.REPORTS)
  dashboard(@Req() req: Req_, @Query() q: Q, @Res({ passthrough: true }) res: Response) {
    const fees = this.canFees(req.user);
    return this.cached(req, res, 'dashboard', q, { fees }, (f) => this.reports.dashboard(req.user.branch_id, f, fees));
  }

  /** Hostel occupancy for report readers; payroll totals only for R.PAYROLL. */
  @Get('summary')
  @Roles(...SUMMARY_READ)
  summary(@Req() req: Req_, @Query() q: Q, @Res({ passthrough: true }) res: Response) {
    const payroll = this.canPayroll(req.user);
    return this.cached(req, res, 'summary', q, { payroll }, async (f) => {
      const hostel = await this.reports.hostel(req.user.branch_id);
      if (!payroll) return { hostel };
      const p = await this.reports.payroll(req.user.branch_id, f);
      return { hostel, payroll_total_net: p.payroll_total_net, payslip_count: p.payslip_count };
    });
  }

  @Get('payroll')
  @Roles(...R.PAYROLL)
  payroll(@Req() req: Req_, @Query() q: Q, @Res({ passthrough: true }) res: Response) {
    return this.cached(req, res, 'payroll', q, {}, (f) => this.reports.payroll(req.user.branch_id, f));
  }

  /**
   * GET /reports/export/:report?format=csv|xlsx|pdf&class_id&section&from&to
   * Always computed fresh (exports are point-in-time documents) and audited.
   */
  @Get('export/:report')
  @Roles(...ANY_EXPORT)
  async export(@Req() req: Req_, @Param('report') report: string, @Query() q: Q, @Res() res: Response) {
    const allowed = EXPORT_ROLES[report];
    if (!allowed) throw new BadRequestException(`report must be one of ${Object.keys(EXPORT_ROLES).join(' | ')}`);
    if (!allowed.includes(req.user.role)) throw new ForbiddenException('Forbidden: Insufficient privileges');
    const format = (q.format ?? 'csv').toLowerCase() as ExportFormat;
    if (!['csv', 'xlsx', 'pdf'].includes(format)) throw new BadRequestException('format must be csv | xlsx | pdf');

    const f = await parseFilters(this.prisma, req.user.branch_id, q);
    const table = await this.reports.table(report, req.user.branch_id, f);
    const branch = await this.prisma.branch.findUnique({ where: { id: req.user.branch_id }, select: { name: true } });
    const filterLine = `Filters: ${Object.entries(f.key).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'} · ${table.rows.length} rows`;
    const buf = await renderTable(table, format, branch?.name ?? 'School', filterLine);

    await audit(this.prisma, req.user, 'EXPORT', 'report', report, JSON.stringify({ format, ...f.key, rows: table.rows.length }));
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', CONTENT_TYPES[format]);
    res.setHeader('Content-Disposition', `attachment; filename="genesis-erp-${report}-${stamp}.${format}"`);
    res.setHeader('Content-Length', String(buf.length));
    return res.send(buf);
  }
}
