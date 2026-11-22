/**
 * Runs before each e2e test file. Points the app at an isolated test database and Redis DB.
 * Override with TEST_DATABASE_URL / TEST_REDIS_URL (CI sets these).
 */
import { testDatabaseUrl, testRedisUrl } from './test-env';

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: testDatabaseUrl(),
  REDIS_URL: testRedisUrl(),
  TRUST_PROXY: 'true', // lets tests vary the client IP via X-Forwarded-For
  MAIL_TRANSPORT: 'log',
  GOOGLE_CLIENT_ID: 'test-google-client-id',
  JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-123',
  WEB_ORIGIN: 'http://localhost:3000',
});
