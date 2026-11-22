import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { type Request } from 'express';
import { Errors } from '../../http/app-exception';

export const CSRF_HEADER = 'x-qp-csrf';

/**
 * CSRF defence for the routes authenticated by the refresh cookie (/auth/refresh, /auth/logout).
 * Combined with SameSite=Lax: a cross-site form cannot set custom headers, and a cross-origin
 * fetch that sets one triggers a CORS preflight that only our web origins pass.
 */
@Injectable()
export class CsrfHeaderGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (req.headers[CSRF_HEADER] !== '1') throw Errors.forbidden('Missing CSRF header');
    return true;
  }
}
