import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { R, ROLE } from '../auth/roles';
import { AuthUser, ReqWithUser, assertInBranch } from '../common/access';
import { CreateIncidentDto, EscalateIncidentDto, IncidentStatusDto, UpdateIncidentDto } from './dto/discipline.dto';
import { INCIDENT_ENTITY, SafeguardingAccess } from './safeguarding-access';

/**
 * Discipline & safeguarding. Every endpoint goes through SafeguardingAccess (row-level
 * visibility + field redaction + audit of every read/write). Route roles:
 *  - report an incident / see own reports: R.INCIDENT_REPORT (all staff)
 *  - case list, detail, status, notes, escalation, audit trail: R.SAFEGUARDING only
 *    (super_admin, principal, discipline_officer — NOT branch_admin, on purpose)
 *  - soft delete: principal / super_admin
 */

/** Allowed status moves. `Escalated` is reachable from any open state via escalate(). */
const TRANSITIONS: Record<string, string[]> = {
  Open: ['Under Review', 'Escalated'],
  'Under Review': ['Closed', 'Escalated'],
  Escalated: ['Under Review', 'Closed'],
  Closed: ['Open'], // principal only, with remarks
};
const AUTO_ESCALATE = ['High', 'Critical'];
const DELETE_ROLES: string[] = [ROLE.SUPER_ADMIN, ROLE.PRINCIPAL];

