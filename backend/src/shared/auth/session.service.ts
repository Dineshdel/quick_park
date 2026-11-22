import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { type User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppException } from '../http/app-exception';
import { type Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { toPublicUser } from '../profile/public-user';
import { type JwtPayload, type RequestContext } from './auth.types';
import { addMs, DAY, hashToken, randomToken } from './token.util';

export interface IssuedSession {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: ReturnType<typeof toPublicUser>;
}

const invalidRefresh = () =>
  new AppException(HttpStatus.UNAUTHORIZED, 'INVALID_TOKEN', 'Session expired, please sign in again');

/** Access JWT (short) + opaque rotating refresh token (stored hashed, grouped in families). */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get accessTtl() {
    return this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
  }
  private get refreshTtlMs() {
    return this.config.get('REFRESH_TTL_DAYS', { infer: true }) * DAY;
  }

  signAccess(user: Pick<User, 'id' | 'role'>) {
    const payload: JwtPayload = { sub: user.id, role: user.role };
    return this.jwt.signAsync(payload, { expiresIn: this.accessTtl });
  }

  /** New login: new refresh-token family. */
  async issue(user: User, ctx: RequestContext): Promise<IssuedSession> {
    const refreshToken = randomToken();
    const refreshExpiresAt = addMs(this.refreshTtlMs);
    await this.prisma.$transaction([
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          familyId: randomUUID(),
          tokenHash: hashToken(refreshToken),
          userAgent: ctx.userAgent,
          ip: ctx.ip,
          expiresAt: refreshExpiresAt,
        },
      }),
      this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    ]);
    return this.build(user, refreshToken, refreshExpiresAt);
  }

  /**
   * Rotate a refresh token. Presenting an already-rotated/revoked token is treated as theft:
   * the whole family (every device session descending from that login) is revoked.
   */
  async rotate(rawToken: string | undefined, ctx: RequestContext): Promise<IssuedSession> {
    if (!rawToken) throw invalidRefresh();
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true },
    });
    if (!existing) throw invalidRefresh();
    if (existing.revokedAt) {
      await this.revokeFamily(existing.familyId);
      throw invalidRefresh();
    }
    if (existing.expiresAt <= new Date() || existing.user.status !== 'ACTIVE') throw invalidRefresh();

    const refreshToken = randomToken();
    const refreshExpiresAt = addMs(this.refreshTtlMs);
    await this.prisma.$transaction(async (tx) => {
      const next = await tx.refreshToken.create({
        data: {
          userId: existing.userId,
          familyId: existing.familyId,
          tokenHash: hashToken(refreshToken),
          userAgent: ctx.userAgent,
          ip: ctx.ip,
          expiresAt: refreshExpiresAt,
        },
      });
      // Conditional update guards against two concurrent rotations of the same token.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: next.id },
      });
      if (count === 0) throw invalidRefresh();
    });
    return this.build(existing.user, refreshToken, refreshExpiresAt);
  }

  /** Logout: revoke the family of the presented token (this browser's session only). */
  async revokeByToken(rawToken: string | undefined) {
    if (!rawToken) return;
    const t = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (t) await this.revokeFamily(t.familyId);
  }

  revokeFamily(familyId: string) {
    return this.prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /** Password change/reset, suspension: sign out everywhere. */
  revokeAllForUser(userId: string) {
    return this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async build(user: User, refreshToken: string, refreshExpiresAt: Date): Promise<IssuedSession> {
    return {
      accessToken: await this.signAccess(user),
      expiresIn: this.accessTtl,
      refreshToken,
      refreshExpiresAt,
      user: toPublicUser(user),
    };
  }
}
