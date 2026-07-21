import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiErrorCode } from '../../common/errors/api-error';

/**
 * Add @UseGuards(JwtAccessGuard) to a route to require a valid ACCESS token.
 * The string 'jwt-access' matches the name given to JwtAccessStrategy.
 */
@Injectable()
export class JwtAccessGuard extends AuthGuard('jwt-access') {
  /**
   * Passport hands us the raw reason a token was rejected; by default Nest
   * throws that away and answers a bare 401 "Unauthorized". One status hides
   * three VERY different situations, and the app must react to each differently:
   *
   *   TOKEN_EXPIRED  the normal 15-minute rollover → refresh silently, the
   *                  student should never notice anything.
   *   TOKEN_INVALID  the signature doesn't verify. In practice that means
   *                  JWT_ACCESS_SECRET changed — a redeploy with fresh secrets
   *                  invalidates every token in existence, which is a real
   *                  operational cause of "everyone got logged out today".
   *   TOKEN_MISSING  no Authorization header arrived at all.
   *
   * Attaching the code costs nothing and turns a mystery into a diagnosis.
   */
  handleRequest<TUser>(
    err: unknown,
    user: TUser | false,
    info: unknown,
  ): TUser {
    if (user) return user;
    if (err instanceof Error) throw err;

    const name = info instanceof Error ? info.name : '';
    const reason = info instanceof Error ? info.message : 'no credentials';

    if (name === 'TokenExpiredError') {
      throw new UnauthorizedException({
        code: ApiErrorCode.TOKEN_EXPIRED,
        message: 'Access token has expired.',
      });
    }
    if (name === 'JsonWebTokenError') {
      throw new UnauthorizedException({
        code: ApiErrorCode.TOKEN_INVALID,
        message: `Access token is not valid: ${reason}`,
      });
    }
    throw new UnauthorizedException({
      code: ApiErrorCode.TOKEN_MISSING,
      message: 'No access token was provided.',
    });
  }
}
