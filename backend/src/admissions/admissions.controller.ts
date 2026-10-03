import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { NotificationsService } from '../notifications/notifications.service';

type ReqWithUser = { user: { sub: string; role: string; branch_id: string } };

function rid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
}

@Controller('admissions')
@UseGuards(AuthGuard)
export class AdmissionsController {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

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
      include: { class: { select: { id: true, name: true, section: true } } },
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

      const token = `tok_${Math.random().toString(36).slice(2, 14)}`;
      const app = await this.prisma.admission.create({
        data: {
          branchId: req.user.branch_id,
          parentName: parent.parent_name ?? null,
          parentContact: parent.parent_contact ?? null,
          parentEmail: parent.parent_email ?? null,
          status: 'Links Sent',
          loginId,
          password,
          token,
        },
      });

      const formLink = `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/admission-form?token=${token}`;
      // Central dispatcher logs to notification_logs; provider is mocked in dev.
      if (parent.parent_email || parent.parent_contact) {
        await this.notifications.notify({
          branch_id: req.user.branch_id,
          channel: parent.parent_email ? 'email' : 'sms',
          recipient: (parent.parent_email || parent.parent_contact) as string,
          subject: 'Admission Form Link',
          body: `Dear Parent, please fill the admission form: ${formLink} (Login ID: ${loginId})`,
          ref_type: 'admission',
          ref_id: app.id,
        });
      }

      generated.push({ id: app.id, parent_name: parent.parent_name, login_id: loginId, password, token, form_link: formLink });
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
    const classId = (dynamicData['class_id'] as string) || undefined;

