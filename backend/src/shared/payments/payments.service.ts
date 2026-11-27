import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type GateChargeDto, type PaymentHistoryItemDto, type PaymentOrderDto } from '@qp/types';
import { AuditService } from '../audit/audit.service';
import { AvailabilityService } from '../availability/availability.service';
import { PrismaService } from '../database/prisma.service';
import { AppException, Errors } from '../http/app-exception';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  PAYMENT_PROVIDER,
  type PaidEvent,
  type PaymentProvider,
  type ProviderPayment,
} from './payment-provider';

export const REFUND_MAX_ATTEMPTS = 6;

/** Booking money only: online gate charges (overstay) are counted with the gate takings instead. */
const BOOKING_MONEY = { purpose: { not: 'GATE_CHARGE' as const } };

/** Reconciliation looks at unpaid orders between these ages (younger ones are still in Checkout). */
const RECONCILE_MIN_AGE_MS = 2 * 60_000;
const RECONCILE_MAX_AGE_MS = 2 * 60 * 60_000;

/** Called once an online gate charge is paid; the gate module registers it (it closes the session). */
export type GateChargePaidHandler = (paymentId: string) => Promise<void>;

/**
 * Orders, webhook handling and refunds. A booking becomes CONFIRMED only from a verified payment event,
 * and every event is processed at most once (webhook_events unique (provider, event_id)).
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private gateChargePaid: GateChargePaidHandler | null = null;
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) readonly provider: PaymentProvider,
    private readonly notify: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly audit: AuditService,
    private readonly availability: AvailabilityService,
  ) {}

  /** Creates (or reuses) a gateway order for the customer's held booking. */
  async createOrder(userId: string, bookingId: string): Promise<PaymentOrderDto> {
    const b = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId },
      include: { user: { select: { name: true, email: true, phone: true } } },
    });
    if (!b) throw Errors.notFound('Booking');
    if (b.status !== 'PENDING_PAYMENT' || !b.holdExpiresAt || b.holdExpiresAt <= new Date()) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'INVALID_STATE',
        'This booking can no longer be paid. Please book again.',
      );
    }
    const purpose = b.extendedFromId ? 'EXTENSION' : 'BOOKING';
    let payment = await this.prisma.payment.findFirst({
      where: { bookingId, status: 'CREATED', provider: this.provider.name, ...BOOKING_MONEY },
    });
    if (!payment) {
      const order = await this.provider.createOrder(b.amountPaise, b.code);
      payment = await this.prisma.payment.create({
        data: {
          bookingId,
          purpose,
          provider: this.provider.name,
          providerOrderId: order.orderId,
          amountPaise: b.amountPaise,
        },
      });
    }
    return {
      provider: this.provider.name,
      orderId: payment.providerOrderId,
      amountPaise: payment.amountPaise,
      currency: 'INR',
      keyId: this.provider.keyId,
      bookingId,
      prefill: { name: b.user.name, email: b.user.email, contact: b.user.phone },
    };
  }

  /** The customer's paid and failed payments, newest first (abandoned, never-paid orders are left out). */
  async history(userId: string): Promise<PaymentHistoryItemDto[]> {
    const rows = await this.prisma.payment.findMany({
      where: { booking: { userId }, status: { in: ['PAID', 'FAILED'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        booking: { select: { code: true, location: { select: { name: true } } } },
        refunds: { where: { status: 'PROCESSED' }, select: { amountPaise: true } },
      },
    });
    return rows.map((p) => ({
      id: p.id,
      bookingId: p.bookingId,
      bookingCode: p.booking.code,
      placeName: p.booking.location.name,
      purpose: p.purpose as PaymentHistoryItemDto['purpose'],
      status: p.status as PaymentHistoryItemDto['status'],
      amountPaise: p.amountPaise,
      refundedPaise: p.refunds.reduce((s, r) => s + r.amountPaise, 0),
      createdAt: p.createdAt.toISOString(),
      paidAt: p.paidAt?.toISOString() ?? null,
    }));
  }

  onGateChargePaid(handler: GateChargePaidHandler) {
    this.gateChargePaid = handler;
  }

  /**
   * Overstay charge to be paid online by the driver: a gateway order tied to the booking and session.
   * Any earlier unpaid request for the same session is cancelled (the amount grows with time).
   */
  async createGateCharge(bookingId: string, sessionId: string, amountPaise: number, code: string) {
    await this.cancelGateCharges(sessionId);
    const order = await this.provider.createOrder(amountPaise, code);
    return this.prisma.payment.create({
      data: {
        bookingId,
        sessionId,
        purpose: 'GATE_CHARGE',
        provider: this.provider.name,
        providerOrderId: order.orderId,
        amountPaise,
      },
    });
  }

  /** Cancels unpaid online gate charges for a session (paid in cash instead, or replaced). */
  async cancelGateCharges(sessionId: string) {
    const open = await this.prisma.payment.findMany({
      where: { sessionId, purpose: 'GATE_CHARGE', status: 'CREATED' },
      select: { id: true },
    });
    if (!open.length) return;
    await this.prisma.payment.updateMany({
      where: { id: { in: open.map((p) => p.id) }, status: 'CREATED' },
      data: { status: 'FAILED' },
    });
    for (const p of open) await this.notify.markPaymentRead(p.id);
  }

  /** The driver's view of an online gate charge (with checkout details while unpaid). */
  async gateCharge(userId: string, paymentId: string): Promise<GateChargeDto> {
    const p = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        booking: {
          select: {
            userId: true,
            code: true,
            user: { select: { name: true, email: true, phone: true } },
          },
        },
        session: {
          select: {
            plateNumber: true,
            overstayMinutes: true,
            location: { select: { name: true } },
          },
        },
      },
    });
    if (!p || p.purpose !== 'GATE_CHARGE' || p.booking.userId !== userId || !p.session)
      throw Errors.notFound('Payment');
    const status = p.status === 'PAID' ? 'PAID' : p.status === 'CREATED' ? 'PENDING' : 'CANCELLED';
    return {
      paymentId: p.id,
      status,
      amountPaise: p.amountPaise,
      plateNumber: p.session.plateNumber,
      placeName: p.session.location.name,
      bookingCode: p.booking.code,
      overstayMinutes: p.session.overstayMinutes,
      requestedAt: p.createdAt.toISOString(),
      paidAt: p.paidAt?.toISOString() ?? null,
      order:
        status === 'PENDING'
          ? {
              provider: this.provider.name,
              orderId: p.providerOrderId,
              amountPaise: p.amountPaise,
              currency: 'INR',
              keyId: this.provider.keyId,
              bookingId: p.bookingId,
              prefill: {
                name: p.booking.user.name,
                email: p.booking.user.email,
                contact: p.booking.user.phone,
              },
            }
          : null,
    };
  }

  /** Verified Razorpay webhook. */
  async handleWebhook(raw: Buffer | undefined, signature?: string, eventId?: string) {
    if (!raw) throw new AppException(HttpStatus.BAD_REQUEST, 'WEBHOOK_INVALID', 'Missing body');
    const event = this.provider.parseWebhook(raw, signature, eventId);
    if (event?.type === 'authorized') {
      // Manual-capture account: capture it now. Razorpay then sends payment.captured, which confirms.
      // Never fail the webhook over this: reconciliation and the Checkout verify call retry it.
      await this.settleProviderPayment(event.orderId, event.paymentId).catch((e: unknown) =>
        this.logger.error(`capturing ${event.paymentId} failed: ${(e as Error).message}`),
      );
    } else if (event) {
      await this.process(event, JSON.parse(raw.toString('utf8')) as Prisma.InputJsonValue);
    }
    return { ok: true };
  }

  /**
   * Called by the browser / app right after Checkout succeeds, with what Checkout handed it. The signature proves
   * the ids came from Razorpay; the payment is then fetched from Razorpay itself (amount, status) before anything
   * is confirmed, so this is as trustworthy as the webhook and does not depend on the webhook arriving.
   */
  async verifyCheckout(userId: string, orderId: string, paymentId: string, signature: string) {
    if (this.provider.name === 'mock') throw Errors.notFound('Endpoint');
    const row = await this.prisma.payment.findUnique({
      where: { providerOrderId: orderId },
      include: { booking: { select: { userId: true } } },
    });
    if (!row || row.booking.userId !== userId) throw Errors.notFound('Payment');
    if (!this.provider.verifyCheckout(orderId, paymentId, signature))
      throw Errors.badRequest('PAYMENT_INVALID', 'This payment could not be verified');
    if (row.status !== 'PAID') await this.settleProviderPayment(orderId, paymentId);
    const after = await this.prisma.payment.findUniqueOrThrow({
      where: { id: row.id },
      select: { status: true },
    });
    return { ok: true, paid: after.status === 'PAID' };
  }

  /** Fetches a payment from the gateway and settles it against our order. */
  private async settleProviderPayment(orderId: string, paymentId: string) {
    const row = await this.prisma.payment.findUnique({
      where: { providerOrderId: orderId },
      select: { providerOrderId: true, amountPaise: true, status: true },
    });
    if (!row || row.status === 'PAID') return false;
    return this.settle(row, await this.provider.fetchPayment(paymentId));
  }

  /**
   * Captures a gateway payment if it is only authorized, then processes it as paid (idempotent: the event id is
   * per gateway payment, and process() ignores an already PAID order). An authorized payment of the wrong amount
   * is left uncaptured, so Razorpay releases the money back to the customer by itself.
   */
  private async settle(row: { providerOrderId: string; amountPaise: number }, gp: ProviderPayment) {
    if (gp.orderId !== row.providerOrderId) {
      this.logger.warn(`payment ${gp.id} belongs to ${gp.orderId}, not ${row.providerOrderId}`);
      return false;
    }
    let p = gp;
    if (p.status === 'authorized') {
      if (p.amountPaise !== row.amountPaise) {
        this.logger.error(`not capturing ${p.id}: ${p.amountPaise} vs ${row.amountPaise}`);
        return false;
      }
      p = await this.provider.capture(p.id, p.amountPaise).catch(async (e: unknown) => {
        // Captured meanwhile (auto-capture, or a parallel webhook / verify call)?
        const again = await this.provider.fetchPayment(gp.id);
        if (again.status !== 'captured') throw e;
        return again;
      });
    }
    if (p.status !== 'captured') return false;
    await this.process(
      {
        eventId: `captured:${p.id}`,
        type: 'paid',
        orderId: p.orderId,
        paymentId: p.id,
        amountPaise: p.amountPaise,
      },
      {
        source: 'gateway-fetch',
        id: p.id,
        order_id: p.orderId,
        status: p.status,
        amount: p.amountPaise,
      },
    );
    return true;
  }

  /**
   * Scheduler: asks the gateway about recent unpaid orders, in case a webhook was lost or never configured
   * (and the customer closed the page before the verify call). Every tick for the first 15 minutes,
   * then every 10 minutes, up to 2 hours.
   */
  async reconcilePending(now = new Date()) {
    if (this.provider.name === 'mock') return 0;
    const rows = await this.prisma.payment.findMany({
      where: {
        provider: this.provider.name,
        status: { in: ['CREATED', 'FAILED'] },
        createdAt: {
          gte: new Date(now.getTime() - RECONCILE_MAX_AGE_MS),
          lte: new Date(now.getTime() - RECONCILE_MIN_AGE_MS),
        },
      },
      select: { providerOrderId: true, amountPaise: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    let settled = 0;
    for (const r of rows) {
      const ageMin = Math.floor((now.getTime() - r.createdAt.getTime()) / 60_000);
      if (ageMin > 15 && ageMin % 10 !== 0) continue;
      try {
        const attempts = await this.provider.orderPayments(r.providerOrderId);
        const gp =
          attempts.find((a) => a.status === 'captured') ??
          attempts.find((a) => a.status === 'authorized');
        if (gp && (await this.settle(r, gp))) settled++;
      } catch (e) {
        this.logger.warn(`reconcile ${r.providerOrderId} failed: ${(e as Error).message}`);
      }
    }
    return settled;
  }

  /** Mock driver only: the customer's simulated checkout result. Ownership is checked. */
  async mockPay(userId: string, orderId: string, outcome: 'success' | 'failure') {
    if (this.provider.name !== 'mock') throw Errors.notFound('Endpoint');
    const p = await this.prisma.payment.findUnique({
      where: { providerOrderId: orderId },
      include: { booking: { select: { userId: true } } },
    });
    if (!p || p.booking.userId !== userId) throw Errors.notFound('Payment');
    const event: PaidEvent = {
      eventId: `mock:${orderId}:${outcome}`,
      type: outcome === 'success' ? 'paid' : 'failed',
      orderId,
      paymentId: `pay_mock_${p.id.replace(/-/g, '').slice(0, 14)}`,
      amountPaise: p.amountPaise,
    };
    await this.process(event, { mock: true, ...event });
    return { ok: true };
  }

  /** Idempotent: a replayed event id is a no-op. */
  async process(event: PaidEvent, payload: Prisma.InputJsonValue) {
    if (event.type === 'authorized') return; // not money yet: settle() captures it first
    let confirmedBookingId: string | null = null;
    let gateChargePaidId: string | null = null;
    let autoRefund: { paymentId: string; amount: number; reason?: string } | null = null;
    const touched = await this.prisma.$transaction(async (tx) => {
      try {
        await tx.webhookEvent.create({
          data: {
            provider: this.provider.name,
            eventId: event.eventId,
            payload,
            processedAt: new Date(),
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return null; // replay
        throw e;
      }
      const payment = await tx.payment.findUnique({
        where: { providerOrderId: event.orderId },
        include: { booking: true },
      });
      if (!payment) {
        this.logger.warn(`payment event for unknown order ${event.orderId}`);
        return null;
      }
      if (payment.status === 'PAID') return null;
      if (event.type === 'failed') {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'FAILED', providerPaymentId: event.paymentId },
        });
        return null;
      }
      if (event.amountPaise !== payment.amountPaise) {
        // Money arrived but not the right amount: record what was received, don't confirm, refund it all.
        this.logger.error(
          `amount mismatch on ${event.orderId}: ${event.amountPaise} vs ${payment.amountPaise}`,
        );
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'PAID',
            providerPaymentId: event.paymentId,
            paidAt: new Date(),
            amountPaise: event.amountPaise,
          },
        });
        if (payment.purpose !== 'GATE_CHARGE' && payment.booking.status === 'PENDING_PAYMENT') {
          await tx.booking.update({
            where: { id: payment.bookingId },
            data: { status: 'EXPIRED' },
          });
        }
        if (event.amountPaise > 0)
          autoRefund = {
            paymentId: payment.id,
            amount: event.amountPaise,
            reason: 'Paid amount did not match the booking price',
          };
        return payment.booking;
      }
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'PAID', providerPaymentId: event.paymentId, paidAt: new Date() },
      });
      if (payment.purpose === 'GATE_CHARGE') {
        // The gate closes the session (or refunds it if the vehicle already left after paying cash).
        gateChargePaidId = payment.id;
        return payment.booking;
      }
      const b = payment.booking;
      if (b.status === 'PENDING_PAYMENT') {
        // If the hold lapsed, the slot may have been sold since: re-check under the capacity lock.
        let ok = !!b.holdExpiresAt && b.holdExpiresAt > new Date();
        if (!ok) {
          await this.availability.lockCapacity(tx, b.locationId, b.vehicleTypeId);
          ok =
            (await this.availability.free(
              b.locationId,
              b.vehicleTypeId,
              b.startAt,
              b.endAt,
              tx,
              b.id,
              b.zoneId,
            )) > 0;
        }
        // Lapsed hold on a named slot: keep it if still free, else move to another free slot on the same floor.
        let slotId = b.slotId;
        if (ok && b.slotId && b.zoneId && !(b.holdExpiresAt && b.holdExpiresAt > new Date())) {
          const picked = await this.availability.pickSlot(
            tx,
            b.zoneId,
            b.vehicleTypeId,
            b.startAt,
            b.endAt,
            b.slotId,
            true,
            b.id,
          );
          ok = picked !== null;
          slotId = picked ?? null;
        }
        if (ok) {
          await tx.booking.update({
            where: { id: b.id },
            data: { status: 'CONFIRMED', confirmedAt: new Date(), holdExpiresAt: null, slotId },
          });
          confirmedBookingId = b.id;
        } else {
          await tx.booking.update({ where: { id: b.id }, data: { status: 'EXPIRED' } });
          autoRefund = { paymentId: payment.id, amount: payment.amountPaise };
        }
      } else if (b.status === 'EXPIRED' || b.status === 'CANCELLED') {
        autoRefund = { paymentId: payment.id, amount: payment.amountPaise };
      }
      return b;
    });
    if (gateChargePaidId) {
      // Never fail the webhook here: the event is already recorded, so a retry would be ignored.
      if (!this.gateChargePaid)
        this.logger.error(`no handler for paid gate charge ${gateChargePaidId}`);
      else
        await this.gateChargePaid(gateChargePaidId).catch((e: unknown) =>
          this.logger.error(
            `closing session for gate charge ${gateChargePaidId} failed: ${(e as Error).message}`,
          ),
        );
    }
    if (confirmedBookingId && touched) {
      await this.notify.bookingConfirmed(confirmedBookingId);
      await this.realtime.publish(touched.locationId, touched.vehicleTypeId);
    }
    if (autoRefund) {
      const { paymentId, amount, reason } = autoRefund as {
        paymentId: string;
        amount: number;
        reason?: string;
      };
      await this.refund(
        paymentId,
        amount,
        reason ?? 'Payment arrived after the booking expired',
        null,
      );
    }
  }

  /**
   * Refund part or all of a payment. Records PROCESSED or FAILED (FAILED is retried by the scheduler).
   * The payment row is locked while the refundable amount is worked out, so two refunds at the same moment
   * (admin + customer cancel) can never add up to more than was paid.
   */
  async refund(paymentId: string, amountPaise: number, reason: string, actorId: string | null) {
    const refund = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
        const p = await tx.payment.findUnique({
          where: { id: paymentId },
          include: { refunds: true },
        });
        if (!p || p.status !== 'PAID')
          throw Errors.badRequest('PAYMENT_INVALID', 'Only paid payments can be refunded');
        const already =
          p.refunds
            .filter((r) => r.status !== 'FAILED')
            .reduce((sum, r) => sum + r.amountPaise, 0) +
          p.refunds
            .filter((r) => r.status === 'FAILED' && r.attempts < REFUND_MAX_ATTEMPTS)
            .reduce((sum, r) => sum + r.amountPaise, 0);
        const amount = Math.min(amountPaise, p.amountPaise - already);
        if (amount <= 0)
          throw Errors.badRequest('PAYMENT_INVALID', 'This payment is already fully refunded');
        let status: 'PROCESSED' | 'FAILED' = 'PROCESSED';
        let providerRefundId: string | null = null;
        let lastError: string | null = null;
        try {
          providerRefundId = (await this.provider.refund(p.providerPaymentId!, amount)).refundId;
        } catch (e) {
          lastError = (e as Error).message.slice(0, 500);
          this.logger.error(`refund failed for ${paymentId}: ${lastError}`);
          status = 'FAILED';
        }
        return tx.refund.create({
          data: {
            paymentId,
            bookingId: p.bookingId,
            amountPaise: amount,
            status,
            providerRefundId,
            reason,
            createdById: actorId,
            lastError,
            lastAttemptAt: new Date(),
          },
        });
      },
      { timeout: 30_000 },
    );
    await this.audit.log(actorId, 'refund.create', 'booking', refund.bookingId, {
      paymentId,
      amount: refund.amountPaise,
      status: refund.status,
      reason,
    });
    return refund;
  }

  /**
   * Scheduler: retry FAILED refunds (backoff 5 min × attempt) until REFUND_MAX_ATTEMPTS.
   * After the last attempt the refund stays FAILED and shows up for the admin to handle by hand.
   */
  async retryFailedRefunds(now = new Date()) {
    const due = await this.prisma.refund.findMany({
      where: { status: 'FAILED', attempts: { lt: REFUND_MAX_ATTEMPTS } },
      include: { payment: { select: { providerPaymentId: true } } },
      take: 50,
      orderBy: { createdAt: 'asc' },
    });
    let processed = 0;
    for (const r of due) {
      if (r.lastAttemptAt && now.getTime() - r.lastAttemptAt.getTime() < r.attempts * 5 * 60_000)
        continue;
      // Claim it (attempts is the version) so two workers never call the provider twice.
      const claimed = await this.prisma.refund.updateMany({
        where: { id: r.id, status: 'FAILED', attempts: r.attempts },
        data: { attempts: { increment: 1 }, lastAttemptAt: now },
      });
      if (!claimed.count) continue;
      try {
        const { refundId } = await this.provider.refund(
          r.payment.providerPaymentId!,
          r.amountPaise,
        );
        await this.prisma.refund.update({
          where: { id: r.id },
          data: { status: 'PROCESSED', providerRefundId: refundId, lastError: null },
        });
        await this.audit.log(null, 'refund.retry_ok', 'booking', r.bookingId, {
          refundId: r.id,
          attempt: r.attempts + 1,
        });
        processed++;
      } catch (e) {
        await this.prisma.refund.update({
          where: { id: r.id },
          data: { lastError: (e as Error).message.slice(0, 500) },
        });
      }
    }
    return processed;
  }

  /** Refund `amountPaise` across a booking's paid payments (newest first). */
  async refundBooking(
    bookingId: string,
    amountPaise: number,
    reason: string,
    actorId: string | null,
  ) {
    const payments = await this.prisma.payment.findMany({
      where: { bookingId, status: 'PAID', ...BOOKING_MONEY },
      orderBy: { paidAt: 'desc' },
      include: { refunds: true },
    });
    let left = amountPaise;
    let refunded = 0;
    for (const p of payments) {
      if (left <= 0) break;
      const reserved = p.refunds
        .filter((r) => r.status !== 'FAILED' || r.attempts < REFUND_MAX_ATTEMPTS)
        .reduce((s, r) => s + r.amountPaise, 0);
      const avail = p.amountPaise - reserved;
      if (avail <= 0) continue;
      const r = await this.refund(p.id, Math.min(avail, left), reason, actorId);
      if (r.status === 'PROCESSED') refunded += r.amountPaise;
      left -= r.amountPaise;
    }
    return refunded;
  }

  async paidAndRefunded(bookingId: string) {
    const [paid, refunded] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { bookingId, status: 'PAID', ...BOOKING_MONEY },
        _sum: { amountPaise: true },
      }),
      this.prisma.refund.aggregate({
        where: { bookingId, status: 'PROCESSED', payment: BOOKING_MONEY },
        _sum: { amountPaise: true },
      }),
    ]);
    return { paid: paid._sum.amountPaise ?? 0, refunded: refunded._sum.amountPaise ?? 0 };
  }
}
