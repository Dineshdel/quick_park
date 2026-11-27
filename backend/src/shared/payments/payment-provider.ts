import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import { AppException } from '../http/app-exception';

export interface ProviderOrder {
  orderId: string;
}
export interface PaidEvent {
  eventId: string;
  /** "authorized": money is held but not captured yet (manual capture). The service captures it. */
  type: 'paid' | 'failed' | 'authorized';
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
  parseWebhook(
    rawBody: Buffer,
    signature: string | undefined,
    eventIdHeader: string | undefined,
  ): PaidEvent | null;
  refund(paymentId: string, amountPaise: number): Promise<{ refundId: string }>;
  /** Checks the signature Checkout hands the browser after a payment (razorpay_signature). */
  verifyCheckout(orderId: string, paymentId: string, signature: string): boolean;
  fetchPayment(paymentId: string): Promise<ProviderPayment>;
  /** Every payment attempt on an order (used to reconcile when a webhook never arrived). */
  orderPayments(orderId: string): Promise<ProviderPayment[]>;
  capture(paymentId: string, amountPaise: number): Promise<ProviderPayment>;
}

/** A payment as the gateway reports it. */
export interface ProviderPayment {
  id: string;
  orderId: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  amountPaise: number;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
const invalid = () =>
  new AppException(HttpStatus.BAD_REQUEST, 'WEBHOOK_INVALID', 'Invalid webhook');

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
  verifyCheckout(): boolean {
    return false;
  }
  fetchPayment(): Promise<ProviderPayment> {
    throw invalid();
  }
  async orderPayments(): Promise<ProviderPayment[]> {
    return [];
  }
  capture(): Promise<ProviderPayment> {
    throw invalid();
  }
}

/** Constant-time hex HMAC comparison. */
function hmacMatches(secret: string, data: string | Buffer, signature: string): boolean {
  const expected = Buffer.from(createHmac('sha256', secret).update(data).digest('hex'));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

interface RazorpayPaymentEntity {
  id: string;
  order_id: string;
  status: ProviderPayment['status'];
  amount: number;
}
const toPayment = (p: RazorpayPaymentEntity): ProviderPayment => ({
  id: p.id,
  orderId: p.order_id,
  status: p.status,
  amountPaise: p.amount,
});

/** Razorpay Orders API + webhook HMAC (X-Razorpay-Signature over the raw body). */
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = 'razorpay' as const;
  constructor(
    readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string,
  ) {}

  private async call<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      // Razorpay explains itself in error.description; keep it for logs and refund lastError.
      const detail = await res
        .json()
        .then((j: { error?: { description?: string } }) => j.error?.description)
        .catch(() => undefined);
      throw new AppException(
        HttpStatus.BAD_GATEWAY,
        'PAYMENT_INVALID',
        `Payment gateway error (${res.status})${detail ? `: ${detail}` : ''}`,
      );
    }
    return (await res.json()) as T;
  }

  async createOrder(amountPaise: number, receipt: string) {
    // payment_capture: capture automatically, whatever the dashboard setting (we still capture if it doesn't).
    const o = await this.call<{ id: string }>('/orders', {
      amount: amountPaise,
      currency: 'INR',
      receipt,
      payment_capture: 1,
    });
    return { orderId: o.id };
  }

  parseWebhook(
    raw: Buffer,
    signature: string | undefined,
    eventIdHeader: string | undefined,
  ): PaidEvent | null {
    if (!signature || !hmacMatches(this.webhookSecret, raw, signature)) throw invalid();
    const body = JSON.parse(raw.toString('utf8')) as {
      event: string;
      payload?: { payment?: { entity?: { id: string; order_id: string; amount: number } } };
    };
    const p = body.payload?.payment?.entity;
    if (!p) return null;
    const type =
      body.event === 'payment.captured' || body.event === 'order.paid'
        ? 'paid'
        : body.event === 'payment.failed'
          ? 'failed'
          : body.event === 'payment.authorized'
            ? 'authorized'
            : null;
    if (!type) return null;
    return {
      eventId: eventIdHeader ?? `${body.event}:${p.id}`,
      type,
      orderId: p.order_id,
      paymentId: p.id,
      amountPaise: p.amount,
    };
  }

  async refund(paymentId: string, amountPaise: number) {
    const r = await this.call<{ id: string }>(`/payments/${paymentId}/refund`, {
      amount: amountPaise,
    });
    return { refundId: r.id };
  }

  /** Checkout signature: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
  verifyCheckout(orderId: string, paymentId: string, signature: string): boolean {
    return hmacMatches(this.keySecret, `${orderId}|${paymentId}`, signature);
  }

  async fetchPayment(paymentId: string) {
    return toPayment(
      await this.call<RazorpayPaymentEntity>(`/payments/${encodeURIComponent(paymentId)}`),
    );
  }

  async orderPayments(orderId: string) {
    const r = await this.call<{ items: RazorpayPaymentEntity[] }>(
      `/orders/${encodeURIComponent(orderId)}/payments`,
    );
    return r.items.map(toPayment);
  }

  async capture(paymentId: string, amountPaise: number) {
    return toPayment(
      await this.call<RazorpayPaymentEntity>(`/payments/${encodeURIComponent(paymentId)}/capture`, {
        amount: amountPaise,
        currency: 'INR',
      }),
    );
  }
}
