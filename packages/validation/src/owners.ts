import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

export const ownerProfileSchema = z.object({
  businessName: z.string().trim().min(2, 'Too short').max(120),
  phone: z
    .string()
    .transform((v) => v.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(/^(\+91)?[6-9]\d{9}$/, 'Enter a valid Indian mobile number')),
  address: z.string().trim().min(5, 'Too short').max(300),
  panNumber: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.string().regex(/^([A-Z]{5}\d{4}[A-Z])?$/, 'PAN looks like ABCDE1234F'))
    .transform((v) => v || null)
    .nullable()
    .optional(),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.string().regex(/^(\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d])?$/, 'Enter a valid 15-character GSTIN'))
    .transform((v) => v || null)
    .nullable()
    .optional(),
  bankAccountName: optionalText(120),
  bankAccountNumber: z
    .string()
    .trim()
    .pipe(z.string().regex(/^(\d{9,18})?$/, 'Account number is 9–18 digits'))
    .transform((v) => v || null)
    .nullable()
    .optional(),
  bankIfsc: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.string().regex(/^([A-Z]{4}0[A-Z0-9]{6})?$/, 'IFSC looks like SBIN0001234'))
    .transform((v) => v || null)
    .nullable()
    .optional(),
  upiId: z
    .string()
    .trim()
    .pipe(z.string().regex(/^([\w.-]{2,}@[a-zA-Z]{2,})?$/, 'UPI id looks like name@bank'))
    .transform((v) => v || null)
    .nullable()
    .optional(),
});
export type OwnerProfileInput = z.input<typeof ownerProfileSchema>;

export const kycUploadSchema = z.object({
  docType: z.enum(['PAN', 'AADHAAR', 'GST_CERTIFICATE', 'LAND_PROOF', 'OTHER']),
});

export const reasonSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(500) });
export type ReasonInput = z.input<typeof reasonSchema>;
