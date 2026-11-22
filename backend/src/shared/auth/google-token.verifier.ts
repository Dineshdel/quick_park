import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { AppException } from '../http/app-exception';
import { type Env } from '../config/env';

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

/** Verifies a Google Identity Services ID token server-side (signature, audience, expiry, issuer). */
@Injectable()
export class GoogleTokenVerifier {
  private readonly client = new OAuth2Client();

  constructor(private readonly config: ConfigService<Env, true>) {}

  async verify(idToken: string): Promise<GoogleProfile> {
    const audience = this.config.get('GOOGLE_CLIENT_ID', { infer: true });
    if (!audience) {
      throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, 'INTERNAL', 'Google sign-in is not configured');
    }
    let payload;
    try {
      payload = (await this.client.verifyIdToken({ idToken, audience })).getPayload();
    } catch {
      payload = undefined;
    }
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'GOOGLE_TOKEN_INVALID', 'Google sign-in failed');
    }
    const email = payload.email.toLowerCase();
    return { sub: payload.sub, email, name: payload.name ?? email.split('@')[0]!, picture: payload.picture };
  }
}
