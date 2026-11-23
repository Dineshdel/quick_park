import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import { AppException } from '../http/app-exception';

export interface ProviderOrder {
  orderId: string;
}
export interface PaidEvent {
  eventId: string;
  type: 'paid' | 'failed';
  orderId: string;
  paymentId: string;
  amountPaise: number;
}

/** Payment gateway adapter. The webhook (or mock completion) is the only source of truth for "paid". */
export interface PaymentProvider {
  readonly name: 'mock' | 'razorpay';
  readonly keyId: string | null;
  createOrder(amountPaise: number, receipt: string): Promise<ProviderOrder>;
  /** Verifies and parses a webhook; returns null for events we don't act on. */
  parseWebhook(rawBody: Buffer, signature: string | undefined, eventIdHeader: string | undefined): PaidEvent | null;
  refund(paymentId: string, amountPaise: number): Promise<{ refundId: string }>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
const invalid = () => new AppException(HttpStatus.BAD_REQUEST, 'WEBHOOK_INVALID', 'Invalid webhook');

/** Local development: orders are fake and the customer "pays" via POST /payments/mock/pay. */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock' as const;
  readonly keyId = null;
  async createOrder() {
    return { orderId: `order_mock_${randomBytes(9).toString('hex')}` };
  }
  parseWebhook(): PaidEvent | null {
    throw invalid();
  }
  async refund() {
    return { refundId: `rfnd_mock_${randomBytes(9).toString('hex')}` };
  }
}

/** Razorpay Orders API + webhook HMAC (X-Razorpay-Signature over the raw body). */
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = 'razorpay' as const;
  constructor(
    readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string,
  ) {}

  private async call<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new AppException(HttpStatus.BAD_GATEWAY, 'PAYMENT_INVALID', `Payment gateway error (${res.status})`);
    return (await res.json()) as T;
  }

  async createOrder(amountPaise: number, receipt: string) {
    const o = await this.call<{ id: string }>('/orders', { amount: amountPaise, currency: 'INR', receipt });
    return { orderId: o.id };
  }

  parseWebhook(raw: Buffer, signature: string | undefined, eventIdHeader: string | undefined): PaidEvent | null {
    if (!signature) throw invalid();
    const expected = Buffer.from(createHmac('sha256', this.webhookSecret).update(raw).digest('hex'));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw invalid();
    const body = JSON.parse(raw.toString('utf8')) as {
      event: string;
      payload?: { payment?: { entity?: { id: string; order_id: string; amount: number } } };
    };
    const p = body.payload?.payment?.entity;
    if (!p) return null;
    const type = body.event === 'payment.captured' || body.event === 'order.paid' ? 'paid' : body.event === 'payment.failed' ? 'failed' : null;
    if (!type) return null;
    return { eventId: eventIdHeader ?? `${body.event}:${p.id}`, type, orderId: p.order_id, paymentId: p.id, amountPaise: p.amount };
  }

  async refund(paymentId: string, amountPaise: number) {
    const r = await this.call<{ id: string }>(`/payments/${paymentId}/refund`, { amount: amountPaise });
    return { refundId: r.id };
  }
}
