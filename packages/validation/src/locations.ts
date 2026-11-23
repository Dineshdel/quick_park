import { z } from 'zod';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
export const openingDaySchema = z
  .object({ open: time, close: time, closed: z.boolean() })
  .refine((d) => d.closed || d.open < d.close, { message: 'Closing time must be after opening time', path: ['close'] });

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
  eventName: z.string().trim().max(120).nullable().optional(),
  eventStartAt: z.coerce.date().nullable().optional(),
  eventEndAt: z.coerce.date().nullable().optional(),
};

const eventRules = (v: { isEvent?: boolean; eventName?: string | null; eventStartAt?: Date | null; eventEndAt?: Date | null }, ctx: z.RefinementCtx) => {
  if (!v.isEvent) return;
  if (!v.eventName) ctx.addIssue({ code: 'custom', path: ['eventName'], message: 'Name the event' });
  if (!v.eventStartAt) ctx.addIssue({ code: 'custom', path: ['eventStartAt'], message: 'Event start is required' });
  if (!v.eventEndAt) ctx.addIssue({ code: 'custom', path: ['eventEndAt'], message: 'Event end is required' });
  if (v.eventStartAt && v.eventEndAt && v.eventEndAt <= v.eventStartAt) {
    ctx.addIssue({ code: 'custom', path: ['eventEndAt'], message: 'Event must end after it starts' });
  }
};

export const locationCreateSchema = z.object(locationFields).superRefine(eventRules);
export type LocationCreateInput = z.input<typeof locationCreateSchema>;

export const locationUpdateSchema = z
  .object(Object.fromEntries(Object.entries(locationFields).map(([k, v]) => [k, (v as z.ZodType).optional()])) as {
    [K in keyof typeof locationFields]: z.ZodOptional<(typeof locationFields)[K]>;
  })
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
        .refine((c) => c.onlineSlots <= c.totalSlots, { message: 'Online slots cannot exceed total slots', path: ['onlineSlots'] }),
    )
    .max(20)
    .refine((items) => new Set(items.map((i) => i.vehicleTypeId)).size === items.length, 'Each vehicle type only once'),
});
export type CapacityInput = z.input<typeof capacitySchema>;

export const pricingSchema = z.object({
  items: z
    .array(
      z.object({
        vehicleTypeId: z.uuid(),
        planType: z.enum(PLAN_TYPES),
        pricePaise: z.coerce.number().int().min(100, 'At least ₹1').max(100_000_000),
        isActive: z.boolean().default(true),
      }),
    )
    .max(120)
    .refine((items) => new Set(items.map((i) => `${i.vehicleTypeId}:${i.planType}`)).size === items.length, 'Each plan only once per vehicle type'),
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
  .object({ start: z.coerce.date(), end: z.coerce.date(), vehicleType: z.uuid() })
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
