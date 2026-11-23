/**
 * Error tracking. Imported first in main.ts so Sentry can instrument everything loaded after it.
 * Off unless SENTRY_DSN is set (in the environment or the root .env). No personal data is sent.
 */
import { existsSync } from 'node:fs';
import * as Sentry from '@sentry/nestjs';

if (!process.env.SENTRY_DSN) {
  for (const f of ['.env', '../.env']) {
    // Only reads keys that aren't already set; ConfigModule loads the rest later.
    if (existsSync(f)) process.loadEnvFile(f);
  }
}

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}
