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
    const razorpay = { PAYMENTS_DRIVER: 'razorpay', RAZORPAY_KEY_ID: 'k', RAZORPAY_KEY_SECRET: 's', RAZORPAY_WEBHOOK_SECRET: 'w' };
    const prod = { ...base, ...razorpay, NODE_ENV: 'production', MAIL_TRANSPORT: 'smtp', SMTP_URL: 'smtp://mail:25' };
    expect(validateEnv(prod)).toMatchObject({ COOKIE_SECURE: true, API_DOCS: false, REQUIRE_EMAIL_VERIFICATION: true });
    expect(validateEnv({ ...prod, API_DOCS: 'true' }).API_DOCS).toBe(true);
    expect(() => validateEnv({ ...prod, MAIL_TRANSPORT: 'log' })).toThrow(/real emails/);
    expect(() => validateEnv({ ...prod, REQUIRE_EMAIL_VERIFICATION: 'false' })).toThrow(/REQUIRE_EMAIL_VERIFICATION/);
  });

  it('refuses mock payments in production and incomplete payment / storage config', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(/mock payments/);
    expect(() => validateEnv({ ...base, PAYMENTS_DRIVER: 'razorpay' })).toThrow(/RAZORPAY_KEY_ID/);
    expect(() => validateEnv({ ...base, STORAGE_DRIVER: 's3' })).toThrow(/S3_PUBLIC_BUCKET/);
  });

  it('refuses to boot with a short JWT secret or missing SMTP_URL for smtp transport', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => validateEnv({ ...base, MAIL_TRANSPORT: 'smtp' })).toThrow(/SMTP_URL/);
  });
});
