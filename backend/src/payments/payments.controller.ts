import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { R, ROLE } from '../auth/roles';
import { AuthUser } from '../common/access';
import { PaymentPurpose, PaymentsService, hmacMatches, razorpayKeySecret } from './payments.service';

export class CreateOrderDto {
  @IsIn(['admission', 'invoice'])
  purpose!: PaymentPurpose;

  @IsString() @IsNotEmpty() @MaxLength(80)
  ref_id!: string;
}

export class RazorpayVerifyDto {
  @IsString() @IsNotEmpty() @MaxLength(80)
  razorpay_order_id!: string;

  @IsString() @IsNotEmpty() @MaxLength(80)
  razorpay_payment_id!: string;

  @IsString() @IsNotEmpty() @MaxLength(200)
  razorpay_signature!: string;
}

type RazorpayEvent = {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; amount?: number; status?: string } };
    order?: { entity?: { id?: string } };
  };
};

const PAYERS = [...new Set([...R.FEES_WRITE, ...R.ADMISSION_ACCOUNTS, ROLE.PARENT])];
const STAFF_PAYERS: string[] = [...new Set([...R.FEES_WRITE, ...R.ADMISSION_ACCOUNTS])];

@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  /** Parent (own application / own child's invoice) or fee staff. Amount computed server-side. */
  @Post('orders')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...PAYERS)
  async createOrder(@Req() req: { user: AuthUser }, @Body() body: CreateOrderDto) {
    await this.payments.assertCanPay(req.user, body.purpose, body.ref_id, STAFF_PAYERS.includes(req.user.role));
    return this.payments.createOrder({ branchId: req.user.branch_id, purpose: body.purpose, refId: body.ref_id });
  }

  /**
   * Razorpay webhook (public). Authenticity = HMAC-SHA256 of the exact raw body with
   * RAZORPAY_WEBHOOK_SECRET. Replays are harmless: markPaid is idempotent.
   */
  @Post('webhook/razorpay')
  @HttpCode(200)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async razorpayWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Body() body: RazorpayEvent,
  ) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(body ?? {}));
    if (!hmacMatches(raw, signature, process.env.RAZORPAY_WEBHOOK_SECRET)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    const event = body?.event ?? '';
    const payment = body?.payload?.payment?.entity;
    const orderId = payment?.order_id ?? body?.payload?.order?.entity?.id;
    if (!orderId) throw new BadRequestException('Webhook has no order id');

    if (event === 'payment.failed') {
      await this.payments.markFailed(orderId);
      return { ok: true, status: 'failed' };
    }
    if (event !== 'payment.captured' && event !== 'order.paid') return { ok: true, ignored: event };
    if (!payment?.id) throw new BadRequestException('Webhook has no payment id');
    try {
      return { ok: true, ...(await this.payments.markPaid(orderId, payment.id, 'razorpay', payment.amount)) };
    } catch (e) {
      // Unknown order: acknowledge so the provider stops retrying, but say so.
      if (e instanceof NotFoundException) return { ok: true, ignored: 'unknown order' };
      throw e;
    }
  }

  /** Client-side confirmation from Razorpay Checkout (signature = HMAC(order_id|payment_id, key secret)). */
  @Post('razorpay/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async razorpayVerify(@Body() body: RazorpayVerifyDto) {
    const ok = hmacMatches(
      `${body.razorpay_order_id}|${body.razorpay_payment_id}`,
      body.razorpay_signature,
      razorpayKeySecret(),
    );
    if (!ok) throw new UnauthorizedException('Invalid payment signature');
    return this.payments.markPaid(body.razorpay_order_id, body.razorpay_payment_id, 'razorpay');
  }

  /** Dev/test stand-in for the provider. Never available in production or for real gateway orders. */
  @Post('mock/:orderId/complete')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async mockComplete(@Param('orderId') orderId: string) {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    return this.payments.markPaid(orderId, `mock_pay_${Date.now().toString(36)}`, 'mock');
  }
}
