import { z } from 'zod';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
export const openingDaySchema = z
  .object({ open: time, close: time, closed: z.boolean() })
  .refine((d) => d.closed || d.open < d.close, {
    message: 'Closing time must be after opening time',
    path: ['close'],
  });

export const PLAN_TYPES = ['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'EVENT'] as const;

const locationFields = {
  categoryId: z.uuid('Choose a category'),
  cancellationPolicyId: z.uuid().nullable().optional(),
  name: z.string().trim().min(3, 'Too short').max(120),
  description: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => v || null)
    .nullable()
    .optional(),
  address: z.string().trim().min(5, 'Too short').max(300),
  city: z.string().trim().min(2, 'Too short').max(80),
  state: z.string().trim().max(80).nullable().optional(),
  pincode: z
    .string()
    .trim()
    .regex(/^(\d{6})?$/, 'Pincode is 6 digits')
    .transform((v) => v || null)
    .nullable()
    .optional(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  is24x7: z.boolean().default(false),
  openingHours: z.array(openingDaySchema).length(7).nullable().optional(),
  amenities: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  maxAdvanceDays: z.coerce.number().int().min(1).max(365).default(30),
  isEvent: z.boolean().default(false),
  /** Free parking: customers book without paying and no prices are shown. */
  isFree: z.boolean().default(false),
  eventName: z.string().trim().max(120).nullable().optional(),
  eventStartAt: z.coerce.date().nullable().optional(),
  eventEndAt: z.coerce.date().nullable().optional(),
};

const eventRules = (
  v: {
    isEvent?: boolean;
    eventName?: string | null;
    eventStartAt?: Date | null;
    eventEndAt?: Date | null;
  },
  ctx: z.RefinementCtx,
) => {
  if (!v.isEvent) return;
  if (!v.eventName)
    ctx.addIssue({ code: 'custom', path: ['eventName'], message: 'Name the event' });
  if (!v.eventStartAt)
    ctx.addIssue({ code: 'custom', path: ['eventStartAt'], message: 'Event start is required' });
  if (!v.eventEndAt)
    ctx.addIssue({ code: 'custom', path: ['eventEndAt'], message: 'Event end is required' });
  if (v.eventStartAt && v.eventEndAt && v.eventEndAt <= v.eventStartAt) {
    ctx.addIssue({
      code: 'custom',
      path: ['eventEndAt'],
      message: 'Event must end after it starts',
    });
  }
};

export const locationCreateSchema = z.object(locationFields).superRefine(eventRules);
export type LocationCreateInput = z.input<typeof locationCreateSchema>;

export const locationUpdateSchema = z
  .object(
    Object.fromEntries(
      Object.entries(locationFields).map(([k, v]) => [k, (v as z.ZodType).optional()]),
    ) as {
      [K in keyof typeof locationFields]: z.ZodOptional<(typeof locationFields)[K]>;
    },
  )
  .superRefine(eventRules);
export type LocationUpdateInput = z.input<typeof locationUpdateSchema>;

export const capacitySchema = z.object({
  items: z
    .array(
      z
        .object({
          vehicleTypeId: z.uuid(),
          totalSlots: z.coerce.number().int().min(0).max(10000),
          onlineSlots: z.coerce.number().int().min(0).max(10000),
          overstayPerHourPaise: z.coerce.number().int().min(0).max(10_000_000).default(0),
        })
        .refine((c) => c.onlineSlots <= c.totalSlots, {
          message: 'Online slots cannot exceed total slots',
          path: ['onlineSlots'],
        }),
    )
    .max(20)
    .refine(
      (items) => new Set(items.map((i) => i.vehicleTypeId)).size === items.length,
      'Each vehicle type only once',
    ),
});
export type CapacityInput = z.input<typeof capacitySchema>;

/** Floor / zone inside an area. `level` orders floors (B2 = -2, Ground = 0, Level 4 = 4) for "nearest floor". */
export const zoneSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, 'Name the floor or zone').max(60),
  level: z.coerce.number().int().min(-20).max(200).default(0),
  tags: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
  capacities: z
    .array(
      z
        .object({
          vehicleTypeId: z.uuid(),
          totalSlots: z.coerce.number().int().min(0).max(10000),
          onlineSlots: z.coerce.number().int().min(0).max(10000),
        })
        .refine((c) => c.onlineSlots <= c.totalSlots, {
          message: 'Online slots cannot exceed total slots',
          path: ['onlineSlots'],
        }),
    )
    .max(20)
    .refine(
      (items) => new Set(items.map((i) => i.vehicleTypeId)).size === items.length,
      'Each vehicle type only once',
    ),
  /**
   * Named slots (P01, 001, A-12…). Optional; when a vehicle type has named slots on this floor, its total/online
   * counts are taken from them (total = all, online = those not kept for walk-ins).
   */
  slots: z
    .array(
      z.object({
        id: z.uuid().optional(),
        label: z.string().trim().min(1, 'Name the slot').max(20),
        vehicleTypeId: z.uuid(),
        isOnline: z.boolean().default(true),
      }),
    )
    .max(500, 'At most 500 named slots per floor')
    .default([])
    .refine(
      (slots) => new Set(slots.map((s) => s.label.toUpperCase())).size === slots.length,
      'Slot names must be different on one floor',
    ),
});

