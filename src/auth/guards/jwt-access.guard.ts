import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Add @UseGuards(JwtAccessGuard) to a route to require a valid ACCESS token.
 * The string 'jwt-access' matches the name given to JwtAccessStrategy.
 */
@Injectable()
export class JwtAccessGuard extends AuthGuard('jwt-access') {}
