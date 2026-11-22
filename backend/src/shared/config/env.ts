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
  })
  .superRefine((env, ctx) => {
    if (env.MAIL_TRANSPORT === 'smtp' && !env.SMTP_URL) {
      ctx.addIssue({ code: 'custom', path: ['SMTP_URL'], message: 'Required when MAIL_TRANSPORT=smtp' });
    }
  })
  .transform((env) => ({
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
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
