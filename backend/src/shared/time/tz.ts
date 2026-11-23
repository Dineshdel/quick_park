/** Time-zone helpers (no dependency): business rules run in APP_TIMEZONE (Asia/Kolkata by default). */

/** Offset of `tz` from UTC at `date`, in minutes (e.g. +330 for IST). */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/** Local wall-clock parts of `date` in `tz`. weekday: 0 = Monday … 6 = Sunday. */
export function localParts(date: Date, tz: string) {
  const local = new Date(date.getTime() + tzOffsetMinutes(date, tz) * 60_000);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    weekday: (local.getUTCDay() + 6) % 7,
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
    dateKey: local.toISOString().slice(0, 10),
  };
}

/** UTC instant of local midnight for a calendar date in `tz`. */
export function localMidnight(year: number, month: number, day: number, tz: string): Date {
  const guess = new Date(Date.UTC(year, month - 1, day));
  const offset = tzOffsetMinutes(guess, tz);
  const result = new Date(guess.getTime() - offset * 60_000);
  // Re-check across DST boundaries.
  const offset2 = tzOffsetMinutes(result, tz);
  return offset2 === offset ? result : new Date(guess.getTime() - offset2 * 60_000);
}

export const hhmmToMinutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