@Controller('discipline')
@UseGuards(AuthGuard, RolesGuard)
export class DisciplineController {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private access: SafeguardingAccess,
  ) {}

  // ─── reads (literal routes before :id) ──────────────────────

  @Get('incidents')
  @Roles(...R.SAFEGUARDING)
  list(@Req() req: ReqWithUser, @Query('student_id') studentId?: string, @Query('status') status?: string, @Query('severity') severity?: string) {
    return this.access.listCases(req.user, { studentId, status, severity });
  }

  /** Incidents the caller reported — no confidential fields. */
  @Get('incidents/mine')
  @Roles(...R.INCIDENT_REPORT)
  mine(@Req() req: ReqWithUser) {
    return this.access.listOwnReports(req.user);
  }

  /** Case-team members a case can be assigned to. */
  @Get('assignees')
  @Roles(...R.SAFEGUARDING)
  async assignees(@Req() req: ReqWithUser) {
    this.access.assertCaseTeam(req.user);
    return this.prisma.user.findMany({
      where: { branchId: req.user.branch_id, isActive: true, role: { in: R.SAFEGUARDING } },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });
  }

  @Get('audit-log')
  @Roles(...R.SAFEGUARDING)
  async auditLog(@Req() req: ReqWithUser, @Query('entity') entity?: string, @Query('entity_id') entityId?: string) {
    this.access.assertCaseTeam(req.user);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        branchId: req.user.branch_id,
        entity: entity || INCIDENT_ENTITY,
        ...(entityId ? { entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    const names = await this.access.userNames(rows.map((r) => r.actorId));
    return rows.map((r) => ({ ...r, actorName: names[r.actorId] ?? r.actorId }));
  }

  @Get('incidents/:id')
  @Roles(...R.INCIDENT_REPORT)
  get(@Req() req: ReqWithUser, @Param('id') id: string) {
    return this.access.view(req.user, id);
  }

  // ─── writes ─────────────────────────────────────────────────

  @Post('incidents')
  @Roles(...R.INCIDENT_REPORT)
  async create(@Req() req: ReqWithUser, @Body() body: CreateIncidentDto) {
    await assertInBranch(this.prisma, 'student', body.student_id, req.user.branch_id);
    const student = await this.prisma.student.findFirst({ where: { id: body.student_id, branchId: req.user.branch_id }, select: { fullName: true, mobileNumber: true } });
    const reporter = await this.prisma.staff.findFirst({ where: { branchId: req.user.branch_id, user: { id: req.user.sub } }, select: { id: true } });
    const severity = body.severity ?? 'Low';
    const incident = await this.prisma.incident.create({
      data: {
        branchId: req.user.branch_id,
        studentId: body.student_id,
        reportedBy: reporter?.id ?? null,
        incidentDate: body.incident_date,
        description: body.description,
        actionTaken: body.action_taken ?? null,
        demerits: body.demerits ?? 0,
        severity,
        status: 'Open',
        confidentialNotes: body.confidential_notes ?? null,
      },
    });
    await this.access.log(req.user, 'CREATE', incident.id, `severity ${severity}`);
    if (AUTO_ESCALATE.includes(severity)) await this.escalateInternal(req.user, incident.id, `auto: severity ${severity}`);

    // Parent communication: generic, no incident details in the message.
    if (student?.mobileNumber) {
      await this.notifications.notify({
        branch_id: req.user.branch_id,
        channel: 'sms',
        recipient: student.mobileNumber,
        body: `An incident involving ${student.fullName} was recorded on ${body.incident_date}. Please contact the school office for details.`,
        ref_type: 'incident',
        ref_id: incident.id,
      });
    }
    return { id: incident.id, status: AUTO_ESCALATE.includes(severity) ? 'Escalated' : 'Open', severity };
  }

  @Put('incidents/:id')
  @Roles(...R.SAFEGUARDING)
  async update(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: UpdateIncidentDto) {
    const existing = await this.access.loadForWrite(req.user, id);
    let assignedTo: string | null | undefined;
    if (body.assigned_to !== undefined) {
      if (body.assigned_to === '') assignedTo = null;
      else {
        const owner = await this.prisma.user.findFirst({
          where: { id: body.assigned_to, branchId: req.user.branch_id, isActive: true, role: { in: R.SAFEGUARDING } },
          select: { id: true },
        });
        if (!owner) throw new BadRequestException('assigned_to must be an active Principal / safeguarding user in this school');
        assignedTo = owner.id;
      }
    }
    const changed = Object.entries({
      description: body.description, action_taken: body.action_taken, demerits: body.demerits,
      confidential_notes: body.confidential_notes, severity: body.severity, assigned_to: body.assigned_to,
    }).filter(([, v]) => v !== undefined).map(([k]) => k);
    await this.prisma.incident.update({
      where: { id },
      data: {
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.action_taken !== undefined ? { actionTaken: body.action_taken } : {}),
        ...(body.demerits !== undefined ? { demerits: body.demerits } : {}),
        ...(body.confidential_notes !== undefined ? { confidentialNotes: body.confidential_notes } : {}),
        ...(body.severity !== undefined ? { severity: body.severity } : {}),
        ...(assignedTo !== undefined ? { assignedTo } : {}),
      },
    });
    await this.access.log(req.user, 'UPDATE', id, `fields: ${changed.join(', ') || 'none'}`);
    if (body.severity && AUTO_ESCALATE.includes(body.severity) && !existing.escalatedAt && existing.status !== 'Closed') {
      await this.escalateInternal(req.user, id, `auto: severity raised to ${body.severity}`);
    }
    return { id, success: true };
  }

  @Put('incidents/:id/status')
  @Roles(...R.SAFEGUARDING)
  async setStatus(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: IncidentStatusDto) {
    const existing = await this.access.loadForWrite(req.user, id);
    if (body.status === existing.status) throw new BadRequestException(`Incident is already ${existing.status}`);
    if (body.status === 'Escalated') {
      if (existing.status === 'Closed') throw new BadRequestException('Re-open a closed case before escalating it');
      await this.escalateInternal(req.user, id, body.remarks?.trim() || 'escalated via status change');
      return { success: true, status: 'Escalated' };
    }
    const allowed = TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(body.status)) {
      throw new BadRequestException(`Cannot move a case from ${existing.status} to ${body.status}`);
    }
    if (existing.status === 'Closed') {
      if (req.user.role !== ROLE.PRINCIPAL) throw new ForbiddenException('Only the Principal can re-open a closed case');
      if (!body.remarks?.trim()) throw new BadRequestException('remarks are required to re-open a case');
    }
    await this.prisma.incident.update({ where: { id }, data: { status: body.status } });
    await this.access.log(req.user, 'UPDATE', id, `status ${existing.status} → ${body.status}${body.remarks?.trim() ? `: ${body.remarks.trim()}` : ''}`);
    return { success: true, status: body.status };
  }

  @Post('incidents/:id/escalate')
  @Roles(...R.SAFEGUARDING)
  async escalate(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: EscalateIncidentDto) {
    const existing = await this.access.loadForWrite(req.user, id);
    if (existing.status === 'Closed') throw new BadRequestException('Re-open a closed case before escalating it');
    if (existing.status === 'Escalated') throw new BadRequestException('Case is already escalated');
    await this.escalateInternal(req.user, id, body.reason?.trim() || 'manual escalation');
    return { success: true, status: 'Escalated' };
  }

  /** Soft delete — safeguarding records are never physically removed. */
  @Delete('incidents/:id')
  @Roles(...DELETE_ROLES)
  async remove(@Req() req: ReqWithUser, @Param('id') id: string) {
    await this.access.loadForWrite(req.user, id);
    await this.prisma.incident.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.access.log(req.user, 'DELETE', id, 'soft delete');
    return { success: true };
  }

  // ─── internals ──────────────────────────────────────────────

  /** Status → Escalated, stamp who/when, tell the Principal(s) without case details. */
  private async escalateInternal(user: AuthUser, id: string, reason: string) {
    const inc = await this.prisma.incident.update({
      where: { id },
      data: { status: 'Escalated', escalatedAt: new Date(), escalatedBy: user.sub },
      select: { id: true, severity: true },
    });
    await this.access.log(user, 'ESCALATE', id, reason);
    const principals = await this.prisma.user.findMany({
      where: { branchId: user.branch_id, role: ROLE.PRINCIPAL, isActive: true },
      select: { email: true },
    });
    for (const p of principals) {
      await this.notifications.notify({
        branch_id: user.branch_id,
        channel: 'email',
        recipient: p.email,
        subject: `Safeguarding case escalated (${inc.severity})`,
        body: `A ${inc.severity}-severity safeguarding case (ref ${inc.id.slice(0, 8)}) has been escalated to you. Open Discipline & Safeguarding in the ERP to review it. Details are not included in this message.`,
        ref_type: 'incident_escalation',
        ref_id: inc.id,
      });
    }
  }
}
