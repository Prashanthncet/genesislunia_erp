import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';

import { NotificationsService } from '../notifications/notifications.service';
import { CreateIncidentDto, IncidentStatusDto, UpdateIncidentDto } from './dto/discipline.dto';

type ReqWithUser = { user: { sub: string; role: string; branch_id: string } };

/** Roles allowed to even see discipline/safeguarding data (plan Phase 5: strict access). */
const DISCIPLINE_ROLES = ['super_admin', 'branch_admin', 'principal', 'warden', 'teacher'];

@Controller('discipline')
@UseGuards(AuthGuard, RolesGuard)
@Roles(...DISCIPLINE_ROLES)
export class DisciplineController {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  @Get('incidents')
  async list(@Req() req: ReqWithUser, @Query('student_id') studentId?: string, @Query('status') status?: string) {
    return this.prisma.incident.findMany({
      where: {
        branchId: req.user.branch_id,
        ...(studentId ? { studentId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        student: { select: { id: true, fullName: true, admissionNo: true, class: { select: { name: true, section: true } } } },
        reporter: { select: { id: true, name: true } },
      },
      orderBy: { incidentDate: 'desc' },
    });
  }

  @Get('incidents/:id')
  async get(@Req() req: ReqWithUser, @Param('id') id: string) {
    const incident = await this.prisma.incident.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: {
        student: { select: { id: true, fullName: true, admissionNo: true, class: { select: { name: true, section: true } } } },
        reporter: { select: { id: true, name: true } },
      },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    // Plan: audit log of every read of a safeguarding record
    await this.prisma.auditLog.create({
      data: {
        branchId: req.user.branch_id,
        actorId: req.user.sub,
        action: 'VIEW',
        entity: 'incident',
        entityId: id,
      },
    });
    return incident;
  }

  @Post('incidents')
  async create(
    @Req() req: ReqWithUser,
    @Body() body: CreateIncidentDto,
  ) {
    const student = await this.prisma.student.findFirst({ where: { id: body.student_id, branchId: req.user.branch_id } });
    if (!student) throw new NotFoundException('Student not found');

    // resolve the reporting staff member from the logged-in user (admins may have no staff row)
    const reporter = await this.prisma.staff.findFirst({ where: { user: { id: req.user.sub } } });
    const incident = await this.prisma.incident.create({
      data: {
        branchId: req.user.branch_id,
        studentId: body.student_id,
        reportedBy: reporter?.id ?? null,
        incidentDate: body.incident_date,
        description: body.description,
        actionTaken: body.action_taken ?? null,
        demerits: body.demerits ?? 0,
        status: 'Open',
        confidentialNotes: body.confidential_notes ?? null,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        branchId: req.user.branch_id,
        actorId: req.user.sub,
        action: 'CREATE',
        entity: 'incident',
        entityId: incident.id,
      },
    });

    // Parent communication: generic, no incident details in the message.
    if (student.mobileNumber) {
      await this.notifications.notify({
        branch_id: req.user.branch_id,
        channel: 'sms',
        recipient: student.mobileNumber,
        body: `An incident involving ${student.fullName} was recorded on ${body.incident_date}. Please contact the school office for details.`,
        ref_type: 'incident',
        ref_id: incident.id,
      });
    }

    return { id: incident.id };
  }

  @Put('incidents/:id')
  async update(
    @Req() req: ReqWithUser,
    @Param('id') id: string,
    @Body() body: UpdateIncidentDto,
  ) {
    const existing = await this.prisma.incident.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Incident not found');
    const incident = await this.prisma.incident.update({
      where: { id },
      data: {
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.action_taken !== undefined ? { actionTaken: body.action_taken } : {}),
        ...(body.demerits !== undefined ? { demerits: body.demerits } : {}),
        ...(body.confidential_notes !== undefined ? { confidentialNotes: body.confidential_notes } : {}),
      },
    });
    await this.prisma.auditLog.create({
      data: { branchId: req.user.branch_id, actorId: req.user.sub, action: 'UPDATE', entity: 'incident', entityId: id },
    });
    return { id: incident.id, success: true };
  }

  @Put('incidents/:id/status')
  async setStatus(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: IncidentStatusDto) {
    const existing = await this.prisma.incident.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Incident not found');
    await this.prisma.incident.update({ where: { id }, data: { status: body.status } });
    await this.prisma.auditLog.create({
      data: { branchId: req.user.branch_id, actorId: req.user.sub, action: 'UPDATE', entity: 'incident', entityId: id, detail: `status → ${body.status}` },
    });
    return { success: true, status: body.status };
  }

  @Delete('incidents/:id')
  @Roles('super_admin', 'branch_admin')
  async remove(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.incident.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Incident not found');
    await this.prisma.incident.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: { branchId: req.user.branch_id, actorId: req.user.sub, action: 'DELETE', entity: 'incident', entityId: id },
    });
    return { success: true };
  }

  @Get('audit-log')
  @Roles('super_admin', 'branch_admin')
  async auditLog(@Req() req: ReqWithUser, @Query('entity') entity?: string, @Query('entity_id') entityId?: string) {
    return this.prisma.auditLog.findMany({
      where: {
        branchId: req.user.branch_id,
        ...(entity ? { entity } : {}),
        ...(entityId ? { entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
