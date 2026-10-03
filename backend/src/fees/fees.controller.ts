import { Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateFeeStructureDto, CreateInvoiceDto, CreatePaymentDto, GenerateInvoicesDto, UpdateFeeStructureDto,
} from './dto/fees.dto';

type ReqWithUser = { user: { sub: string; role: string; branch_id: string } };

const FEE_STATUSES = ['Unpaid', 'Partially Paid', 'Paid', 'Overdue'];

/** Next sequential document number, collision-safe: INV-2026-0001 / RCPT-2026-0001. */
async function nextDocNo(
  prisma: PrismaService,
  kind: 'invoice' | 'receipt',
): Promise<string> {
  const prefix = kind === 'invoice' ? 'INV' : 'RCPT';
  const year = new Date().getFullYear();
  let n = kind === 'invoice'
    ? await prisma.feeInvoice.count()
    : await prisma.offlinePayment.count();
  for (;;) {
    n += 1;
    const candidate = `${prefix}-${year}-${String(n).padStart(4, '0')}`;
    const dup = kind === 'invoice'
      ? await prisma.feeInvoice.findUnique({ where: { invoiceNo: candidate } })
      : await prisma.offlinePayment.findUnique({ where: { receiptNo: candidate } });
    if (!dup) return candidate;
  }
}

@Controller('fees')
@UseGuards(AuthGuard, RolesGuard)
export class FeesController {
  constructor(private prisma: PrismaService) {}

  // ─── Fee structures CRUD ────────────────────────────────────

  @Get('structures')
  listStructures(@Req() req: ReqWithUser, @Query('class_id') classId?: string) {
    return this.prisma.feeStructure.findMany({
      where: { branchId: req.user.branch_id, ...(classId ? { classId } : {}) },
      include: { class: { select: { id: true, name: true, section: true } } },
      orderBy: { feeType: 'asc' },
    });
  }

  @Post('structures')
  @Roles('super_admin', 'branch_admin')
  async createStructure(@Req() req: ReqWithUser, @Body() body: CreateFeeStructureDto) {
    const s = await this.prisma.feeStructure.create({
      data: { branchId: req.user.branch_id, classId: body.class_id, feeType: body.fee_type, amount: body.amount },
    });
    return { id: s.id };
  }

