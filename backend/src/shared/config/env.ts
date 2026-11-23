import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(4000),
    /** Comma-separated list of allowed browser origins; the first one is used to build email links. */
    WEB_ORIGIN: z.string().default('http://localhost:3000'),
    TRUST_PROXY: bool.default(false),

    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
    /** Secure cookies need HTTPS; defaults to true outside development/test. */
    COOKIE_SECURE: bool.optional(),

    /** Optional until Google sign-in is configured; /auth/google returns 503 without it. */
    GOOGLE_CLIENT_ID: z.string().optional(),

    /** "log" prints emails to the API log (dev); "smtp" sends via SMTP_URL (Mailpit, SES SMTP, Resend SMTP). */
    MAIL_TRANSPORT: z.enum(['log', 'smtp']).default('log'),
    SMTP_URL: z.string().optional(),
    MAIL_FROM: z.string().default('Quick Park <no-reply@quickpark.local>'),

    /** false = users can sign in right after registering, no verification email is sent. Turn back on before launch. */
    REQUIRE_EMAIL_VERIFICATION: bool.default(true),

    /** "local" stores files on disk under STORAGE_DIR (development); "s3" uses the two S3 buckets. */
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_DIR: z.string().default('./storage'),
    S3_REGION: z.string().optional(),
    S3_ENDPOINT: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_PUBLIC_BUCKET: z.string().optional(),
    S3_PRIVATE_BUCKET: z.string().optional(),
    /** Base URL for public files in S3 mode (bucket website / CDN), e.g. https://cdn.example.com */
    S3_PUBLIC_URL: z.string().optional(),

    /** "mock" simulates payments locally; "razorpay" uses Razorpay (test or live keys). */
    PAYMENTS_DRIVER: z.enum(['mock', 'razorpay']).default('mock'),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

    /** HMAC key for booking pass QR codes; defaults to one derived from JWT_ACCESS_SECRET. */
    PASS_SECRET: z.string().min(32).optional(),
    /** Business time zone for opening hours and calendar days. */
    APP_TIMEZONE: z.string().default('Asia/Kolkata'),
    /** false disables the background scheduler (tests drive it directly). */
    SCHEDULER_ENABLED: bool.default(true),
    /** Swagger UI at /api/docs. Defaults to on, except in production. */
    API_DOCS: bool.optional(),
    /** Error tracking (Sentry). Empty = off. */
    SENTRY_DSN: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === 's3') {
      for (const k of ['S3_REGION', 'S3_PUBLIC_BUCKET', 'S3_PRIVATE_BUCKET', 'S3_PUBLIC_URL'] as const) {
        if (!env[k]) ctx.addIssue({ code: 'custom', path: [k], message: 'Required when STORAGE_DRIVER=s3' });
      }
    }
    if (env.PAYMENTS_DRIVER === 'razorpay') {
      for (const k of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'] as const) {
        if (!env[k]) ctx.addIssue({ code: 'custom', path: [k], message: 'Required when PAYMENTS_DRIVER=razorpay' });
      }
    }
    if (env.NODE_ENV === 'production' && env.PAYMENTS_DRIVER === 'mock') {
      ctx.addIssue({ code: 'custom', path: ['PAYMENTS_DRIVER'], message: 'mock payments are not allowed in production' });
    }
    if (env.NODE_ENV === 'production' && env.MAIL_TRANSPORT === 'log') {
      ctx.addIssue({ code: 'custom', path: ['MAIL_TRANSPORT'], message: 'production must send real emails: set MAIL_TRANSPORT=smtp and SMTP_URL' });
    }
    if (env.NODE_ENV === 'production' && !env.REQUIRE_EMAIL_VERIFICATION) {
      ctx.addIssue({ code: 'custom', path: ['REQUIRE_EMAIL_VERIFICATION'], message: 'must be true in production (anyone could register with someone else’s email)' });
    }
    if (env.MAIL_TRANSPORT === 'smtp' && !env.SMTP_URL) {
      ctx.addIssue({ code: 'custom', path: ['SMTP_URL'], message: 'Required when MAIL_TRANSPORT=smtp' });
    }
  })
  .transform((env) => ({
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
    API_DOCS: env.API_DOCS ?? env.NODE_ENV !== 'production',
    WEB_ORIGINS: env.WEB_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
  }));

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
