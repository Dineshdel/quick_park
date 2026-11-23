import { HttpStatus } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { type Role } from '@qp/types';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AuthCacheService } from '../src/shared/auth/auth-cache.service';
import { GoogleTokenVerifier, type GoogleProfile } from '../src/shared/auth/google-token.verifier';
import { PasswordService } from '../src/shared/auth/password.service';
import { AppException } from '../src/shared/http/app-exception';
import { MAIL_TRANSPORT, type MailMessage, type MailTransport } from '../src/shared/mail/mail.types';
import { PrismaService } from '../src/shared/database/prisma.service';
import { REDIS } from '../src/shared/redis/redis.module';
import { assertTestDatabase } from './test-env';

export const API = '/api/v1';
export const PASSWORD = 'correct-horse-1';
export const CSRF = { 'x-qp-csrf': '1' };
export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Captures outgoing emails so tests can follow verification/reset links. */
export class CaptureMailTransport implements MailTransport {
  readonly sent: MailMessage[] = [];

  async send(m: MailMessage) {
    this.sent.push(m);
  }

  async waitFor(to: string, subject: RegExp, timeoutMs = 5000): Promise<MailMessage> {
    const start = Date.now();
    for (;;) {
      const hit = [...this.sent].reverse().find((m) => m.to === to && subject.test(m.subject));
      if (hit) return hit;
      if (Date.now() - start > timeoutMs) throw new Error(`No email matching ${subject} to ${to}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  static tokenFrom(m: MailMessage) {
    const token = /token=([A-Za-z0-9_-]+)/.exec(m.text)?.[1];
    if (!token) throw new Error('No token in email');
    return token;
  }
}

/** Fake Google verifier. Token format: "fake|<sub>|<email>|<verified>|<name>"; anything else is rejected. */
class FakeGoogleVerifier {
  async verify(idToken: string): Promise<GoogleProfile> {
    const [tag, sub, email, verified, name] = idToken.split('|');
    if (tag !== 'fake' || !sub || !email || verified !== 'true') {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'GOOGLE_TOKEN_INVALID', 'Google sign-in failed');
    }
    return { sub, email: email.toLowerCase(), name: name ?? 'Google User' };
  }
}
export const googleToken = (sub: string, email: string, verified = true, name = 'Google User') =>
  `fake|${sub}|${email}|${verified}|${name}`;

export interface TestContext {
  app: NestExpressApplication;
  prisma: PrismaService;
  redis: Redis;
  mail: CaptureMailTransport;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestContext> {
  const mail = new CaptureMailTransport();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MAIL_TRANSPORT)
    .useValue(mail)
    .overrideProvider(GoogleTokenVerifier)
    .useValue(new FakeGoogleVerifier())
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false, rawBody: true });
  configureApp(app);
  await app.init();

  const prisma = app.get(PrismaService);
  const redis = app.get<Redis>(REDIS);
  await resetData(prisma, redis);
  return { app, prisma, redis, mail, http: () => request(app.getHttpServer()), close: () => app.close() };
}

/** Wipe all rows (schema stays) and Redis state. Called once per test file. */
async function resetData(prisma: PrismaService, redis: Redis) {
  assertTestDatabase(process.env.DATABASE_URL!);
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'spatial_ref_sys')`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  }
  await redis.flushdb();
}

let ipCounter = 0;
/** A fresh client IP per request keeps per-IP rate limits from leaking between tests. */
export const freshIp = () => {
  ipCounter += 1;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
};

let emailCounter = 0;
export const uniqueEmail = (prefix = 'user') => `${prefix}${++emailCounter}.${Date.now()}@example.com`;

/** Insert a verified, active user with PASSWORD directly in the DB. */
export async function createUser(ctx: TestContext, role: Role | null, email = uniqueEmail(role?.toLowerCase() ?? 'norole')) {
  return ctx.prisma.user.create({
    data: {
      email,
      name: 'Seeded User',
      role,
      emailVerifiedAt: new Date(),
      passwordHash: await ctx.app.get(PasswordService).hash(PASSWORD),
    },
  });
}

export function refreshCookie(res: request.Response): string {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('qp_rt='));
  if (!raw) throw new Error('No refresh cookie set');
  return raw.split(';')[0]!;
}

/** Log in with email + password; returns the access token and the refresh cookie pair. */
export async function login(ctx: TestContext, email: string, password = PASSWORD) {
  const res = await ctx
    .http()
    .post(`${API}/auth/login`)
    .set('X-Forwarded-For', freshIp())
    .send({ email, password })
    .expect(200);
  return { accessToken: res.body.accessToken as string, cookie: refreshCookie(res) };
}

export async function suspend(ctx: TestContext, userId: string) {
  await ctx.prisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });
  await ctx.app.get(AuthCacheService).invalidate(userId);
}
