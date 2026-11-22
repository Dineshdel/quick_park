/**
 * Shared enums. Values must stay identical to the Prisma enums in prisma/schema.prisma.
 * Declared as const objects so they work as runtime values in both web and API.
 */
const enumOf = <T extends readonly string[]>(...values: T) =>
  Object.freeze(Object.fromEntries(values.map((v) => [v, v]))) as { readonly [K in T[number]]: K };

export const Role = enumOf('VEHICLE_OWNER', 'PARKING_OWNER', 'SUPER_ADMIN');
export type Role = keyof typeof Role;
/** Roles a user may pick for themselves at sign-up / choose-role. */
export const SELF_SERVICE_ROLES = [Role.VEHICLE_OWNER, Role.PARKING_OWNER] as const;
export type SelfServiceRole = (typeof SELF_SERVICE_ROLES)[number];

export const UserStatus = enumOf('ACTIVE', 'SUSPENDED');
export type UserStatus = keyof typeof UserStatus;

export const AuthProvider = enumOf('GOOGLE');
export type AuthProvider = keyof typeof AuthProvider;

export const PlanType = enumOf('HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');
export type PlanType = keyof typeof PlanType;

export const BookingStatus = enumOf(
  'PENDING_PAYMENT',
  'CONFIRMED',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
);
export type BookingStatus = keyof typeof BookingStatus;

export const LocationStatus = enumOf('DRAFT', 'PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');
export type LocationStatus = keyof typeof LocationStatus;

export const KycStatus = enumOf('NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED');
export type KycStatus = keyof typeof KycStatus;

export const ScanDirection = enumOf('ENTRY', 'EXIT');
export type ScanDirection = keyof typeof ScanDirection;

/** Seeded vehicle type codes. Admins may add more rows, so treat this as a non-exhaustive list. */
export const DEFAULT_VEHICLE_TYPES = ['CAR', 'BIKE', 'AUTO', 'VAN', 'BUS', 'LORRY'] as const;

/** Stable machine-readable API error codes: `{ error: { code, message, details? } }`. */
export const ErrorCode = enumOf(
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL',
  'INVALID_CREDENTIALS',
  'EMAIL_NOT_VERIFIED',
  'EMAIL_TAKEN',
  'INVALID_TOKEN',
  'ACCOUNT_SUSPENDED',
  'ROLE_REQUIRED',
  'ROLE_ALREADY_SET',
  'GOOGLE_TOKEN_INVALID',
  'PASSWORD_NOT_SET',
);
export type ErrorCode = keyof typeof ErrorCode;

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
