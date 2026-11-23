import { z } from 'zod';

// Field schemas carry no defaults, so the `update` (partial) schemas never reset omitted fields.
const iconSchema = z
  .string()
  .trim()
  .max(50)
  .regex(/^[a-z0-9-]*$/, 'Use a lucide icon name, e.g. "car"')
  .transform((v) => v || null)
  .nullable();
const sortOrderSchema = z.coerce.number().int().min(0).max(9999);
const labelSchema = z.string().trim().min(2, 'Too short').max(60);

// ---------- Vehicle types ----------

const vehicleTypeFields = {
  name: labelSchema,
  icon: iconSchema,
  sortOrder: sortOrderSchema,
  isActive: z.boolean(),
};

export const vehicleTypeCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.string().regex(/^[A-Z][A-Z0-9_]{1,19}$/, 'Use 2–20 capital letters, digits or _ (e.g. EV_CAR)')),
  ...vehicleTypeFields,
  icon: iconSchema.optional(),
  sortOrder: sortOrderSchema.optional(),
  isActive: z.boolean().optional(),
});
export type VehicleTypeCreateInput = z.input<typeof vehicleTypeCreateSchema>;

/** `code` is immutable: bookings and pricing refer to it. */
export const vehicleTypeUpdateSchema = z.object(vehicleTypeFields).partial();
export type VehicleTypeUpdateInput = z.input<typeof vehicleTypeUpdateSchema>;

// ---------- Categories ----------

const categoryFields = {
  name: labelSchema,
  icon: iconSchema,
  sortOrder: sortOrderSchema,
  isActive: z.boolean(),
};

export const categoryCreateSchema = z.object({
  ...categoryFields,
  icon: iconSchema.optional(),
  sortOrder: sortOrderSchema.optional(),
  isActive: z.boolean().optional(),
});
export type CategoryCreateInput = z.input<typeof categoryCreateSchema>;

export const categoryUpdateSchema = z.object(categoryFields).partial();
export type CategoryUpdateInput = z.input<typeof categoryUpdateSchema>;

// ---------- Cancellation policies ----------

export const cancellationRuleSchema = z.object({
  hoursBefore: z.coerce.number().int().min(0).max(8760),
  refundPct: z.coerce.number().int().min(0).max(100),
});

/**
 * Rules are normalised to hoursBefore descending. They must have distinct hoursBefore values, include a
 * hoursBefore = 0 rule (so every cancellation time is covered), and never refund more closer to the start.
 */
export const cancellationRulesSchema = z
  .array(cancellationRuleSchema)
  .min(1, 'Add at least one rule')
  .max(10)
  .transform((rules) => [...rules].sort((a, b) => b.hoursBefore - a.hoursBefore))
  .superRefine((rules, ctx) => {
    const hours = rules.map((r) => r.hoursBefore);
    if (new Set(hours).size !== hours.length) {
      ctx.addIssue({ code: 'custom', message: 'Each rule needs a different number of hours' });
    }
    if (!hours.includes(0)) {
      ctx.addIssue({ code: 'custom', message: 'Add a rule for 0 hours (cancelling at the last moment)' });
    }
    for (let i = 1; i < rules.length; i++) {
      if (rules[i]!.refundPct > rules[i - 1]!.refundPct) {
        ctx.addIssue({ code: 'custom', message: 'Refunds cannot increase closer to the start time' });
        break;
      }
    }
  });

const policyFields = {
  name: labelSchema,
  description: z
    .string()
    .trim()
    .max(500)
    .transform((v) => v || null)
    .nullable(),
  rules: cancellationRulesSchema,
  isDefault: z.boolean(),
  isActive: z.boolean(),
};

export const cancellationPolicyCreateSchema = z.object({
  ...policyFields,
  description: policyFields.description.optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export type CancellationPolicyCreateInput = z.input<typeof cancellationPolicyCreateSchema>;

export const cancellationPolicyUpdateSchema = z.object(policyFields).partial();
export type CancellationPolicyUpdateInput = z.input<typeof cancellationPolicyUpdateSchema>;

// ---------- Platform settings ----------

export const platformSettingsSchema = z.object({
  defaultCommissionPct: z.coerce
    .number()
    .min(0)
    .max(100)
    .refine((v) => Math.round(v * 100) === v * 100, 'At most 2 decimal places'),
  holdMinutes: z.coerce.number().int().min(1).max(60),
  entryGraceMinutes: z.coerce.number().int().min(0).max(240),
  fewLeftThreshold: z.coerce.number().int().min(0).max(1000),
  exitGraceMinutes: z.coerce.number().int().min(0).max(240),
});
export const platformSettingsUpdateSchema = platformSettingsSchema.partial();
export type PlatformSettingsUpdateInput = z.input<typeof platformSettingsUpdateSchema>;
