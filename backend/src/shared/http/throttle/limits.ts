import { MINUTE, HOUR } from '../../auth/token.util';

/** Named per-route limits, used as @Throttle({ default: Limits.login }). */
export const Limits = {
  /** PDF: 5 tries per 15 minutes per email + IP. */
  login: { limit: 5, ttl: 15 * MINUTE },
  /** register, forgot-password, resend-verification, admin invite */
  sensitive: { limit: 5, ttl: HOUR },
  /** QR scans at a gate. */
  scan: { limit: 60, ttl: MINUTE },
} as const;
