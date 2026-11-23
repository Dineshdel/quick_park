import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type ParkingLocation, type PlanType, type Prisma } from '@prisma/client';
import { type OpeningDay, type QuoteDto } from '@qp/types';
import { planEnd } from '@qp/validation';
import { AvailabilityService } from '../availability/availability.service';
import { type Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { AppException, Errors } from '../http/app-exception';
import { hhmmToMinutes, localParts } from '../time/tz';

type Db = PrismaService | Prisma.TransactionClient;
const err = (code: 'PLAN_NOT_AVAILABLE' | 'OUTSIDE_OPENING_HOURS' | 'TOO_FAR_AHEAD' | 'START_IN_PAST' | 'INVALID_STATE', message: string) =>
  new AppException(HttpStatus.BAD_REQUEST, code, message);

export interface QuoteRequest {
  locationId: string;
  vehicleTypeId: string;
  planType: PlanType;
  startAt: Date;
  quantity: number;
}

/**
 * Booking rules and price (plan M7, PricingService). Assumed defaults for open questions (plan §10):
 *  - Q4 durations: HOURLY N hours, DAILY N×24h, WEEKLY N×7d, MONTHLY N×30d, YEARLY 365d; EVENT = event window.
 *  - Q10 hourly bookings must fit inside one day's opening hours; daily and longer plans ignore them.
 */
@Injectable()
export class QuoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Validates the request against the place and returns times + price. Does not check availability. */
  async price(req: QuoteRequest, db: Db = this.prisma, now = new Date()) {
    const loc = await db.parkingLocation.findUnique({ where: { id: req.locationId } });
    if (!loc || loc.status !== 'ACTIVE') throw Errors.notFound('Parking place');
    const plan = await db.pricingPlan.findUnique({
      where: { locationId_vehicleTypeId_planType: { locationId: loc.id, vehicleTypeId: req.vehicleTypeId, planType: req.planType } },
    });
    if (!plan?.isActive) throw err('PLAN_NOT_AVAILABLE', 'This plan is not offered for this vehicle type here');
    if (loc.isEvent !== (req.planType === 'EVENT')) {
      throw err('PLAN_NOT_AVAILABLE', loc.isEvent ? 'This is event parking: book the event plan' : 'Event plans are only for event parking');
    }

    let startAt = req.startAt;
    let endAt: Date;
    let quantity = req.quantity;
    if (req.planType === 'EVENT') {
      startAt = loc.eventStartAt!;
      endAt = loc.eventEndAt!;
      quantity = 1;
      if (endAt <= now) throw err('INVALID_STATE', 'This event has ended');
    } else {
      endAt = planEnd(startAt, req.planType, quantity);
      if (startAt.getTime() < now.getTime() - 5 * 60_000) throw err('START_IN_PAST', 'Start time is in the past');
      if (startAt.getTime() > now.getTime() + loc.maxAdvanceDays * 86_400_000) {
        throw err('TOO_FAR_AHEAD', `You can book up to ${loc.maxAdvanceDays} days ahead here`);
      }
      if (req.planType === 'HOURLY') this.assertOpen(loc, startAt, endAt);
    }
    return { location: loc, startAt, endAt, quantity, unitPaise: plan.pricePaise, amountPaise: plan.pricePaise * quantity };
  }

  async quote(req: QuoteRequest): Promise<QuoteDto> {
    const p = await this.price(req);
    const free = await this.availability.free(req.locationId, req.vehicleTypeId, p.startAt, p.endAt);
    return {
      startAt: p.startAt.toISOString(),
      endAt: p.endAt.toISOString(),
      planType: req.planType,
      quantity: p.quantity,
      unitPaise: p.unitPaise,
      amountPaise: p.amountPaise,
      free,
    };
  }

  private assertOpen(loc: ParkingLocation, start: Date, end: Date) {
    if (loc.is24x7) return;
    const hours = loc.openingHours as OpeningDay[] | null;
    if (!hours) return;
    const tz = this.config.get('APP_TIMEZONE', { infer: true });
    const s = localParts(start, tz);
    const e = localParts(new Date(end.getTime() - 1), tz);
    const day = hours[s.weekday];
    const fits = day && !day.closed && s.dateKey === e.dateKey && s.minutes >= hhmmToMinutes(day.open) && e.minutes < hhmmToMinutes(day.close);
    if (!fits) {
      throw err('OUTSIDE_OPENING_HOURS', day && !day.closed ? `Open ${day.open}–${day.close} that day: hourly bookings must fit inside` : 'Closed that day');
    }
  }
}
