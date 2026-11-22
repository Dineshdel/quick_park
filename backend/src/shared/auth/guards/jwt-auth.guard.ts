import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { type Request } from 'express';
import { AppException, Errors } from '../../http/app-exception';
import { AuthCacheService } from '../auth-cache.service';
import { type JwtPayload } from '../auth.types';
import { IS_PUBLIC } from '../decorators/public.decorator';

/** Global guard: requires a valid Bearer access token unless the route is @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly authCache: AuthCacheService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw Errors.unauthenticated();

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, { algorithms: ['HS256'] });
    } catch {
      throw Errors.unauthenticated('Access token is invalid or expired');
    }

    const auth = await this.authCache.get(payload.sub);
    if (!auth) throw Errors.unauthenticated();
    if (auth.status !== 'ACTIVE') {
      throw new AppException(HttpStatus.FORBIDDEN, 'ACCOUNT_SUSPENDED', 'This account is suspended');
    }
    req.user = { id: payload.sub, role: auth.role };
    return true;
  }
}
