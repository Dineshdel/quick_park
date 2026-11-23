// Server-side error tracking for Next.js (page rendering, server components). Off unless a DSN is set.
import * as Sentry from '@sentry/nextjs';

export function register() {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (dsn) Sentry.init({ dsn, environment: process.env.NODE_ENV, sendDefaultPii: false, tracesSampleRate: 0 });
}

export const onRequestError = Sentry.captureRequestError;
