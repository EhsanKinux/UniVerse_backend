import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { resolveClientIp } from './client-ip.util';

/**
 * The global rate-limit guard, with two corrections to the stock behaviour.
 *
 * 1. `getTracker` normalises the client address (see resolveClientIp), so an
 *    IPv4 client isn't counted twice under `1.2.3.4` and `::ffff:1.2.3.4`.
 * 2. CORS preflights are skipped. The browser sends an automatic `OPTIONS`
 *    before every cross-origin POST — counting those would halve every limit,
 *    and a throttled preflight fails in the browser as an opaque "network
 *    error" with no status at all, which is the most confusing possible way for
 *    a rate limit to surface.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(`ip:${resolveClientIp(req as unknown as Request)}`);
  }

  protected shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return Promise.resolve(true);
    const req = context.switchToHttp().getRequest<Request>();
    return Promise.resolve(req.method === 'OPTIONS');
  }
}
