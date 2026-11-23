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

export const PlanType = enumOf('HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'EVENT');
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
  'DUPLICATE',
  'IN_USE',
  'DEFAULT_POLICY_LOCKED',
  'VEHICLE_TYPE_INVALID',
  'VEHICLE_LIMIT',
  'OWNER_PROFILE_REQUIRED',
  'KYC_INCOMPLETE',
  'KYC_NOT_APPROVED',
  'INVALID_STATE',
  'LOCATION_INCOMPLETE',
  'FILE_INVALID',
  'SLOT_UNAVAILABLE',
  'PLAN_NOT_AVAILABLE',
  'OUTSIDE_OPENING_HOURS',
  'TOO_FAR_AHEAD',
  'START_IN_PAST',
  'BOOKING_NOT_CANCELLABLE',
  'BOOKING_NOT_ACTIVE',
  'PAYMENT_INVALID',
  'WEBHOOK_INVALID',
  'QR_INVALID',
  'WRONG_LOCATION',
  'TOO_EARLY',
  'BOOKING_ENDED',
  'NO_BOOKING',
  'ALREADY_INSIDE',
  'NOT_INSIDE',
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

// ---------- Masters (M2) ----------

export interface VehicleTypeDto {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface CategoryDto {
  id: string;
  name: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
}

/** Refund `refundPct` % when cancelled at least `hoursBefore` hours before start. */
export interface CancellationRule {
  hoursBefore: number;
  refundPct: number;
}

export interface CancellationPolicyDto {
  id: string;
  name: string;
  description: string | null;
  /** Sorted by hoursBefore descending; the last rule always has hoursBefore = 0. */
  rules: CancellationRule[];
  isDefault: boolean;
  isActive: boolean;
}

export interface PlatformSettingsDto {
  defaultCommissionPct: number;
  holdMinutes: number;
  entryGraceMinutes: number;
  fewLeftThreshold: number;
  exitGraceMinutes: number;
  updatedAt: string;
}

// ---------- Vehicles (M3) ----------

/** Max live vehicles per customer. */
export const MAX_VEHICLES_PER_USER = 20;

/** Prefix of the text encoded in a vehicle sticker QR: `qpv:<qrToken>`. Booking passes use a different prefix. */
export const VEHICLE_QR_PREFIX = 'qpv:';

export interface VehicleDto {
  id: string;
  plateNumber: string;
  vehicleType: Pick<VehicleTypeDto, 'id' | 'code' | 'name' | 'icon'>;
  photoUrl: string | null;
  createdAt: string;
}

export interface VehicleQrDto {
  vehicleId: string;
  plateNumber: string;
  vehicleTypeName: string;
  /** Exact text inside the QR code. */
  payload: string;
  /** Ready-to-render SVG image of the QR code. */
  svg: string;
}

// ---------- Enums for M4–M12 ----------

export const KycDocType = enumOf('PAN', 'AADHAAR', 'GST_CERTIFICATE', 'LAND_PROOF', 'OTHER');
export type KycDocType = keyof typeof KycDocType;
/** Documents an owner must upload before submitting KYC. */
export const REQUIRED_KYC_DOCS: KycDocType[] = ['PAN', 'AADHAAR'];

export const PaymentStatus = enumOf('CREATED', 'PAID', 'FAILED');
export type PaymentStatus = keyof typeof PaymentStatus;
export const PaymentMethod = enumOf('CASH', 'UPI', 'RAZORPAY');
export type PaymentMethod = keyof typeof PaymentMethod;
export const RefundStatus = enumOf('PENDING', 'PROCESSED', 'FAILED');
export type RefundStatus = keyof typeof RefundStatus;
export const PayoutStatus = enumOf('PENDING', 'PAID');
export type PayoutStatus = keyof typeof PayoutStatus;
export const DisputeStatus = enumOf('OPEN', 'RESOLVED', 'REJECTED');
export type DisputeStatus = keyof typeof DisputeStatus;

export const AMENITIES = ['CCTV', 'Covered', 'Security guard', 'EV charging', 'Washroom', 'Wheelchair access', 'Car wash', 'Valet'] as const;

/** Prefix of booking pass QR text: `qpb:<bookingId>.<signature>`. */
export const BOOKING_QR_PREFIX = 'qpb:';

// ---------- DTOs for M4–M12 ----------

export interface OpeningDay {
  open: string; // "08:00"
  close: string; // "22:00"
  closed: boolean;
}

export interface OwnerProfileDto {
  id: string;
  businessName: string;
  phone: string;
  address: string;
  panNumber: string | null;
  gstin: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  upiId: string | null;
  kycStatus: KycStatus;
  kycRejectionReason: string | null;
  kycSubmittedAt: string | null;
  documents: KycDocumentDto[];
}

export interface KycDocumentDto {
  id: string;
  docType: KycDocType;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface CapacityDto {
  vehicleTypeId: string;
  vehicleTypeCode: string;
  vehicleTypeName: string;
  totalSlots: number;
  onlineSlots: number;
  overstayPerHourPaise: number;
}

export interface PriceDto {
  vehicleTypeId: string;
  planType: PlanType;
  pricePaise: number;
  isActive: boolean;
}

export interface BlockDto {
  id: string;
  vehicleTypeId: string;
  startAt: string;
  endAt: string;
  slots: number;
  reason: string | null;
}

export interface PhotoDto {
  id: string;
  url: string;
}

export interface LocationDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  address: string;
  city: string;
  state: string | null;
  pincode: string | null;
  lat: number;
  lng: number;
  is24x7: boolean;
  openingHours: OpeningDay[] | null;
  amenities: string[];
  maxAdvanceDays: number;
  status: LocationStatus;
  rejectionReason: string | null;
  isEvent: boolean;
  eventName: string | null;
  eventStartAt: string | null;
  eventEndAt: string | null;
  category: { id: string; name: string };
  cancellationPolicy: { id: string; name: string; rules: CancellationRule[] } | null;
  photos: PhotoDto[];
  capacities: CapacityDto[];
  prices: PriceDto[];
}

export interface OwnerLocationDto extends LocationDto {
  blocks: BlockDto[];
  createdAt: string;
}

export interface SearchResultDto {
  id: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  distanceKm: number | null;
  category: string;
  photoUrl: string | null;
  is24x7: boolean;
  isEvent: boolean;
  /** Cheapest active price for the requested (or any) vehicle type. */
  fromPaise: number | null;
  fromPlan: PlanType | null;
  /** Free slots for the requested window + vehicle type (null when not requested). */
  free: number | null;
}

export type DayAvailability = 'free' | 'few' | 'full' | 'closed';
export interface CalendarDto {
  month: string; // "2026-11"
  vehicleTypeId: string;
  days: { date: string; free: number; state: DayAvailability }[];
}

export interface QuoteDto {
  startAt: string;
  endAt: string;
  planType: PlanType;
  quantity: number;
  unitPaise: number;
  amountPaise: number;
  free: number;
}

export interface BookingDto {
  id: string;
  code: string;
  status: BookingStatus;
  planType: PlanType;
  quantity: number;
  startAt: string;
  endAt: string;
  amountPaise: number;
  holdExpiresAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  extendedFromId: string | null;
  cancellationRules: CancellationRule[];
  location: { id: string; name: string; slug: string; address: string; city: string; lat: number; lng: number };
  vehicle: { id: string; plateNumber: string };
  vehicleType: { id: string; code: string; name: string };
  refundedPaise: number;
  createdAt: string;
}

export interface PaymentOrderDto {
  provider: 'mock' | 'razorpay';
  orderId: string;
  amountPaise: number;
  currency: 'INR';
  /** Razorpay key id for Checkout (razorpay only). */
  keyId: string | null;
  bookingId: string;
}

export interface PassDto {
  bookingId: string;
  code: string;
  payload: string;
  svg: string;
}

export interface ScanResultDto {
  action: 'ENTRY' | 'EXIT';
  sessionId: string;
  plateNumber: string;
  vehicleTypeName: string;
  customerName: string | null;
  booking: { id: string; code: string; planType: PlanType; startAt: string; endAt: string } | null;
  isWalkIn: boolean;
  overstayMinutes: number;
  /** Amount to collect at the gate (overstay or walk-in), in paise. */
  amountDuePaise: number;
  message: string;
}

export interface SessionDto {
  id: string;
  plateNumber: string;
  vehicleTypeName: string;
  isWalkIn: boolean;
  entryAt: string;
  exitAt: string | null;
  bookingCode: string | null;
  bookingEndAt: string | null;
  overstayAmountPaise: number;
  walkInAmountPaise: number;
  paymentMethod: PaymentMethod | null;
}

export interface AvailabilityEvent {
  locationId: string;
  vehicleTypeId: string;
  free: number;
  inside: number;
}

/** Owners see the customer's name, vehicle and booking only: never email or phone (PDF). */
export interface OwnerBookingDto {
  id: string;
  code: string;
  status: BookingStatus;
  planType: PlanType;
  quantity: number;
  startAt: string;
  endAt: string;
  amountPaise: number;
  commissionPaise: number;
  customerName: string;
  plateNumber: string;
  vehicleTypeName: string;
  location: { id: string; name: string };
}

export interface OwnerDashboardDto {
  locations: { id: string; name: string; status: LocationStatus; inside: number; capacity: number }[];
  todayBookings: number;
  insideNow: number;
  revenueTodayPaise: number;
  revenueMonthPaise: number;
  daily: { date: string; grossPaise: number; netPaise: number; bookings: number }[];
}

export interface EarningsDto {
  from: string;
  to: string;
  grossPaise: number;
  commissionPaise: number;
  refundPaise: number;
  netPaise: number;
  walkInPaise: number;
  overstayPaise: number;
  byLocation: { locationId: string; name: string; grossPaise: number; netPaise: number; bookings: number }[];
}

export interface PayoutDto {
  id: string;
  ownerId: string;
  businessName: string;
  periodFrom: string;
  periodTo: string;
  grossPaise: number;
  commissionPaise: number;
  refundPaise: number;
  netPaise: number;
  status: PayoutStatus;
  reference: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface DisputeDto {
  id: string;
  bookingId: string;
  bookingCode: string;
  customerName: string;
  reason: string;
  status: DisputeStatus;
  resolution: string | null;
  refundPaise: number;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ReportRowDto {
  key: string;
  bookings: number;
  grossPaise: number;
  commissionPaise: number;
  refundPaise: number;
}

/** "₹1,234.50" */
export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}
