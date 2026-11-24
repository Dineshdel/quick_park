import { Injectable } from '@nestjs/common';
import { Prisma, type PlanType } from '@prisma/client';
import { type LocationDto, type Paginated, type SearchResultDto } from '@qp/types';
import { type searchSchema } from '@qp/validation';
import { type z } from 'zod';
import { AvailabilityService } from '../availability/availability.service';
import { PrismaService } from '../database/prisma.service';
import { Errors } from '../http/app-exception';
import { locationInclude, toLocationDto } from '../locations/location.mapper';

interface Row {
  id: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  is_24x7: boolean;
  is_event: boolean;
  is_free: boolean;
  category: string;
  photo_url: string | null;
  distance_km: number | null;
  from_paise: number | null;
  from_plan: PlanType | null;
  total: bigint;
}

/** Public parking search (plan M6): near a point (PostGIS ST_DWithin), by city, text (pg_trgm), category, vehicle type. */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
  ) {}

  async search(q: z.output<typeof searchSchema>): Promise<Paginated<SearchResultDto>> {
    const geo = q.lat !== undefined && q.lng !== undefined;
    const point = geo
      ? Prisma.sql`ST_SetSRID(ST_MakePoint(${q.lng}, ${q.lat}), 4326)::geography`
      : null;
    const where: Prisma.Sql[] = [Prisma.sql`l.status = 'ACTIVE'`];
    if (point)
      where.push(
        Prisma.sql`ST_DWithin(ST_SetSRID(ST_MakePoint(l.lng, l.lat), 4326)::geography, ${point}, ${q.radiusKm * 1000})`,
      );
    if (q.city) where.push(Prisma.sql`l.city ILIKE ${q.city}`);
    if (q.category) where.push(Prisma.sql`l.category_id = ${q.category}::uuid`);
    if (q.q)
      where.push(
        Prisma.sql`(l.name ILIKE ${`%${q.q}%`} OR l.address ILIKE ${`%${q.q}%`} OR l.city ILIKE ${`%${q.q}%`} OR similarity(l.name, ${q.q}) > 0.3)`,
      );
    if (q.vehicleType) {
      where.push(
        Prisma.sql`EXISTS (SELECT 1 FROM location_capacity c WHERE c.location_id = l.id AND c.vehicle_type_id = ${q.vehicleType}::uuid AND c.online_slots > 0)`,
      );
    }
    const priceFilter = q.vehicleType
      ? Prisma.sql`AND p.vehicle_type_id = ${q.vehicleType}::uuid`
      : Prisma.empty;
    const distance = point
      ? Prisma.sql`ST_Distance(ST_SetSRID(ST_MakePoint(l.lng, l.lat), 4326)::geography, ${point}) / 1000`
      : Prisma.sql`NULL::float`;
    const order = point
      ? Prisma.sql`distance_km ASC`
      : q.q
        ? Prisma.sql`similarity(l.name, ${q.q}) DESC, l.name ASC`
        : Prisma.sql`l.approved_at DESC NULLS LAST`;

    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT l.id, l.name, l.slug, l.address, l.city, l.lat, l.lng, l.is_24x7, l.is_event, l.is_free,
        cat.name AS category,
        (SELECT ph.url FROM location_photos ph WHERE ph.location_id = l.id ORDER BY ph.sort_order LIMIT 1) AS photo_url,
        ${distance} AS distance_km,
        fp.price_paise AS from_paise, fp.plan_type AS from_plan,
        COUNT(*) OVER () AS total
      FROM parking_locations l
      JOIN categories cat ON cat.id = l.category_id
      LEFT JOIN LATERAL (
        SELECT p.price_paise, p.plan_type::text AS plan_type FROM pricing_plans p
        WHERE p.location_id = l.id AND p.is_active ${priceFilter}
        ORDER BY CASE p.plan_type WHEN 'HOURLY' THEN 1 WHEN 'DAILY' THEN 2 WHEN 'EVENT' THEN 3 WHEN 'WEEKLY' THEN 4 WHEN 'MONTHLY' THEN 5 ELSE 6 END, p.price_paise
        LIMIT 1
      ) fp ON true
      WHERE ${Prisma.join(where, ' AND ')}
      ORDER BY ${order}
      LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`;

    const withWindow = q.vehicleType && q.start && q.end && q.end > q.start;
    const items = await Promise.all(
      rows.map(
        async (r): Promise<SearchResultDto> => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          address: r.address,
          city: r.city,
          lat: r.lat,
          lng: r.lng,
          distanceKm: r.distance_km === null ? null : Math.round(r.distance_km * 10) / 10,
          category: r.category,
          photoUrl: r.photo_url,
          is24x7: r.is_24x7,
          isEvent: r.is_event,
          isFree: r.is_free,
          fromPaise: r.is_free ? 0 : r.from_paise,
          fromPlan: r.from_plan,
          free: withWindow
            ? await this.availability.free(r.id, q.vehicleType!, q.start!, q.end!)
            : null,
        }),
      ),
    );
    return { items, page: q.page, pageSize: q.pageSize, total: Number(rows[0]?.total ?? 0) };
  }

  /** Public place page. Only ACTIVE places are visible. */
  async bySlug(slug: string): Promise<LocationDto> {
    const l = await this.prisma.parkingLocation.findUnique({
      where: { slug },
      include: locationInclude,
    });
    if (!l || l.status !== 'ACTIVE') throw Errors.notFound('Parking place');
    return toLocationDto(l);
  }

  async byId(id: string): Promise<LocationDto> {
    const l = await this.prisma.parkingLocation.findUnique({
      where: { id },
      include: locationInclude,
    });
    if (!l || l.status !== 'ACTIVE') throw Errors.notFound('Parking place');
    return toLocationDto(l);
  }

  async assertActive(id: string) {
    const l = await this.prisma.parkingLocation.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!l || l.status !== 'ACTIVE') throw Errors.notFound('Parking place');
  }
}
