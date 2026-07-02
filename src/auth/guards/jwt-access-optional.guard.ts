import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Like JwtAccessGuard, but the token is OPTIONAL: a valid one attaches the user
 * to the request, while a missing/expired/invalid one just leaves it null —
 * the request itself always proceeds.
 *
 * Used on endpoints that serve everyone but personalise when they can, e.g.
 * POST /push/subscribe: an anonymous browser still gets news broadcasts, but a
 * logged-in one is linked to its user so personal reminders can find the device.
 */
@Injectable()
export class OptionalJwtAccessGuard extends AuthGuard('jwt-access') {
  // Passport calls this with whatever the strategy produced. The default
  // implementation throws on any error/missing user — overriding it to swallow
  // both is exactly what makes the guard "optional".
  handleRequest<TUser = unknown>(err: unknown, user: unknown): TUser {
    if (err || !user) return null as TUser;
    return user as TUser;
  }
}
