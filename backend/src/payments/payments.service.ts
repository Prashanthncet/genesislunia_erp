import * as crypto from 'crypto';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, assertCanSeeStudent } from '../common/access';
import { ADM, systemActor, transitionAdmission } from '../admissions/workflow';
// Same per-branch RCPT-<CODE>-YYYY-NNNN numbering as the fees module's offline payments.
import { nextDocNo, withDocNoRetry } from '../fees/doc-no';

export type PaymentPurpose = 'admission' | 'invoice';

/** Razorpay key secret. `RAZORPAY_SECRET` is accepted as an alias (that is how the dashboard labels it). */
export function razorpayKeySecret(): string | undefined {
  return process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET || undefined;
}

export function razorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && razorpayKeySecret());
}

export function defaultAdmissionFee(): number {
  const v = Number(process.env.ADMISSION_FEE_AMOUNT);
  return Number.isFinite(v) && v > 0 ? v : 25000;
}

/** Constant-time compare of two hex HMAC strings. */
export function hmacMatches(payload: string | Buffer, signature: string | undefined, secret: string | undefined): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const a = Buffer.from(signature.trim(), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

@Injectable()
export class PaymentsService {
  private readonly log = new Logger('Payments');

  constructor(private prisma: PrismaService) {}

  /** Amount is always computed here, never taken from the client. */
  async createOrder(input: { branchId: string; purpose: PaymentPurpose; refId: string }) {
    const { branchId, purpose, refId } = input;
    let amount: number;
    if (purpose === 'admission') {
      const app = await this.prisma.admission.findFirst({ where: { id: refId, branchId } });
      if (!app) throw new NotFoundException('Application not found');
      if (app.status !== ADM.VALIDATED) {
        throw new ConflictException(`Payment is only possible after document validation (status: ${app.status})`);
      }
      amount = app.feeAmount ?? defaultAdmissionFee();
      if (app.feeAmount == null) await this.prisma.admission.update({ where: { id: app.id }, data: { feeAmount: amount } });
    } else {
      const inv = await this.prisma.feeInvoice.findFirst({ where: { id: refId, branchId }, include: { payments: true } });
      if (!inv) throw new NotFoundException('Invoice not found');
      const paid = inv.payments.reduce((s, p) => s + p.amountPaid, 0);
      amount = Math.round((inv.totalAmount - paid) * 100) / 100;
      if (amount <= 0) throw new ConflictException('Invoice is already fully paid');
    }

    const currency = 'INR';
    let gateway: 'razorpay' | 'mock' = 'mock';
    let gatewayOrderId = `mock_order_${crypto.randomBytes(10).toString('hex')}`;
    if (razorpayConfigured()) {
      gateway = 'razorpay';
      const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${razorpayKeySecret()}`).toString('base64');
      let res: Response;
      try {
        res = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: Math.round(amount * 100), // paise
            currency,
            receipt: `${purpose}_${refId}`.slice(0, 40),
            notes: { purpose, ref_id: refId, branch_id: branchId },
          }),
        });
      } catch (e) {
        throw new BadGatewayException(`Payment gateway unreachable: ${(e as Error).message}`);
      }
      if (!res.ok) throw new BadGatewayException(`Payment gateway rejected the order (${res.status})`);
      const body = (await res.json()) as { id?: string };
      if (!body.id) throw new BadGatewayException('Payment gateway returned no order id');
      gatewayOrderId = body.id;
    }

    const order = await this.prisma.paymentOrder.create({
      data: { branchId, purpose, refId, amount, currency, gateway, gatewayOrderId },
    });
    return {
      id: order.id,
      order_id: order.gatewayOrderId,
      gateway,
      amount,
      amount_minor: Math.round(amount * 100),
      currency,
      ...(gateway === 'razorpay' ? { key_id: process.env.RAZORPAY_KEY_ID } : {}),
    };
  }

  /** Portal/staff guard for POST /payments/orders. 404 outside the caller's school. */
  async assertCanPay(user: AuthUser, purpose: PaymentPurpose, refId: string, staffAllowed: boolean) {
    if (purpose === 'admission') {
      const app = await this.prisma.admission.findFirst({ where: { id: refId, branchId: user.branch_id }, select: { parentUserId: true } });
      if (!app) throw new NotFoundException('Application not found');
      if (user.role === 'parent' && app.parentUserId === user.sub) return;
      if (staffAllowed) return;
      throw new NotFoundException('Application not found');
    }
    const inv = await this.prisma.feeInvoice.findFirst({ where: { id: refId, branchId: user.branch_id }, select: { studentId: true } });
    if (!inv) throw new NotFoundException('Invoice not found');
    if (user.role === 'parent') return assertCanSeeStudent(this.prisma, user, inv.studentId);
    if (!staffAllowed) throw new NotFoundException('Invoice not found');
  }

  /**
   * Marks an order paid exactly once and applies it to the admission / invoice.
   * Safe to call repeatedly (webhook retries, client verify + webhook both arriving).
   */
  async markPaid(gatewayOrderId: string, gatewayPaymentId: string, expectedGateway?: string, paidAmountMinor?: number) {
    const order = await this.prisma.paymentOrder.findUnique({ where: { gatewayOrderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (expectedGateway && order.gateway !== expectedGateway) throw new NotFoundException('Order not found');
    if (paidAmountMinor !== undefined && paidAmountMinor !== Math.round(order.amount * 100)) {
      throw new BadRequestException('Paid amount does not match the order');
    }
    if (order.status === 'paid') return { order_id: gatewayOrderId, status: 'paid', duplicate: true };

    return withDocNoRetry(() => this.prisma.$transaction(async (tx) => {
      const claimed = await tx.paymentOrder.updateMany({
        where: { id: order.id, status: { not: 'paid' } },
        data: { status: 'paid', gatewayPaymentId, paidAt: new Date() },
      });
      if (claimed.count !== 1) return { order_id: gatewayOrderId, status: 'paid', duplicate: true };

      let applied = 'none';
      if (order.purpose === 'admission') {
        const app = await tx.admission.findUnique({ where: { id: order.refId }, select: { status: true } });
        if (app?.status === ADM.VALIDATED) {
          await transitionAdmission(tx, {
            admissionId: order.refId,
            branchId: order.branchId,
            action: 'payment_received',
            actor: systemActor,
            remarks: `Online payment ${gatewayPaymentId} via ${order.gateway}`,
            data: { paymentStatus: 'Paid', paymentRef: gatewayPaymentId, paidAt: new Date(), feeAmount: order.amount },
          });
          applied = ADM.PAYMENT_RECEIVED;
        } else {
          // Paid after someone already recorded it offline / rejected: keep the money trail, flag for reconciliation.
          this.log.warn(`order ${gatewayOrderId} paid but admission ${order.refId} is "${app?.status}" — needs manual reconciliation`);
          applied = 'needs_reconciliation';
        }
      } else {
        const inv = await tx.feeInvoice.findUnique({ where: { id: order.refId }, include: { payments: true } });
        if (inv) {
          const already = inv.payments.reduce((s, p) => s + p.amountPaid, 0);
          await tx.offlinePayment.create({
            data: {
              branchId: inv.branchId,
              invoiceId: inv.id,
              amountPaid: order.amount,
              paymentMode: 'Online',
              referenceNo: gatewayPaymentId,
              paymentDate: new Date().toISOString().slice(0, 10),
              receiptNo: await nextDocNo(tx, inv.branchId, 'receipt'),
            },
          });
          const total = already + order.amount;
          const status = total >= inv.totalAmount - 0.001 ? 'Paid' : 'Partially Paid';
          await tx.feeInvoice.update({ where: { id: inv.id }, data: { status } });
          applied = status;
        }
      }
      return { order_id: gatewayOrderId, status: 'paid', duplicate: false, applied };
    }));
  }

  async markFailed(gatewayOrderId: string) {
    await this.prisma.paymentOrder.updateMany({ where: { gatewayOrderId, status: 'created' }, data: { status: 'failed' } });
  }
}
