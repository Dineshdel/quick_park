import { z } from 'zod';

export const uuidSchema = z.uuid();

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Enter a valid email address' }).max(254));

/**
 * Passwords attackers try first (most-leaked lists, plus this app's own name). Compared after
 * lower-casing and dropping a trailing number/symbol run, so "Password@123" and "qwerty2024!" match too.
 */
const COMMON_PASSWORDS = new Set([
  'password', 'passw0rd', 'pass', 'passcode', 'welcome', 'admin', 'administrator', 'root', 'login',
  'letmein', 'qwerty', 'qwertyuiop', 'asdfgh', 'asdfghjkl', 'zxcvbnm', 'abc', 'abcd', 'abcdef',
  'abcdefgh', 'iloveyou', 'monkey', 'dragon', 'master', 'sunshine', 'princess', 'football',
  'cricket', 'baseball', 'superman', 'batman', 'starwars', 'shadow', 'trustno', 'freedom',
  'whatever', 'hello', 'secret', 'changeme', 'default', 'test', 'testing', 'guest', 'user',
  'india', 'bharat', 'chennai', 'mumbai', 'delhi', 'bangalore', 'bengaluru', 'hyderabad',
  'krishna', 'ganesh', 'sairam', 'omsairam', 'jaihind', 'parking', 'quickpark', 'quick park',
]);

/** True for passwords made only of digits, one repeated character, or a common word + numbers. */
export function isWeakPassword(password: string): boolean {
  const p = password.toLowerCase();
  if (/^\d+$/.test(p)) return true; // 12345678, phone numbers, dates
  if (/^(.)\1+$/.test(p)) return true; // aaaaaaaa
  const core = p.replace(/[\d\W_]+$/, '').replace(/^[\d\W_]+/, '');
  return COMMON_PASSWORDS.has(core) || COMMON_PASSWORDS.has(p);
}

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((p) => !isWeakPassword(p), {
    message: 'This password is too easy to guess. Use a few unrelated words or a mix of letters and numbers.',
  });

export const nameSchema = z.string().trim().min(2, 'Name is too short').max(100);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationInput = z.infer<typeof paginationSchema>;
