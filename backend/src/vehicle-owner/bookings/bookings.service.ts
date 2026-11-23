import { randomBytes } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type BookingStatus } from '@prisma/client';
import { type BookingDto, type CancellationRule, type PassDto } from '@qp/types';
import { refundPctFor, type bookingCreateSchema } from '@qp/validation';
import { type z } from 'zod';
import { AvailabilityService } from '../../shared/availability/availability.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { AppException, Errors } from '../../shared/http/app-exception';
import { MastersService } from '../../shared/masters/masters.service';
import { NotificationsService } from '../../shared/notifications/notifications.service';
import { PassService } from '../../shared/pass/pass.service';
import { PaymentsService } from '../../shared/payments/payments.service';
import { QuoteService } from '../../shared/pricing/quote.service';
import { RealtimeGateway } from '../../shared/realtime/realtime.gateway';

export const bookingInclude = {
  location: {
    select: { id: true, name: true, slug: true, address: true, city: true, lat: true, lng: true },
  },
  vehicle: { select: { id: true, plateNumber: true } },
  vehicleType: { select: { id: true, code: true, name: true } },
  refunds: { where: { status: 'PROCESSED' }, select: { amountPaise: true } },
} satisfies Prisma.BookingInclude;
type Row = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

export const toBookingDto = (b: Row): BookingDto => ({
  id: b.id,
  code: b.code,
  status: b.status,
  planType: b.planType,
  quantity: b.quantity,
  startAt: b.startAt.toISOString(),
  endAt: b.endAt.toISOString(),
  amountPaise: b.amountPaise,
  holdExpiresAt: b.holdExpiresAt?.toISOString() ?? null,
  cancelledAt: b.cancelledAt?.toISOString() ?? null,
  cancelReason: b.cancelReason,
  extendedFromId: b.extendedFromId,
  cancellationRules: b.cancellationRules as unknown as CancellationRule[],
  location: b.location,
  vehicle: b.vehicle,
  vehicleType: b.vehicleType,
  refundedPaise: b.refunds.reduce((s, r) => s + r.amountPaise, 0),
  createdAt: b.createdAt.toISOString(),
});

const MAX_UNPAID_HOLDS = 3;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () =>
  `QP${Array.from(randomBytes(6), (x) => CODE_CHARS[x % CODE_CHARS.length]).join('')}`;
/** Booking codes are random (32^6); on the rare unique clash, run the insert again with a fresh code. */
async function retryOnCodeClash<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (e) {
      const target =
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
          ? String((e.meta as { target?: unknown })?.target ?? '')
          : '';
      if (attempt < 4 && target.includes('code')) continue;
      throw e;
    }
  }
}

const slotUnavailable = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'SLOT_UNAVAILABLE',
    'No slots left for that time. Try another time or place.',
  );

export interface CreateArgs extends z.output<typeof bookingCreateSchema> {
  idempotencyKey: string;
  extendedFromId?: string;
}

