import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * Protects the admin pages. If the current session isn't logged in, we throw
 * UnauthorizedException — which AdminAuthFilter turns into a redirect to the
 * login page (rather than a bare 401).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.session?.isAdmin) {
      return true;
    }
    throw new UnauthorizedException();
  }
}
