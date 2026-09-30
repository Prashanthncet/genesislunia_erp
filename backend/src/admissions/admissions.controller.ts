import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';

type ReqWithUser = { user: { sub: string; role: string; branch_id: string } };

function rid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
}

@Controller('admissions')
@UseGuards(AuthGuard)
export class AdmissionsController {
  constructor(private prisma: PrismaService) {}

  // ─── Dynamic field builder ───────────────────────────────────

  @Get('fields')
  listFields(@Req() req: ReqWithUser) {
    return this.prisma.admissionField.findMany({
      where: { branchId: req.user.branch_id },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Post('fields')
  async createField(
    @Req() req: ReqWithUser,
    @Body() body: { label?: string; field_type?: string; is_required?: boolean; validation_rule?: string },
  ) {
    if (!body?.label || !body?.field_type) {
      return { statusCode: 400, error: 'label and field_type are required' };
    }
    const field = await this.prisma.admissionField.create({
      data: {
        branchId: req.user.branch_id,
        label: body.label,
        fieldType: body.field_type,
        isRequired: body.is_required ?? true,
        validationRule: body.validation_rule ?? null,
      },
    });
    return { id: field.id, message: 'Field created successfully' };
  }

  @Delete('fields/:id')
  async deleteField(@Req() req: ReqWithUser, @Param('id') id: string) {
    await this.prisma.admissionField.deleteMany({ where: { id, branchId: req.user.branch_id } });
    return { message: 'Field deleted' };
  }

  @Post('setup-fields')
  async setupFields(@Req() req: ReqWithUser) {
    await this.prisma.admissionField.updateMany({
      where: { branchId: req.user.branch_id, status: 'Draft' },
      data: { status: 'Pending Approval' },
    });
    return { success: true, message: 'Sent to OS for Approval!' };
  }

  // ─── Applications ────────────────────────────────────────────

  @Get()
  listApplications(@Req() req: ReqWithUser) {
    return this.prisma.admission.findMany({
      where: { branchId: req.user.branch_id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('trigger-links')
  async triggerLinks(
    @Req() req: ReqWithUser,
    @Body() body: { parents?: Array<{ parent_name?: string; parent_email?: string; parent_contact?: string }> },
  ) {
    const parents = body?.parents ?? [];
    const generated = [];

    for (const parent of parents) {
      const loginId = `P${Math.floor(1000 + Math.random() * 9000)}`;
      const password = Math.random().toString(36).slice(-8);

      const app = await this.prisma.admission.create({
        data: {
          branchId: req.user.branch_id,
          parentName: parent.parent_name ?? null,
          parentContact: parent.parent_contact ?? null,
          parentEmail: parent.parent_email ?? null,
          status: 'Links Sent',
          loginId,
          password,
        },
      });

      // Mock SMS/Email dispatch (legacy behavior)
      // eslint-disable-next-line no-console
      console.log(`[MOCK EMAIL/SMS] → ${parent.parent_email}: Login ID ${loginId}`);

      generated.push({ id: app.id, parent_name: parent.parent_name, login_id: loginId, password });
    }

    return { message: 'Links triggered successfully', generated };
  }

  @Post(':id/submit')
  async submit(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const app = await this.prisma.admission.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!app) throw new NotFoundException('Application not found');

    const dynamicData = body ?? {};
    const studentName = (dynamicData['student_name'] as string) || 'Unknown';
    const dob = (dynamicData['dob'] as string) || '';

    await this.prisma.admission.update({
      where: { id },
      data: {
        studentName,
        dob,
        dynamicData: JSON.stringify(dynamicData),
        status: 'Submitted by Parent',
      },
    });

    return { message: 'Application submitted successfully' };
  }

  @Post(':id/validate')
  async validate(
    @Req() req: ReqWithUser,
    @Param('id') id: string,
    @Body() body: { isValid?: boolean; remarks?: string },
  ) {
    const app = await this.prisma.admission.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!app) throw new NotFoundException('Application not found');

    const newStatus = body?.isValid ? 'Document Validated' : 'Re-submit';
    await this.prisma.admission.update({
      where: { id },
      data: { status: newStatus, remarks: body?.remarks ?? null },
    });

    return { message: `Application ${body?.isValid ? 'validated' : 'rejected'}` };
  }

  @Post(':id/pay')
  async pay(@Req() req: ReqWithUser, @Param('id') id: string) {
    const app = await this.prisma.admission.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!app) throw new NotFoundException('Application not found');

    await this.prisma.admission.update({
      where: { id },
      data: { paymentStatus: 'Paid' },
    });
    return { message: 'Payment recorded successfully' };
  }

  @Post(':id/verify-receipt')
  async verifyReceipt(@Req() req: ReqWithUser, @Param('id') id: string) {
    const app = await this.prisma.admission.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!app) throw new NotFoundException('Application not found');

    await this.prisma.admission.update({
      where: { id },
      data: { paymentStatus: 'Verified', status: 'Fee Approved' },
    });
    return { message: 'Receipt verified successfully' };
  }

  @Post(':id/allocate')
  async allocate(@Req() req: ReqWithUser, @Param('id') id: string) {
    const app = await this.prisma.admission.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!app) throw new NotFoundException('Application not found');

    const rollNo = `6-2026-${Math.floor(100 + Math.random() * 900)}`;
    const houses = ['Red', 'Blue', 'Green', 'Yellow'];
    const house = houses[Math.floor(Math.random() * houses.length)];

    await this.prisma.admission.update({
      where: { id },
      data: { rollNo, house, status: 'Roll No Assigned' },
    });

    return { message: 'Roll No and House allocated', roll_no: rollNo, house };
  }

  @Post(':id/vp-approve')
  async vpApprove(@Req() req: ReqWithUser, @Param('id') id: string) {
    const app = await this.prisma.admission.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!app) throw new NotFoundException('Application not found');

    await this.prisma.admission.update({
      where: { id },
      data: { status: 'VP Approved' },
    });
    return { message: 'VP approved successfully' };
  }

  @Post(':id/principal-approve')
  async principalApprove(@Req() req: ReqWithUser, @Param('id') id: string) {
    const app = await this.prisma.admission.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!app) throw new NotFoundException('Application not found');

    const newStudentId = rid('stu');

    await this.prisma.$transaction([
      this.prisma.student.create({
        data: {
          id: newStudentId,
          branchId: app.branchId,
          admissionNo: app.rollNo ?? rid('ADM'),
          fullName: app.studentName ?? 'Unknown',
          mobileNumber: app.parentContact,
          email: app.parentEmail,
          rollNo: app.rollNo,
          enrollmentDate: new Date().toISOString().split('T')[0],
          status: 'Active',
        },
      }),
      this.prisma.admission.update({
        where: { id },
        data: { status: 'Admission Complete' },
      }),
    ]);

    return { message: 'Admission completed and student moved to master record', student_id: newStudentId };
  }
}
