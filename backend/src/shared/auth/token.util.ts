import { createHash, randomBytes } from 'node:crypto';

/** 256-bit URL-safe random token. */
export const randomToken = () => randomBytes(32).toString('base64url');

/** Tokens are stored only as SHA-256 hashes (they are high-entropy, so no salt/KDF needed). */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const addMs = (ms: number, from = new Date()) => new Date(from.getTime() + ms);
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
