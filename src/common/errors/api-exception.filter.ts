import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client';
import { ApiErrorBody, ApiErrorCode } from './api-error';

/**
 * The single place every API failure is turned into a response.
 *
 * Before this existed, a failure could reach the PWA in several different
 * shapes (`{message: string}`, `{message: string[]}`, an empty body for a
 * crash), with nothing to distinguish "your password is wrong" from "the
 * database is down" — so the app showed one vague sentence for all of them and
 * the real cause was invisible. Now:
 *
 *   - every failure answers with the SAME JSON envelope (see ApiErrorBody),
 *   - it always carries a stable `code` the client can branch on,
 *   - it always carries a `requestId` that also appears in the server log,
 *   - 5xx details stay in the log; the client gets a safe generic message.
 *
 * Registered globally in main.ts. Controller-scoped filters still win over it,
 * so the /admin panel keeps redirecting HTML visitors to its login page
 * (see AdminAuthFilter) instead of answering them with JSON.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiError');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const { status, code, message, details } = this.describe(exception);

    // A streamed response (a PDF download, the SSE news stream) may already
    // have started. Writing a JSON body on top would corrupt it, so all we can
    // do is log and drop the connection.
    if (res.headersSent) {
      this.log(status, code, req, exception);
      res.end();
      return;
    }

    const body: ApiErrorBody = {
      statusCode: status,
      code,
      message,
      requestId: req.requestId ?? 'unknown',
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    };
    if (details?.length) body.details = details;

    const retryAfter = this.retryAfterSeconds(res);
    if (retryAfter) {
      // Re-publish under the STANDARD header name (see retryAfterSeconds) and
      // in the body, so the app can tell the student exactly how long to wait
      // instead of guessing.
      res.setHeader('Retry-After', retryAfter);
      body.retryAfter = retryAfter;
    }

    this.log(status, code, req, exception);
    res.status(status).json(body);
  }

  // ---------------------------------------------------------------------------
  // Classification
  // ---------------------------------------------------------------------------

  private describe(exception: unknown): {
    status: number;
    code: ApiErrorCode;
    message: string;
    details?: string[];
  } {
    if (exception instanceof ThrottlerException) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: ApiErrorCode.RATE_LIMITED,
        message: 'Too many requests. Please slow down and try again.',
      };
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    const prisma = this.fromPrisma(exception);
    if (prisma) return prisma;

    // express/body-parser style errors: plain objects carrying a status.
    const httpish = this.statusOf(exception);
    if (httpish && httpish < 500) {
      return {
        status: httpish,
        code: this.codeForStatus(httpish),
        message: 'The request could not be processed.',
      };
    }

    // Anything left is a genuine bug. The details go to the log, never here.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ApiErrorCode.INTERNAL_ERROR,
      message: 'Something went wrong on our side.',
    };
  }

  /** Unpack a Nest HttpException, whose body may be a string, array, or object. */
  private fromHttpException(exception: HttpException): {
    status: number;
    code: ApiErrorCode;
    message: string;
    details?: string[];
  } {
    // getStatus() is typed `number`; narrowing it to the enum keeps the
    // comparisons below type-safe.
    const status = exception.getStatus();
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return { status, code: this.codeForStatus(status), message: response };
    }

    const bag = response as {
      code?: unknown;
      message?: unknown;
      details?: unknown;
    };

    // The global ValidationPipe reports every broken rule as a string array —
    // that's the one case where per-field detail is genuinely useful to show.
    const rawMessage = bag.message;
    const details = Array.isArray(rawMessage)
      ? rawMessage.filter((m): m is string => typeof m === 'string')
      : Array.isArray(bag.details)
        ? bag.details.filter((m): m is string => typeof m === 'string')
        : undefined;

    const isValidationError =
      Array.isArray(rawMessage) && status === Number(HttpStatus.BAD_REQUEST);

    const message =
      typeof rawMessage === 'string'
        ? rawMessage
        : (details?.[0] ?? exception.message);

    const code =
      typeof bag.code === 'string'
        ? (bag.code as ApiErrorCode)
        : isValidationError
          ? ApiErrorCode.VALIDATION_FAILED
          : this.codeForStatus(status);

    return { status, code, message, details };
  }

  /**
   * Database failures deserve their own treatment: "the connection pool is
   * exhausted" is an infrastructure problem the client should RETRY, while a
   * unique-constraint violation is the caller's fault. Collapsing both into a
   * blank 500 is exactly what made the original bug so hard to chase.
   */
  private fromPrisma(exception: unknown): {
    status: number;
    code: ApiErrorCode;
    message: string;
  } | null {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': // unique constraint
          return {
            status: HttpStatus.CONFLICT,
            code: ApiErrorCode.CONFLICT,
            message: 'That value is already taken.',
          };
        case 'P2025': // record required but not found
          return {
            status: HttpStatus.NOT_FOUND,
            code: ApiErrorCode.NOT_FOUND,
            message: 'The requested record no longer exists.',
          };
        case 'P2024': // timed out fetching a connection from the pool
        case 'P1001': // can't reach the database server
        case 'P1002': // database timed out
        case 'P1008': // operation timed out
        case 'P1017': // server closed the connection
          return {
            status: HttpStatus.SERVICE_UNAVAILABLE,
            code: ApiErrorCode.DATABASE_UNAVAILABLE,
            message: 'The database is unavailable. Please retry shortly.',
          };
        default:
          return null; // fall through to a logged 500
      }
    }

    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: ApiErrorCode.DATABASE_UNAVAILABLE,
        message: 'The database is unavailable. Please retry shortly.',
      };
    }

    return null;
  }

  /**
   * How long the client must wait, in seconds — or 0 if this isn't a rate-limit
   * rejection.
   *
   * ThrottlerGuard sets the header itself, but it SUFFIXES the name with the
   * throttler that tripped: our per-account limit produces `Retry-After-identity`,
   * which no HTTP client understands and which the browser won't even reveal to
   * JavaScript. So we collect whatever `retry-after*` headers are present, take
   * the longest wait, and republish it under the real name.
   */
  private retryAfterSeconds(res: Response): number {
    let longest = 0;
    for (const name of res.getHeaderNames()) {
      if (!name.toLowerCase().startsWith('retry-after')) continue;
      const seconds = Number(res.getHeader(name));
      if (Number.isFinite(seconds) && seconds > longest) longest = seconds;
    }
    return longest;
  }

  private statusOf(exception: unknown): number | null {
    if (typeof exception !== 'object' || exception === null) return null;
    const bag = exception as { status?: unknown; statusCode?: unknown };
    const raw = bag.status ?? bag.statusCode;
    return typeof raw === 'number' && raw >= 400 && raw <= 599 ? raw : null;
  }

  private codeForStatus(status: HttpStatus): ApiErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ApiErrorCode.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return ApiErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ApiErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ApiErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ApiErrorCode.CONFLICT;
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return ApiErrorCode.PAYLOAD_TOO_LARGE;
      case HttpStatus.UNSUPPORTED_MEDIA_TYPE:
        return ApiErrorCode.UNSUPPORTED_MEDIA_TYPE;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ApiErrorCode.RATE_LIMITED;
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ApiErrorCode.DATABASE_UNAVAILABLE;
      default:
        return Number(status) >= 500
          ? ApiErrorCode.INTERNAL_ERROR
          : ApiErrorCode.BAD_REQUEST;
    }
  }

  // ---------------------------------------------------------------------------
  // Logging
  // ---------------------------------------------------------------------------

  /**
   * One line per failure, always including the requestId so a student's screen
   * and this log can be matched up. Server faults (5xx) also get the stack —
   * they're bugs and you need it. Expected client errors (401 on a typo'd
   * password) stay one quiet line so the log doesn't drown in noise.
   */
  private log(
    status: number,
    code: ApiErrorCode,
    req: Request,
    exception: unknown,
  ): void {
    const who = req.ip ?? 'unknown-ip';
    const line = `${status} ${code} ${req.method} ${req.originalUrl} ip=${who} rid=${req.requestId ?? '-'}`;

    if (status >= 500) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(line, stack ?? String(exception));
      return;
    }
    if (status === Number(HttpStatus.TOO_MANY_REQUESTS)) {
      // Worth a warning: if legitimate students trip this, the limits or the
      // client-IP detection (TRUST_PROXY) need attention.
      this.logger.warn(line);
      return;
    }
    this.logger.debug?.(line);
  }
}
