import { hashToken } from '../src/shared/auth/token.util';
import {
  API,
  bearer,
  CaptureMailTransport,
  createTestApp,
  createUser,
  CSRF,
  freshIp,
  googleToken,
  login,
  PASSWORD,
  refreshCookie,
  suspend,
  type TestContext,
  uniqueEmail,
} from './helpers';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

const post = (path: string, body?: object) => ctx.http().post(`${API}${path}`).set('X-Forwarded-For', freshIp()).send(body);

describe('POST /auth/register + verify-email', () => {
  it('rejects invalid input with field details', async () => {
    const res = await post('/auth/register', { name: 'A', email: 'nope', password: 'short', role: 'SUPER_ADMIN' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const paths = res.body.error.details.map((d: { path: string }) => d.path).sort();
    expect(paths).toEqual(['email', 'name', 'password', 'role']);
  });

  it('cannot self-register as SUPER_ADMIN', async () => {
    await post('/auth/register', { name: 'Eve', email: uniqueEmail(), password: PASSWORD, role: 'SUPER_ADMIN' }).expect(400);
  });

  it('registers, lowercases email, stores argon2 hash, emails a single-use verify link', async () => {
    const email = uniqueEmail('Mixed.Case');
    await post('/auth/register', { name: 'Asha', email: email.toUpperCase(), password: PASSWORD, role: 'VEHICLE_OWNER' }).expect(201);

    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: email.toLowerCase() } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.role).toBe('VEHICLE_OWNER');

    // Login blocked until verified
    const blocked = await post('/auth/login', { email, password: PASSWORD }).expect(403);
    expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    const mail = await ctx.mail.waitFor(user.email, /Verify/);
    const token = CaptureMailTransport.tokenFrom(mail);
    // Only the hash is stored
    expect(await ctx.prisma.emailToken.findFirst({ where: { tokenHash: token } })).toBeNull();
    expect(await ctx.prisma.emailToken.findFirst({ where: { tokenHash: hashToken(token) } })).not.toBeNull();

    await post('/auth/verify-email', { token }).expect(200);
    const reuse = await post('/auth/verify-email', { token }).expect(400);
    expect(reuse.body.error.code).toBe('INVALID_TOKEN');

    await ctx.mail.waitFor(user.email, /Welcome/);
    await login(ctx, email.toLowerCase());
  });

  it('rejects duplicate email with 409 EMAIL_TAKEN', async () => {
    const { email } = await createUser(ctx, 'VEHICLE_OWNER');
    const res = await post('/auth/register', { name: 'Dup', email, password: PASSWORD, role: 'PARKING_OWNER' }).expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects an expired verification token', async () => {
    const email = uniqueEmail();
    await post('/auth/register', { name: 'Late', email, password: PASSWORD, role: 'VEHICLE_OWNER' }).expect(201);
    const token = CaptureMailTransport.tokenFrom(await ctx.mail.waitFor(email, /Verify/));
    await ctx.prisma.emailToken.update({ where: { tokenHash: hashToken(token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await post('/auth/verify-email', { token }).expect(400);
  });

  it('resend-verification invalidates the old link and never reveals whether the account exists', async () => {
    const email = uniqueEmail();
    await post('/auth/register', { name: 'Resend', email, password: PASSWORD, role: 'PARKING_OWNER' }).expect(201);
    const first = CaptureMailTransport.tokenFrom(await ctx.mail.waitFor(email, /Verify/));
    ctx.mail.sent.length = 0;

    const unknown = await post('/auth/resend-verification', { email: uniqueEmail('ghost') }).expect(200);
    const known = await post('/auth/resend-verification', { email }).expect(200);
    expect(unknown.body).toEqual(known.body);

    const second = CaptureMailTransport.tokenFrom(await ctx.mail.waitFor(email, /Verify/));
    expect(second).not.toBe(first);
    await post('/auth/verify-email', { token: first }).expect(400);
    await post('/auth/verify-email', { token: second }).expect(200);
  });
});

describe('POST /auth/login', () => {
  it('returns access token in body and refresh token only in an httpOnly path-scoped cookie', async () => {
    const { email } = await createUser(ctx, 'PARKING_OWNER');
    const res = await post('/auth/login', { email, password: PASSWORD }).expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email, role: 'PARKING_OWNER', emailVerified: true, hasPassword: true });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('qp_rt');
    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it('gives the same error for wrong password and unknown email', async () => {
    const { email } = await createUser(ctx, 'VEHICLE_OWNER');
    const wrong = await post('/auth/login', { email, password: 'wrong-password' }).expect(401);
    const unknown = await post('/auth/login', { email: uniqueEmail('ghost'), password: PASSWORD }).expect(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rate-limits to 5 attempts per 15 min per email + IP', async () => {
    const { email } = await createUser(ctx, 'VEHICLE_OWNER');
    const ip = freshIp();
    const attempt = (e: string) => ctx.http().post(`${API}/auth/login`).set('X-Forwarded-For', ip).send({ email: e, password: 'bad-password' });
    for (let i = 0; i < 5; i++) await attempt(email).expect(401);
    const limited = await attempt(email).expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    // Even the right password is blocked for that email+IP...
    await ctx.http().post(`${API}/auth/login`).set('X-Forwarded-For', ip).send({ email, password: PASSWORD }).expect(429);
    // ...but other emails from the same IP are unaffected.
    await attempt(uniqueEmail('other')).expect(401);
  });

  it('blocks suspended users', async () => {
    const user = await createUser(ctx, 'VEHICLE_OWNER');
    await suspend(ctx, user.id);
    const res = await post('/auth/login', { email: user.email, password: PASSWORD }).expect(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });
});

describe('POST /auth/refresh + logout', () => {
  it('requires the CSRF header', async () => {
    const { email } = await createUser(ctx, 'VEHICLE_OWNER');
    const { cookie } = await login(ctx, email);
    await post('/auth/refresh').set('Cookie', cookie).expect(403);
  });

  it('401 without a cookie', async () => {
    const res = await post('/auth/refresh').set(CSRF).expect(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rotates the refresh token; replaying an old one revokes the whole family', async () => {
    const { email } = await createUser(ctx, 'VEHICLE_OWNER');
    const { cookie: first } = await login(ctx, email);

    const r1 = await post('/auth/refresh').set(CSRF).set('Cookie', first).expect(200);
    const second = refreshCookie(r1);
    expect(second).not.toBe(first);
    expect(r1.body.accessToken).toEqual(expect.any(String));

    // Replay of the rotated token = theft signal
    await post('/auth/refresh').set(CSRF).set('Cookie', first).expect(401);
    // ...which also kills the legitimate newer token
    await post('/auth/refresh').set(CSRF).set('Cookie', second).expect(401);
  });

  it('mobile app: refresh token comes in the body (no cookie), and refresh/logout take it from the body', async () => {
    const { email } = await createUser(ctx, 'VEHICLE_OWNER');
    const MOBILE = { 'X-QP-Client': 'mobile' };
    const res = await post('/auth/login', { email, password: PASSWORD }).set(MOBILE).expect(200);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.body).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) });
    const r1 = await post('/auth/refresh', { refreshToken: res.body.refreshToken }).set(CSRF).set(MOBILE).expect(200);
    expect(r1.body.refreshToken).not.toBe(res.body.refreshToken);
    // Without the mobile header the body token is ignored (web only uses the cookie).
    await post('/auth/refresh', { refreshToken: r1.body.refreshToken }).set(CSRF).expect(401);
    await post('/auth/logout', { refreshToken: r1.body.refreshToken }).set(CSRF).set(MOBILE).expect(204);
    await post('/auth/refresh', { refreshToken: r1.body.refreshToken }).set(CSRF).set(MOBILE).expect(401);
  });

  it('rejects expired refresh tokens', async () => {
    const { email } = await createUser(ctx, 'VEHICLE_OWNER');
    const { cookie } = await login(ctx, email);
    await ctx.prisma.refreshToken.updateMany({ where: { user: { email } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await post('/auth/refresh').set(CSRF).set('Cookie', cookie).expect(401);
  });

  it('logout revokes the session and clears the cookie', async () => {
    const { email } = await createUser(ctx, 'VEHICLE_OWNER');
    const { cookie } = await login(ctx, email);
    const res = await post('/auth/logout').set(CSRF).set('Cookie', cookie).expect(204);
    expect(([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]).toMatch(/qp_rt=;/);
    await post('/auth/refresh').set(CSRF).set('Cookie', cookie).expect(401);
  });
});

describe('forgot / reset password', () => {
  it('does not reveal whether the email exists', async () => {
    const { email } = await createUser(ctx, 'VEHICLE_OWNER');
    const a = await post('/auth/forgot-password', { email }).expect(200);
    const b = await post('/auth/forgot-password', { email: uniqueEmail('ghost') }).expect(200);
    expect(a.body).toEqual(b.body);
  });

  it('resets once, revokes all sessions, and the new password works', async () => {
    const { email } = await createUser(ctx, 'PARKING_OWNER');
    const { cookie } = await login(ctx, email);
    await post('/auth/forgot-password', { email }).expect(200);
    const token = CaptureMailTransport.tokenFrom(await ctx.mail.waitFor(email, /Reset/));

    await post('/auth/reset-password', { token, password: 'short' }).expect(400);
    await post('/auth/reset-password', { token, password: 'brand-new-pass' }).expect(200);
    await post('/auth/reset-password', { token, password: 'another-pass-1' }).expect(400);

    await post('/auth/refresh').set(CSRF).set('Cookie', cookie).expect(401);
    await post('/auth/login', { email, password: PASSWORD }).expect(401);
    await login(ctx, email, 'brand-new-pass');
  });

  it('reset link expires after 30 minutes', async () => {
    const { email } = await createUser(ctx, 'VEHICLE_OWNER');
    await post('/auth/forgot-password', { email }).expect(200);
    const token = CaptureMailTransport.tokenFrom(await ctx.mail.waitFor(email, /Reset/));
    const row = await ctx.prisma.emailToken.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });
    const ttlMin = (row.expiresAt.getTime() - row.createdAt.getTime()) / 60000;
    expect(Math.round(ttlMin)).toBe(30);
    await ctx.prisma.emailToken.update({ where: { id: row.id }, data: { expiresAt: new Date(Date.now() - 1) } });
    await post('/auth/reset-password', { token, password: 'brand-new-pass' }).expect(400);
  });
});

describe('Google sign-in + choose-role', () => {
  it('rejects invalid or unverified Google tokens', async () => {
    const res = await post('/auth/google', { idToken: 'garbage-token-value' }).expect(401);
    expect(res.body.error.code).toBe('GOOGLE_TOKEN_INVALID');
    await post('/auth/google', { idToken: googleToken('sub-x', uniqueEmail(), false) }).expect(401);
  });

  it('creates a role-less user who must choose a role before using role-gated routes', async () => {
    const email = uniqueEmail('g');
    const res = await post('/auth/google', { idToken: googleToken('sub-new-1', email) }).expect(200);
    expect(res.body.needsRole).toBe(true);
    expect(res.body.user).toMatchObject({ email, role: null, emailVerified: true, hasPassword: false });
    const token = res.body.accessToken as string;

    await ctx.http().get(`${API}/me`).set(bearer(token)).expect(200);
    const gated = await post('/admin/invite', { email: uniqueEmail() }).set(bearer(token)).expect(403);
    expect(gated.body.error.code).toBe('ROLE_REQUIRED');

    await post('/auth/choose-role', { role: 'SUPER_ADMIN' }).set(bearer(token)).expect(400);
    const chosen = await post('/auth/choose-role', { role: 'PARKING_OWNER' }).set(bearer(token)).expect(200);
    expect(chosen.body.user.role).toBe('PARKING_OWNER');
    const again = await post('/auth/choose-role', { role: 'VEHICLE_OWNER' }).set(bearer(token)).expect(409);
    expect(again.body.error.code).toBe('ROLE_ALREADY_SET');

    // Same Google account signs in again -> same user, no role prompt
    const second = await post('/auth/google', { idToken: googleToken('sub-new-1', email) }).expect(200);
    expect(second.body.user.id).toBe(res.body.user.id);
    expect(second.body.needsRole).toBe(false);
  });

  it('links Google to an existing verified account and keeps its password', async () => {
    const user = await createUser(ctx, 'VEHICLE_OWNER');
    const res = await post('/auth/google', { idToken: googleToken('sub-link-1', user.email) }).expect(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user.hasPassword).toBe(true);
    expect(await ctx.prisma.authAccount.count({ where: { userId: user.id } })).toBe(1);
  });

  it('on an unverified account, Google proves ownership: password dropped, sessions revoked', async () => {
    const email = uniqueEmail('squat');
    await post('/auth/register', { name: 'Squatter', email, password: PASSWORD, role: 'VEHICLE_OWNER' }).expect(201);
    const res = await post('/auth/google', { idToken: googleToken('sub-owner-1', email) }).expect(200);
    expect(res.body.user).toMatchObject({ email, emailVerified: true, hasPassword: false });
    await post('/auth/login', { email, password: PASSWORD }).expect(401);
  });
});

describe('profile + access control', () => {
  it('401 without token, 401 with tampered token', async () => {
    await ctx.http().get(`${API}/me`).expect(401);
    const { email } = await createUser(ctx, 'VEHICLE_OWNER');
    const { accessToken } = await login(ctx, email);
    const tampered = accessToken.slice(0, -2) + (accessToken.endsWith('a') ? 'bb' : 'aa');
    await ctx.http().get(`${API}/me`).set(bearer(tampered)).expect(401);
  });

  it('PATCH /me validates and rejects unknown fields (no role escalation)', async () => {
    const { email } = await createUser(ctx, 'VEHICLE_OWNER');
    const { accessToken } = await login(ctx, email);
    await ctx.http().patch(`${API}/me`).set(bearer(accessToken)).send({ role: 'SUPER_ADMIN' }).expect(400);
    await ctx.http().patch(`${API}/me`).set(bearer(accessToken)).send({ phone: '12' }).expect(400);
    const ok = await ctx.http().patch(`${API}/me`).set(bearer(accessToken)).send({ name: 'New Name', phone: '+919876543210' }).expect(200);
    expect(ok.body).toMatchObject({ name: 'New Name', phone: '+919876543210', role: 'VEHICLE_OWNER' });
  });

  it('PATCH /me/password checks the current password and signs out other sessions', async () => {
    const { email } = await createUser(ctx, 'VEHICLE_OWNER');
    const a = await login(ctx, email);
    const b = await login(ctx, email);
    await ctx.http().patch(`${API}/me/password`).set(bearer(a.accessToken)).send({ currentPassword: 'wrong', newPassword: 'new-password-1' }).expect(400);
    const res = await ctx.http().patch(`${API}/me/password`).set(bearer(a.accessToken)).send({ currentPassword: PASSWORD, newPassword: 'new-password-1' }).expect(200);
    await post('/auth/refresh').set(CSRF).set('Cookie', b.cookie).expect(401);
    await post('/auth/refresh').set(CSRF).set('Cookie', refreshCookie(res)).expect(200);
    await login(ctx, email, 'new-password-1');
  });

  it('suspension takes effect immediately on existing access tokens', async () => {
    const user = await createUser(ctx, 'PARKING_OWNER');
    const { accessToken, cookie } = await login(ctx, user.email);
    await ctx.http().get(`${API}/me`).set(bearer(accessToken)).expect(200);
    await suspend(ctx, user.id);
    const res = await ctx.http().get(`${API}/me`).set(bearer(accessToken)).expect(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    await post('/auth/refresh').set(CSRF).set('Cookie', cookie).expect(401);
  });
});

describe('super admin invites', () => {
  it('only SUPER_ADMIN can invite', async () => {
    for (const role of ['VEHICLE_OWNER', 'PARKING_OWNER'] as const) {
      const { email } = await createUser(ctx, role);
      const { accessToken } = await login(ctx, email);
      const res = await post('/admin/invite', { email: uniqueEmail() }).set(bearer(accessToken)).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('invite -> accept -> logged in as SUPER_ADMIN; token single use; existing users cannot be invited', async () => {
    const admin = await createUser(ctx, 'SUPER_ADMIN');
    const { accessToken } = await login(ctx, admin.email);
    const existing = await createUser(ctx, 'VEHICLE_OWNER');
    const dup = await post('/admin/invite', { email: existing.email }).set(bearer(accessToken)).expect(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');

    const email = uniqueEmail('newadmin');
    await post('/admin/invite', { email }).set(bearer(accessToken)).expect(200);
    const token = CaptureMailTransport.tokenFrom(await ctx.mail.waitFor(email, /administrator/));

    // Pending invitee cannot log in or self-register with that email
    await post('/auth/login', { email, password: PASSWORD }).expect(401);
    await post('/auth/register', { name: 'Someone', email, password: PASSWORD, role: 'VEHICLE_OWNER' }).expect(409);

    const accepted = await post('/auth/accept-invite', { token, name: 'Ops Admin', password: PASSWORD }).expect(200);
    expect(accepted.body.user).toMatchObject({ email, role: 'SUPER_ADMIN', name: 'Ops Admin' });
    refreshCookie(accepted);
    await post('/auth/accept-invite', { token, name: 'Ops Admin', password: PASSWORD }).expect(400);

    const newAdmin = await login(ctx, email);
    await post('/admin/invite', { email: uniqueEmail() }).set(bearer(newAdmin.accessToken)).expect(200);
  });
});

describe('platform', () => {
  it('health is public', async () => {
    const res = await ctx.http().get(`${API}/health`).expect(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up', redis: 'up' });
  });

  it('serves the OpenAPI document with zod-derived bodies', async () => {
    const res = await ctx.http().get('/api/docs-json').expect(200);
    const register = res.body.paths['/api/v1/auth/register'].post;
    expect(register.requestBody.content['application/json'].schema.properties).toHaveProperty('email');
  });
});
