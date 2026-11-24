import { HttpStatus, Injectable } from '@nestjs/common';
import { type Booking, type ParkingSession, Prisma } from '@prisma/client';
import {
  VEHICLE_QR_PREFIX,
  type ChargeBreakdownDto,
  type ScanResultDto,
  type SessionDto,
} from '@qp/types';
import { formatPlate, isPass, type scanSchema, type walkInSchema } from '@qp/validation';
import { type z } from 'zod';
import { AvailabilityService } from '../../shared/availability/availability.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { AppException, Errors } from '../../shared/http/app-exception';
import { MastersService } from '../../shared/masters/masters.service';
import { NotificationsService } from '../../shared/notifications/notifications.service';
import { PassService } from '../../shared/pass/pass.service';
import { RealtimeGateway } from '../../shared/realtime/realtime.gateway';
import { OwnerContext } from '../owner-context.service';

const fail = (
  status: HttpStatus,
  code:
    | 'QR_INVALID'
    | 'WRONG_LOCATION'
    | 'TOO_EARLY'
    | 'BOOKING_ENDED'
    | 'NO_BOOKING'
    | 'ALREADY_INSIDE'
    | 'NOT_INSIDE'
    | 'BOOKING_NOT_ACTIVE'
    | 'SLOT_UNAVAILABLE',
  message: string,
  details?: unknown,
) => new AppException(status, code, message, details);
const PLATE = /^[A-Z0-9]{4,12}$/;
/** Booking codes look like QPAB12CD (see bookings.service newCode). */
const BOOKING_CODE = /^QP[A-Z0-9]{6}$/;
/** What staff type: upper-case, without spaces, dots or dashes ("tn 09 ab-1234" → "TN09AB1234"). */
const normalizeTyped = (t: string) => t.toUpperCase().replace(/[\s.-]/g, '');
const noBooking = (plateNumber: string, vehicleTypeId: string | null) =>
  fail(
    HttpStatus.NOT_FOUND,
    'NO_BOOKING',
    `${formatPlate(plateNumber)} has no booking here right now. Record it as a walk-in?`,
    { plateNumber, vehicleTypeId },
  );
const MIN = 60_000;
const HOUR = 60 * MIN;

/**
 * Gate operations (plan M10). Validation chain for a scan: genuine token → this owner's place → booking state →
 * time window (entry grace) → not already inside. Assumed defaults (plan §10):
 *  Q5 overstay / walk-in charges are collected at the gate and recorded as CASH or UPI.
 *  Q6 grace minutes come from platform settings. Q7 weekly+ passes allow unlimited re-entry until they end.
 *  Q8 a sticker scan uses the vehicle's current booking here, else suggests a walk-in.
 *  Q9 the owner scans personally (no attendant role).
 */
