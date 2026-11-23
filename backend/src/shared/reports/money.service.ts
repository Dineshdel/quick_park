import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export interface MoneyRow {
  key: string;
  label: string;
  bookings: number;
  grossPaise: number;
  refundPaise: number;
  commissionPaise: number;
  netPaise: number;
}

export interface MoneyFilter {
  from?: Date;
  to?: Date;
  ownerId?: string;
  locationId?: string;
}

type GroupBy = 'location' | 'city' | 'category' | 'month' | 'day' | 'owner';

/**
 * One definition of booking money, used by owner earnings, payouts and admin reports:
 *   gross = paid; refunds = processed refunds; commission scales with what was kept
 *   (commission × (paid − refunded) / paid); net to owner = gross − refunds − commission.
 * Bookings are counted by payment date. Walk-in and overstay cash is the owner's (assumed default, Q1).
 */
@Injectable()
export class MoneyService {
  constructor(private readonly prisma: PrismaService) {}

  async grouped(groupBy: GroupBy, f: MoneyFilter, tz = 'Asia/Kolkata'): Promise<MoneyRow[]> {
    const key = {
      location: Prisma.sql`l.id::text`,
      city: Prisma.sql`l.city`,
      category: Prisma.sql`c.id::text`,
      owner: Prisma.sql`l.owner_id::text`,
      month: Prisma.sql`to_char(p.paid_at AT TIME ZONE ${tz}, 'YYYY-MM')`,
      day: Prisma.sql`to_char(p.paid_at AT TIME ZONE ${tz}, 'YYYY-MM-DD')`,
    }[groupBy];
    const label = {
      location: Prisma.sql`MIN(l.name)`,
      city: Prisma.sql`MIN(l.city)`,
      category: Prisma.sql`MIN(c.name)`,
      owner: Prisma.sql`MIN(o.business_name)`,
      month: Prisma.sql`MIN(to_char(p.paid_at AT TIME ZONE ${tz}, 'YYYY-MM'))`,
      day: Prisma.sql`MIN(to_char(p.paid_at AT TIME ZONE ${tz}, 'YYYY-MM-DD'))`,
    }[groupBy];
    const where: Prisma.Sql[] = [Prisma.sql`true`];
    if (f.from) where.push(Prisma.sql`p.paid_at >= ${f.from}`);
    if (f.to) where.push(Prisma.sql`p.paid_at < ${f.to}`);
    if (f.ownerId) where.push(Prisma.sql`l.owner_id = ${f.ownerId}::uuid`);
    if (f.locationId) where.push(Prisma.sql`l.id = ${f.locationId}::uuid`);
    const rows = await this.prisma.$queryRaw<{ key: string; label: string; bookings: bigint; gross: bigint; refunds: bigint; commission: Prisma.Decimal | null }[]>`
      WITH p AS (
        SELECT booking_id, SUM(amount_paise) AS amount, MIN(paid_at) AS paid_at FROM payments WHERE status = 'PAID' GROUP BY booking_id
      ), r AS (
        SELECT booking_id, SUM(amount_paise) AS refunded FROM refunds WHERE status = 'PROCESSED' GROUP BY booking_id
      )
      SELECT ${key} AS key, ${label} AS label, COUNT(*) AS bookings,
        COALESCE(SUM(p.amount), 0) AS gross,
        COALESCE(SUM(COALESCE(r.refunded, 0)), 0) AS refunds,
        SUM(ROUND(b.commission_paise::numeric * (p.amount - COALESCE(r.refunded, 0)) / NULLIF(p.amount, 0))) AS commission
      FROM bookings b
      JOIN p ON p.booking_id = b.id
      LEFT JOIN r ON r.booking_id = b.id
      JOIN parking_locations l ON l.id = b.location_id
      JOIN categories c ON c.id = l.category_id
      JOIN owners o ON o.id = l.owner_id
      WHERE ${Prisma.join(where, ' AND ')}
      GROUP BY 1 ORDER BY 1`;
    return rows.map((r) => {
      const gross = Number(r.gross);
      const refunds = Number(r.refunds);
      const commission = Number(r.commission ?? 0);
      return { key: r.key, label: r.label, bookings: Number(r.bookings), grossPaise: gross, refundPaise: refunds, commissionPaise: commission, netPaise: gross - refunds - commission };
    });
  }

  async totals(f: MoneyFilter) {
    const rows = await this.grouped('owner', f);
    return rows.reduce(
      (t, r) => ({
        bookings: t.bookings + r.bookings,
        grossPaise: t.grossPaise + r.grossPaise,
        refundPaise: t.refundPaise + r.refundPaise,
        commissionPaise: t.commissionPaise + r.commissionPaise,
        netPaise: t.netPaise + r.netPaise,
      }),
      { bookings: 0, grossPaise: 0, refundPaise: 0, commissionPaise: 0, netPaise: 0 },
    );
  }

  /** Cash/UPI collected at the gate (walk-ins + overstay) for an owner's places. */
  async gate(f: MoneyFilter) {
    const where: Prisma.ParkingSessionWhereInput = {
      exitAt: { not: null, ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) },
      ...(f.ownerId ? { location: { ownerId: f.ownerId } } : {}),
      ...(f.locationId ? { locationId: f.locationId } : {}),
    };
    const s = await this.prisma.parkingSession.aggregate({ where, _sum: { walkInAmountPaise: true, overstayAmountPaise: true } });
    return { walkInPaise: s._sum.walkInAmountPaise ?? 0, overstayPaise: s._sum.overstayAmountPaise ?? 0 };
  }
}
