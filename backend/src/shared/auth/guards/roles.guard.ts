import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Role } from '@qp/types';
import { type Request } from 'express';
import { AppException, Errors } from '../../http/app-exception';
import { IS_PUBLIC } from '../decorators/public.decorator';
import { ALLOW_NO_ROLE, ROLES } from '../decorators/roles.decorator';

/** Global guard (runs after JwtAuthGuard): enforces @Roles() and blocks role-less users by default. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const user = ctx.switchToHttp().getRequest<Request>().user;
    if (!user) throw Errors.unauthenticated();

    if (user.role === null) {
      if (this.reflector.getAllAndOverride<boolean>(ALLOW_NO_ROLE, targets)) return true;
      throw new AppException(HttpStatus.FORBIDDEN, 'ROLE_REQUIRED', 'Choose an account type first');
    }

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (roles?.length && !roles.includes(user.role)) throw Errors.forbidden();
    return true;
  }
}