/** Customer bookings (plan M7). */
@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quotes: QuoteService,
    private readonly availability: AvailabilityService,
    private readonly masters: MastersService,
    private readonly payments: PaymentsService,
    private readonly notify: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly pass: PassService,
  ) {}

  /**
   * Hold a slot for `holdMinutes` while the customer pays. Under the capacity row lock, re-check that a slot is
   * free, then insert, so concurrent requests can never overbook. The same Idempotency-Key returns the same booking.
   */
  async create(userId: string, a: CreateArgs): Promise<{ booking: BookingDto; created: boolean }> {
    const existing = await this.prisma.booking.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: a.idempotencyKey } },
      include: bookingInclude,
    });
    if (existing) return { booking: toBookingDto(existing), created: false };

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: a.vehicleId, userId, deletedAt: null },
    });
    if (!vehicle)
      throw Errors.badRequest('VALIDATION_FAILED', 'Choose one of your vehicles', [
        { path: 'vehicleId', message: 'Choose one of your vehicles' },
      ]);
    const settings = await this.masters.settings();
    // Unpaid holds block real slots, so one account can't hoard a place with many of them.
    const holds = await this.prisma.booking.count({
      where: { userId, status: 'PENDING_PAYMENT', holdExpiresAt: { gt: new Date() } },
    });
    if (holds >= MAX_UNPAID_HOLDS) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'INVALID_STATE',
        `You have ${holds} unpaid bookings. Pay for or cancel one first.`,
      );
    }

    try {
      const booking = await retryOnCodeClash(() =>
        this.prisma.$transaction(async (tx) => {
          const p = await this.quotes.price(
            {
              locationId: a.locationId,
              vehicleTypeId: vehicle.vehicleTypeId,
              planType: a.planType,
              startAt: a.startAt,
              quantity: a.quantity,
            },
            tx,
          );
          await this.availability.lockCapacity(tx, a.locationId, vehicle.vehicleTypeId);
          const free = await this.availability.free(
            a.locationId,
            vehicle.vehicleTypeId,
            p.startAt,
            p.endAt,
            tx,
          );
          if (free < 1) throw slotUnavailable();
          const clash = await tx.booking.findFirst({
            where: {
              vehicleId: vehicle.id,
              status: { in: ['CONFIRMED', 'ACTIVE'] },
              startAt: { lt: p.endAt },
              endAt: { gt: p.startAt },
              ...(a.extendedFromId ? { NOT: { id: a.extendedFromId } } : {}),
            },
          });
          if (clash)
            throw new AppException(
              HttpStatus.CONFLICT,
              'SLOT_UNAVAILABLE',
              `This vehicle already has booking ${clash.code} at that time`,
            );

          const owner = await tx.owner.findUniqueOrThrow({
            where: { id: p.location.ownerId },
            select: { commissionPct: true },
          });
          const pct = owner.commissionPct?.toNumber() ?? settings.defaultCommissionPct;
          const policy = p.location.cancellationPolicyId
            ? await tx.cancellationPolicy.findUnique({
                where: { id: p.location.cancellationPolicyId },
              })
            : await tx.cancellationPolicy.findFirst({ where: { isDefault: true } });
          return tx.booking.create({
            data: {
              code: newCode(),
              userId,
              vehicleId: vehicle.id,
              locationId: a.locationId,
              vehicleTypeId: vehicle.vehicleTypeId,
              planType: a.planType,
              quantity: p.quantity,
              startAt: p.startAt,
              endAt: p.endAt,
              amountPaise: p.amountPaise,
              commissionPaise: Math.round((p.amountPaise * pct) / 100),
              holdExpiresAt: new Date(Date.now() + settings.holdMinutes * 60_000),
              idempotencyKey: a.idempotencyKey,
              extendedFromId: a.extendedFromId ?? null,
              cancellationRules: (policy?.rules ?? [
                { hoursBefore: 0, refundPct: 0 },
              ]) as Prisma.InputJsonValue,
            },
            include: bookingInclude,
          });
        }),
      );
      await this.realtime.publish(booking.locationId, booking.vehicleTypeId);
      return { booking: toBookingDto(booking), created: true };
    } catch (e) {
      // A parallel request with the same key won the race: return its booking.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.prisma.booking.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey: a.idempotencyKey } },
          include: bookingInclude,
        });
        if (again) return { booking: toBookingDto(again), created: false };
      }
      throw e;
    }
  }

  async list(userId: string, tab: 'upcoming' | 'active' | 'past'): Promise<BookingDto[]> {
    const now = new Date();
    const where: Prisma.BookingWhereInput =
      tab === 'active'
        ? { userId, status: 'ACTIVE' }
        : tab === 'upcoming'
          ? {
              userId,
              OR: [
                { status: 'CONFIRMED', endAt: { gt: now } },
                { status: 'PENDING_PAYMENT', holdExpiresAt: { gt: now } },
              ],
            }
          : { userId, status: { in: ['COMPLETED', 'CANCELLED', 'EXPIRED'] as BookingStatus[] } };
    const rows = await this.prisma.booking.findMany({
      where,
      include: bookingInclude,
      orderBy: { startAt: tab === 'past' ? 'desc' : 'asc' },
      take: 100,
    });
    return rows.map(toBookingDto);
  }

  async find(userId: string, id: string) {
    const b = await this.prisma.booking.findFirst({
      where: { id, userId },
      include: bookingInclude,
    });
    if (!b) throw Errors.notFound('Booking');
    return b;
  }

  async get(userId: string, id: string) {
    return toBookingDto(await this.find(userId, id));
  }

  /**
   * Cancel. Unpaid holds are simply released. Confirmed bookings refund per the policy captured at booking time,
   * based on hours left before start. Started bookings can't be cancelled.
   */
  async cancel(userId: string, id: string, reason?: string) {
    const b = await this.find(userId, id);
    const now = new Date();
    if (b.status === 'PENDING_PAYMENT') {
      await this.prisma.booking.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancelReason: reason ?? 'Cancelled before payment',
        },
      });
      await this.realtime.publish(b.locationId, b.vehicleTypeId);
      return this.get(userId, id);
    }
    if (b.status !== 'CONFIRMED' || b.startAt <= now) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'BOOKING_NOT_CANCELLABLE',
        'Only upcoming confirmed bookings can be cancelled',
      );
    }
    const claimed = await this.prisma.booking.updateMany({
      where: { id, status: 'CONFIRMED' },
      data: { status: 'CANCELLED', cancelledAt: now, cancelReason: reason ?? null },
    });
    if (!claimed.count)
      throw new AppException(
        HttpStatus.CONFLICT,
        'BOOKING_NOT_CANCELLABLE',
        'This booking changed, refresh and try again',
      );
    const hoursBefore = (b.startAt.getTime() - now.getTime()) / 3_600_000;
    const pct = refundPctFor(b.cancellationRules as unknown as CancellationRule[], hoursBefore);
    const { paid } = await this.payments.paidAndRefunded(id);
    const amount = Math.floor((paid * pct) / 100);
    const refunded =
      amount > 0
        ? await this.payments.refundBooking(
            id,
            amount,
            `Customer cancelled (${pct}% per policy)`,
            userId,
          )
        : 0;
    await this.notify.bookingCancelled(id, refunded);
    await this.realtime.publish(b.locationId, b.vehicleTypeId);
    return this.get(userId, id);
  }

  /** Extension = a new booking right after this one ends, same plan rate, paid separately (assumed default, Q12). */
  async extend(userId: string, id: string, quantity: number) {
    const b = await this.find(userId, id);
    if (!['CONFIRMED', 'ACTIVE'].includes(b.status) || b.endAt <= new Date()) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'BOOKING_NOT_ACTIVE',
        'Only current or upcoming bookings can be extended',
      );
    }
    if (b.planType === 'EVENT')
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'PLAN_NOT_AVAILABLE',
        'Event bookings cannot be extended',
      );
    const lastInChain = await this.chainEnd(b.id);
    return this.create(userId, {
      locationId: b.locationId,
      vehicleId: b.vehicleId,
      planType: b.planType,
      startAt: lastInChain,
      quantity,
      idempotencyKey: `extend:${b.id}:${lastInChain.toISOString()}:${quantity}`,
      extendedFromId: b.id,
    });
  }

  /** End of the booking plus any confirmed extensions that follow it. */
  async chainEnd(bookingId: string): Promise<Date> {
    let current = await this.prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    let end = current.endAt;
    for (let i = 0; i < 50; i++) {
      const next = await this.prisma.booking.findFirst({
        where: {
          extendedFromId: current.id,
          status: { in: ['CONFIRMED', 'ACTIVE', 'PENDING_PAYMENT'] },
          startAt: end,
        },
      });
      if (!next) break;
      end = next.endAt;
      current = next;
    }
    return end;
  }

  async passFor(userId: string, id: string): Promise<PassDto> {
    const b = await this.find(userId, id);
    if (!['CONFIRMED', 'ACTIVE'].includes(b.status)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'BOOKING_NOT_ACTIVE',
        'A pass is available once the booking is confirmed',
      );
    }
    return {
      bookingId: b.id,
      code: b.code,
      payload: this.pass.payload(b.id),
      svg: await this.pass.svg(b.id),
    };
  }

  async passPdf(userId: string, id: string) {
    const b = await this.find(userId, id);
    if (!['CONFIRMED', 'ACTIVE'].includes(b.status)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'BOOKING_NOT_ACTIVE',
        'A pass is available once the booking is confirmed',
      );
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true },
    });
    return {
      code: b.code,
      pdf: await this.pass.pdf({
        id: b.id,
        code: b.code,
        planType: b.planType,
        quantity: b.quantity,
        startAt: b.startAt,
        endAt: b.endAt,
        amountPaise: b.amountPaise,
        plateNumber: b.vehicle.plateNumber,
        vehicleTypeName: b.vehicleType.name,
        locationName: b.location.name,
        address: b.location.address,
        customerName: user.name,
      }),
    };
  }

  /** Disputes (assumed flow, Q15): the customer raises one from a booking; an admin resolves it. */
  async raiseDispute(userId: string, id: string, reason: string) {
    const b = await this.find(userId, id);
    if (b.status === 'PENDING_PAYMENT')
      throw new AppException(HttpStatus.CONFLICT, 'INVALID_STATE', 'Pay for the booking first');
    const open = await this.prisma.dispute.findFirst({ where: { bookingId: id, status: 'OPEN' } });
    if (open) throw Errors.conflict('DUPLICATE', 'You already have an open issue for this booking');
    return this.prisma.dispute.create({ data: { bookingId: id, raisedById: userId, reason } });
  }

  async disputes(userId: string, id: string) {
    await this.find(userId, id);
    return this.prisma.dispute.findMany({
      where: { bookingId: id },
      orderBy: { createdAt: 'desc' },
    });
  }
}
