import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { assertTestDatabase, testDatabaseUrl } from './test-env';

/** Apply pending migrations to the test database once per e2e run (non-destructive). */
export default function globalSetup() {
  const url = testDatabaseUrl();
  assertTestDatabase(url);
  execSync('pnpm exec prisma migrate deploy', {
    cwd: resolve(__dirname, '..'), // backend/ (schema at prisma/schema.prisma)
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
