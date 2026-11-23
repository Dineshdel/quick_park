import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { LoggerModule } from 'nestjs-pino';
// ---- one folder per user type ----
import { AdminModule } from './admin/admin.module';
import { ParkingOwnerModule } from './parking-owner/parking-owner.module';
import { VehicleOwnerModule } from './vehicle-owner/vehicle-owner.module';
// ---- shared by all users ----
import { AuthModule } from './shared/auth/auth.module';
import { JwtAuthGuard } from './shared/auth/guards/jwt-auth.guard';
import { RolesGuard } from './shared/auth/guards/roles.guard';
import { MINUTE } from './shared/auth/token.util';
import { AllExceptionsFilter } from './shared/http/filters/all-exceptions.filter';
import { AppThrottlerGuard } from './shared/http/throttle/app-throttler.guard';
import { RedisThrottlerStorage } from './shared/http/throttle/redis-throttler.storage';
import { type Env, validateEnv } from './shared/config/env';
import { HealthController } from './shared/health/health.controller';
import { MailModule } from './shared/mail/mail.module';
import { PrismaModule } from './shared/database/prisma.module';
import { REDIS, RedisModule, redisOptionsFromUrl } from './shared/redis/redis.module';
import { ProfileModule } from './shared/profile/profile.module';
import { MastersModule } from './shared/masters/masters.module';
import { EnginesModule } from './shared/engines.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv, envFilePath: ['.env', '../.env'] }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const env = config.get('NODE_ENV', { infer: true });
        return {
          pinoHttp: {
            level: env === 'test' ? 'silent' : env === 'production' ? 'info' : 'debug',
            transport: env === 'development' ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
            redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
          },
        };
      },
    }),
    PrismaModule,
    RedisModule,
    ThrottlerModule.forRootAsync({
      inject: [REDIS],
      useFactory: (redis: Redis) => ({
        // Generous global default; sensitive routes override with @Throttle.
        throttlers: [{ name: 'default', ttl: MINUTE, limit: 300 }],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: redisOptionsFromUrl(config.get('REDIS_URL', { infer: true })),
        prefix: 'qp',
      }),
    }),
    MailModule,
    AuthModule,
    ProfileModule,
    MastersModule,
    EnginesModule,
    // One module per user type
    AdminModule,
    ParkingOwnerModule,
    VehicleOwnerModule,
  ],
  controllers: [HealthController],
  providers: [
    // Guard order matters: rate limit → authenticate → authorise.
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
