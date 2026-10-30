import * as crypto from 'crypto';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Admission } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { R, ROLE } from '../auth/roles';
import { AuthUser, assertInBranch, audit } from '../common/access';
import { sendPdf } from '../common/pdf';
import {
  AllocateDto,
  CopyTemplateDto,
  CreateFieldDto,
  FeeApproveDto,
  OfflinePaymentDto,
  OptionalRemarksDto,
  RemarksDto,
  ReorderFieldsDto,
  SignDto,
  TriggerLinksDto,
  UpdateFieldDto,
  UploadDocumentDto,
  ValidateDto,
} from './admissions.dto';
import { AdmissionsService, LINK_DAYS, formLink, formQrDataUrl, formQrPng, toPublicField } from './admissions.service';
import {
  ADM,
  Actor,
  TERMINAL_STATUSES,
  YEAR_RE,
  academicYearOf,
  fieldKey,
  parseDynamic,
  studentFieldsFromForm,
  transitionAdmission,
  validateUpload,
} from './workflow';
import { defaultAdmissionFee } from '../payments/payments.service';
import { DocumentStorage } from '../storage/document-storage.service';

type Req = { user: AuthUser };
const actorOf = (req: Req): Actor => ({ id: req.user.sub, role: req.user.role });
const EDITABLE_TEMPLATE = ['Draft', 'Rejected'];
const VP_OR_PRINCIPAL = [...new Set([...R.ADMISSION_VP, ...R.ADMISSION_PRINCIPAL])];
const LETTER_STATUSES: string[] = [ADM.CONFIRMED, ADM.COMPLETE];

function yearParam(year: string | undefined): string {
  const y = year ?? academicYearOf();
  if (!YEAR_RE.test(y)) throw new BadRequestException('academic_year must look like 2026-27');
  return y;
}

/** List/detail view of an application: never exposes the form token. */
function view(app: Admission & Record<string, unknown>) {
  const { token: _token, ...rest } = app;
  return rest;
}

@Controller('admissions')
@UseGuards(AuthGuard, RolesGuard)
export class AdmissionsController {
  constructor(
    private prisma: PrismaService,
    private svc: AdmissionsService,
    private docs: DocumentStorage,
  ) {}

  // ─── Field template (per academic year) ──────────────────────

