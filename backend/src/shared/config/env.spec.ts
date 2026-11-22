import { validateEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://u@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('applies defaults and derives WEB_ORIGINS / COOKIE_SECURE', () => {
    const env = validateEnv({ ...base, WEB_ORIGIN: 'http://a.test, http://b.test' });
    expect(env.PORT).toBe(4000);
    expect(env.WEB_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
    expect(env.COOKIE_SECURE).toBe(false);
    expect(validateEnv({ ...base, NODE_ENV: 'production' }).COOKIE_SECURE).toBe(true);
  });

  it('refuses to boot with a short JWT secret or missing SMTP_URL for smtp transport', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => validateEnv({ ...base, MAIL_TRANSPORT: 'smtp' })).toThrow(/SMTP_URL/);
  });
});
