import {
  Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Put, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { R, ROLE } from '../auth/roles';
import { assertCanSeeStudent, assertInBranch, audit, currentStaffId, portalStudentIds, ReqWithUser } from '../common/access';
import { buildPdf, sendPdf } from '../common/pdf';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { nextDocNo, withDocNoRetry } from './doc-no';
import { invoiceMoney, today } from './fee-summary';
import {
  CreateFeeStructureDto, CreateInvoiceDto, CreatePaymentDto, GenerateInvoicesDto, SendPendingRemindersDto, UpdateFeeStructureDto,
} from './dto/fees.dto';

/** Fee staff + the parent/student portal (portal callers are narrowed to their own child). */
const FEES_READ_PORTAL = [...R.FEES_READ, ROLE.PARENT, ROLE.STUDENT];

const STUDENT_SELECT = {
  id: true, fullName: true, admissionNo: true, rollNo: true,
  class: { select: { id: true, name: true, section: true } },
} as const;

@Controller('fees')
@UseGuards(AuthGuard, RolesGuard)
export class FeesController {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  private async schoolName(branchId: string) {
    const b = await this.prisma.branch.findUnique({ where: { id: branchId }, select: { name: true, location: true } });
    return { school: b?.name ?? 'School', schoolLine: b?.location ?? undefined };
  }

  // ─── Fee structures CRUD ────────────────────────────────────

  @Get('structures')
  @Roles(...R.FEES_READ)
  async listStructures(@Req() req: ReqWithUser, @Query('class_id') classId?: string) {
    if (classId) await assertInBranch(this.prisma, 'class', classId, req.user.branch_id);
    return this.prisma.feeStructure.findMany({
      where: { branchId: req.user.branch_id, ...(classId ? { classId } : {}) },
      include: { class: { select: { id: true, name: true, section: true } } },
      orderBy: { feeType: 'asc' },
    });
  }

  @Post('structures')
  @Roles(...R.FEES_WRITE)
  async createStructure(@Req() req: ReqWithUser, @Body() body: CreateFeeStructureDto) {
    await assertInBranch(this.prisma, 'class', body.class_id, req.user.branch_id);
    const s = await this.prisma.feeStructure.create({
      data: { branchId: req.user.branch_id, classId: body.class_id, feeType: body.fee_type, amount: body.amount },
    });
    await audit(this.prisma, req.user, 'CREATE', 'fee_structure', s.id, `${body.fee_type} ${body.amount}`);
    return { id: s.id };
  }

  @Put('structures/:id')
  @Roles(...R.FEES_WRITE)
  async updateStructure(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: UpdateFeeStructureDto) {
    const existing = await this.prisma.feeStructure.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Fee structure not found');
    const s = await this.prisma.feeStructure.update({
      where: { id },
      data: {
        ...(body.fee_type !== undefined ? { feeType: body.fee_type } : {}),
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
      },
    });
    await audit(this.prisma, req.user, 'UPDATE', 'fee_structure', id);
    return { id: s.id, success: true };
  }

  @Delete('structures/:id')
  @Roles(...R.FEES_WRITE)
  async deleteStructure(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.feeStructure.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Fee structure not found');
    await this.prisma.feeStructure.delete({ where: { id } });
    await audit(this.prisma, req.user, 'DELETE', 'fee_structure', id);
    return { success: true };
  }

  // ─── Invoices ───────────────────────────────────────────────

  /**
   * Staff see the school; parents/students only their own child's invoices.
   * Every row carries paid_amount, balance and an `overdue` flag (past due, money owed).
   */
  @Get('invoices')
  @Roles(...FEES_READ_PORTAL)
  async listInvoices(
    @Req() req: ReqWithUser,
    @Query('student_id') studentId?: string,
    @Query('status') status?: string,
    @Query('overdue') overdue?: string,
  ) {
    const allowed = await portalStudentIds(this.prisma, req.user);
    if (studentId) {
      if (allowed && !allowed.includes(studentId)) throw new ForbiddenException('You can only view your own child');
      await assertInBranch(this.prisma, 'student', studentId, req.user.branch_id);
    }
    const studentFilter = studentId ? { studentId } : allowed ? { studentId: { in: allowed } } : {};
    const invoices = await this.prisma.feeInvoice.findMany({
      where: { branchId: req.user.branch_id, ...studentFilter, ...(status ? { status } : {}) },
      include: { student: { select: STUDENT_SELECT }, payments: true },
      orderBy: { dueDate: 'desc' },
    });
    const asOf = today();
    const rows = invoices.map((inv) => ({ ...inv, ...invoiceMoney(inv, asOf) }));
    return overdue === 'true' ? rows.filter((r) => r.overdue) : rows;
  }

  /**
   * Fee defaulters: students with at least one invoice past its due date that is not
   * fully paid. Sorted by overdue amount, largest first.
   */
  @Get('defaulters')
  @Roles(...R.FEES_READ)
  async defaulters(@Req() req: ReqWithUser, @Query('class_id') classId?: string) {
    if (classId) await assertInBranch(this.prisma, 'class', classId, req.user.branch_id);
    const asOf = today();
    const invoices = await this.prisma.feeInvoice.findMany({
      where: {
        branchId: req.user.branch_id,
        dueDate: { lt: asOf },
        status: { not: 'Paid' },
        ...(classId ? { student: { classId } } : {}),
      },
      include: { student: { select: { ...STUDENT_SELECT, mobileNumber: true, status: true } }, payments: { select: { amountPaid: true } } },
      orderBy: { dueDate: 'asc' },
    });
    const byStudent = new Map<string, {
      student: (typeof invoices)[number]['student']; overdue_amount: number; overdue_invoices: number;
      oldest_due: string; days_overdue: number; invoice_ids: string[];
    }>();
    for (const inv of invoices) {
      const m = invoiceMoney(inv, asOf);
      if (!m.overdue) continue;
      const row = byStudent.get(inv.studentId) ?? {
        student: inv.student, overdue_amount: 0, overdue_invoices: 0, oldest_due: inv.dueDate, days_overdue: 0, invoice_ids: [],
      };
      row.overdue_amount = Math.round((row.overdue_amount + m.balance) * 100) / 100;
      row.overdue_invoices += 1;
      row.invoice_ids.push(inv.id);
      if (inv.dueDate < row.oldest_due) row.oldest_due = inv.dueDate;
      byStudent.set(inv.studentId, row);
    }
    const day = 86_400_000;
    const students = [...byStudent.values()]
      .map((r) => ({ ...r, days_overdue: Math.max(0, Math.floor((Date.parse(asOf) - Date.parse(r.oldest_due)) / day)) }))
      .sort((a, b) => b.overdue_amount - a.overdue_amount);
    return {
      as_of: asOf,
      total_overdue: Math.round(students.reduce((s, r) => s + r.overdue_amount, 0) * 100) / 100,
      count: students.length,
      students,
    };
  }

  @Get('invoices/:id')
  @Roles(...FEES_READ_PORTAL)
  async getInvoice(@Req() req: ReqWithUser, @Param('id') id: string) {
    const inv = await this.prisma.feeInvoice.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: {
        student: { select: STUDENT_SELECT },
        payments: { include: { collector: { select: { id: true, name: true } } }, orderBy: { paymentDate: 'desc' } },
      },
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    await assertCanSeeStudent(this.prisma, req.user, inv.studentId);
    return { ...inv, ...invoiceMoney(inv) };
  }

  @Get('invoices/:id/invoice.pdf')
  @Roles(...FEES_READ_PORTAL)
  async invoicePdf(@Req() req: ReqWithUser, @Param('id') id: string, @Res() res: Response) {
    const inv = await this.prisma.feeInvoice.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: { student: { select: STUDENT_SELECT }, payments: { orderBy: { paymentDate: 'asc' } } },
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    await assertCanSeeStudent(this.prisma, req.user, inv.studentId);
    const m = invoiceMoney(inv);
    const structures = inv.student.class
      ? await this.prisma.feeStructure.findMany({ where: { branchId: req.user.branch_id, classId: inv.student.class.id }, orderBy: { feeType: 'asc' } })
      : [];
    const cls = inv.student.class ? `${inv.student.class.name}${inv.student.class.section ? ` - ${inv.student.class.section}` : ''}` : '';
    const pdf = await buildPdf({
      ...(await this.schoolName(req.user.branch_id)),
      title: 'Fee Invoice',
      reference: inv.invoiceNo ?? inv.id,
      blocks: [
        { kind: 'fields', rows: [
          ['Invoice No', inv.invoiceNo], ['Term', inv.term],
          ['Student', inv.student.fullName], ['Admission No', inv.student.admissionNo],
          ['Class', cls], ['Due date', inv.dueDate],
          ['Status', m.overdue ? `${inv.status} (OVERDUE)` : inv.status], ['Issued', today()],
        ] },
        ...(structures.length
          ? [{ kind: 'heading' as const, text: 'Fee heads (class structure)' },
            { kind: 'table' as const, head: ['Fee head', 'Amount (Rs.)'], widths: [330, 169], rows: structures.map((s) => [s.feeType, s.amount.toFixed(2)]) }]
          : []),
        { kind: 'heading', text: 'Amount' },
        { kind: 'fields', rows: [['Invoice total', `Rs. ${inv.totalAmount.toFixed(2)}`], ['Paid to date', `Rs. ${m.paid_amount.toFixed(2)}`], ['Balance due', `Rs. ${m.balance.toFixed(2)}`]] },
        ...(inv.payments.length
          ? [{ kind: 'heading' as const, text: 'Payments received' },
            { kind: 'table' as const, head: ['Receipt', 'Date', 'Mode', 'Amount (Rs.)'], widths: [150, 110, 120, 119],
              rows: inv.payments.map((p) => [p.receiptNo, p.paymentDate, p.paymentMode, p.amountPaid.toFixed(2)]) }]
          : []),
      ],
    });
    await audit(this.prisma, req.user, 'EXPORT', 'fee_invoice', inv.id, 'invoice.pdf');
    return sendPdf(res, pdf, `invoice-${inv.invoiceNo ?? inv.id}.pdf`);
  }

  @Post('invoices')
  @Roles(...R.FEES_WRITE)
  async createInvoice(@Req() req: ReqWithUser, @Body() body: CreateInvoiceDto) {
    await assertInBranch(this.prisma, 'student', body.student_id, req.user.branch_id);
    const branchId = req.user.branch_id;
    const inv = await withDocNoRetry(async () => {
      const invoiceNo = await nextDocNo(this.prisma, branchId, 'invoice');
      return this.prisma.feeInvoice.create({
        data: {
          branchId, studentId: body.student_id, term: body.term, totalAmount: body.total_amount,
          dueDate: body.due_date, status: 'Unpaid', invoiceNo,
        },
      });
    });
    await audit(this.prisma, req.user, 'CREATE', 'fee_invoice', inv.id, inv.invoiceNo ?? undefined);
    return { id: inv.id, invoice_no: inv.invoiceNo };
  }

  /** Generate invoices for every active student of a class from the class fee structure. */
  @Post('invoices/generate')
  @Roles(...R.FEES_WRITE)
  async generateInvoices(@Req() req: ReqWithUser, @Body() body: GenerateInvoicesDto) {
    const branchId = req.user.branch_id;
    await assertInBranch(this.prisma, 'class', body.class_id, branchId);
    const structures = await this.prisma.feeStructure.findMany({ where: { branchId, classId: body.class_id } });
    if (structures.length === 0) throw new NotFoundException('No fee structures defined for this class');
    const total = structures.reduce((sum, s) => sum + s.amount, 0);

    const students = await this.prisma.student.findMany({ where: { branchId, classId: body.class_id, status: 'Active' } });

    const created: string[] = [];
    for (const student of students) {
      const dup = await this.prisma.feeInvoice.findFirst({ where: { branchId, studentId: student.id, term: body.term } });
      if (dup) continue; // idempotent per term
      const inv = await withDocNoRetry(async () => this.prisma.feeInvoice.create({
        data: {
          branchId, studentId: student.id, term: body.term, totalAmount: total, dueDate: body.due_date,
          invoiceNo: await nextDocNo(this.prisma, branchId, 'invoice'),
        },
      }));
      created.push(inv.id);
    }
    await audit(this.prisma, req.user, 'CREATE', 'fee_invoice', body.class_id, `generated ${created.length} for ${body.term}`);
    return { generated: created.length, invoice_ids: created };
  }

  /**
   * Send fee/instalment reminders strictly to parents with PENDING (unpaid or partially-paid) invoices.
   * Paid invoices are explicitly excluded so settled parents are never spammed.
   */
  @Post('reminders/pending')
  @Roles(...R.FEES_WRITE)
  async sendPendingReminders(@Req() req: ReqWithUser, @Body() body: SendPendingRemindersDto) {
    const branchId = req.user.branch_id;
    if (body.class_id) await assertInBranch(this.prisma, 'class', body.class_id, branchId);
    if (body.student_id) await assertInBranch(this.prisma, 'student', body.student_id, branchId);
    if (body.invoice_id) await assertInBranch(this.prisma, 'feeInvoice', body.invoice_id, branchId);

    const rows = await this.prisma.feeInvoice.findMany({
      where: {
        branchId,
        ...(body.invoice_id ? { id: body.invoice_id } : {}),
        ...(body.student_id ? { studentId: body.student_id } : {}),
        ...(body.term ? { term: body.term } : {}),
        ...(body.class_id ? { student: { classId: body.class_id } } : {}),
      },
      include: {
        student: {
          select: {
            id: true, fullName: true, admissionNo: true, fatherName: true, motherName: true, mobileNumber: true, email: true,

            class: { select: { name: true, section: true } },
          },
        },
        payments: { select: { amountPaid: true } },
      },
      orderBy: [{ dueDate: 'asc' }],
    });

    let paidExcluded = 0;
    let sent = 0;
    let mocked = 0;
    let failed = 0;
    let skippedNoContact = 0;
    const channel = body.channel ?? 'sms';
    const nowStr = today();

    const pendingRows = rows.filter((inv) => {
      const m = invoiceMoney(inv, nowStr);
      if (inv.status === 'Paid' || m.balance <= 0) {
        paidExcluded++;
        return false;
      }
      return true;
    });

    const { school } = await this.schoolName(branchId);
    for (const inv of pendingRows) {
      const m = invoiceMoney(inv, nowStr);
      const recipient = channel === 'email'
        ? (inv.student.email ?? '').trim()
        : (inv.student.mobileNumber ?? '').trim();
      if (!recipient) {
        skippedNoContact++;
        continue;
      }
      const parentLabel = inv.student.fatherName || inv.student.motherName || 'Parent';
      const msg = `Dear ${parentLabel}, fee instalment for ${inv.student.fullName} (${inv.term}, Invoice ${inv.invoiceNo ?? inv.id}) has a pending balance of Rs. ${m.balance.toFixed(2)} (Due: ${inv.dueDate}). Kindly clear the pending dues at the earliest. - ${school}`;
      const log = await this.notifications.notify({
        branch_id: branchId,
        channel,
        recipient,
        subject: `Pending Fee Instalment Reminder — ${inv.student.fullName} (${inv.term})`,
        body: msg,
        ref_type: 'fee_invoice_reminder',
        ref_id: inv.id,
      });
      if (log.status === 'sent') sent++;
      else if (log.status === 'mocked') mocked++;
      else failed++;
    }

    await audit(
      this.prisma, req.user, 'CREATE', 'fee_invoice_reminder', body.invoice_id ?? body.class_id ?? 'all',
      `pending=${pendingRows.length} paid_excluded=${paidExcluded} sent=${sent + mocked}`,
    );
    return {
      pending_invoices: pendingRows.length,
      paid_excluded: paidExcluded,
      dispatched: sent + mocked,
      sent,
      mocked,
      failed,
      skipped_no_contact: skippedNoContact,
    };
  }

  // ─── Payments ───────────────────────────────────────────────

  /** Recent payments (offline + online-gateway ones, which land here with paymentMode 'Online'). */
  @Get('payments')
  @Roles(...R.FEES_READ)
  async listPayments(
    @Req() req: ReqWithUser,
    @Query('invoice_id') invoiceId?: string,
    @Query('mode') mode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (invoiceId) await assertInBranch(this.prisma, 'feeInvoice', invoiceId, req.user.branch_id);
    const rows = await this.prisma.offlinePayment.findMany({
      where: {
        branchId: req.user.branch_id,
        ...(invoiceId ? { invoiceId } : {}),
        ...(mode ? { paymentMode: mode } : {}),
        ...(from || to ? { paymentDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      include: {
        invoice: { select: { id: true, invoiceNo: true, term: true, student: { select: STUDENT_SELECT } } },
        collector: { select: { id: true, name: true } },
      },
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows.map((p) => ({ ...p, online: p.paymentMode === 'Online' }));
  }

  @Post('payments')
  @Roles(...R.FEES_WRITE)
  async recordPayment(@Req() req: ReqWithUser, @Body() body: CreatePaymentDto) {
    const branchId = req.user.branch_id;
    const found = await this.prisma.feeInvoice.findFirst({ where: { id: body.invoice_id, branchId }, select: { id: true } });
    if (!found) throw new NotFoundException('Invoice not found');
    const collector = await currentStaffId(this.prisma, req.user);

    // Balance check, number allocation, insert and status update are one transaction so
    // concurrent payments can neither overpay an invoice nor share a receipt number.
    const result = await withDocNoRetry(() => this.prisma.$transaction(async (tx) => {
      const invoice = await tx.feeInvoice.findUniqueOrThrow({ where: { id: found.id }, include: { payments: true } });
      const alreadyPaid = invoice.payments.reduce((sum, p) => sum + p.amountPaid, 0);
      if (alreadyPaid + body.amount_paid > invoice.totalAmount + 0.001) {
        throw new ConflictException('Payment exceeds invoice balance');
      }
      const payment = await tx.offlinePayment.create({
        data: {
          branchId, invoiceId: invoice.id, amountPaid: body.amount_paid, paymentMode: body.payment_mode,
          referenceNo: body.reference_no ?? null, paymentDate: body.payment_date ?? today(),
          collectedBy: collector, receiptNo: await nextDocNo(tx, branchId, 'receipt'),
        },
      });
      const newPaid = alreadyPaid + body.amount_paid;
      const status = newPaid >= invoice.totalAmount - 0.001 ? 'Paid' : 'Partially Paid';
      await tx.feeInvoice.update({ where: { id: invoice.id }, data: { status } });
      return { payment, status, newPaid, total: invoice.totalAmount };
    }, { timeout: 15_000, maxWait: 15_000 }));

    await audit(this.prisma, req.user, 'CREATE', 'payment', result.payment.id, `${result.payment.receiptNo} ${body.amount_paid}`);
    return {
      id: result.payment.id,
      receipt_no: result.payment.receiptNo,
      invoice_status: result.status,
      paid_amount: Math.round(result.newPaid * 100) / 100,
      balance: Math.max(0, Math.round((result.total - result.newPaid) * 100) / 100),
    };
  }

  /** Printable receipt. Parents/students may download receipts for their own child. */
  @Get('payments/:id/receipt.pdf')
  @Roles(...FEES_READ_PORTAL)
  async receiptPdf(@Req() req: ReqWithUser, @Param('id') id: string, @Res() res: Response) {
    const p = await this.prisma.offlinePayment.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: {
        invoice: { include: { student: { select: STUDENT_SELECT }, payments: { select: { amountPaid: true, createdAt: true, id: true } } } },
        collector: { select: { name: true } },
      },
    });
    if (!p) throw new NotFoundException('Payment not found');
    await assertCanSeeStudent(this.prisma, req.user, p.invoice.studentId);
    const inv = p.invoice;
    // Balance as at this receipt (payments up to and including this one).
    const paidToDate = inv.payments.filter((x) => x.createdAt <= p.createdAt).reduce((s, x) => s + x.amountPaid, 0);
    const cls = inv.student.class ? `${inv.student.class.name}${inv.student.class.section ? ` - ${inv.student.class.section}` : ''}` : '';
    const pdf = await buildPdf({
      ...(await this.schoolName(req.user.branch_id)),
      title: 'Fee Receipt',
      reference: p.receiptNo ?? p.id,
      blocks: [
        { kind: 'fields', rows: [
          ['Receipt No', p.receiptNo], ['Payment date', p.paymentDate],
          ['Student', inv.student.fullName], ['Admission No', inv.student.admissionNo],
          ['Class', cls], ['Roll No', inv.student.rollNo],
          ['Invoice No', inv.invoiceNo], ['Term', inv.term],
        ] },
        { kind: 'heading', text: 'Payment' },
        { kind: 'fields', rows: [
          ['Amount received', `Rs. ${p.amountPaid.toFixed(2)}`],
          ['Mode', p.paymentMode === 'Online' ? 'Online (payment gateway)' : p.paymentMode],
          ['Reference', p.referenceNo], ['Collected by', p.paymentMode === 'Online' ? 'Online' : (p.collector?.name ?? 'Accounts office')],
        ] },
        { kind: 'table', head: ['Invoice total (Rs.)', 'Paid to date (Rs.)', 'Balance (Rs.)'], widths: [166, 166, 167],
          rows: [[inv.totalAmount.toFixed(2), paidToDate.toFixed(2), Math.max(0, inv.totalAmount - paidToDate).toFixed(2)]] },
        { kind: 'spacer', size: 10 },
        { kind: 'text', text: 'Received with thanks. Please retain this receipt for your records.' },
      ],
    });
    await audit(this.prisma, req.user, 'EXPORT', 'payment', p.id, 'receipt.pdf');
    return sendPdf(res, pdf, `receipt-${p.receiptNo ?? p.id}.pdf`);
  }
}
