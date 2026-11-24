import { formatRupees, type BookingStatus, type PlanType } from '@qp/types';
import { PLAN_RULES } from '@qp/validation';

export { formatRupees };
const TZ = 'Asia/Kolkata';

export const fmtDateTime = (iso: string | Date) =>
  new Date(iso).toLocaleString('en-IN', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
export const fmtDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString('en-IN', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
export const fmtTime = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString('en-IN', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

export const planLabel = (p: PlanType, qty = 1) =>
  p === 'EVENT' ? 'Event pass' : `${qty} ${PLAN_RULES[p].unit}${qty === 1 ? '' : 's'}`;
export const planUnit = (p: PlanType) => (p === 'EVENT' ? 'event' : PLAN_RULES[p].unit);

/** 97 → "1 h 37 min". */
export const fmtDur = (min: number) =>
  min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;

export const STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  CONFIRMED: 'Confirmed',
  ACTIVE: 'Parked',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

export const STATUS_TONE: Record<
  BookingStatus,
  'success' | 'warning' | 'info' | 'muted' | 'danger'
> = {
  PENDING_PAYMENT: 'warning',
  CONFIRMED: 'info',
  ACTIVE: 'success',
  COMPLETED: 'muted',
  CANCELLED: 'danger',
  EXPIRED: 'muted',
};
