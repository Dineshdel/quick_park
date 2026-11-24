import { randomBytes } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { type OwnerLocationDto } from '@qp/types';
import {
  slugify,
  type blockSchema,
  type capacitySchema,
  type layoutSchema,
  type locationCreateSchema,
  type locationUpdateSchema,
  type pricingSchema,
} from '@qp/validation';
import { type z } from 'zod';
import { AuditService } from '../../shared/audit/audit.service';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  StorageService,
  type UploadedFile,
} from '../../shared/files/storage.service';
import { AppException, Errors } from '../../shared/http/app-exception';
import { ownerLocationInclude, toOwnerLocationDto } from '../../shared/locations/location.mapper';
import { RealtimeGateway } from '../../shared/realtime/realtime.gateway';
import { OwnerContext } from '../owner-context.service';

const MAX_PHOTOS = 10;
const DEFAULT_HOURS = Array.from({ length: 7 }, () => ({
  open: '08:00',
  close: '22:00',
  closed: false,
}));

/** An owner's parking places (plan M5). Every method checks ownership via OwnerContext. */
@Injectable()
export class OwnerLocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: OwnerContext,
    private readonly storage: StorageService,
    private readonly realtime: RealtimeGateway,
    private readonly audit: AuditService,
  ) {}

  private async load(id: string): Promise<OwnerLocationDto> {
    const l = await this.prisma.parkingLocation.findUniqueOrThrow({
      where: { id },
      include: {
        ...ownerLocationInclude,
        blocks: { where: { endAt: { gt: new Date() } }, orderBy: { startAt: 'asc' } },
      },
    });
    return toOwnerLocationDto(l);
  }

  async list(userId: string): Promise<OwnerLocationDto[]> {
    const o = await this.prisma.owner.findUnique({ where: { userId } });
    if (!o) return [];
    const rows = await this.prisma.parkingLocation.findMany({
      where: { ownerId: o.id },
      include: {
        ...ownerLocationInclude,
        blocks: { where: { endAt: { gt: new Date() } }, orderBy: { startAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toOwnerLocationDto);
  }

  async get(userId: string, id: string) {
    await this.ctx.location(userId, id);
    return this.load(id);
  }

  private async assertRefs(categoryId?: string, policyId?: string | null) {
    if (categoryId) {
      const c = await this.prisma.category.findUnique({ where: { id: categoryId } });
      if (!c?.isActive)
        throw Errors.badRequest('VALIDATION_FAILED', 'Choose a valid category', [
          { path: 'categoryId', message: 'Choose a valid category' },
        ]);
    }
    if (policyId) {
      const p = await this.prisma.cancellationPolicy.findUnique({ where: { id: policyId } });
      if (!p?.isActive)
        throw Errors.badRequest('VALIDATION_FAILED', 'Choose a valid cancellation policy', [
          { path: 'cancellationPolicyId', message: 'Choose a valid policy' },
        ]);
    }
  }

  /** Drafts are allowed before KYC approval (assumed default, plan Q17); submitting needs approval. */
  async create(userId: string, input: z.output<typeof locationCreateSchema>) {
    const owner = await this.ctx.owner(userId);
    await this.assertRefs(input.categoryId, input.cancellationPolicyId);
    const slug = `${slugify(`${input.name} ${input.city}`) || 'parking'}-${randomBytes(3).toString('hex')}`;
    const policyId =
      input.cancellationPolicyId ??
      (await this.prisma.cancellationPolicy.findFirst({ where: { isDefault: true } }))?.id ??
      null;
    const l = await this.prisma.parkingLocation.create({
      data: {
        ...input,
        openingHours: (input.openingHours ?? DEFAULT_HOURS) as Prisma.InputJsonValue,
        cancellationPolicyId: policyId,
        ownerId: owner.id,
        slug,
      },
    });
    return this.load(l.id);
  }

  async update(userId: string, id: string, input: z.output<typeof locationUpdateSchema>) {
    const { location } = await this.ctx.location(userId, id);
    if (location.status === 'PENDING' || location.status === 'ARCHIVED') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'INVALID_STATE',
        location.status === 'PENDING' ? 'This place is under review' : 'This place is archived',
      );
    }
    await this.assertRefs(input.categoryId, input.cancellationPolicyId);
    const isEvent = input.isEvent ?? location.isEvent;
    if (isEvent && !(input.eventStartAt ?? location.eventStartAt)) {
      throw Errors.badRequest('VALIDATION_FAILED', 'Event start is required', [
        { path: 'eventStartAt', message: 'Event start is required' },
      ]);
    }
    const { openingHours, ...rest } = input;
    await this.prisma.parkingLocation.update({
      where: { id },
      data: {
        ...rest,
        ...(openingHours !== undefined
          ? { openingHours: openingHours as Prisma.InputJsonValue }
          : {}),
      },
    });
    return this.load(id);
  }

  async submit(userId: string, id: string) {
    const { owner, location } = await this.ctx.location(userId, id);
    if (owner.kycStatus !== 'APPROVED') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'KYC_NOT_APPROVED',
        'Your business verification must be approved before places can go live',
      );
    }
    if (location.status !== 'DRAFT')
      throw new AppException(
        HttpStatus.CONFLICT,
        'INVALID_STATE',
        'Only draft places can be submitted',
      );
    const [caps, prices] = await Promise.all([
      this.prisma.locationCapacity.findMany({ where: { locationId: id, onlineSlots: { gt: 0 } } }),
      this.prisma.pricingPlan.findMany({ where: { locationId: id, isActive: true } }),
    ]);
    const issues: { path: string; message: string }[] = [];
    if (!caps.length)
      issues.push({
        path: 'capacity',
        message: 'Add slots bookable online for at least one vehicle type',
      });
    const priced = caps.filter((c) =>
      prices.some(
        (p) =>
          p.vehicleTypeId === c.vehicleTypeId &&
          (location.isFree || p.pricePaise >= 100) &&
          (location.isEvent ? p.planType === 'EVENT' : p.planType !== 'EVENT'),
      ),
    );
    if (caps.length && !priced.length) {
      issues.push({
        path: 'pricing',
        message: location.isFree
          ? 'Choose at least one booking plan for a vehicle type with slots'
          : location.isEvent
            ? 'Set an event price'
            : 'Set at least one price for a vehicle type with slots',
      });
    }
    if (location.isEvent && location.eventEndAt && location.eventEndAt <= new Date())
      issues.push({ path: 'eventEndAt', message: 'The event has already ended' });
    if (issues.length)
      throw Errors.badRequest('LOCATION_INCOMPLETE', 'This place is not ready yet', issues);
    await this.prisma.parkingLocation.update({
      where: { id },
      data: { status: 'PENDING', submittedAt: new Date(), rejectionReason: null },
    });
    return this.load(id);
  }

  // ---------- photos ----------

  async addPhoto(userId: string, id: string, file: UploadedFile | undefined) {
    await this.ctx.location(userId, id);
    const count = await this.prisma.locationPhoto.count({ where: { locationId: id } });
    if (count >= MAX_PHOTOS)
      throw Errors.badRequest('FILE_INVALID', `Up to ${MAX_PHOTOS} photos per place`);
    const { key } = await this.storage.save('public', `places/${id}`, file, {
      allowed: IMAGE_TYPES,
      maxBytes: MAX_UPLOAD_BYTES,
    });
    await this.prisma.locationPhoto.create({
      data: { locationId: id, storageKey: key, url: this.storage.publicUrl(key), sortOrder: count },
    });
    return this.load(id);
  }

  async deletePhoto(userId: string, id: string, photoId: string) {
    await this.ctx.location(userId, id);
    const p = await this.prisma.locationPhoto.findFirst({ where: { id: photoId, locationId: id } });
    if (!p) throw Errors.notFound('Photo');
    await this.prisma.locationPhoto.delete({ where: { id: p.id } });
    await this.storage.remove('public', p.storageKey);
    return this.load(id);
  }

  // ---------- capacity, pricing, blocks ----------

  private async assertTypes(ids: string[]) {
    const n = await this.prisma.vehicleType.count({ where: { id: { in: ids }, isActive: true } });
    if (n !== new Set(ids).size)
      throw Errors.badRequest('VEHICLE_TYPE_INVALID', 'One of the vehicle types is not available');
  }

  /**
   * Replaces the whole capacity list. Types left out stop being offered here. When the place has floors/zones,
   * slot counts come from them, so only the overstay rate is taken from this request.
   */
  async setCapacity(userId: string, id: string, input: z.output<typeof capacitySchema>) {
    await this.ctx.location(userId, id);
    await this.assertTypes(input.items.map((i) => i.vehicleTypeId));
    if (await this.prisma.parkingZone.count({ where: { locationId: id } })) {
      for (const i of input.items) {
        await this.prisma.locationCapacity.updateMany({
          where: { locationId: id, vehicleTypeId: i.vehicleTypeId },
          data: { overstayPerHourPaise: i.overstayPerHourPaise },
        });
      }
      return this.load(id);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.locationCapacity.deleteMany({
        where: {
          locationId: id,
          vehicleTypeId: { notIn: input.items.map((i) => i.vehicleTypeId) },
        },
      });
      for (const i of input.items) {
        await tx.locationCapacity.upsert({
          where: { locationId_vehicleTypeId: { locationId: id, vehicleTypeId: i.vehicleTypeId } },
          create: { locationId: id, ...i },
          update: i,
        });
      }
    });
    for (const i of input.items) await this.realtime.publish(id, i.vehicleTypeId);
    return this.load(id);
  }

  /**
   * Replaces the place's sub-places and floors/zones (ids kept for ones that stay, so bookings keep their floor).
   * The place's slots per vehicle type become the sums over its zones. A floor with upcoming bookings can't be removed.
   */
  async setLayout(userId: string, id: string, input: z.output<typeof layoutSchema>) {
    const { location } = await this.ctx.location(userId, id);
    if (location.status === 'PENDING' || location.status === 'ARCHIVED') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'INVALID_STATE',
        location.status === 'PENDING' ? 'This place is under review' : 'This place is archived',
      );
    }
    const zones = input.areas.flatMap((a) => a.zones);
    // Named slots decide the counts for their vehicle type on that floor: total = all, online = not walk-in only.
    for (const z of zones) {
      const byType = new Map<string, { totalSlots: number; onlineSlots: number }>();
      for (const s of z.slots) {
        const c = byType.get(s.vehicleTypeId) ?? { totalSlots: 0, onlineSlots: 0 };
        byType.set(s.vehicleTypeId, {
          totalSlots: c.totalSlots + 1,
          onlineSlots: c.onlineSlots + (s.isOnline ? 1 : 0),
        });
      }
      z.capacities = [
        ...z.capacities.filter((c) => !byType.has(c.vehicleTypeId)),
        ...[...byType].map(([vehicleTypeId, c]) => ({ vehicleTypeId, ...c })),
      ];
    }
    await this.assertTypes([
      ...new Set(zones.flatMap((z) => z.capacities.map((c) => c.vehicleTypeId))),
    ]);
    const existing = await this.prisma.parkingZone.findMany({
      where: { locationId: id },
      select: { id: true, areaId: true, name: true },
    });
    const existingAreas = await this.prisma.parkingArea.findMany({
      where: { locationId: id },
      select: { id: true },
    });
    const own = (ids: string[], list: { id: string }[], what: string) => {
      for (const x of ids)
        if (!list.some((e) => e.id === x))
          throw Errors.badRequest('VALIDATION_FAILED', `Unknown ${what}`);
    };
    own(
      input.areas.flatMap((a) => (a.id ? [a.id] : [])),
      existingAreas,
      'area',
    );
    own(
      zones.flatMap((z) => (z.id ? [z.id] : [])),
      existing,
      'floor/zone',
    );
    const kept = new Set(zones.flatMap((z) => (z.id ? [z.id] : [])));
    const removed = existing.filter((z) => !kept.has(z.id));
    const existingSlots = await this.prisma.parkingSlot.findMany({
      where: { locationId: id },
      select: {
        id: true,
        zoneId: true,
        label: true,
        vehicleTypeId: true,
        isOnline: true,
        sortOrder: true,
        zone: { select: { name: true } },
      },
    });
    for (const z of zones)
      for (const s of z.slots)
        if (s.id && !existingSlots.some((e) => e.id === s.id && e.zoneId === z.id))
          throw Errors.badRequest('VALIDATION_FAILED', 'Unknown slot');
    const keptSlots = new Set(zones.flatMap((z) => z.slots.flatMap((s) => (s.id ? [s.id] : []))));
    const removedSlots = existingSlots.filter((s) => !keptSlots.has(s.id));
    if (removedSlots.length) {
      const busy = await this.prisma.booking.findFirst({
        where: {
          slotId: { in: removedSlots.map((s) => s.id) },
          endAt: { gt: new Date() },
          OR: [
            { status: { in: ['CONFIRMED', 'ACTIVE'] } },
            { status: 'PENDING_PAYMENT', holdExpiresAt: { gt: new Date() } },
          ],
        },
        select: { slot: { select: { label: true, zone: { select: { name: true } } } } },
      });
      if (busy)
        throw new AppException(
          HttpStatus.CONFLICT,
          'INVALID_STATE',
          `Slot ${busy.slot?.label ?? ''} on ${busy.slot?.zone.name ?? 'a floor'} has upcoming bookings and can't be removed yet`,
        );
    }
    if (removed.length) {
      const busy = await this.prisma.booking.findFirst({
        where: {
          zoneId: { in: removed.map((z) => z.id) },
          endAt: { gt: new Date() },
          OR: [
            { status: { in: ['CONFIRMED', 'ACTIVE'] } },
            { status: 'PENDING_PAYMENT', holdExpiresAt: { gt: new Date() } },
          ],
        },
        select: { zone: { select: { name: true } } },
      });
      if (busy)
        throw new AppException(
          HttpStatus.CONFLICT,
          'INVALID_STATE',
          `${busy.zone?.name ?? 'A floor'} has upcoming bookings and can't be removed yet`,
        );
    }

    const touchedTypes = new Set<string>();
    await this.prisma.$transaction(async (tx) => {
      const keptAreas = input.areas.flatMap((a) => (a.id ? [a.id] : []));
      await tx.parkingZone.deleteMany({ where: { locationId: id, id: { notIn: [...kept] } } });
      await tx.parkingArea.deleteMany({ where: { locationId: id, id: { notIn: keptAreas } } });
      for (const [ai, a] of input.areas.entries()) {
        const areaData = {
          name: a.name,
          description: a.description ?? null,
          lat: a.lat ?? null,
          lng: a.lng ?? null,
          sortOrder: ai,
        };
        const area = a.id
          ? await tx.parkingArea.update({ where: { id: a.id }, data: areaData })
          : await tx.parkingArea.create({ data: { ...areaData, locationId: id } });
        for (const [zi, z] of a.zones.entries()) {
          const zoneData = {
            name: z.name,
            level: z.level,
            tags: z.tags,
            sortOrder: zi,
            areaId: area.id,
          };
          const zone = z.id
            ? await tx.parkingZone.update({ where: { id: z.id }, data: zoneData })
            : await tx.parkingZone.create({ data: { ...zoneData, locationId: id } });
          await tx.zoneCapacity.deleteMany({
            where: {
              zoneId: zone.id,
              vehicleTypeId: { notIn: z.capacities.map((c) => c.vehicleTypeId) },
            },
          });
          for (const c of z.capacities) {
            await tx.zoneCapacity.upsert({
              where: { zoneId_vehicleTypeId: { zoneId: zone.id, vehicleTypeId: c.vehicleTypeId } },
              create: { zoneId: zone.id, ...c },
              update: { totalSlots: c.totalSlots, onlineSlots: c.onlineSlots },
            });
          }
          await this.saveSlots(tx, id, zone.id, z.slots, existingSlots);
        }
      }
      if (!zones.length) return; // back to simple slots: keep the place-level numbers as they are
      // Place totals = sums over zones (overstay rates stay as the owner set them).
      const sums = new Map<string, { totalSlots: number; onlineSlots: number }>();
      for (const c of zones.flatMap((z) => z.capacities)) {
        const s = sums.get(c.vehicleTypeId) ?? { totalSlots: 0, onlineSlots: 0 };
        sums.set(c.vehicleTypeId, {
          totalSlots: s.totalSlots + c.totalSlots,
          onlineSlots: s.onlineSlots + c.onlineSlots,
        });
      }
      const before = await tx.locationCapacity.findMany({
        where: { locationId: id },
        select: { vehicleTypeId: true },
      });
      before.forEach((b) => touchedTypes.add(b.vehicleTypeId));
      await tx.locationCapacity.deleteMany({
        where: { locationId: id, vehicleTypeId: { notIn: [...sums.keys()] } },
      });
      for (const [vehicleTypeId, s] of sums) {
        touchedTypes.add(vehicleTypeId);
        await tx.locationCapacity.upsert({
          where: { locationId_vehicleTypeId: { locationId: id, vehicleTypeId } },
          create: { locationId: id, vehicleTypeId, ...s },
          update: s,
        });
      }
    });
    for (const t of touchedTypes) await this.realtime.publish(id, t);
    return this.load(id);
  }

  /** Replaces a floor's named slots, writing only what changed (renames go through a temporary label first). */
  private async saveSlots(
    tx: Prisma.TransactionClient,
    locationId: string,
    zoneId: string,
    slots: z.output<typeof layoutSchema>['areas'][number]['zones'][number]['slots'],
    existing: {
      id: string;
      zoneId: string;
      label: string;
      vehicleTypeId: string;
      isOnline: boolean;
      sortOrder: number;
    }[],
  ) {
    const keep = slots.flatMap((s) => (s.id ? [s.id] : []));
    await tx.parkingSlot.deleteMany({ where: { zoneId, id: { notIn: keep } } });
    const before = new Map(existing.filter((e) => e.zoneId === zoneId).map((e) => [e.id, e]));
    const changed = slots.flatMap((s, i) => {
      const e = s.id ? before.get(s.id) : undefined;
      return e &&
        (e.label !== s.label ||
          e.vehicleTypeId !== s.vehicleTypeId ||
          e.isOnline !== s.isOnline ||
          e.sortOrder !== i)
        ? [{ s, i, e }]
        : [];
    });
    for (const { s, e } of changed)
      if (e.label !== s.label)
        await tx.parkingSlot.update({ where: { id: e.id }, data: { label: `~${e.id}` } });
    for (const { s, i, e } of changed)
      await tx.parkingSlot.update({
        where: { id: e.id },
        data: {
          label: s.label,
          vehicleTypeId: s.vehicleTypeId,
          isOnline: s.isOnline,
          sortOrder: i,
        },
      });
    const fresh = slots.flatMap((s, i) =>
      s.id
        ? []
        : [
            {
              zoneId,
              locationId,
              label: s.label,
              vehicleTypeId: s.vehicleTypeId,
              isOnline: s.isOnline,
              sortOrder: i,
            },
          ],
    );
    if (fresh.length) await tx.parkingSlot.createMany({ data: fresh });
  }

  async setPricing(userId: string, id: string, input: z.output<typeof pricingSchema>) {
    const { location } = await this.ctx.location(userId, id);
    if (location.isFree) {
      input = { items: input.items.map((i) => ({ ...i, pricePaise: 0 })) }; // free place: plans only say what can be booked
    } else {
      const unpriced = input.items.findIndex((i) => i.pricePaise < 100);
      if (unpriced >= 0)
        throw Errors.badRequest('VALIDATION_FAILED', 'Set a price of at least ₹1', [
          { path: `items.${unpriced}.pricePaise`, message: 'At least ₹1' },
        ]);
    }
    await this.assertTypes(input.items.map((i) => i.vehicleTypeId));
    await this.prisma.$transaction(async (tx) => {
      await tx.pricingPlan.deleteMany({ where: { locationId: id } });
      if (input.items.length)
        await tx.pricingPlan.createMany({
          data: input.items.map((i) => ({ locationId: id, ...i })),
        });
    });
    return this.load(id);
  }

  async addBlock(userId: string, id: string, input: z.output<typeof blockSchema>) {
    await this.ctx.location(userId, id);
    const cap = await this.prisma.locationCapacity.findUnique({
      where: { locationId_vehicleTypeId: { locationId: id, vehicleTypeId: input.vehicleTypeId } },
    });
    if (!cap)
      throw Errors.badRequest('VEHICLE_TYPE_INVALID', 'This vehicle type has no slots here');
    if (input.slots > cap.onlineSlots) {
      throw Errors.badRequest(
        'VALIDATION_FAILED',
        `At most ${cap.onlineSlots} online slots can be blocked`,
        [{ path: 'slots', message: `At most ${cap.onlineSlots}` }],
      );
    }
    await this.prisma.capacityBlock.create({
      data: { locationId: id, ...input, reason: input.reason ?? null },
    });
    await this.realtime.publish(id, input.vehicleTypeId);
    return this.load(id);
  }

  async deleteBlock(userId: string, id: string, blockId: string) {
    await this.ctx.location(userId, id);
    const b = await this.prisma.capacityBlock.findFirst({ where: { id: blockId, locationId: id } });
    if (!b) throw Errors.notFound('Block');
    await this.prisma.capacityBlock.delete({ where: { id: b.id } });
    await this.realtime.publish(id, b.vehicleTypeId);
    return this.load(id);
  }
}
