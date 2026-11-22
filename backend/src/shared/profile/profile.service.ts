import { HttpStatus, Injectable } from '@nestjs/common';
import { type ChangePasswordInput, type UpdateProfileInput } from '@qp/validation';
import { PasswordService } from '../auth/password.service';
import { type RequestContext } from '../auth/auth.types';
import { SessionService } from '../auth/session.service';
import { AppException, Errors } from '../http/app-exception';
import { PrismaService } from '../database/prisma.service';
import { toPublicUser } from './public-user';

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
  ) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Errors.notFound('User');
    return toPublicUser(user);
  }

  async updateMe(userId: string, input: UpdateProfileInput) {
    return toPublicUser(await this.prisma.user.update({ where: { id: userId }, data: input }));
  }

  /**
   * Changes (or, for Google-only accounts, sets) the password. Signs out every session,
   * then starts a fresh one for the caller.
   */
  async changePassword(userId: string, input: ChangePasswordInput, ctx: RequestContext) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.passwordHash) {
      const ok = !!input.currentPassword && (await this.passwords.verify(user.passwordHash, input.currentPassword));
      if (!ok) throw new AppException(HttpStatus.BAD_REQUEST, 'INVALID_CREDENTIALS', 'Current password is incorrect');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.passwords.hash(input.newPassword) },
    });
    await this.sessions.revokeAllForUser(userId);
    return this.sessions.issue(updated, ctx);
  }
}