  @Put('structures/:id')
  @Roles('super_admin', 'branch_admin')
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
    return { id: s.id, success: true };
  }

  @Delete('structures/:id')
  @Roles('super_admin', 'branch_admin')
  async deleteStructure(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.feeStructure.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Fee structure not found');
    await this.prisma.feeStructure.delete({ where: { id } });
    return { success: true };
  }

  // ─── Invoices ───────────────────────────────────────────────

  @Get('invoices')
  async listInvoices(
    @Req() req: ReqWithUser,
    @Query('student_id') studentId?: string,
    @Query('status') status?: string,
  ) {
    const invoices = await this.prisma.feeInvoice.findMany({
      where: {
        branchId: req.user.branch_id,
        ...(studentId ? { studentId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        student: { select: { id: true, fullName: true, admissionNo: true, class: { select: { name: true, section: true } } } },
        payments: true,
      },
      orderBy: { dueDate: 'desc' },
    });
    return invoices.map((inv) => {
      const paid = inv.payments.reduce((sum, p) => sum + p.amountPaid, 0);
      return { ...inv, paid_amount: paid, balance: Math.max(0, inv.totalAmount - paid) };
    });
  }

  @Get('invoices/:id')
  async getInvoice(@Req() req: ReqWithUser, @Param('id') id: string) {
    const inv = await this.prisma.feeInvoice.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: {
        student: { select: { id: true, fullName: true, admissionNo: true, class: { select: { name: true, section: true } } } },
        payments: { include: { collector: { select: { id: true, name: true } } }, orderBy: { paymentDate: 'desc' } },
      },
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    const paid = inv.payments.reduce((sum, p) => sum + p.amountPaid, 0);
    return { ...inv, paid_amount: paid, balance: Math.max(0, inv.totalAmount - paid) };
  }

  @Post('invoices')
  @Roles('super_admin', 'branch_admin')
  async createInvoice(@Req() req: ReqWithUser, @Body() body: CreateInvoiceDto) {
    const invoiceNo = await nextDocNo(this.prisma, 'invoice');
    const inv = await this.prisma.feeInvoice.create({
      data: {
        branchId: req.user.branch_id,
        studentId: body.student_id,
        term: body.term,
        totalAmount: body.total_amount,
        dueDate: body.due_date,
        status: 'Unpaid',
        invoiceNo,
      },
    });
    return { id: inv.id, invoice_no: invoiceNo };
  }

  /** Generate invoices for every active student of a class from the class fee structure. */
  @Post('invoices/generate')
  @Roles('super_admin', 'branch_admin')
  async generateInvoices(@Req() req: ReqWithUser, @Body() body: GenerateInvoicesDto) {
    const structures = await this.prisma.feeStructure.findMany({
      where: { branchId: req.user.branch_id, classId: body.class_id },
    });
    if (structures.length === 0) throw new NotFoundException('No fee structures defined for this class');
    const total = structures.reduce((sum, s) => sum + s.amount, 0);

    const students = await this.prisma.student.findMany({
      where: { branchId: req.user.branch_id, classId: body.class_id, status: 'Active' },
    });

    const created: string[] = [];
    for (const student of students) {
      const dup = await this.prisma.feeInvoice.findFirst({
        where: { branchId: req.user.branch_id, studentId: student.id, term: body.term },
      });
      if (dup) continue; // idempotent per term
      const inv = await this.prisma.feeInvoice.create({
        data: {
          branchId: req.user.branch_id,
          studentId: student.id,
          term: body.term,
          totalAmount: total,
          dueDate: body.due_date,
          invoiceNo: await nextDocNo(this.prisma, 'invoice'),
        },
      });
      created.push(inv.id);
    }
    return { generated: created.length, invoice_ids: created };
  }

  // ─── Offline payments ───────────────────────────────────────

  @Post('payments')
  @Roles('super_admin', 'branch_admin')
  async recordPayment(
    @Req() req: ReqWithUser,
    @Body() body: CreatePaymentDto,
  ) {
    const invoice = await this.prisma.feeInvoice.findFirst({
      where: { id: body.invoice_id, branchId: req.user.branch_id },
      include: { payments: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    // resolve the collecting staff member from the logged-in user (admins may have no staff row)
    const collector = await this.prisma.staff.findFirst({ where: { user: { id: req.user.sub } } });

    const alreadyPaid = invoice.payments.reduce((sum, p) => sum + p.amountPaid, 0);
    if (alreadyPaid + body.amount_paid > invoice.totalAmount + 0.001) {
      throw new ConflictException('Payment exceeds invoice balance');
    }

    const payment = await this.prisma.offlinePayment.create({
      data: {
        branchId: req.user.branch_id,
        invoiceId: invoice.id,
        amountPaid: body.amount_paid,
        paymentMode: body.payment_mode,
        referenceNo: body.reference_no ?? null,
        paymentDate: body.payment_date ?? new Date().toISOString().slice(0, 10),
        collectedBy: collector?.id ?? null,
        receiptNo: await nextDocNo(this.prisma, 'receipt'),
      },
    });

    const newPaid = alreadyPaid + body.amount_paid;
    const status = newPaid >= invoice.totalAmount - 0.001 ? 'Paid' : 'Partially Paid';
    await this.prisma.feeInvoice.update({ where: { id: invoice.id }, data: { status } });

    return { id: payment.id, receipt_no: payment.receiptNo, invoice_status: status, paid_amount: newPaid, balance: Math.max(0, invoice.totalAmount - newPaid) };
  }
}
