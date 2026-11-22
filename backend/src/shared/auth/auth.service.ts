import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type SelfServiceRole } from '@qp/types';
import { type LoginInput, type RegisterInput, type ResetPasswordInput } from '@qp/validation';
import { AppException, Errors } from '../http/app-exception';
import { type Env } from '../config/env';
import { webLink } from '../config/web-link';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../database/prisma.service';
import { toPublicUser } from '../profile/public-user';
import { assertActive } from './assert-active';
import { AuthCacheService } from './auth-cache.service';
import { type RequestContext } from './auth.types';
import { EmailTokenService } from './email-token.service';
import { GoogleTokenVerifier } from './google-token.verifier';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { HOUR, MINUTE } from './token.util';

export const VERIFY_TTL = 24 * HOUR;
export const RESET_TTL = 30 * MINUTE;

const invalidCredentials = () =>
  new AppException(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Incorrect email or password');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly emailTokens: EmailTokenService,
    private readonly google: GoogleTokenVerifier,
    private readonly mail: MailService,
    private readonly authCache: AuthCacheService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private link(path: string, token?: string) {
    return webLink(this.config, path, token);
  }

  // ---------- email + password ----------

  async register(input: RegisterInput) {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (exists) throw Errors.conflict('EMAIL_TAKEN', 'An account with this email already exists');

    const passwordHash = await this.passwords.hash(input.password);
    const { user, token } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name: input.name, email: input.email, passwordHash, role: input.role },
      });
      const token = await this.emailTokens.create(user.id, 'VERIFY_EMAIL', VERIFY_TTL, tx);
      return { user, token };
    });
    await this.mail.send(user.email, 'verifyEmail', { name: user.name, link: this.link('/verify-email', token) });
    return { message: 'Check your email to verify your account' };
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.$transaction(async (tx) => {
      const userId = await this.emailTokens.consume(token, 'VERIFY_EMAIL', tx);
      return tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    });
    await this.mail.send(user.email, 'welcome', { name: user.name, link: this.link('/login') });
    return { message: 'Email verified, you can now sign in' };
  }

  /** Always succeeds (no account enumeration). */
  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && !user.emailVerifiedAt && user.passwordHash && user.status === 'ACTIVE') {
      const token = await this.emailTokens.create(user.id, 'VERIFY_EMAIL', VERIFY_TTL);
      await this.mail.send(user.email, 'verifyEmail', { name: user.name, link: this.link('/verify-email', token) });
    }
    return { message: 'If that account needs verification, we sent a new link' };
  }

  async login(input: LoginInput, ctx: RequestContext) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const ok = await this.passwords.verify(user?.passwordHash, input.password);
    if (!user || !ok) throw invalidCredentials();
    if (!user.emailVerifiedAt) {
      throw new AppException(HttpStatus.FORBIDDEN, 'EMAIL_NOT_VERIFIED', 'Verify your email before signing in');
    }
    assertActive(user);
    return this.sessions.issue(user, ctx);
  }

  /** Always succeeds (no account enumeration). Google-only users may use this to add a password. */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && user.status === 'ACTIVE') {
      const token = await this.emailTokens.create(user.id, 'RESET_PASSWORD', RESET_TTL);
      await this.mail.send(user.email, 'resetPassword', { name: user.name, link: this.link('/reset-password', token) });
    }
    return { message: 'If an account exists for that email, we sent a reset link' };
  }

  async resetPassword(input: ResetPasswordInput) {
    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const userId = await this.emailTokens.consume(input.token, 'RESET_PASSWORD', tx);
      const current = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      return tx.user.update({
        where: { id: userId },
        // Following the emailed link proves ownership of the address.
        data: { passwordHash, emailVerifiedAt: current.emailVerifiedAt ?? new Date() },
      });
    });
    await this.sessions.revokeAllForUser(user.id);
    return { message: 'Password updated, please sign in' };
  }

  // ---------- Google ----------

  async loginWithGoogle(idToken: string, ctx: RequestContext) {
    const profile = await this.google.verify(idToken);

    const linked = await this.prisma.authAccount.findUnique({
      where: { provider_providerUserId: { provider: 'GOOGLE', providerUserId: profile.sub } },
      include: { user: true },
    });
    let user = linked?.user;

    if (!user) {
      const byEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });
      if (byEmail) {
        // Link Google to the existing account. If that account never verified its email, someone else
        // may have registered it: Google has now proven ownership, so drop the unverified password
        // and any sessions (prevents pre-account-takeover).
        const unverified = !byEmail.emailVerifiedAt;
        user = await this.prisma.$transaction(async (tx) => {
          await tx.authAccount.create({
            data: { userId: byEmail.id, provider: 'GOOGLE', providerUserId: profile.sub },
          });
          return tx.user.update({
            where: { id: byEmail.id },
            data: {
              emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
              avatarUrl: byEmail.avatarUrl ?? profile.picture,
              ...(unverified ? { passwordHash: null } : {}),
            },
          });
        });
        if (unverified) await this.sessions.revokeAllForUser(user.id);
      } else {
        user = await this.prisma.user.create({
          data: {
            name: profile.name,
            email: profile.email,
            emailVerifiedAt: new Date(),
            avatarUrl: profile.picture,
            authAccounts: { create: { provider: 'GOOGLE', providerUserId: profile.sub } },
          },
        });
      }
    }

    assertActive(user);
    const session = await this.sessions.issue(user, ctx);
    return { ...session, needsRole: user.role === null };
  }

  /** One-time role choice after the first Google sign-in. */
  async chooseRole(userId: string, role: SelfServiceRole) {
    const { count } = await this.prisma.user.updateMany({ where: { id: userId, role: null }, data: { role } });
    if (count === 0) throw Errors.conflict('ROLE_ALREADY_SET', 'Account type is already set');
    await this.authCache.invalidate(userId);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      accessToken: await this.sessions.signAccess(user),
      expiresIn: this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true }),
      user: toPublicUser(user),
    };
  }
}
