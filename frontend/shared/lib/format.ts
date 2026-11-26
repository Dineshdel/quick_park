import { formatRupees, type BookingStatus, type PlanType } from '@qp/types';
import { PLAN_RULES } from '@qp/validation';

export { formatRupees };
const TZ = 'Asia/Kolkata';

export const fmtDateTime = (iso: string | Date) =>
  new Date(iso).toLocaleString('en-IN', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });
export const fmtDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString('en-IN', { timeZone: TZ, dateStyle: 'medium' });
export const fmtTime = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString('en-IN', { timeZone: TZ, timeStyle: 'short' });

export const planLabel = (p: PlanType, qty = 1) =>
  p === 'EVENT' ? 'Event pass' : `${qty} ${PLAN_RULES[p].unit}${qty === 1 ? '' : 's'}`;
export const planUnit = (p: PlanType) => (p === 'EVENT' ? 'event' : PLAN_RULES[p].unit);

export const STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  CONFIRMED: 'Confirmed',
  ACTIVE: 'Parked',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

/** Value for <input type="datetime-local"> in local browser time. */
export const toLocalInput = (d: Date) => {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
};
export const rupeesToPaise = (r: string | number) => Math.round(Number(r) * 100);
export const paiseToRupees = (p: number) => (p / 100).toString();
