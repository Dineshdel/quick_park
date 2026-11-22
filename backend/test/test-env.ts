import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Reads a key from the repo-root .env without adding a dependency. */
function fromDotEnv(key: string): string | undefined {
  const file = resolve(__dirname, '../../.env');
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim();
}

/** TEST_DATABASE_URL, or DATABASE_URL from .env with "_test" appended to the database name. */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = fromDotEnv('DATABASE_URL');
  if (!base) throw new Error('Set TEST_DATABASE_URL or DATABASE_URL in .env');
  const url = new URL(base);
  url.pathname = `${url.pathname}_test`;
  return url.toString();
}

/** TEST_REDIS_URL, or REDIS_URL from .env using logical DB 1 (dev uses 0). */
export function testRedisUrl(): string {
  if (process.env.TEST_REDIS_URL) return process.env.TEST_REDIS_URL;
  const url = new URL(fromDotEnv('REDIS_URL') ?? 'redis://localhost:6379');
  url.pathname = '/1';
  return url.toString();
}

/** Safety net: e2e tests truncate tables, so refuse any database whose name does not end in "_test". */
export function assertTestDatabase(url: string) {
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to run e2e tests against database "${name}" (name must end with "_test")`);
  }
}
