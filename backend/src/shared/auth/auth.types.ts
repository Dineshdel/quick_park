import { type Role } from '@qp/types';

/** What the JWT guard attaches to `req.user`. Role/status come from the DB (cached), not the token. */
export interface AuthUser {
  id: string;
  role: Role | null;
}

export interface JwtPayload {
  sub: string;
  role: Role | null;
}

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