@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: OwnerContext,
    private readonly pass: PassService,
    private readonly masters: MastersService,
    private readonly availability: AvailabilityService,
    private readonly realtime: RealtimeGateway,
    private readonly notify: NotificationsService,
  ) {}

  async scan(userId: string, input: z.output<typeof scanSchema>): Promise<ScanResultDto> {
    await this.ctx.location(userId, input.locationId);
    const token = input.token.trim();
    const settings = await this.masters.settings();
    const now = new Date();

    if (input.direction === 'EXIT') {
      const session = await this.findOpenSessionForToken(input.locationId, token);
      return this.prepareExit(userId, session, now, settings.exitGraceMinutes);
    }

    // ENTRY: pass QR, sticker QR, typed booking code, or typed number plate.
    const grace = settings.entryGraceMinutes * MIN;
    let booking: Booking | null = null;
    const bookingId = this.pass.verify(token);
    const typed = normalizeTyped(token);
    if (bookingId) {
      booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
      if (!booking) throw fail(HttpStatus.NOT_FOUND, 'QR_INVALID', 'Unknown pass');
    } else if (token.startsWith(VEHICLE_QR_PREFIX)) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { qrToken: token.slice(VEHICLE_QR_PREFIX.length), deletedAt: null },
      });
      if (!vehicle)
        throw fail(
          HttpStatus.NOT_FOUND,
          'QR_INVALID',
          'This sticker is not valid (removed or replaced)',
        );
      booking = await this.currentBooking([vehicle.id], input.locationId, now, grace);
      if (!booking) throw noBooking(vehicle.plateNumber, vehicle.vehicleTypeId);
    } else if (
      BOOKING_CODE.test(typed) &&
      (booking = await this.prisma.booking.findUnique({ where: { code: typed } }))
    ) {
      // typed booking code, e.g. QPAB12CD
    } else if (PLATE.test(typed)) {
      const vehicles = await this.prisma.vehicle.findMany({
        where: { plateNumber: typed, deletedAt: null },
        select: { id: true, vehicleTypeId: true },
      });
      booking = vehicles.length
        ? await this.currentBooking(
            vehicles.map((v) => v.id),
            input.locationId,
            now,
            grace,
          )
        : null;
      if (!booking) throw noBooking(typed, vehicles[0]?.vehicleTypeId ?? null);
    } else {
      throw fail(
        HttpStatus.BAD_REQUEST,
        'QR_INVALID',
        'Not a Quick Park code. Scan the pass or sticker, or type the booking code or number plate.',
      );
    }
    if (booking.locationId !== input.locationId)
      throw fail(
        HttpStatus.CONFLICT,
        'WRONG_LOCATION',
        'This booking is for a different parking place',
      );

    if (!['CONFIRMED', 'ACTIVE'].includes(booking.status)) {
      throw fail(
        HttpStatus.CONFLICT,
        'BOOKING_NOT_ACTIVE',
        `Booking ${booking.code} is ${booking.status.toLowerCase().replace('_', ' ')}`,
      );
    }
    if (now.getTime() < booking.startAt.getTime() - settings.entryGraceMinutes * MIN) {
      throw fail(
        HttpStatus.CONFLICT,
        'TOO_EARLY',
        `Too early: entry opens ${settings.entryGraceMinutes} min before ${this.pass.fmt(booking.startAt)}`,
      );
    }
    const chainEnd = await this.chainEnd(booking);
    if (now >= chainEnd)
      throw fail(
        HttpStatus.CONFLICT,
        'BOOKING_ENDED',
        `Booking ${booking.code} ended ${this.pass.fmt(chainEnd)}`,
      );
    if (booking.status === 'ACTIVE' && !isPass(booking.planType)) {
      const used = await this.prisma.parkingSession.findFirst({
        where: { bookingId: booking.id, exitAt: { not: null } },
      });
      if (used)
        throw fail(
          HttpStatus.CONFLICT,
          'BOOKING_NOT_ACTIVE',
          'This single-entry booking was already used',
        );
    }

    const vehicle = await this.prisma.vehicle.findUniqueOrThrow({
      where: { id: booking.vehicleId },
      include: { user: { select: { name: true } }, vehicleType: true },
    });
    const zone = booking.zoneId
      ? await this.prisma.parkingZone.findUnique({
          where: { id: booking.zoneId },
          select: { name: true, area: { select: { name: true } } },
        })
      : null;
    const slot = booking.slotId
      ? await this.prisma.parkingSlot.findUnique({
          where: { id: booking.slotId },
          select: { label: true },
        })
      : null;
    const session = await this.openSession({
      locationId: input.locationId,
      bookingId: booking.id,
      vehicleId: vehicle.id,
      vehicleTypeId: booking.vehicleTypeId,
      plateNumber: vehicle.plateNumber,
      isWalkIn: false,
      enteredById: userId,
    });
    if (booking.status === 'CONFIRMED')
      await this.prisma.booking.update({ where: { id: booking.id }, data: { status: 'ACTIVE' } });
    await this.realtime.publish(input.locationId, booking.vehicleTypeId);
    await this.notify.session(session.id, 'entry');
    return {
      action: 'ENTRY',
      sessionId: session.id,
      plateNumber: vehicle.plateNumber,
      vehicleTypeName: vehicle.vehicleType.name,
      customerName: vehicle.user.name,
      booking: {
        id: booking.id,
        code: booking.code,
        planType: booking.planType,
        startAt: booking.startAt.toISOString(),
        endAt: chainEnd.toISOString(),
      },
      isWalkIn: false,
      overstayMinutes: 0,
      amountDuePaise: 0,
      charges: null,
      message: `Welcome ${vehicle.user.name.split(' ')[0]}: ${formatPlate(vehicle.plateNumber)} may enter${zone ? ` · Park at ${slot ? `slot ${slot.label}, ` : ''}${zone.name} (${zone.area.name})` : ''}`,
    };
  }

  async walkIn(userId: string, input: z.output<typeof walkInSchema>): Promise<ScanResultDto> {
    await this.ctx.location(userId, input.locationId);
    const cap = await this.prisma.locationCapacity.findUnique({
      where: {
        locationId_vehicleTypeId: {
          locationId: input.locationId,
          vehicleTypeId: input.vehicleTypeId,
        },
      },
      include: { vehicleType: true },
    });
    if (!cap)
      throw Errors.badRequest('VEHICLE_TYPE_INVALID', 'This vehicle type has no slots here');
    const live = await this.availability.live(input.locationId, input.vehicleTypeId);
    // Physical space check: everyone inside + confirmed bookings that may arrive now must fit in total slots.
    if (live.inside >= cap.totalSlots)
      throw fail(
        HttpStatus.CONFLICT,
        'SLOT_UNAVAILABLE',
        'The parking is full for this vehicle type',
      );
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        plateNumber: input.plateNumber,
        vehicleTypeId: input.vehicleTypeId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });
    const session = await this.openSession({
      locationId: input.locationId,
      bookingId: null,
      vehicleId: vehicle?.id ?? null,
      vehicleTypeId: input.vehicleTypeId,
      plateNumber: input.plateNumber,
      isWalkIn: true,
      enteredById: userId,
    });
    await this.realtime.publish(input.locationId, input.vehicleTypeId);
    return {
      action: 'ENTRY',
      sessionId: session.id,
      plateNumber: input.plateNumber,
      vehicleTypeName: cap.vehicleType.name,
      customerName: null,
      booking: null,
      isWalkIn: true,
      overstayMinutes: 0,
      amountDuePaise: 0,
      charges: null,
      message: `Walk-in recorded: ${formatPlate(input.plateNumber)}. Charge at exit.`,
    };
  }

  /** Close a session after collecting any amount due. paymentMethod is required when something is due. */
  async exit(
    userId: string,
    sessionId: string,
    paymentMethod?: 'CASH' | 'UPI',
  ): Promise<ScanResultDto> {
    const s = await this.prisma.parkingSession.findUnique({ where: { id: sessionId } });
    if (!s) throw Errors.notFound('Session');
    await this.ctx.location(userId, s.locationId);
    if (s.exitAt) throw fail(HttpStatus.CONFLICT, 'NOT_INSIDE', 'This vehicle has already left');
    const settings = await this.masters.settings();
    const due = await this.amounts(s, new Date(), settings.exitGraceMinutes);
    if (due.total > 0 && !paymentMethod) {
      throw Errors.badRequest('VALIDATION_FAILED', 'Record how the amount was paid (cash or UPI)', [
        { path: 'paymentMethod', message: 'Choose cash or UPI' },
      ]);
    }
    return this.close(userId, s, due, due.total > 0 ? paymentMethod! : null);
  }

  async sessions(userId: string, locationId: string, open: boolean): Promise<SessionDto[]> {
    await this.ctx.location(userId, locationId);
    const rows = await this.prisma.parkingSession.findMany({
      where: {
        locationId,
        ...(open ? { exitAt: null } : { entryAt: { gte: new Date(Date.now() - 24 * HOUR) } }),
      },
      include: {
        vehicleType: { select: { name: true } },
        booking: { select: { code: true, endAt: true } },
      },
      orderBy: { entryAt: 'desc' },
      take: 200,
    });
    const settings = await this.masters.settings();
    const now = new Date();
    const live = new Map<string, { dueNowPaise: number; freeUntil: string | null }>();
    for (const s of rows.filter((r) => !r.exitAt)) {
      const due = await this.amounts(s, now, settings.exitGraceMinutes);
      live.set(s.id, { dueNowPaise: due.total, freeUntil: due.freeUntil?.toISOString() ?? null });
    }
    return rows.map((s) => ({
      id: s.id,
      plateNumber: s.plateNumber,
      vehicleTypeName: s.vehicleType.name,
      isWalkIn: s.isWalkIn,
      entryAt: s.entryAt.toISOString(),
      exitAt: s.exitAt?.toISOString() ?? null,
      bookingCode: s.booking?.code ?? null,
      bookingEndAt: s.booking?.endAt.toISOString() ?? null,
      overstayAmountPaise: s.overstayAmountPaise,
      walkInAmountPaise: s.walkInAmountPaise,
      paymentMethod: s.paymentMethod,
      dueNowPaise: live.get(s.id)?.dueNowPaise ?? 0,
      freeUntil: live.get(s.id)?.freeUntil ?? null,
    }));
  }

  // ---------- helpers ----------

  private async openSession(data: Prisma.ParkingSessionUncheckedCreateInput) {
    try {
      return await this.prisma.parkingSession.create({ data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw fail(
          HttpStatus.CONFLICT,
          'ALREADY_INSIDE',
          `${formatPlate(data.plateNumber)} is already inside`,
        );
      }
      throw e;
    }
  }

  /** The booking that lets one of these vehicles in now (entry opens `grace` ms before the start). */
  private currentBooking(vehicleIds: string[], locationId: string, now: Date, grace: number) {
    return this.prisma.booking.findFirst({
      where: {
        vehicleId: { in: vehicleIds },
        locationId,
        status: { in: ['CONFIRMED', 'ACTIVE'] },
        startAt: { lte: new Date(now.getTime() + grace) },
        endAt: { gt: now },
      },
      orderBy: { startAt: 'asc' },
    });
  }

  private async findOpenSessionForToken(locationId: string, token: string) {
    const bookingId = this.pass.verify(token);
    let where: Prisma.ParkingSessionWhereInput | null = null;
    if (bookingId) {
      const b = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        select: { locationId: true },
      });
      if (b && b.locationId !== locationId)
        throw fail(
          HttpStatus.CONFLICT,
          'WRONG_LOCATION',
          'This pass is for a different parking place',
        );
      where = { bookingId };
    } else if (token.startsWith(VEHICLE_QR_PREFIX)) {
      const v = await this.prisma.vehicle.findFirst({
        where: { qrToken: token.slice(VEHICLE_QR_PREFIX.length) },
      });
      if (!v) throw fail(HttpStatus.NOT_FOUND, 'QR_INVALID', 'This sticker is not valid');
      where = { plateNumber: v.plateNumber };
    } else {
      const typed = normalizeTyped(token);
      const byCode = BOOKING_CODE.test(typed)
        ? await this.prisma.booking.findUnique({
            where: { code: typed },
            select: { id: true, locationId: true },
          })
        : null;
      if (byCode) {
        if (byCode.locationId !== locationId)
          throw fail(
            HttpStatus.CONFLICT,
            'WRONG_LOCATION',
            'This booking is for a different parking place',
          );
        where = { bookingId: byCode.id };
      } else {
        if (!PLATE.test(typed))
          throw fail(
            HttpStatus.BAD_REQUEST,
            'QR_INVALID',
            'Scan the pass or sticker, or type the booking code or number plate',
          );
        where = { plateNumber: typed };
      }
    }
    const s = await this.prisma.parkingSession.findFirst({
      where: { ...where, locationId, exitAt: null },
    });
    if (!s) throw fail(HttpStatus.NOT_FOUND, 'NOT_INSIDE', 'This vehicle is not inside');
    return s;
  }

  private async prepareExit(
    userId: string,
    s: ParkingSession,
    now: Date,
    exitGrace: number,
  ): Promise<ScanResultDto> {
    const due = await this.amounts(s, now, exitGrace);
    if (due.total === 0) return this.close(userId, s, due, null);
    const vt = await this.prisma.vehicleType.findUniqueOrThrow({ where: { id: s.vehicleTypeId } });
    const booking = s.bookingId
      ? await this.prisma.booking.findUnique({
          where: { id: s.bookingId },
          include: { user: { select: { name: true } } },
        })
      : null;
    const late = due.overstayMinutes;
    return {
      action: 'EXIT',
      sessionId: s.id,
      plateNumber: s.plateNumber,
      vehicleTypeName: vt.name,
      customerName: booking?.user.name ?? null,
      booking: booking
        ? {
            id: booking.id,
            code: booking.code,
            planType: booking.planType,
            startAt: booking.startAt.toISOString(),
            endAt: due.breakdown?.from ?? booking.endAt.toISOString(),
          }
        : null,
      isWalkIn: s.isWalkIn,
      overstayMinutes: late,
      amountDuePaise: due.total,
      charges: due.breakdown,
      message: s.isWalkIn
        ? `Collect the walk-in charge, then confirm exit`
        : `Late by ${late >= 60 ? `${Math.floor(late / 60)} h ` : ''}${late % 60} min: collect the overstay charge, then confirm exit`,
    };
  }

  /**
   * Gate charges at `now`, per started hour:
   *  - overstay: once `exitGraceMinutes` have passed after the booking end (incl. extensions), every started hour
   *    past the end is charged at the place's overstay rate (5 min grace → 10:06 exit after a 10:00 end = 1 hour);
   *  - walk-in: every started hour since entry at the hourly price, capped by the daily price when cheaper.
   */
  private async amounts(s: ParkingSession, now: Date, exitGraceMinutes: number) {
    const cap = await this.prisma.locationCapacity.findUnique({
      where: {
        locationId_vehicleTypeId: { locationId: s.locationId, vehicleTypeId: s.vehicleTypeId },
      },
    });
    let overstayMinutes = 0;
    let overstay = 0;
    let walkIn = 0;
    let breakdown: ChargeBreakdownDto | null = null;
    let freeUntil: Date | null = null;
    if (s.bookingId) {
      const booking = await this.prisma.booking.findUniqueOrThrow({ where: { id: s.bookingId } });
      const end = await this.chainEnd(booking);
      freeUntil = new Date(end.getTime() + exitGraceMinutes * MIN);
      if (now.getTime() > freeUntil.getTime()) {
        overstayMinutes = Math.ceil((now.getTime() - end.getTime()) / MIN);
        const hours = Math.ceil(overstayMinutes / 60);
        const rate = cap?.overstayPerHourPaise ?? 0;
        overstay = hours * rate;
        breakdown = {
          kind: 'OVERSTAY',
          from: end.toISOString(),
          graceMinutes: exitGraceMinutes,
          until: now.toISOString(),
          minutes: overstayMinutes,
          hours,
          ratePerHourPaise: rate,
          amountPaise: overstay,
          note: rate ? null : 'No overstay charge is set for this vehicle type',
        };
      }
    } else if (s.isWalkIn) {
      const minutes = Math.max(1, Math.ceil((now.getTime() - s.entryAt.getTime()) / MIN));
      const hours = Math.max(1, Math.ceil(minutes / 60));
      const plan = (planType: 'HOURLY' | 'DAILY') =>
        this.prisma.pricingPlan.findUnique({
          where: {
            locationId_vehicleTypeId_planType: {
              locationId: s.locationId,
              vehicleTypeId: s.vehicleTypeId,
              planType,
            },
          },
        });
      const [hourly, daily] = await Promise.all([plan('HOURLY'), plan('DAILY')]);
      let note: string | null = null;
      if (hourly?.isActive) walkIn = hours * hourly.pricePaise;
      if (daily?.isActive) {
        const byDay = Math.ceil(hours / 24) * daily.pricePaise;
        if (!walkIn || byDay < walkIn) {
          note = walkIn
            ? `Daily rate applied (cheaper than ${hours} h hourly)`
            : 'Charged at the daily rate';
          walkIn = byDay;
        }
      }
      breakdown = {
        kind: 'WALK_IN',
        from: s.entryAt.toISOString(),
        graceMinutes: 0,
        until: now.toISOString(),
        minutes,
        hours,
        ratePerHourPaise: hourly?.isActive ? hourly.pricePaise : 0,
        amountPaise: walkIn,
        note,
      };
    }
    return { overstayMinutes, overstay, walkIn, total: overstay + walkIn, breakdown, freeUntil };
  }

  private async close(
    userId: string,
    s: ParkingSession,
    due: {
      overstayMinutes: number;
      overstay: number;
      walkIn: number;
      total: number;
      breakdown: ChargeBreakdownDto | null;
    },
    method: 'CASH' | 'UPI' | null,
  ): Promise<ScanResultDto> {
    const now = new Date();
    const closed = await this.prisma.parkingSession.updateMany({
      where: { id: s.id, exitAt: null },
      data: {
        exitAt: now,
        exitedById: userId,
        overstayMinutes: due.overstayMinutes,
        overstayAmountPaise: due.overstay,
        walkInAmountPaise: due.walkIn,
        paymentMethod: method,
      },
    });
    if (!closed.count)
      throw fail(HttpStatus.CONFLICT, 'NOT_INSIDE', 'This vehicle has already left');
    let bookingOut: ScanResultDto['booking'] = null;
    let customerName: string | null = null;
    if (s.bookingId) {
      const booking = await this.prisma.booking.findUniqueOrThrow({
        where: { id: s.bookingId },
        include: { user: { select: { name: true } } },
      });
      customerName = booking.user.name;
      const end = await this.chainEnd(booking);
      bookingOut = {
        id: booking.id,
        code: booking.code,
        planType: booking.planType,
        startAt: booking.startAt.toISOString(),
        endAt: end.toISOString(),
      };
      // Single-entry plans finish at exit; passes finish only when their time is up.
      if (!isPass(booking.planType) || now >= end) {
        const chain = await this.chainIds(booking);
        await this.prisma.booking.updateMany({
          where: { id: { in: chain }, status: { in: ['ACTIVE', 'CONFIRMED'] } },
          data: { status: 'COMPLETED' },
        });
      }
    }
    const vt = await this.prisma.vehicleType.findUniqueOrThrow({ where: { id: s.vehicleTypeId } });
    await this.realtime.publish(s.locationId, s.vehicleTypeId);
    await this.notify.session(s.id, 'exit');
    return {
      action: 'EXIT',
      sessionId: s.id,
      plateNumber: s.plateNumber,
      vehicleTypeName: vt.name,
      customerName,
      booking: bookingOut,
      isWalkIn: s.isWalkIn,
      overstayMinutes: due.overstayMinutes,
      amountDuePaise: 0,
      charges: due.total ? due.breakdown : null,
      message: `${formatPlate(s.plateNumber)} may leave${due.total ? ` (collected ₹${(due.total / 100).toFixed(0)} by ${method})` : ''}`,
    };
  }

  private async chainIds(b: Booking): Promise<string[]> {
    const ids = [b.id];
    let current = b;
    for (let i = 0; i < 50; i++) {
      const next = await this.prisma.booking.findFirst({
        where: {
          extendedFromId: current.id,
          status: { in: ['CONFIRMED', 'ACTIVE'] },
          startAt: current.endAt,
        },
      });
      if (!next) break;
      ids.push(next.id);
      current = next;
    }
    return ids;
  }

  /** End of a booking plus its confirmed back-to-back extensions. */
  private async chainEnd(b: Booking): Promise<Date> {
    let current = b;
    for (let i = 0; i < 50; i++) {
      const next = await this.prisma.booking.findFirst({
        where: {
          extendedFromId: current.id,
          status: { in: ['CONFIRMED', 'ACTIVE'] },
          startAt: current.endAt,
        },
      });
      if (!next) break;
      current = next;
    }
    return current.endAt;
  }
}
