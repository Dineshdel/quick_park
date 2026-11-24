import { Prisma } from '@prisma/client';
import {
  type CancellationRule,
  type LocationDto,
  type OpeningDay,
  type OwnerLocationDto,
} from '@qp/types';

export const locationInclude = {
  category: { select: { id: true, name: true } },
  cancellationPolicy: { select: { id: true, name: true, rules: true } },
  photos: { orderBy: { sortOrder: 'asc' }, select: { id: true, url: true } },
  capacities: { include: { vehicleType: { select: { code: true, name: true, sortOrder: true } } } },
  areas: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      zones: {
        orderBy: [{ sortOrder: 'asc' }, { level: 'asc' }],
        include: { capacities: true, slots: { orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] } },
      },
    },
  },
  prices: true,
} satisfies Prisma.ParkingLocationInclude;

export const ownerLocationInclude = {
  ...locationInclude,
  blocks: { where: { endAt: { gt: new Date(0) } }, orderBy: { startAt: 'asc' } },
} satisfies Prisma.ParkingLocationInclude;

type Row = Prisma.ParkingLocationGetPayload<{ include: typeof locationInclude }>;
type OwnerRow = Prisma.ParkingLocationGetPayload<{ include: typeof ownerLocationInclude }>;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toLocationDto(l: Row): LocationDto {
  return {
    id: l.id,
    name: l.name,
    slug: l.slug,
    description: l.description,
    address: l.address,
    city: l.city,
    state: l.state,
    pincode: l.pincode,
    lat: l.lat,
    lng: l.lng,
    is24x7: l.is24x7,
    openingHours: l.openingHours as OpeningDay[] | null,
    amenities: l.amenities,
    maxAdvanceDays: l.maxAdvanceDays,
    status: l.status,
    rejectionReason: l.rejectionReason,
    isEvent: l.isEvent,
    isFree: l.isFree,
    eventName: l.eventName,
    eventStartAt: iso(l.eventStartAt),
    eventEndAt: iso(l.eventEndAt),
    category: l.category,
    cancellationPolicy: l.cancellationPolicy
      ? {
          ...l.cancellationPolicy,
          rules: l.cancellationPolicy.rules as unknown as CancellationRule[],
        }
      : null,
    photos: l.photos,
    capacities: [...l.capacities]
      .sort((a, b) => a.vehicleType.sortOrder - b.vehicleType.sortOrder)
      .map((c) => ({
        vehicleTypeId: c.vehicleTypeId,
        vehicleTypeCode: c.vehicleType.code,
        vehicleTypeName: c.vehicleType.name,
        totalSlots: c.totalSlots,
        onlineSlots: c.onlineSlots,
        overstayPerHourPaise: c.overstayPerHourPaise,
      })),
    areas: l.areas.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      lat: a.lat,
      lng: a.lng,
      zones: a.zones.map((z) => ({
        id: z.id,
        name: z.name,
        level: z.level,
        tags: z.tags,
        capacities: z.capacities.map((c) => ({
          vehicleTypeId: c.vehicleTypeId,
          totalSlots: c.totalSlots,
          onlineSlots: c.onlineSlots,
        })),
        slots: z.slots.map((s) => ({
          id: s.id,
          label: s.label,
          vehicleTypeId: s.vehicleTypeId,
          isOnline: s.isOnline,
        })),
      })),
    })),
    prices: l.prices.map((p) => ({
      vehicleTypeId: p.vehicleTypeId,
      planType: p.planType,
      pricePaise: p.pricePaise,
      isActive: p.isActive,
    })),
  };
}

export function toOwnerLocationDto(l: OwnerRow): OwnerLocationDto {
  return {
    ...toLocationDto(l),
    blocks: l.blocks.map((b) => ({
      id: b.id,
      vehicleTypeId: b.vehicleTypeId,
      startAt: b.startAt.toISOString(),
      endAt: b.endAt.toISOString(),
      slots: b.slots,
      reason: b.reason,
    })),
    createdAt: l.createdAt.toISOString(),
  };
}
