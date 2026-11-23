import { z } from 'zod';
import { PLAN_TYPES } from './locations';

type Plan = (typeof PLAN_TYPES)[number];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Unit length and max quantity per plan. Monthly = 30 days, yearly = 365 days (assumed default, plan Q4). */
export const PLAN_RULES: Record<Plan, { unitMs: number; maxQty: number; label: string; unit: string }> = {
  HOURLY: { unitMs: HOUR, maxQty: 24, label: 'Hourly', unit: 'hour' },
  DAILY: { unitMs: DAY, maxQty: 30, label: 'Daily', unit: 'day' },
  WEEKLY: { unitMs: 7 * DAY, maxQty: 8, label: 'Weekly', unit: 'week' },
  MONTHLY: { unitMs: 30 * DAY, maxQty: 12, label: 'Monthly', unit: 'month' },
  YEARLY: { unitMs: 365 * DAY, maxQty: 1, label: 'Yearly', unit: 'year' },
  EVENT: { unitMs: 0, maxQty: 1, label: 'Event', unit: 'event' },
};

/** End of a booking that starts at `start`. EVENT bookings use the event window instead. */
export function planEnd(start: Date, plan: Plan, quantity: number): Date {
  return new Date(start.getTime() + PLAN_RULES[plan].unitMs * quantity);
}

/** Multi-entry passes: the booking stays valid for re-entry until it ends (assumed default, plan Q7). */
export const isPass = (plan: Plan) => plan === 'WEEKLY' || plan === 'MONTHLY' || plan === 'YEARLY' || plan === 'EVENT';

/** Refund % for cancelling `hoursBefore` hours before start: first rule whose threshold is met (rules sorted desc). */
export function refundPctFor(rules: { hoursBefore: number; refundPct: number }[], hoursBefore: number): number {
  const sorted = [...rules].sort((a, b) => b.hoursBefore - a.hoursBefore);
  return sorted.find((r) => hoursBefore >= r.hoursBefore)?.refundPct ?? 0;
}

export const quoteSchema = z
  .object({
    locationId: z.uuid(),
    vehicleTypeId: z.uuid(),
    planType: z.enum(PLAN_TYPES),
    startAt: z.coerce.date(),
    quantity: z.coerce.number().int().min(1).default(1),
  })
  .refine((v) => v.quantity <= PLAN_RULES[v.planType].maxQty, {
    message: 'Too many units for this plan',
    path: ['quantity'],
  });
export type QuoteInput = z.input<typeof quoteSchema>;

export const bookingCreateSchema = z
  .object({
    locationId: z.uuid(),
    vehicleId: z.uuid('Choose a vehicle'),
    planType: z.enum(PLAN_TYPES),
    startAt: z.coerce.date(),
    quantity: z.coerce.number().int().min(1).default(1),
  })
  .refine((v) => v.quantity <= PLAN_RULES[v.planType].maxQty, {
    message: 'Too many units for this plan',
    path: ['quantity'],
  });
export type BookingCreateInput = z.input<typeof bookingCreateSchema>;

export const extendSchema = z.object({ quantity: z.coerce.number().int().min(1).max(30).default(1) });

export const bookingListSchema = z.object({ tab: z.enum(['upcoming', 'active', 'past']).default('upcoming') });

export const cancelSchema = z.object({ reason: z.string().trim().max(300).optional() });

export const disputeCreateSchema = z.object({ reason: z.string().trim().min(10, 'Tell us what went wrong (10+ characters)').max(1000) });
export type DisputeCreateInput = z.input<typeof disputeCreateSchema>;

export const paymentOrderSchema = z.object({ bookingId: z.uuid() });
export const mockPaySchema = z.object({ orderId: z.string().min(1), outcome: z.enum(['success', 'failure']).default('success') });

export const scanSchema = z.object({
  token: z.string().trim().min(4).max(300),
  locationId: z.uuid(),
  direction: z.enum(['ENTRY', 'EXIT']),
});
export type ScanInput = z.input<typeof scanSchema>;

export const walkInSchema = z.object({
  locationId: z.uuid(),
  vehicleTypeId: z.uuid(),
  plateNumber: z
    .string()
    .transform((v) => v.toUpperCase().replace(/[\s.-]/g, ''))
    .pipe(z.string().regex(/^[A-Z0-9]{4,12}$/, 'Enter a valid number plate')),
});
export type WalkInInput = z.input<typeof walkInSchema>;

export const exitSchema = z.object({
  paymentMethod: z.enum(['CASH', 'UPI']).optional(),
});

export const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
