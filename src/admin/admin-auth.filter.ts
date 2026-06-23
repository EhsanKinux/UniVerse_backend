import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * The admin panel is a set of HTML pages, so an auth failure should send the
 * visitor to the login screen — not return a JSON 401. This filter catches the
 * UnauthorizedException thrown by AdminGuard and issues that redirect.
 */
@Catch(UnauthorizedException)
export class AdminAuthFilter implements ExceptionFilter {
  catch(_exception: UnauthorizedException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.redirect('/admin/login');
  }
}
