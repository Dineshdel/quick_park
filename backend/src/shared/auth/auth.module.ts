import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { type Env } from '../config/env';
import { AuthCacheService } from './auth-cache.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailTokenService } from './email-token.service';
import { GoogleTokenVerifier } from './google-token.verifier';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PasswordService } from './password.service';
import { RefreshCookieService } from './refresh-cookie.service';
import { SessionService } from './session.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: { algorithm: 'HS256' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthCacheService,
    EmailTokenService,
    GoogleTokenVerifier,
    PasswordService,
    RefreshCookieService,
    SessionService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [AuthService, AuthCacheService, EmailTokenService, PasswordService, RefreshCookieService, SessionService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
