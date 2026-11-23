import { z } from 'zod';
import { paginationSchema } from './common';

export const userListSchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  role: z.enum(['VEHICLE_OWNER', 'PARKING_OWNER', 'SUPER_ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});

export const userStatusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) });

export const adminBookingListSchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['PENDING_PAYMENT', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED']).optional(),
});

export const refundCreateSchema = z.object({
  bookingId: z.uuid(),
  amountPaise: z.coerce.number().int().min(1),
  reason: z.string().trim().min(3).max(300),
});
export type RefundCreateInput = z.input<typeof refundCreateSchema>;

export const disputeResolveSchema = z.object({
  status: z.enum(['RESOLVED', 'REJECTED']),
  resolution: z.string().trim().min(3, 'Explain the decision').max(1000),
  refundPaise: z.coerce.number().int().min(0).default(0),
});
export type DisputeResolveInput = z.input<typeof disputeResolveSchema>;

export const payoutCreateSchema = z
  .object({ ownerId: z.uuid(), periodFrom: z.coerce.date(), periodTo: z.coerce.date() })
  .refine((v) => v.periodTo > v.periodFrom, { message: 'End must be after start', path: ['periodTo'] });
export type PayoutCreateInput = z.input<typeof payoutCreateSchema>;

export const payoutPaidSchema = z.object({ reference: z.string().trim().min(2).max(100) });

export const reportSchema = z.object({
  groupBy: z.enum(['city', 'category', 'month']).default('month'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const ownerCommissionSchema = z.object({ commissionPct: z.coerce.number().min(0).max(100).nullable() });
