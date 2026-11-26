import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type BookingStatus, type Prisma } from '@prisma/client';
import { type EarningsDto, type OwnerBookingDto, type OwnerDashboardDto, type PayoutDto } from '@qp/types';
import { AvailabilityService } from '../../shared/availability/availability.service';
import { type Env } from '../../shared/config/env';
import { PrismaService } from '../../shared/database/prisma.service';
import { MoneyService } from '../../shared/reports/money.service';
import { localMidnight, localParts } from '../../shared/time/tz';
import { OwnerContext } from '../owner-context.service';

export const toPayoutDto = (p: Prisma.PayoutGetPayload<{ include: { owner: { select: { businessName: true } } } }>): PayoutDto => ({
  id: p.id,
  ownerId: p.ownerId,
  businessName: p.owner.businessName,
  periodFrom: p.periodFrom.toISOString(),
  periodTo: p.periodTo.toISOString(),
  grossPaise: p.grossPaise,
  commissionPaise: p.commissionPaise,
  refundPaise: p.refundPaise,
  netPaise: p.netPaise,
  status: p.status,
  reference: p.reference,
  paidAt: p.paidAt?.toISOString() ?? null,
  createdAt: p.createdAt.toISOString(),
});

/** Owner-side views (plan M11). Customers' email and phone are never included (PDF). */
@Injectable()
export class OwnerBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: OwnerContext,
    private readonly money: MoneyService,
    private readonly availability: AvailabilityService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private tz() {
    return this.config.get('APP_TIMEZONE', { infer: true });
  }

  private todayRange() {
    const p = localParts(new Date(), this.tz());
    return { start: localMidnight(p.year, p.month, p.day, this.tz()), end: localMidnight(p.year, p.month, p.day + 1, this.tz()) };
  }

  async bookings(userId: string, q: { locationId?: string; date?: string; status?: BookingStatus }): Promise<OwnerBookingDto[]> {
    const owner = await this.ctx.owner(userId);
    if (q.locationId) await this.ctx.location(userId, q.locationId);
    let range: Prisma.BookingWhereInput = {};
    if (q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date)) {
      const [y, m, d] = q.date.split('-').map(Number) as [number, number, number];
      range = { startAt: { lt: localMidnight(y, m, d + 1, this.tz()) }, endAt: { gt: localMidnight(y, m, d, this.tz()) } };
    }
    const rows = await this.prisma.booking.findMany({
      where: {
        location: { ownerId: owner.id },
        ...(q.locationId ? { locationId: q.locationId } : {}),
        ...(q.status ? { status: q.status } : { status: { not: 'PENDING_PAYMENT' } }),
        ...range,
      },
      include: {
        user: { select: { name: true } },
        vehicle: { select: { plateNumber: true } },
        vehicleType: { select: { name: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { startAt: 'desc' },
      take: 300,
    });
    return rows.map((b) => ({
      id: b.id,
      code: b.code,
      status: b.status,
      planType: b.planType,
      quantity: b.quantity,
      startAt: b.startAt.toISOString(),
      endAt: b.endAt.toISOString(),
      amountPaise: b.amountPaise,
      commissionPaise: b.commissionPaise,
      customerName: b.user.name,
      plateNumber: b.vehicle.plateNumber,
      vehicleTypeName: b.vehicleType.name,
      location: b.location,
    }));
  }

  async occupancy(userId: string, locationId: string) {
    await this.ctx.location(userId, locationId);
    const caps = await this.prisma.locationCapacity.findMany({ where: { locationId }, include: { vehicleType: true } });
    return Promise.all(
      caps.map(async (c) => ({
        vehicleTypeId: c.vehicleTypeId,
        vehicleTypeName: c.vehicleType.name,
        totalSlots: c.totalSlots,
        onlineSlots: c.onlineSlots,
        ...(await this.availability.live(locationId, c.vehicleTypeId)),
      })),
    );
  }

  async dashboard(userId: string): Promise<OwnerDashboardDto> {
    const owner = await this.prisma.owner.findUnique({ where: { userId } });
    const empty: OwnerDashboardDto = { locations: [], todayBookings: 0, insideNow: 0, revenueTodayPaise: 0, revenueMonthPaise: 0, daily: [] };
    if (!owner) return empty;
    const { start, end } = this.todayRange();
    const p = localParts(new Date(), this.tz());
    const monthStart = localMidnight(p.year, p.month, 1, this.tz());
    const since = new Date(start.getTime() - 29 * 86_400_000);
    const locations = await this.prisma.parkingLocation.findMany({
      where: { ownerId: owner.id },
      select: { id: true, name: true, status: true, capacities: { select: { totalSlots: true } }, photos: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 }, _count: { select: { sessions: { where: { exitAt: null } } } } },
      orderBy: { createdAt: 'asc' },
    });
    const [todayBookings, today, month, daily] = await Promise.all([
      this.prisma.booking.count({ where: { location: { ownerId: owner.id }, status: { in: ['CONFIRMED', 'ACTIVE', 'COMPLETED'] }, startAt: { lt: end }, endAt: { gt: start } } }),
      this.money.totals({ ownerId: owner.id, from: start, to: end }),
      this.money.totals({ ownerId: owner.id, from: monthStart }),
      this.money.grouped('day', { ownerId: owner.id, from: since }, this.tz()),
    ]);
    const byDay = new Map(daily.map((d) => [d.key, d]));
    return {
      locations: locations.map((l) => ({ id: l.id, name: l.name, status: l.status, inside: l._count.sessions, capacity: l.capacities.reduce((s, c) => s + c.totalSlots, 0), photoUrl: l.photos[0]?.url ?? null })),
      todayBookings,
      insideNow: locations.reduce((s, l) => s + l._count.sessions, 0),
      revenueTodayPaise: today.grossPaise - today.refundPaise,
      revenueMonthPaise: month.grossPaise - month.refundPaise,
      daily: Array.from({ length: 30 }, (_, i) => {
        const key = localParts(new Date(since.getTime() + i * 86_400_000 + 12 * 3_600_000), this.tz()).dateKey;
        const d = byDay.get(key);
        return { date: key, grossPaise: d ? d.grossPaise - d.refundPaise : 0, netPaise: d?.netPaise ?? 0, bookings: d?.bookings ?? 0 };
      }),
    };
  }

  async earnings(userId: string, from?: Date, to?: Date): Promise<EarningsDto> {
    const owner = await this.ctx.owner(userId);
    const p = localParts(new Date(), this.tz());
    const f = from ?? localMidnight(p.year, p.month, 1, this.tz());
    const t = to ?? new Date();
    const [byLocation, gate] = await Promise.all([this.money.grouped('location', { ownerId: owner.id, from: f, to: t }), this.money.gate({ ownerId: owner.id, from: f, to: t })]);
    const sum = (k: 'grossPaise' | 'commissionPaise' | 'refundPaise' | 'netPaise') => byLocation.reduce((s, r) => s + r[k], 0);
    return {
      from: f.toISOString(),
      to: t.toISOString(),
      grossPaise: sum('grossPaise'),
      commissionPaise: sum('commissionPaise'),
      refundPaise: sum('refundPaise'),
      netPaise: sum('netPaise'),
      ...gate,
      byLocation: byLocation.map((r) => ({ locationId: r.key, name: r.label, grossPaise: r.grossPaise, netPaise: r.netPaise, bookings: r.bookings })),
    };
  }

  async payouts(userId: string) {
    const owner = await this.ctx.owner(userId);
    const rows = await this.prisma.payout.findMany({ where: { ownerId: owner.id }, include: { owner: { select: { businessName: true } } }, orderBy: { periodTo: 'desc' } });
    return rows.map(toPayoutDto);
  }
}
