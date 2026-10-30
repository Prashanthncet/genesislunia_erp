import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { R } from '../auth/roles';
import { ReqWithUser } from '../common/access';
import { PrismaService } from '../prisma/prisma.service';
import { textContains } from '../common/search';

const isPayrollOrAdmin = (role: string) =>
  (R.PAYROLL as readonly string[]).includes(role) ||
  (R.ADMINS as readonly string[]).includes(role);

/**
 * Dedicated `/api/employees` controller paired with the Next.js `/api/employees`
 * Route Handler (BFF) in the recommended security architecture.
 *
 * - Protected by NestJS `AuthGuard` and `RolesGuard` (`@Roles(...R.STAFF)`).
 * - Portal users (`parent`, `student`) are rejected with 403 Forbidden.
 * - Sensitive compensation fields (`salaryStructure`) are only included for
 *   authorized payroll/admin/developer roles; general staff receive strictly
 *   directory-level fields.
 */
@Controller('employees')
@UseGuards(AuthGuard, RolesGuard)
export class EmployeesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles(...R.STAFF)
  async list(
    @Req() req: ReqWithUser,
    @Query('department') department?: string,
    @Query('role') role?: string,
    @Query('q') q?: string,
  ) {
    const canSeeSensitive = isPayrollOrAdmin(req.user.role);
    const rows = await this.prisma.staff.findMany({
      where: {
        branchId: req.user.branch_id,
        ...(department ? { department } : {}),
        ...(role ? { role } : {}),
        ...(q
          ? {
              OR: [
                { name: textContains(q) },
                { email: textContains(q) },
                { department: textContains(q) },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        phone: canSeeSensitive,
        subjects: true,
        maxPeriodsPerDay: true,
        isActive: true,
        ...(canSeeSensitive ? { salaryStructure: true } : {}),
      },
      orderBy: { name: 'asc' },
    });

    return {
      source: 'nestjs-employees-controller',
      via_bff: Boolean((req as { viaBff?: boolean }).viaBff),
      role_scope: canSeeSensitive ? 'privileged' : 'directory_redacted',
      count: rows.length,
      employees: rows,
    };
  }

  @Get(':id')
  @Roles(...R.STAFF)
  async detail(@Req() req: ReqWithUser, @Param('id') id: string) {
    const canSeeSensitive = isPayrollOrAdmin(req.user.role);
    const emp = await this.prisma.staff.findFirst({
      where: { id, branchId: req.user.branch_id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        phone: canSeeSensitive,
        subjects: true,
        maxPeriodsPerDay: true,
        isActive: true,
        ...(canSeeSensitive ? { salaryStructure: true } : {}),
      },
    });
    if (!emp) throw new NotFoundException('Employee not found');
    return emp;
  }
}
