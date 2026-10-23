import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  GoneException,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Admission } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { AdmissionsService, toPublicField } from './admissions.service';
import { UploadDocumentDto } from './admissions.dto';
import { DocumentStorage } from '../storage/document-storage.service';
import { ADM, EDITABLE_STATUSES, PARENT_LINK, academicYearOf, parseDynamic, transitionAdmission, validateUpload } from './workflow';

/**
 * Public (unauthenticated) parent-facing endpoints, gated by the unguessable link token
 * sent with "Create admission form". Editing is only possible while the application is
 * Links Sent / Re-submit and the 15-day link has not expired.
 */
@Controller('admissions/public')
export class AdmissionsPublicController {
  constructor(
    private prisma: PrismaService,
    private svc: AdmissionsService,
    private payments: PaymentsService,
    private docs: DocumentStorage,
  ) {}

  private async load(token: string) {
    if (!token || token.length > 120) throw new NotFoundException('Invalid admission link');
    const app = await this.prisma.admission.findUnique({ where: { token } });
    if (!app) throw new NotFoundException('Invalid admission link');
    return app;
  }

  private isExpired(app: Admission) {
    return app.status === ADM.LINK_EXPIRED || (EDITABLE_STATUSES.includes(app.status) && !!app.linkExpiresAt && app.linkExpiresAt.getTime() <= Date.now());
  }

  /** 410 when expired, 409 when the form is no longer editable. */
  private async editable(token: string) {
    const app = await this.load(token);
    if (this.isExpired(app)) throw new GoneException('This admission link has expired. Please contact the admission office.');
    if (!EDITABLE_STATUSES.includes(app.status)) throw new ConflictException(`The form can no longer be changed (status: ${app.status})`);
    return app;
  }

  @Get(':token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async getForm(@Param('token') token: string) {
    const app = await this.load(token);
    if (this.isExpired(app)) throw new GoneException('This admission link has expired. Please contact the admission office.');
    const year = app.academicYear ?? academicYearOf();
    const editable = EDITABLE_STATUSES.includes(app.status);
    const [fields, classes, branch, docs, lastOrder] = await Promise.all([
      this.svc.publishedTemplate(app.branchId, year),
      this.prisma.class.findMany({ where: { branchId: app.branchId }, select: { id: true, name: true, section: true }, orderBy: [{ name: 'asc' }, { section: 'asc' }] }),
      this.prisma.branch.findUnique({ where: { id: app.branchId }, select: { name: true } }),
      this.prisma.admissionDocument.findMany({
        where: { admissionId: app.id, docType: { not: 'fee_receipt' } },
        select: { id: true, docType: true, fileName: true, sizeBytes: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.paymentOrder.findFirst({ where: { purpose: 'admission', refId: app.id }, orderBy: { createdAt: 'desc' }, select: { gateway: true, status: true, amount: true } }),
    ]);
    return {
      application_id: app.id,
      school: branch?.name ?? null,
      academic_year: year,
      status: app.status,
      editable,
      already_submitted: !editable,
      remarks: app.status === ADM.RESUBMIT || app.status === ADM.REJECTED ? app.remarks : null,
      link_expires_at: app.linkExpiresAt,
      student_name: app.studentName,
      parent_name: app.parentName,
      login_id: app.loginId,
      fields: fields.map(toPublicField),
      classes,
      dynamic_data: editable ? parseDynamic(app.dynamicData) : {},
      documents: docs,
      payment: {
        can_pay: app.status === ADM.VALIDATED,
        amount: app.feeAmount,
        status: app.paymentStatus,
        last_order: lastOrder,
      },
    };
  }

  /** Save without validation or status change (parent can come back later). */
  @Post(':token/draft')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async saveDraft(@Param('token') token: string, @Body() body: Record<string, unknown>) {
    const app = await this.editable(token);
    const v = await this.svc.validateSubmission(app, body ?? {}, false);
    await this.prisma.admission.update({
      where: { id: app.id },
      data: { dynamicData: JSON.stringify(v.data), ...(v.studentName ? { studentName: v.studentName } : {}) },
    });
    return { message: 'Draft saved' };
  }

  @Post(':token/submit')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async submit(@Param('token') token: string, @Body() body: Record<string, unknown>) {
    const app = await this.editable(token);
    const v = await this.svc.validateSubmission(app, body ?? {}, true);
    await this.prisma.$transaction((tx) =>
      transitionAdmission(tx, {
        admissionId: app.id,
        branchId: app.branchId,
        action: 'submit',
        actor: { id: app.parentUserId, role: PARENT_LINK },
        data: {
          dynamicData: JSON.stringify(v.data),
          studentName: v.studentName,
          dob: v.dob,
          ...(v.classId ? { classId: v.classId } : {}),
          submittedAt: new Date(),
        },
      }),
    );
    await this.svc.notifyParent(app, 'Admission form received',
      `We have received the admission form for ${v.studentName ?? 'your ward'}. The admission office will verify the documents.`);
    return { message: 'Application submitted successfully', status: ADM.SUBMITTED };
  }

  @Post(':token/documents')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async upload(@Param('token') token: string, @Body() body: UploadDocumentDto) {
    const app = await this.editable(token);
    const file = validateUpload(body.file_name, body.data_url);
    const count = await this.prisma.admissionDocument.count({ where: { admissionId: app.id } });
    if (count >= 20) throw new ConflictException('Too many documents on this application');
    const doc = await this.docs.createAdmissionDoc(app.branchId, app.id, body.doc_type, file);
    return { id: doc.id, message: 'Document uploaded', size_bytes: file.sizeBytes };
  }

  @Delete(':token/documents/:docId')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async removeDoc(@Param('token') token: string, @Param('docId') docId: string) {
    const app = await this.editable(token);
    const doc = await this.prisma.admissionDocument.findFirst({
      where: { id: docId, admissionId: app.id, docType: { not: 'fee_receipt' } },
      select: { id: true, storageKey: true },
    });
    if (!doc) throw new NotFoundException('Document not found');
    await this.docs.deleteDoc(doc);
    return { message: 'Document removed' };
  }

  /** Payment step for the parent (after Document Validated). Amount is computed server-side. */
  @Post(':token/pay')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async pay(@Param('token') token: string) {
    const app = await this.load(token);
    if (app.status !== ADM.VALIDATED) throw new ConflictException(`Payment is not open for this application (status: ${app.status})`);
    return this.payments.createOrder({ branchId: app.branchId, purpose: 'admission', refId: app.id });
  }
}
