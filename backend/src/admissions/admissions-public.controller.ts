import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Public (unauthenticated) parent-facing endpoints, gated by a one-off link token
 * generated when the office triggers admission links. Mirrors the plan's
 * "parent submits via the shared link" flow.
 */
@Controller('admissions/public')
export class AdmissionsPublicController {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  @Get(':token')
  async getForm(@Param('token') token: string) {
    const app = await this.prisma.admission.findUnique({ where: { token } });
    if (!app) throw new NotFoundException('Invalid or expired admission link');

    const fields = await this.prisma.admissionField.findMany({
      where: { branchId: app.branchId },
      orderBy: { createdAt: 'asc' },
    });

    let dynamic: Record<string, unknown> = {};
    try {
      dynamic = app.dynamicData ? JSON.parse(app.dynamicData) : {};
    } catch {
      dynamic = {};
    }

    return {
      application_id: app.id,
      status: app.status,
      student_name: app.studentName,
      already_submitted: app.status !== 'Links Sent',
      fields,
      dynamic_data: dynamic,
    };
  }

  @Post(':token/submit')
  async submit(@Param('token') token: string, @Body() body: Record<string, unknown>) {
    const app = await this.prisma.admission.findUnique({ where: { token } });
    if (!app) throw new NotFoundException('Invalid or expired admission link');
    if (!body || typeof body !== 'object') throw new BadRequestException('Form data is required');

    const studentName = (body['student_name'] as string) || 'Unknown';
    const dob = (body['dob'] as string) || '';
    const classId = (body['class_id'] as string) || undefined;

    await this.prisma.admission.update({
      where: { id: app.id },
      data: {
        studentName,
        dob,
        dynamicData: JSON.stringify(body),
        ...(classId ? { classId } : {}),
        status: 'Submitted by Parent',
      },
    });

    // acknowledge the office (mock channel in dev)
    await this.notifications.notify({
      branch_id: app.branchId,
      channel: 'email',
      recipient: app.parentEmail ?? 'admissions-office@demo.local',
      subject: 'Admission form submitted',
      body: `Admission form for ${studentName} was submitted by the parent.`,
      ref_type: 'admission',
      ref_id: app.id,
    });

    return { message: 'Application submitted successfully', status: 'Submitted by Parent' };
  }
}
