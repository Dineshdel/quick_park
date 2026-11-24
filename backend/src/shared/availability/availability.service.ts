import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { type CalendarDto, type DayAvailability, type OpeningDay } from '@qp/types';
import { type Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { MastersService } from '../masters/masters.service';
import { localMidnight, localParts } from '../time/tz';

type Db = PrismaService | Prisma.TransactionClient;

/** Vehicles inside without a covering booking are assumed to leave within this long (affects windows starting sooner). */
const OCCUPANCY_HORIZON_MS = 2 * 3_600_000;

interface Interval {
  s: Date;
  e: Date;
  w: number;
}

/** Peak total weight of half-open intervals [s, e) at any instant of [start, end) (same rule as peakUsed). */
export function peakIn(intervals: Interval[], start: Date, end: Date): number {
  const ev: [number, number][] = [];
  const a = start.getTime();
  const b = end.getTime();
  for (const i of intervals) {
    const s = i.s.getTime();
    const e = i.e.getTime();
    if (s >= b || e <= a) continue;
    ev.push([Math.max(s, a), i.w]);
    if (e < b) ev.push([e, -i.w]);
  }
  ev.sort((x, y) => x[0] - y[0] || x[1] - y[1]); // ends before starts at the same instant
  let run = 0;
  let peak = 0;
  for (const [, d] of ev) {
    run += d;
    if (run > peak) peak = run;
  }
  return peak;
}

/** Booking statuses that occupy a slot. PENDING_PAYMENT only while its hold is unexpired. */
const HOLDING = Prisma.sql`(b.status IN ('CONFIRMED','ACTIVE') OR (b.status = 'PENDING_PAYMENT' AND b.hold_expires_at > now()))`;

/**
 * Availability engine (plan §5.1):
 *   free(t) = online_slots − concurrent_bookings(t) − blocked(t),  result = min over t in [start, end)
 * computed exactly with one sweep-line query over booking/block start and end points inside the window.
 */
@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly masters: MastersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Peak slots used (bookings + blocks) at any instant of [start, end). With `zoneId`, only bookings made for that
   * floor/zone count (blocks are place-wide, so they only reduce the place's overall free slots).
   */
  async peakUsed(
    locationId: string,
    vehicleTypeId: string,
    start: Date,
    end: Date,
    db: Db = this.prisma,
    excludeBookingId?: string,
    zoneId?: string,
  ): Promise<number> {
    const exclude = excludeBookingId
      ? Prisma.sql`AND b.id <> ${excludeBookingId}::uuid`
      : Prisma.empty;
    const zone = zoneId ? Prisma.sql`AND b.zone_id = ${zoneId}::uuid` : Prisma.empty;
    const blocks = zoneId ? Prisma.sql`AND false` : Prisma.empty;
    // Ends sort before starts at the same instant: intervals are half-open [start, end).
    const rows = await db.$queryRaw<{ peak: number | null }[]>`
      WITH ev AS (
        SELECT GREATEST(b.start_at, ${start}) AS t, 1 AS d FROM bookings b
          WHERE b.location_id = ${locationId}::uuid AND b.vehicle_type_id = ${vehicleTypeId}::uuid
            AND ${HOLDING} AND b.start_at < ${end} AND b.end_at > ${start} ${exclude} ${zone}
        UNION ALL
        SELECT b.end_at, -1 FROM bookings b
          WHERE b.location_id = ${locationId}::uuid AND b.vehicle_type_id = ${vehicleTypeId}::uuid
            AND ${HOLDING} AND b.end_at > ${start} AND b.end_at < ${end} AND b.start_at < ${end} ${exclude} ${zone}
        UNION ALL
        SELECT GREATEST(k.start_at, ${start}), k.slots FROM capacity_blocks k
          WHERE k.location_id = ${locationId}::uuid AND k.vehicle_type_id = ${vehicleTypeId}::uuid
            AND k.start_at < ${end} AND k.end_at > ${start} ${blocks}
        UNION ALL
        SELECT k.end_at, -k.slots FROM capacity_blocks k
          WHERE k.location_id = ${locationId}::uuid AND k.vehicle_type_id = ${vehicleTypeId}::uuid
            AND k.end_at > ${start} AND k.end_at < ${end} AND k.start_at < ${end} ${blocks}
      )
      SELECT MAX(run)::int AS peak FROM (
        SELECT SUM(d) OVER (ORDER BY t, d ROWS UNBOUNDED PRECEDING) AS run FROM ev
      ) x`;
    return Math.max(0, rows[0]?.peak ?? 0);
  }

  /**
   * Free online slots for the whole window (0 when the type isn't offered here). Windows that start soon also
   * subtract vehicles that are inside without a booking covering them (overstays, walk-ins beyond the offline
   * slots): they physically hold a space until they leave.
   */
  async free(
    locationId: string,
    vehicleTypeId: string,
    start: Date,
    end: Date,
    db: Db = this.prisma,
    excludeBookingId?: string,
    zoneId?: string | null,
  ): Promise<number> {
    const cap = await db.locationCapacity.findUnique({
      where: { locationId_vehicleTypeId: { locationId, vehicleTypeId } },
    });
    if (!cap) return 0;
    const extra =
      start.getTime() < Date.now() + OCCUPANCY_HORIZON_MS
        ? await this.unbookedInside(locationId, vehicleTypeId, cap.totalSlots - cap.onlineSlots, db)
        : 0;
    const placeFree = Math.max(
      0,
      cap.onlineSlots -
        (await this.peakUsed(locationId, vehicleTypeId, start, end, db, excludeBookingId)) -
        extra,
    );
    if (!zoneId || placeFree === 0) return placeFree;
    return Math.min(
      placeFree,
      await this.zoneFree(zoneId, vehicleTypeId, start, end, db, excludeBookingId),
    );
  }

  /**
   * Free online slots on one floor/zone, counting only bookings made for it. "Any floor" bookings are covered by
   * the place-wide check in free(): as long as every floor stays within its own slots and the place within its
   * total, any-floor cars always fit in the slots left over, so a floor booking needs both checks to pass.
   */
  async zoneFree(
    zoneId: string,
    vehicleTypeId: string,
    start: Date,
    end: Date,
    db: Db = this.prisma,
    excludeBookingId?: string,
  ): Promise<number> {
    const zc = await db.zoneCapacity.findUnique({
      where: { zoneId_vehicleTypeId: { zoneId, vehicleTypeId } },
      include: { zone: { select: { locationId: true } } },
    });
    if (!zc) return 0;
    return Math.max(
      0,
      zc.onlineSlots -
        (await this.peakUsed(
          zc.zone.locationId,
          vehicleTypeId,
          start,
          end,
          db,
          excludeBookingId,
          zoneId,
        )),
    );
  }

  /** Free slots per floor/zone for a window, each capped by the place's overall free slots. */
  async zones(
    locationId: string,
    vehicleTypeId: string,
    start: Date,
    end: Date,
  ): Promise<{ zoneId: string; free: number }[]> {
    const caps = await this.prisma.zoneCapacity.findMany({
      where: { vehicleTypeId, zone: { locationId } },
      select: { zoneId: true },
    });
    if (!caps.length) return [];
    const placeFree = await this.free(locationId, vehicleTypeId, start, end);
    const out: { zoneId: string; free: number }[] = [];
    for (const c of caps)
      out.push({
        zoneId: c.zoneId,
        free:
          placeFree === 0
            ? 0
            : Math.min(placeFree, await this.zoneFree(c.zoneId, vehicleTypeId, start, end)),
      });
    return out;
  }

  /**
   * Vehicles inside right now that no current booking accounts for: overstays (their booking chain has ended)
   * plus walk-ins beyond the offline slots (walk-ins use offline slots first, plan Q2).
   */
  async unbookedInside(
    locationId: string,
    vehicleTypeId: string,
    offlineSlots: number,
    db: Db = this.prisma,
  ): Promise<number> {
    const rows = await db.$queryRaw<{ overstays: number; walkins: number }[]>`
      SELECT
        COUNT(*) FILTER (WHERE s.booking_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM bookings b WHERE b.vehicle_id = s.vehicle_id AND b.location_id = s.location_id
            AND b.status IN ('CONFIRMED','ACTIVE') AND b.end_at > now()
        ))::int AS overstays,
        COUNT(*) FILTER (WHERE s.is_walk_in)::int AS walkins
      FROM parking_sessions s
      WHERE s.location_id = ${locationId}::uuid AND s.vehicle_type_id = ${vehicleTypeId}::uuid AND s.exit_at IS NULL`;
    const r = rows[0] ?? { overstays: 0, walkins: 0 };
    return r.overstays + Math.max(0, r.walkins - offlineSlots);
  }

  /**
   * Locks the capacity row for (location, vehicle type) until the transaction ends. Every booking insert takes
   * this lock first, so two requests can never both see the last free slot (plan §5.1, PDF §Availability).
   */
  async lockCapacity(tx: Prisma.TransactionClient, locationId: string, vehicleTypeId: string) {
    await tx.$queryRaw`SELECT id FROM location_capacity
      WHERE location_id = ${locationId}::uuid AND vehicle_type_id = ${vehicleTypeId}::uuid FOR UPDATE`;
  }

  /**
   * Named slots of one vehicle type on a floor, each with whether it is free for [start, end): online (not kept for
   * walk-ins) and no holding booking on that slot overlaps the window. Empty when the floor has no named slots.
   */
  async slotStates(
    zoneId: string,
    vehicleTypeId: string,
    start: Date,
    end: Date,
    db: Db = this.prisma,
    excludeBookingId?: string,
  ) {
    const exclude = excludeBookingId
      ? Prisma.sql`AND b.id <> ${excludeBookingId}::uuid`
      : Prisma.empty;
    return db.$queryRaw<{ id: string; label: string; isOnline: boolean; free: boolean }[]>`
      SELECT s.id, s.label, s.is_online AS "isOnline",
        (s.is_online AND NOT EXISTS (
          SELECT 1 FROM bookings b WHERE b.slot_id = s.id AND ${HOLDING}
            AND b.start_at < ${end} AND b.end_at > ${start} ${exclude}
        )) AS free
      FROM parking_slots s
      WHERE s.zone_id = ${zoneId}::uuid AND s.vehicle_type_id = ${vehicleTypeId}::uuid
      ORDER BY s.sort_order, s.label`;
  }

  /**
   * Chooses the named slot for a floor booking (call inside the booking transaction, after lockCapacity):
   * the preferred slot when it's free, otherwise (if `fallback`) the first free one in order.
   * Returns `undefined` when the floor has no named slots for this vehicle type (count-only floor), `null` when
   * none is free.
   */
  async pickSlot(
    db: Db,
    zoneId: string,
    vehicleTypeId: string,
    start: Date,
    end: Date,
    preferId?: string | null,
    fallback = true,
    excludeBookingId?: string,
  ): Promise<string | null | undefined> {
    const slots = await this.slotStates(zoneId, vehicleTypeId, start, end, db, excludeBookingId);
    if (!slots.length) return undefined;
    if (preferId) {
      const want = slots.find((s) => s.id === preferId);
      if (want?.free) return want.id;
      if (!fallback) return null;
    }
    return slots.find((s) => s.free)?.id ?? null;
  }

  /** Bookings holding a slot and capacity blocks that overlap [start, end), as weighted intervals. */
  private async intervals(
    locationId: string,
    vehicleTypeId: string,
    start: Date,
    end: Date,
  ): Promise<Interval[]> {
    return this.prisma.$queryRaw<Interval[]>`
      SELECT b.start_at AS s, b.end_at AS e, 1 AS w FROM bookings b
        WHERE b.location_id = ${locationId}::uuid AND b.vehicle_type_id = ${vehicleTypeId}::uuid
          AND ${HOLDING} AND b.start_at < ${end} AND b.end_at > ${start}
      UNION ALL
      SELECT k.start_at, k.end_at, k.slots FROM capacity_blocks k
        WHERE k.location_id = ${locationId}::uuid AND k.vehicle_type_id = ${vehicleTypeId}::uuid
          AND k.start_at < ${end} AND k.end_at > ${start}`;
  }

  /** Month calendar: per local day, the minimum free count over that day. */
  async calendar(locationId: string, vehicleTypeId: string, month: string): Promise<CalendarDto> {
    const tz = this.config.get('APP_TIMEZONE', { infer: true });
    const [y, m] = month.split('-').map(Number) as [number, number];
    const loc = await this.prisma.parkingLocation.findUnique({
      where: { id: locationId },
      select: { is24x7: true, openingHours: true, capacities: { where: { vehicleTypeId } } },
    });
    const cap = loc?.capacities[0];
    const { fewLeftThreshold } = await this.masters.settings();
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    // Everything that holds a slot this month, loaded once; each day's peak is then swept in memory.
    const monthStart = localMidnight(y, m, 1, tz);
    const monthEnd = localMidnight(y, m, daysInMonth + 1, tz);
    const intervals = cap
      ? await this.intervals(locationId, vehicleTypeId, monthStart, monthEnd)
      : [];
    const hours = loc?.openingHours as OpeningDay[] | null | undefined;
    const days: CalendarDto['days'] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const start = localMidnight(y, m, d, tz);
      const end = localMidnight(y, m, d + 1, tz);
      const date = `${month}-${String(d).padStart(2, '0')}`;
      const weekday = localParts(new Date(start.getTime() + 12 * 3_600_000), tz).weekday;
      if (!cap || cap.onlineSlots === 0) {
        days.push({ date, free: 0, state: 'full' });
        continue;
      }
      if (!loc!.is24x7 && hours?.[weekday]?.closed) {
        days.push({ date, free: 0, state: 'closed' });
        continue;
      }
      const free = Math.max(0, cap.onlineSlots - peakIn(intervals, start, end));
      const state: DayAvailability =
        free === 0 ? 'full' : free <= fewLeftThreshold ? 'few' : 'free';
      days.push({ date, free, state });
    }
    return { month, vehicleTypeId, days };
  }

  /**
   * Live numbers for the gate and realtime feed: vehicles inside now, and free online slots right now.
   * Walk-ins use offline slots (total − online) first; beyond that they also reduce online availability (plan Q2).
   */
  async live(locationId: string, vehicleTypeId: string) {
    const cap = await this.prisma.locationCapacity.findUnique({
      where: { locationId_vehicleTypeId: { locationId, vehicleTypeId } },
    });
    const inside = await this.prisma.parkingSession.count({
      where: { locationId, vehicleTypeId, exitAt: null },
    });
    if (!cap) return { free: 0, inside, total: 0 };
    const now = new Date();
    const used = await this.peakUsed(
      locationId,
      vehicleTypeId,
      now,
      new Date(now.getTime() + 60_000),
    );
    const extra = await this.unbookedInside(
      locationId,
      vehicleTypeId,
      cap.totalSlots - cap.onlineSlots,
    );
    return { free: Math.max(0, cap.onlineSlots - used - extra), inside, total: cap.totalSlots };
  }
}
