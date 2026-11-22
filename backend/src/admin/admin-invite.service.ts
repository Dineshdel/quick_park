import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type AcceptInviteInput } from '@qp/validation';
import { assertActive } from '../shared/auth/assert-active';
import { AuthCacheService } from '../shared/auth/auth-cache.service';
import { type RequestContext } from '../shared/auth/auth.types';
import { EmailTokenService } from '../shared/auth/email-token.service';
import { PasswordService } from '../shared/auth/password.service';
import { SessionService } from '../shared/auth/session.service';
import { DAY } from '../shared/auth/token.util';
import { type Env } from '../shared/config/env';
import { webLink } from '../shared/config/web-link';
import { PrismaService } from '../shared/database/prisma.service';
import { Errors } from '../shared/http/app-exception';
import { MailService } from '../shared/mail/mail.service';

export const INVITE_TTL = 3 * DAY;

/**
 * Super admins are never self-registered: an existing admin invites them by email, and they
 * finish setup (name + password) through the emailed link.
 */
@Injectable()
export class AdminInviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly emailTokens: EmailTokenService,
    private readonly authCache: AuthCacheService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async invite(email: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    const isPendingInvite = existing?.role === 'SUPER_ADMIN' && !existing.passwordHash && !existing.emailVerifiedAt;
    if (existing && !isPendingInvite) throw Errors.conflict('EMAIL_TAKEN', 'An account with this email already exists');

    const token = await this.prisma.$transaction(async (tx) => {
      const user =
        existing ?? (await tx.user.create({ data: { email, name: email.split('@')[0]!, role: 'SUPER_ADMIN' } }));
      return this.emailTokens.create(user.id, 'ADMIN_INVITE', INVITE_TTL, tx);
    });
    await this.mail.send(email, 'adminInvite', { link: webLink(this.config, '/admin/accept-invite', token) });
    return { message: 'Invitation sent' };
  }

  async accept(input: AcceptInviteInput, ctx: RequestContext) {
    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const userId = await this.emailTokens.consume(input.token, 'ADMIN_INVITE', tx);
      return tx.user.update({
        where: { id: userId },
        data: { name: input.name, passwordHash, emailVerifiedAt: new Date() },
      });
    });
    assertActive(user);
    await this.authCache.invalidate(user.id);
    return this.sessions.issue(user, ctx);
  }
}
