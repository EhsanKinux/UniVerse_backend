import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../types/jwt-payload.type';

/**
 * Validates the REFRESH token (used only by POST /auth/refresh).
 *
 * The key difference from the access strategy: `passReqToCallback: true` makes
 * validate() also receive the raw request. We pull the raw refresh-token string
 * back out of it and pass it along, because AuthService must compare that raw
 * token against the bcrypt hash stored in the database. That comparison is what
 * lets us rotate tokens and revoke sessions (logout).
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  validate(
    req: Request,
    payload: JwtPayload,
  ): JwtPayload & { refreshToken: string } {
    const authHeader = req.get('authorization') ?? '';
    const refreshToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is missing or malformed');
    }
    // This becomes request.user, so the controller can read `sub` + refreshToken.
    return { ...payload, refreshToken };
  }
}
