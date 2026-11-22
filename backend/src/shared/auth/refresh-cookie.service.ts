import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type CookieOptions, type Request, type Response } from 'express';
import { type Env } from '../config/env';
import { type IssuedSession } from './session.service';

const NAME = 'qp_rt';

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

  read(req: Request): string | undefined {
    const v = (req.cookies as Record<string, unknown> | undefined)?.[NAME];
    return typeof v === 'string' ? v : undefined;
  }

  clear(res: Response) {
    res.clearCookie(NAME, this.options());
  }

  /** Sets the cookie and returns the client-facing body (access token + user, never the refresh token). */
  respond(res: Response, s: IssuedSession) {
    res.cookie(NAME, s.refreshToken, this.options(s.refreshExpiresAt));
    return { accessToken: s.accessToken, expiresIn: s.expiresIn, user: s.user };
  }
}
