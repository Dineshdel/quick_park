import { type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

const BY_EMAIL = 'throttle:byEmail';
/** Key this route's rate limit on IP + submitted email (login), instead of IP only. */
export const ThrottleByEmailAndIp = () => SetMetadata(BY_EMAIL, true);

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>, context?: ExecutionContext): Promise<string> {
    const ip = (req.ip as string | undefined) ?? 'unknown';
    const byEmail =
      context && this.reflector.getAllAndOverride<boolean>(BY_EMAIL, [context.getHandler(), context.getClass()]);
    if (!byEmail) return ip;
    const body = req.body as { email?: unknown } | undefined;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    return `${ip}|${email}`;
  }
}