    await this.prisma.admission.update({
      where: { id },
      data: {
        studentName,
        dob,
        dynamicData: JSON.stringify(dynamicData),
        ...(classId ? { classId } : {}),
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

  /**
   * Roll number per plan spec: [CLASS][YEAR][SEQ] — e.g. 10A-2026-007.
   * Class resolved from body > admission.classId > dynamicData > first class.
   * House allocated to the currently least-populated house (balanced).
   */
  @Post(':id/allocate')
  async allocate(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: { class_id?: string }) {
    const app = await this.prisma.admission.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!app) throw new NotFoundException('Application not found');

    let dynamic: Record<string, unknown> = {};
    try {
      dynamic = app.dynamicData ? JSON.parse(app.dynamicData) : {};
    } catch {
      dynamic = {};
    }
    const classId = body?.class_id ?? app.classId ?? (dynamic['class_id'] as string | undefined) ?? null;
    const cls = classId
      ? await this.prisma.class.findFirst({ where: { id: classId, branchId: req.user.branch_id } })
      : await this.prisma.class.findFirst({ where: { branchId: req.user.branch_id }, orderBy: { name: 'asc' } });

    const prefix = cls ? `${cls.name}${cls.section ?? ''}`.replace(/\s+/g, '').toUpperCase() : 'GEN';
    const year = new Date().getFullYear();
    const siblings = await this.prisma.student.findMany({
      where: { branchId: req.user.branch_id, ...(cls ? { classId: cls.id } : {}), rollNo: { not: null } },
      select: { rollNo: true },
    });
    // roll numbers also live on not-yet-enrolled admissions until principal-approve moves them
    const allocatedAdmissions = await this.prisma.admission.findMany({
      where: { branchId: req.user.branch_id, rollNo: { not: null }, ...(cls ? { classId: cls.id } : {}) },
      select: { rollNo: true },
    });
    const prefixSet = new Set(
      [...siblings, ...allocatedAdmissions]
        .map((r) => r.rollNo ?? '')
        .filter((rn) => rn.startsWith(`${prefix}-${year}-`)),
    );
    // collision-safe: max existing sequence + 1, skipping any used value
    let n = 0;
    for (const rn of prefixSet) {
      const parsed = parseInt(rn.split('-').pop() ?? '0', 10);
      if (Number.isFinite(parsed) && parsed > n) n = parsed;
    }
    let rollNo: string;
    do {
      n += 1;
      rollNo = `${prefix}-${year}-${String(n).padStart(3, '0')}`;
    } while (prefixSet.has(rollNo));

    // balanced house: least-populated wins, ties go to canonical order
    const houses = ['Red', 'Blue', 'Green', 'Yellow'];
    const counts = await this.prisma.student.groupBy({
      by: ['house'],
      where: { branchId: req.user.branch_id, house: { in: houses } },
      _count: true,
    });
    const countOf = (h: string) => counts.find((c) => c.house === h)?._count ?? 0;
    const house = houses.reduce((min, h) => (countOf(h) < countOf(min) ? h : min), houses[0]);

    await this.prisma.admission.update({
      where: { id },
      data: { rollNo, house, classId: cls?.id ?? app.classId, status: 'Roll No Assigned' },
    });

    return { message: 'Roll No and House allocated', roll_no: rollNo, house, class_id: cls?.id ?? null };
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
          house: app.house,
          classId: app.classId,
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

  // ─── Documents ───────────────────────────────────────────────

  @Post(':id/documents')
  async uploadDocument(
    @Req() req: ReqWithUser,
    @Param('id') id: string,
    @Body() body: { doc_type?: string; file_name?: string; data_url?: string },
  ) {
    const app = await this.prisma.admission.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!app) throw new NotFoundException('Application not found');
    if (!body?.doc_type || !body?.file_name || !body?.data_url) {
      throw new BadRequestException('doc_type, file_name and data_url are required');
    }
    const sizeBytes = Math.floor((body.data_url.length * 3) / 4);
    if (sizeBytes > 2 * 1024 * 1024) {
      throw new BadRequestException('File too large (max 2 MB)');
    }
    const doc = await this.prisma.admissionDocument.create({
      data: {
        branchId: req.user.branch_id,
        admissionId: id,
        docType: body.doc_type,
        fileName: body.file_name,
        dataUrl: body.data_url,
        sizeBytes,
      },
    });
    return { id: doc.id, message: 'Document uploaded successfully', size_bytes: sizeBytes };
  }

  @Get(':id/documents')
  async listDocuments(@Req() req: ReqWithUser, @Param('id') id: string) {
    const app = await this.prisma.admission.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!app) throw new NotFoundException('Application not found');
    const docs = await this.prisma.admissionDocument.findMany({
      where: { admissionId: id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, docType: true, fileName: true, sizeBytes: true, createdAt: true },
    });
    return docs;
  }

  @Get('documents/:docId/download')
  async downloadDocument(@Req() req: ReqWithUser, @Param('docId') docId: string) {
    const doc = await this.prisma.admissionDocument.findFirst({
      where: { id: docId, branchId: req.user.branch_id },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return { id: doc.id, doc_type: doc.docType, file_name: doc.fileName, data_url: doc.dataUrl };
  }

  @Delete('documents/:docId')
  async deleteDocument(@Req() req: ReqWithUser, @Param('docId') docId: string) : Promise<{ message: string }> {
    const result = await this.prisma.admissionDocument.deleteMany({
      where: { id: docId, branchId: req.user.branch_id },
    });
    if (result.count === 0) throw new NotFoundException('Document not found');
    return { message: 'Document deleted' };
  }

  // ─── Admission letter ────────────────────────────────────────

  @Get(':id/letter-data')
  async letterData(@Req() req: ReqWithUser, @Param('id') id: string) {
    const app = await this.prisma.admission.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!app) throw new NotFoundException('Application not found');
    if (!['VP Approved', 'Admission Confirmed', 'Admission Complete'].includes(app.status))
      throw new ForbiddenException('Admission letter available only after VP approval');

    let dynamic: Record<string, unknown> = {};
    try {
      dynamic = app.dynamicData ? JSON.parse(app.dynamicData) : {};
    } catch {
      dynamic = {};
    }
    return {
      application_id: app.id,
      student_name: app.studentName,
      dob: app.dob,
      parent_name: app.parentName,
      parent_contact: app.parentContact,
      roll_no: app.rollNo,
      house: app.house,
      status: app.status,
      class_applied: dynamic['class_applied'] ?? null,
      generated_at: new Date().toISOString(),
    }; 
  }
}