  @Get('fields')
  @Roles(...R.ADMISSION_READ)
  listFields(@Req() req: Req, @Query('academic_year') year?: string) {
    return this.prisma.admissionField.findMany({
      where: { branchId: req.user.branch_id, academicYear: yearParam(year) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Template status per year: Draft | Pending Approval | Published | Rejected (+ OS remarks). */
  @Get('templates')
  @Roles(...R.ADMISSION_READ)
  async templates(@Req() req: Req) {
    const fields = await this.prisma.admissionField.findMany({
      where: { branchId: req.user.branch_id },
      orderBy: { reviewedAt: 'desc' },
    });
    const byYear = new Map<string, typeof fields>();
    for (const f of fields) {
      const y = f.academicYear ?? 'unassigned';
      byYear.set(y, [...(byYear.get(y) ?? []), f]);
    }
    return [...byYear.entries()]
      .map(([year, fs]) => {
        const statuses = new Set(fs.map((f) => f.status));
        const status = statuses.has('Pending Approval')
          ? 'Pending Approval'
          : statuses.has('Rejected')
            ? 'Rejected'
            : statuses.has('Draft')
              ? 'Draft'
              : 'Published';
        const reviewed = fs.find((f) => f.reviewedAt);
        return {
          academic_year: year,
          status,
          field_count: fs.length,
          review_remarks: reviewed?.reviewRemarks ?? null,
          reviewed_at: reviewed?.reviewedAt ?? null,
        };
      })
      .sort((a, b) => b.academic_year.localeCompare(a.academic_year));
  }

  private async assertTemplateEditable(branchId: string, year: string) {
    const locked = await this.prisma.admissionField.count({
      where: { branchId, academicYear: year, status: { notIn: EDITABLE_TEMPLATE } },
    });
    if (locked) {
      throw new ConflictException(`The ${year} template is pending approval or published; create the next year's template instead`);
    }
  }

  private assertRegex(rule?: string) {
    if (!rule) return;
    try {
      new RegExp(rule);
    } catch {
      throw new BadRequestException('validation_rule is not a valid regular expression');
    }
  }

  @Post('fields')
  @Roles(...R.ADMISSION_SETUP)
  async createField(@Req() req: Req, @Body() body: CreateFieldDto) {
    const year = yearParam(body.academic_year);
    const branchId = req.user.branch_id;
    await this.assertTemplateEditable(branchId, year);
    this.assertRegex(body.validation_rule);
    const existing = await this.prisma.admissionField.findMany({ where: { branchId, academicYear: year }, select: { label: true, sortOrder: true } });
    if (existing.some((f) => fieldKey(f.label) === fieldKey(body.label))) throw new ConflictException('A field with this label already exists');
    const field = await this.prisma.admissionField.create({
      data: {
        branchId,
        label: body.label.trim(),
        fieldType: body.field_type,
        isRequired: body.is_required ?? true,
        validationRule: body.validation_rule || null,
        academicYear: year,
        status: 'Draft',
        sortOrder: existing.reduce((m, f) => Math.max(m, f.sortOrder + 1), 0),
      },
    });
    return { id: field.id, message: 'Field created successfully' };
  }

  @Post('fields/reorder')
  @Roles(...R.ADMISSION_SETUP)
  async reorder(@Req() req: Req, @Body() body: ReorderFieldsDto) {
    await this.assertTemplateEditable(req.user.branch_id, body.academic_year);
    const fields = await this.prisma.admissionField.findMany({
      where: { branchId: req.user.branch_id, academicYear: body.academic_year, id: { in: body.ids } },
      select: { id: true },
    });
    if (fields.length !== body.ids.length) throw new NotFoundException('field not found');
    await this.prisma.$transaction(body.ids.map((id, i) => this.prisma.admissionField.update({ where: { id }, data: { sortOrder: i } })));
    return { message: 'Order saved' };
  }

  private async editableField(branchId: string, id: string) {
    const f = await this.prisma.admissionField.findFirst({ where: { id, branchId } });
    if (!f) throw new NotFoundException('Field not found');
    if (!EDITABLE_TEMPLATE.includes(f.status)) throw new ConflictException(`Field is ${f.status} and can no longer be changed`);
    return f;
  }

  @Put('fields/:id')
  @Roles(...R.ADMISSION_SETUP)
  async updateField(@Req() req: Req, @Param('id') id: string, @Body() body: UpdateFieldDto) {
    await this.editableField(req.user.branch_id, id);
    this.assertRegex(body.validation_rule);
    await this.prisma.admissionField.update({
      where: { id },
      data: {
        ...(body.label !== undefined ? { label: body.label.trim() } : {}),
        ...(body.field_type !== undefined ? { fieldType: body.field_type } : {}),
        ...(body.is_required !== undefined ? { isRequired: body.is_required } : {}),
        ...(body.validation_rule !== undefined ? { validationRule: body.validation_rule || null } : {}),
      },
    });
    return { message: 'Field updated' };
  }

  @Delete('fields/:id')
  @Roles(...R.ADMISSION_SETUP)
  async deleteField(@Req() req: Req, @Param('id') id: string) {
    await this.editableField(req.user.branch_id, id);
    await this.prisma.admissionField.delete({ where: { id } });
    return { message: 'Field deleted' };
  }

  private async sendForApproval(req: Req, year: string) {
    const res = await this.prisma.admissionField.updateMany({
      where: { branchId: req.user.branch_id, academicYear: year, status: { in: EDITABLE_TEMPLATE } },
      data: { status: 'Pending Approval' },
    });
    if (res.count === 0) throw new ConflictException(`No draft fields to send for ${year}`);
    await audit(this.prisma, req.user, 'UPDATE', 'admission_template', year, 'sent for approval');
    return { success: true, sent: res.count, academic_year: year, message: 'Sent to OS for approval' };
  }

  @Post('templates/:year/send')
  @Roles(...R.ADMISSION_SETUP)
  sendTemplate(@Req() req: Req, @Param('year') year: string) {
    return this.sendForApproval(req, yearParam(year));
  }

  /** Legacy name of templates/:year/send (current academic year). */
  @Post('setup-fields')
  @Roles(...R.ADMISSION_SETUP)
  setupFields(@Req() req: Req, @Query('academic_year') year?: string) {
    return this.sendForApproval(req, yearParam(year));
  }

  @Post('templates/:year/approve')
  @Roles(...R.ADMISSION_OS)
  async approveTemplate(@Req() req: Req, @Param('year') year: string, @Body() body: OptionalRemarksDto) {
    const y = yearParam(year);
    const res = await this.prisma.admissionField.updateMany({
      where: { branchId: req.user.branch_id, academicYear: y, status: 'Pending Approval' },
      data: { status: 'Published', reviewRemarks: body.remarks ?? null, reviewedBy: req.user.sub, reviewedAt: new Date() },
    });
    if (res.count === 0) throw new ConflictException(`Nothing pending approval for ${y}`);
    await audit(this.prisma, req.user, 'APPROVE', 'admission_template', y);
    return { message: 'Template published', academic_year: y, fields: res.count };
  }

  @Post('templates/:year/reject')
  @Roles(...R.ADMISSION_OS)
  async rejectTemplate(@Req() req: Req, @Param('year') year: string, @Body() body: RemarksDto) {
    const y = yearParam(year);
    const res = await this.prisma.admissionField.updateMany({
      where: { branchId: req.user.branch_id, academicYear: y, status: 'Pending Approval' },
      data: { status: 'Rejected', reviewRemarks: body.remarks.trim(), reviewedBy: req.user.sub, reviewedAt: new Date() },
    });
    if (res.count === 0) throw new ConflictException(`Nothing pending approval for ${y}`);
    await audit(this.prisma, req.user, 'REJECT', 'admission_template', y, body.remarks);
    return { message: 'Template sent back to the admission officer', academic_year: y };
  }

  @Post('templates/:year/copy')
  @Roles(...R.ADMISSION_SETUP)
  async copyTemplate(@Req() req: Req, @Param('year') year: string, @Body() body: CopyTemplateDto) {
    const y = yearParam(year);
    const branchId = req.user.branch_id;
    if (y === body.from_year) throw new BadRequestException('Choose a different source year');
    if (await this.prisma.admissionField.count({ where: { branchId, academicYear: y } })) {
      throw new ConflictException(`${y} already has fields; delete them first`);
    }
    const src = await this.prisma.admissionField.findMany({
      where: { branchId, academicYear: body.from_year },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (!src.length) throw new NotFoundException(`No template for ${body.from_year}`);
    await this.prisma.admissionField.createMany({
      data: src.map((f, i) => ({
        branchId,
        label: f.label,
        fieldType: f.fieldType,
        isRequired: f.isRequired,
        validationRule: f.validationRule,
        academicYear: y,
        status: 'Draft',
        sortOrder: i,
      })),
    });
    return { message: `Copied ${src.length} fields from ${body.from_year}`, copied: src.length };
  }

  // ─── Applications ────────────────────────────────────────────

  @Get()
  @Roles(...R.ADMISSION_READ)
  async listApplications(@Req() req: Req, @Query('status') status?: string, @Query('academic_year') year?: string) {
    const rows = await this.prisma.admission.findMany({
      where: { branchId: req.user.branch_id, ...(status ? { status } : {}), ...(year ? { academicYear: year } : {}) },
      include: { class: { select: { id: true, name: true, section: true } }, _count: { select: { documents: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(view);
  }

  /** Logged-in parent: own applications with status, timeline and confirmation. */
  @Get('my')
  @Roles(ROLE.PARENT)
  async my(@Req() req: Req) {
    const apps = await this.prisma.admission.findMany({
      where: { branchId: req.user.branch_id, parentUserId: req.user.sub },
      include: {
        class: { select: { id: true, name: true, section: true } },
        steps: { orderBy: { createdAt: 'asc' }, select: { fromStatus: true, toStatus: true, action: true, actorRole: true, remarks: true, createdAt: true } },
        documents: { where: { docType: { not: 'fee_receipt' } }, select: { id: true, docType: true, fileName: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(apps.map(async (a) => {
      const link = [ADM.LINKS_SENT, ADM.RESUBMIT].includes(a.status as never) && a.token ? formLink(a.token) : null;
      const qr = a.token ? await formQrDataUrl(formLink(a.token)) : null;
      return {
      id: a.id,
      status: a.status,
      academic_year: a.academicYear,
      student_name: a.studentName,
      remarks: a.remarks,
      link_expires_at: a.linkExpiresAt,
      token: [ADM.LINKS_SENT, ADM.RESUBMIT, ADM.VALIDATED].includes(a.status as never) ? a.token : null,
      form_link: link,
      qr_data_url: qr,
      fee_amount: a.feeAmount,
      payment_status: a.paymentStatus,
      can_pay: a.status === ADM.VALIDATED,
      timeline: a.steps,
      documents: a.documents,
      confirmation:
        a.status === ADM.COMPLETE || a.status === ADM.CONFIRMED
          ? {
              student_id: a.studentId,
              roll_no: a.rollNo,
              house: a.house,
              class: a.class,
              receipt_no: a.receiptNo,
              signed_by_name: a.signatureName,
              signed_at: a.signedAt,
            }
          : null,
      letter_available: a.status === ADM.COMPLETE,
      };
    }));
  }

  @Post('trigger-links')
  @Roles(...R.ADMISSION_SETUP)
  async triggerLinks(@Req() req: Req, @Body() body: TriggerLinksDto) {
    const year = yearParam(body.academic_year);
    const published = await this.svc.publishedTemplate(req.user.branch_id, year);
    if (!published.length) throw new ConflictException(`No published admission form template for ${year}; get it approved by the OS first`);
    const generated = [];
    for (const p of body.parents) {
      if (!p.parent_email && !p.parent_contact) throw new BadRequestException(`${p.parent_name}: an email or phone number is required`);
      generated.push(await this.svc.createParentInvite(req.user.branch_id, actorOf(req), p, year, body.fee_amount ?? defaultAdmissionFee()));
    }
    return {
      message: 'Admission forms created and links sent',
      note: 'Passwords are shown only in this response; they are not stored and cannot be retrieved again.',
      generated,
    };
  }

  @Post('reminders/run')
  @HttpCode(200)
  @Roles(...R.ADMISSION_SETUP)
  runReminders(@Req() req: Req) {
    return this.svc.runReminders(new Date(), req.user.branch_id);
  }

  // ─── Documents (literal routes before :id) ──────────────────

  /**
   * Short-lived signed URL `{ url, expires_at, file_name, mime_type }` (inline, so the drawer can
   * preview it). `data_url` is only returned for legacy rows not yet moved into storage.
   */
  @Get('documents/:docId/download')
  @Roles(...R.ADMISSION_READ)
  async downloadDocument(@Req() req: Req, @Param('docId') docId: string) {
    const doc = await this.prisma.admissionDocument.findFirst({ where: { id: docId, branchId: req.user.branch_id } });
    if (!doc) throw new NotFoundException('Document not found');
    return this.docs.link(doc, { inline: true });
  }

  @Delete('documents/:docId')
  @Roles(...R.ADMISSION_SETUP)
  async deleteDocument(@Req() req: Req, @Param('docId') docId: string): Promise<{ message: string }> {
    const doc = await this.prisma.admissionDocument.findFirst({ where: { id: docId, branchId: req.user.branch_id } });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.studentId) throw new ConflictException('Archived student documents cannot be deleted here');
    await this.docs.deleteDoc(doc);
    return { message: 'Document deleted' };
  }

  // ─── Single application ──────────────────────────────────────

  @Get(':id')
  @Roles(...R.ADMISSION_READ)
  async detail(@Req() req: Req, @Param('id') id: string) {
    const app = await this.svc.getInBranch(req.user.branch_id, id);
    const fields = app.academicYear ? await this.svc.publishedTemplate(app.branchId, app.academicYear) : [];
    const canSeeLink = (R.ADMISSION_SETUP as string[]).includes(req.user.role);
    const link = canSeeLink && app.token ? formLink(app.token) : null;
    const qrDataUrl = link ? await formQrDataUrl(link) : null;
    return {
      ...view(app),
      dynamic_data: parseDynamic(app.dynamicData),
      template: fields.map(toPublicField),
      form_link: link,
      qr_data_url: qrDataUrl,
    };
  }

  @Get(':id/timeline')
  @Roles(...R.ADMISSION_READ)
  async timeline(@Req() req: Req, @Param('id') id: string) {
    await assertInBranch(this.prisma, 'admission', id, req.user.branch_id);
    return this.svc.timeline(req.user.branch_id, id);
  }

  private step(req: Req, id: string, action: Parameters<typeof transitionAdmission>[1]['action'], remarks?: string, data?: Parameters<typeof transitionAdmission>[1]['data']) {
    return this.prisma.$transaction((tx) =>
      transitionAdmission(tx, { admissionId: id, branchId: req.user.branch_id, action, actor: actorOf(req), remarks, data }),
    );
  }

  @Post(':id/validate')
  @Roles(...R.ADMISSION_SETUP)
  async validate(@Req() req: Req, @Param('id') id: string, @Body() body: ValidateDto) {
    const valid = body.is_valid ?? body.isValid;
    if (valid === undefined) throw new BadRequestException('is_valid is required');
    if (valid) {
      await this.step(req, id, 'validate', body.remarks);
      const app = await this.svc.getInBranch(req.user.branch_id, id);
      await this.svc.notifyParent(app, 'Documents verified — fee payment due',
        `Your documents for ${app.studentName ?? 'the application'} are verified. Please pay the admission fee from the form link or the parent portal.`);
      return { message: 'Application validated', status: ADM.VALIDATED };
    }
    // Re-submit: the parent gets a fresh 15-day window to fix the form.
    await this.step(req, id, 'request_resubmit', body.remarks, {
      linkExpiresAt: new Date(Date.now() + LINK_DAYS * 86_400_000),
    });
    const app = await this.svc.getInBranch(req.user.branch_id, id);
    await this.svc.notifyParent(app, 'Admission form needs changes',
      `Please correct and resubmit the admission form: ${body.remarks}. Link: ${formLink(app.token ?? '')}`);
    return { message: 'Sent back to parent for re-submission', status: ADM.RESUBMIT };
  }

  /** Accounts records an offline (counter / bank) payment — needs a reference. */
  @Post(':id/pay')
  @Roles(...R.ADMISSION_ACCOUNTS)
  async recordOfflinePayment(@Req() req: Req, @Param('id') id: string, @Body() body: OfflinePaymentDto) {
    const app = await this.svc.getInBranch(req.user.branch_id, id);
    const amount = body.amount ?? app.feeAmount ?? defaultAdmissionFee();
    await this.step(req, id, 'record_offline_payment', `Offline ${body.payment_mode ?? 'payment'} ref ${body.reference_no}`, {
      paymentStatus: 'Paid',
      paymentRef: `${body.payment_mode ?? 'Offline'}:${body.reference_no}`,
      paidAt: new Date(),
      feeAmount: amount,
    });
    return { message: 'Payment recorded', status: ADM.PAYMENT_RECEIVED };
  }

  @Post(':id/verify-receipt')
  @Roles(...R.ADMISSION_ACCOUNTS)
  async feeApprove(@Req() req: Req, @Param('id') id: string, @Body() body: FeeApproveDto) {
    const branchId = req.user.branch_id;
    const app = await this.svc.getInBranch(branchId, id);
    const receiptNo = body.receipt_no?.trim() || (await this.nextAdmissionReceipt(branchId));
    const dup = await this.prisma.admission.findFirst({ where: { branchId, receiptNo, NOT: { id } }, select: { id: true } });
    if (dup) throw new ConflictException('Receipt number already used');
    const file = body.receipt ? validateUpload(body.receipt.file_name, body.receipt.data_url) : null;
    // The object is written before the transaction; if the transition fails (wrong status,
    // race) the orphan object is removed again.
    const stored = file ? await this.docs.putAdmissionFile(branchId, app.id, file) : null;
    try {
      await this.prisma.$transaction(async (tx) => {
        let receiptDocId: string | null = null;
        if (stored) {
          const doc = await tx.admissionDocument.create({ data: { ...stored, branchId, admissionId: app.id, docType: 'fee_receipt' } });
          receiptDocId = doc.id;
        }
        await transitionAdmission(tx, {
          admissionId: id,
          branchId,
          action: 'fee_approve',
          actor: actorOf(req),
          remarks: body.remarks,
          data: { paymentStatus: 'Verified', receiptNo, ...(receiptDocId ? { receiptDocId } : {}) },
        });
      });
    } catch (e) {
      await this.docs.discard(stored?.storageKey);
      throw e;
    }
    return { message: 'Payment verified and fee approved', receipt_no: receiptNo, status: ADM.FEE_APPROVED };
  }

  private async nextAdmissionReceipt(branchId: string): Promise<string> {
    const year = new Date().getFullYear();
    let n = await this.prisma.admission.count({ where: { branchId, receiptNo: { startsWith: `ADM-RCPT-${year}-` } } });
    for (;;) {
      n += 1;
      const candidate = `ADM-RCPT-${year}-${String(n).padStart(4, '0')}`;
      if (!(await this.prisma.admission.findFirst({ where: { branchId, receiptNo: candidate }, select: { id: true } }))) return candidate;
    }
  }

  /**
   * Roll number per plan spec: [CLASS][YEAR][SEQ] — e.g. 10A-2026-007.
   * Class resolved from body > admission.classId > form data > first class.
   * House allocated to the currently least-populated house (balanced).
   */
  @Post(':id/allocate')
  @Roles(...R.ADMISSION_OS)
  async allocate(@Req() req: Req, @Param('id') id: string, @Body() body: AllocateDto) {
    const branchId = req.user.branch_id;
    const app = await this.svc.getInBranch(branchId, id);
    if (app.status !== ADM.FEE_APPROVED) throw new ConflictException(`Cannot assign roll number in status "${app.status}"`);
    await assertInBranch(this.prisma, 'class', body.class_id, branchId);
    const dynamic = parseDynamic(app.dynamicData);
    const classId = body.class_id ?? app.classId ?? (typeof dynamic['class_id'] === 'string' ? dynamic['class_id'] : null);
    const cls = classId
      ? await this.prisma.class.findFirst({ where: { id: classId, branchId } })
      : await this.prisma.class.findFirst({ where: { branchId }, orderBy: { name: 'asc' } });

    const prefix = cls ? `${cls.name}${cls.section ?? ''}`.replace(/\s+/g, '').toUpperCase() : 'GEN';
    const year = new Date().getFullYear();
    const siblings = await this.prisma.student.findMany({
      where: { branchId, ...(cls ? { classId: cls.id } : {}), rollNo: { not: null } },
      select: { rollNo: true },
    });
    const allocated = await this.prisma.admission.findMany({
      where: { branchId, rollNo: { not: null }, ...(cls ? { classId: cls.id } : {}) },
      select: { rollNo: true },
    });
    const used = new Set([...siblings, ...allocated].map((r) => r.rollNo ?? '').filter((rn) => rn.startsWith(`${prefix}-${year}-`)));
    let n = 0;
    for (const rn of used) {
      const parsed = parseInt(rn.split('-').pop() ?? '0', 10);
      if (Number.isFinite(parsed) && parsed > n) n = parsed;
    }
    let rollNo: string;
    do {
      n += 1;
      rollNo = `${prefix}-${year}-${String(n).padStart(3, '0')}`;
    } while (used.has(rollNo));

    // balanced house: least-populated wins (students + in-flight admissions), ties in canonical order
    const houses = ['Red', 'Blue', 'Green', 'Yellow'];
    const counts = await this.prisma.student.groupBy({ by: ['house'], where: { branchId, house: { in: houses } }, _count: true });
    const pendingCounts = await this.prisma.admission.groupBy({
      by: ['house'],
      where: { branchId, house: { in: houses }, status: { in: [ADM.ROLL_ASSIGNED, ADM.VP_APPROVED, ADM.CONFIRMED] } },
      _count: true,
    });
    const countOf = (h: string) =>
      (counts.find((c) => c.house === h)?._count ?? 0) + (pendingCounts.find((c) => c.house === h)?._count ?? 0);
    const autoHouse = houses.reduce((min, h) => (countOf(h) < countOf(min) ? h : min), houses[0]);
    const house = body.house?.trim() ? body.house.trim() : autoHouse;
    const stepRemarks = body.forward_to?.trim() ? `Forwarded to ${body.forward_to.trim()}` : undefined;

    await this.step(req, id, 'assign_roll', stepRemarks, { rollNo, house, classId: cls?.id ?? app.classId });
    return { message: 'Roll No and House allocated', roll_no: rollNo, house, class_id: cls?.id ?? null };
  }

  @Post(':id/vp-approve')
  @Roles(...R.ADMISSION_VP)
  async vpApprove(@Req() req: Req, @Param('id') id: string, @Body() body: OptionalRemarksDto) {
    await this.step(req, id, 'vp_approve', body.remarks);
    return { message: 'VP approved', status: ADM.VP_APPROVED };
  }

  @Post(':id/vp-send-back')
  @Roles(...R.ADMISSION_VP)
  async vpSendBack(@Req() req: Req, @Param('id') id: string, @Body() body: RemarksDto) {
    // Roll number/house are released so the OS re-allocates them.
    await this.step(req, id, 'vp_send_back', body.remarks, { rollNo: null, house: null });
    return { message: 'Sent back to the Office Superintendent', status: ADM.FEE_APPROVED };
  }

  /** Principal digital sign → Admission Confirmed → (same transaction) Admission Complete. */
  @Post(':id/principal-approve')
  @Roles(...R.ADMISSION_PRINCIPAL)
  async principalApprove(@Req() req: Req, @Param('id') id: string, @Body() body: SignDto) {
    await assertInBranch(this.prisma, 'admission', id, req.user.branch_id);
    const result = await this.svc.confirmAndComplete(req.user.branch_id, id, actorOf(req), body.signature_name, body.remarks);
    const app = await this.svc.getInBranch(req.user.branch_id, id);
    await this.svc.notifyParent(app, 'Admission confirmed',
      `Admission of ${app.studentName ?? 'your ward'} is confirmed. Roll No ${app.rollNo ?? '-'}, House ${app.house ?? '-'}. The admission letter is available in the parent portal.`);
    return { message: 'Admission confirmed and student moved to master record', status: ADM.COMPLETE, ...result };
  }

  @Post(':id/principal-send-back')
  @Roles(...R.ADMISSION_PRINCIPAL)
  async principalSendBack(@Req() req: Req, @Param('id') id: string, @Body() body: RemarksDto) {
    await this.step(req, id, 'principal_send_back', body.remarks);
    return { message: 'Sent back to the Vice Principal', status: ADM.ROLL_ASSIGNED };
  }

  @Post(':id/reject')
  @Roles(...VP_OR_PRINCIPAL)
  async reject(@Req() req: Req, @Param('id') id: string, @Body() body: RemarksDto) {
    await this.step(req, id, 'reject', body.remarks);
    const app = await this.svc.getInBranch(req.user.branch_id, id);
    await this.svc.notifyParent(app, 'Admission application closed', `The admission application was not approved: ${body.remarks}`);
    return { message: 'Application rejected', status: ADM.REJECTED };
  }

  @Post(':id/reissue-link')
  @Roles(...R.ADMISSION_SETUP)
  async reissue(@Req() req: Req, @Param('id') id: string) {
    const token = `tok_${crypto.randomBytes(24).toString('hex')}`;
    const linkExpiresAt = new Date(Date.now() + LINK_DAYS * 86_400_000);
    await this.step(req, id, 'reissue_link', undefined, { token, linkExpiresAt, remindersSent: 0, lastReminderAt: null });
    const app = await this.svc.getInBranch(req.user.branch_id, id);
    await this.svc.notifyParent(app, 'Admission form link re-issued',
      `Your admission form link: ${formLink(token)} (valid until ${linkExpiresAt.toISOString().slice(0, 10)}). Login ID: ${app.loginId ?? '-'}`);
    const reissuedLink = formLink(token);
    const qrDataUrl = await formQrDataUrl(reissuedLink);
    return { message: 'Link re-issued', form_link: reissuedLink, qr_data_url: qrDataUrl, link_expires_at: linkExpiresAt };
  }

  /** QR code PNG for an admission application's form link. */
  @Get(':id/qr.png')
  @Roles(...R.ADMISSION_READ, ROLE.PARENT)
  async qrPng(@Req() req: Req, @Param('id') id: string, @Res() res: Response) {
    const app = await this.svc.getInBranch(req.user.branch_id, id);
    if (req.user.role === ROLE.PARENT && app.parentUserId !== req.user.sub) {
      throw new NotFoundException('Application not found');
    }
    const targetUrl = app.token
      ? formLink(app.token)
      : `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/portal/admission`;
    const buf = await formQrPng(targetUrl);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="admission-qr-${app.id.slice(0, 8)}.png"`);
    return res.send(buf);
  }

  @Post(':id/documents')
  @Roles(...R.ADMISSION_SETUP)
  async uploadDocument(@Req() req: Req, @Param('id') id: string, @Body() body: UploadDocumentDto) {
    const app = await this.svc.getInBranch(req.user.branch_id, id);
    if (TERMINAL_STATUSES.includes(app.status)) throw new ConflictException(`Application is ${app.status}`);
    const file = validateUpload(body.file_name, body.data_url);
    const doc = await this.docs.createAdmissionDoc(req.user.branch_id, id, body.doc_type, file);
    return { id: doc.id, message: 'Document uploaded successfully', size_bytes: file.sizeBytes };
  }

  @Get(':id/documents')
  @Roles(...R.ADMISSION_READ)
  async listDocuments(@Req() req: Req, @Param('id') id: string) {
    await assertInBranch(this.prisma, 'admission', id, req.user.branch_id);
    return this.prisma.admissionDocument.findMany({
      where: { admissionId: id, branchId: req.user.branch_id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, docType: true, fileName: true, sizeBytes: true, mimeType: true, studentId: true, createdAt: true },
    });
  }

  // ─── Admission letter ────────────────────────────────────────

  /** Legacy JSON letter data (kept for older clients). 403 before the principal signs. */
  @Get(':id/letter-data')
  @Roles(...R.ADMISSION_READ)
  async letterData(@Req() req: Req, @Param('id') id: string) {
    const app = await this.svc.getInBranch(req.user.branch_id, id);
    if (!LETTER_STATUSES.includes(app.status)) throw new ForbiddenException('Admission letter available only after principal approval');
    return {
      application_id: app.id,
      student_name: app.studentName,
      dob: app.dob,
      parent_name: app.parentName,
      parent_contact: app.parentContact,
      roll_no: app.rollNo,
      house: app.house,
      status: app.status,
      class: app.class,
      signature_name: app.signatureName,
      signed_at: app.signedAt,
      generated_at: new Date().toISOString(),
    };
  }

  /** Admission letter PDF. Staff from Admission Confirmed; the applicant's parent once Admission Complete. */
  @Get(':id/letter.pdf')
  @Roles(...R.ADMISSION_READ, ROLE.PARENT)
  async letterPdf(@Req() req: Req, @Param('id') id: string, @Res() res: Response) {
    const app = await this.svc.getInBranch(req.user.branch_id, id);
    if (req.user.role === ROLE.PARENT) {
      if (app.parentUserId !== req.user.sub) throw new NotFoundException('Application not found');
      if (app.status !== ADM.COMPLETE) throw new ConflictException('The admission letter is available once the admission is complete');
    } else if (!LETTER_STATUSES.includes(app.status)) {
      throw new ConflictException('The admission letter is available after the principal signs');
    }
    const buf = await this.svc.letterPdf(app);
    return sendPdf(res, buf, `admission-letter-${app.rollNo ?? app.id.slice(0, 8)}.pdf`);
  }

  /** Printable Application Summary PDF (all form responses, document checklist, fee & workflow status). */
  @Get(':id/summary.pdf')
  @Roles(...R.ADMISSION_READ, ROLE.PARENT)
  async summaryPdf(@Req() req: Req, @Param('id') id: string, @Res() res: Response) {
    const app = await this.svc.getInBranch(req.user.branch_id, id);
    if (req.user.role === ROLE.PARENT && app.parentUserId !== req.user.sub) {
      throw new NotFoundException('Application not found');
    }
    const buf = await this.svc.summaryPdf(app);
    return sendPdf(res, buf, `admission-summary-${app.loginId ?? app.id.slice(0, 8)}.pdf`);
  }

  // ─── Export hooks (Phase 2: data shape only) ────────────────

  @Get(':id/export/:kind')
  @Roles(...R.ADMISSION_READ)
  async exportHook(@Req() req: Req, @Param('id') id: string, @Param('kind') kind: string) {
    if (!['tc', 'id-card', 'fee'].includes(kind)) throw new NotFoundException('Unknown export');
    const app = await this.svc.getInBranch(req.user.branch_id, id);
    if (app.status !== ADM.COMPLETE || !app.studentId) throw new ConflictException('Exports are available once the admission is complete');
    const student = await this.prisma.student.findUnique({
      where: { id: app.studentId },
      include: { class: { select: { id: true, name: true, section: true } }, branch: { select: { name: true } } },
    });
    if (!student) throw new NotFoundException('Student not found');
    const sf = studentFieldsFromForm(parseDynamic(app.dynamicData));
    if (kind === 'tc') {
      return {
        kind: 'transfer_certificate',
        version: 1,
        school: student.branch.name,
        student_id: student.id,
        admission_no: student.admissionNo,
        full_name: student.fullName,
        dob: student.dob,
        father_name: student.fatherName,
        mother_name: student.motherName,
        class_admitted: student.class,
        date_of_admission: student.enrollmentDate,
        roll_no: student.rollNo,
        house: student.house,
        academic_year: app.academicYear,
        // filled by the TC module when the student leaves:
        date_of_leaving: null,
        reason_for_leaving: null,
        conduct: null,
      };
    }
    if (kind === 'id-card') {
      const photo = await this.prisma.admissionDocument.findFirst({ where: { studentId: student.id, docType: 'photo' }, select: { id: true } });
      return {
        kind: 'id_card',
        version: 1,
        school: student.branch.name,
        student_id: student.id,
        admission_no: student.admissionNo,
        full_name: student.fullName,
        class: student.class,
        roll_no: student.rollNo,
        house: student.house,
        dob: student.dob,
        blood_group: student.bloodGroup ?? sf.bloodGroup,
        parent_name: app.parentName,
        emergency_contact: app.parentContact,
        photo_document_id: photo?.id ?? null,
        academic_year: app.academicYear,
      };
    }
    return {
      kind: 'fee_handoff',
      version: 1,
      student_id: student.id,
      admission_id: app.id,
      class_id: student.classId,
      academic_year: app.academicYear,
      admission_fee: {
        amount: app.feeAmount,
        paid_at: app.paidAt,
        payment_ref: app.paymentRef,
        receipt_no: app.receiptNo,
        receipt_document_id: app.receiptDocId,
        status: app.paymentStatus,
      },
      // the fee module generates term invoices from the class fee structure
      next_action: 'generate_term_invoices',
    };
  }
}