/** Sub-place inside a place (e.g. "Tech Park Parking" on a campus, "North tower" at an office). */
export const areaSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, 'Name the area').max(80),
  description: z
    .string()
    .trim()
    .max(300)
    .transform((v) => v || null)
    .nullable()
    .optional(),
  lat: z.coerce.number().min(-90).max(90).nullable().optional(),
  lng: z.coerce.number().min(-180).max(180).nullable().optional(),
  zones: z.array(zoneSchema).min(1, 'Add at least one floor or zone').max(50),
});

/** The whole layout of a place, replaced in one go. An empty list switches back to simple (place-level) slots. */
export const layoutSchema = z
  .object({ areas: z.array(areaSchema).max(30) })
  .refine(
    (v) => v.areas.reduce((n, a) => n + a.zones.length, 0) <= 200,
    'At most 200 floors/zones per place',
  )
  .refine(
    (v) =>
      v.areas.reduce((n, a) => n + a.zones.reduce((m, z) => m + (z.slots?.length ?? 0), 0), 0) <=
      5000,
    'At most 5000 named slots per place',
  );
export type LayoutInput = z.input<typeof layoutSchema>;

export const pricingSchema = z.object({
  items: z
    .array(
      z.object({
        vehicleTypeId: z.uuid(),
        planType: z.enum(PLAN_TYPES),
        /** 0 only for free places (checked by the server); paid places need at least ₹1. */
        pricePaise: z.coerce.number().int().min(0).max(100_000_000),
        isActive: z.boolean().default(true),
      }),
    )
    .max(120)
    .refine(
      (items) =>
        new Set(items.map((i) => `${i.vehicleTypeId}:${i.planType}`)).size === items.length,
      'Each plan only once per vehicle type',
    ),
});
export type PricingInput = z.input<typeof pricingSchema>;

export const blockSchema = z
  .object({
    vehicleTypeId: z.uuid(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    slots: z.coerce.number().int().min(1).max(10000),
    reason: z.string().trim().max(200).nullable().optional(),
  })
  .refine((b) => b.endAt > b.startAt, { message: 'End must be after start', path: ['endAt'] });
export type BlockInput = z.input<typeof blockSchema>;

export const searchSchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(0.5).max(100).default(10),
  city: z.string().trim().max(80).optional(),
  q: z.string().trim().max(100).optional(),
  category: z.uuid().optional(),
  vehicleType: z.uuid().optional(),
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchInput = z.input<typeof searchSchema>;

export const calendarSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM'),
  vehicleType: z.uuid(),
});

export const availabilitySchema = z
  .object({
    start: z.coerce.date(),
    end: z.coerce.date(),
    vehicleType: z.uuid(),
    zone: z.uuid().optional(),
  })
  .refine((v) => v.end > v.start, { message: 'End must be after start', path: ['end'] });

/** "My Mall Parking!" → "my-mall-parking" */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
