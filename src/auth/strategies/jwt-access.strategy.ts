import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import { AuthenticatedUser, JwtPayload } from '../types/jwt-payload.type';

/**
 * Validates the ACCESS token on protected routes.
 *
 * Passport (via passport-jwt) does the heavy lifting:
 *   1. reads the token from the "Authorization: Bearer <token>" header,
 *   2. verifies its signature with JWT_ACCESS_SECRET and checks it isn't expired,
 *   3. if valid, calls validate() below with the decoded payload.
 *
 * Whatever validate() returns is attached to `request.user`.
 * The 'jwt-access' name is what JwtAccessGuard references.
 */
@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt-access') {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // Make sure the user still exists (they could have been deleted after the
    // token was issued). If not, deny access.
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    return { id: user.id, email: user.email };
  }
}
