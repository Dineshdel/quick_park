import { Inject, Injectable } from '@nestjs/common';
import { type Role, type UserStatus } from '@qp/types';
import type Redis from 'ioredis';
import { PrismaService } from '../database/prisma.service';
import { REDIS } from '../redis/redis.module';

interface CachedAuth {
  role: Role | null;
  status: UserStatus;
}

const key = (userId: string) => `auth:user:${userId}`;
const TTL_SECONDS = 60;

/**
 * Role + status lookup for the JWT guard. Cached briefly in Redis; callers that change a user's
 * role or status must call invalidate() so suspensions take effect immediately.
 */
@Injectable()
export class AuthCacheService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async get(userId: string): Promise<CachedAuth | null> {
    const hit = await this.redis.get(key(userId));
    if (hit) return JSON.parse(hit) as CachedAuth;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, status: true } });
    if (!user) return null;
    await this.redis.set(key(userId), JSON.stringify(user), 'EX', TTL_SECONDS);
    return user;
  }

  async invalidate(userId: string) {
    await this.redis.del(key(userId));
  }
}
