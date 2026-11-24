import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type CookieOptions, type Request, type Response } from 'express';
import { type Env } from '../config/env';
import { type IssuedSession } from './session.service';

const NAME = 'qp_rt';
/** Native apps have no cookie jar: they send this header and keep the refresh token in secure storage instead. */
export const MOBILE_CLIENT_HEADER = 'x-qp-client';
const isMobile = (req: Request | undefined) => req?.headers[MOBILE_CLIENT_HEADER] === 'mobile';

/** The httpOnly refresh-token cookie. Path-scoped so it is only ever sent to /api/v1/auth/*. */
@Injectable()
export class RefreshCookieService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private options(expires?: Date): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: 'lax',
      path: '/api/v1/auth',
      expires,
    };
  }

  /** The refresh token: from the cookie (web) or, for the mobile app, from the JSON body `{ refreshToken }`. */
  read(req: Request): string | undefined {
    const v = (req.cookies as Record<string, unknown> | undefined)?.[NAME];
    if (typeof v === 'string') return v;
    const body = isMobile(req) ? (req.body as { refreshToken?: unknown } | undefined)?.refreshToken : undefined;
    return typeof body === 'string' ? body : undefined;
  }

  clear(res: Response) {
    res.clearCookie(NAME, this.options());
  }

  /**
   * Web: sets the httpOnly cookie and returns the access token + user, never the refresh token.
   * Mobile app (`X-QP-Client: mobile`): no cookie; the refresh token is returned for the app's secure storage.
   */
  respond(res: Response, s: IssuedSession) {
    const body = { accessToken: s.accessToken, expiresIn: s.expiresIn, user: s.user };
    if (isMobile(res.req)) return { ...body, refreshToken: s.refreshToken, refreshExpiresAt: s.refreshExpiresAt.toISOString() };
    res.cookie(NAME, s.refreshToken, this.options(s.refreshExpiresAt));
    return body;
  }
}
