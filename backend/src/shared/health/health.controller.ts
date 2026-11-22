import { Controller, Get, HttpStatus, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type Redis from 'ioredis';
import { AppException } from '../http/app-exception';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../database/prisma.service';
import { REDIS } from '../redis/redis.module';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Public()
  @Get()
  async check() {
    const [db, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => 'up', () => 'down'),
      this.redis.ping().then(() => 'up', () => 'down'),
    ]);
    if (db !== 'up' || redis !== 'up') {
      throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, 'INTERNAL', 'Dependency down', { db, redis });
    }
    return { status: 'ok', db, redis };
  }
}
