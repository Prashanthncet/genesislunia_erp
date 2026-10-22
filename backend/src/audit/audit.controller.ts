import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { R, ROLE } from '../auth/roles';
import { ReqWithUser } from '../common/access';
import { INCIDENT_ENTITY } from '../discipline/safeguarding-access';

/**
 * School-wide audit trail for administrators (hostel moves, payroll runs, exports,
 * approvals…). Safeguarding records are deliberately EXCLUDED: their access history
 * is only visible to the safeguarding team via /discipline/audit-log (plan Phase 5).
 */
@Controller('audit-log')
@UseGuards(AuthGuard, RolesGuard)
@Roles(...R.ADMINS, ROLE.PRINCIPAL)
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list(
    @Req() req: ReqWithUser,
    @Query('entity') entity?: string,
    @Query('entity_id') entityId?: string,
    @Query('action') action?: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(Math.max(Number(limit) || 100, 1), 500);
    return this.prisma.auditLog.findMany({
      where: {
        branchId: req.user.branch_id,
        entity: entity && entity !== INCIDENT_ENTITY ? entity : { not: INCIDENT_ENTITY },
        ...(entityId ? { entityId } : {}),
        ...(action ? { action } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
