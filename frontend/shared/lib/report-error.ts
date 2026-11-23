import * as Sentry from '@sentry/nextjs';

/** Send an unexpected error to Sentry (when NEXT_PUBLIC_SENTRY_DSN is set) and the console. */
export function reportError(error: unknown) {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) Sentry.captureException(error);
  console.error(error);
}
