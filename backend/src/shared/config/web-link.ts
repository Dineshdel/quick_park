import { type ConfigService } from '@nestjs/config';
import { type Env } from './env';

/** Absolute link to a frontend page (used in emails), e.g. webLink(config, '/verify-email', token). */
export function webLink(config: ConfigService<Env, true>, path: string, token?: string): string {
  const base = config.get('WEB_ORIGINS', { infer: true })[0];
  return token ? `${base}${path}?token=${encodeURIComponent(token)}` : `${base}${path}`;
}
