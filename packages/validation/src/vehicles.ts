import { z } from 'zod';

/**
 * Number plates are stored upper case with spaces, dots and dashes removed: "tn 09 ab-1234" → "TN09AB1234".
 * Kept loose (4–12 letters/digits) so BH-series, old formats and temporary plates are accepted.
 */
export const plateNumberSchema = z
  .string()
  .transform((v) => v.toUpperCase().replace(/[\s.-]/g, ''))
  .pipe(z.string().regex(/^[A-Z0-9]{4,12}$/, 'Enter a valid number plate, e.g. TN 09 AB 1234'));

export const vehicleCreateSchema = z.object({
  vehicleTypeId: z.uuid('Choose a vehicle type'),
  plateNumber: plateNumberSchema,
});
export type VehicleCreateInput = z.input<typeof vehicleCreateSchema>;

export const vehicleUpdateSchema = vehicleCreateSchema.partial();
export type VehicleUpdateInput = z.input<typeof vehicleUpdateSchema>;

/** "TN09AB1234" → "TN 09 AB 1234" for display (best effort; unusual formats are returned unchanged). */
export function formatPlate(plate: string): string {
  const m = /^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/.exec(plate);
  return m ? [m[1], m[2], m[3], m[4]].filter(Boolean).join(' ') : plate;
}
