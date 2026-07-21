import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiErrorCode } from '../../common/errors/api-error';

/** Requires a valid REFRESH token. Used only on POST /auth/refresh. */
@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {
  /**
   * Same idea as JwtAccessGuard: report WHY the renewal failed. Every case here
   * means the same thing to the app — this session cannot be renewed, sign the
   * student out — but "expired after 7 days" and "signature no longer verifies"
   * call for completely different fixes on our side, so the log must say which.
   */
  handleRequest<TUser>(
    err: unknown,
    user: TUser | false,
    info: unknown,
  ): TUser {
    if (user) return user;
    if (err instanceof Error) throw err;

    const name = info instanceof Error ? info.name : '';
    const detail =
      name === 'TokenExpiredError'
        ? 'Refresh token has expired; the session is over.'
        : name === 'JsonWebTokenError'
          ? 'Refresh token signature is not valid.'
          : 'No refresh token was provided.';

    throw new UnauthorizedException({
      code: ApiErrorCode.REFRESH_REJECTED,
      message: detail,
    });
  }
}
