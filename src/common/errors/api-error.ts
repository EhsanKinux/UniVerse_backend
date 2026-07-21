import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * The stable, machine-readable vocabulary of API failures.
 *
 * Why not just use HTTP status codes? Because a status is too coarse to act on.
 * Three different things all answer "401", and the app must treat them
 * differently:
 *   - INVALID_CREDENTIALS → "wrong email or password", stay on the sign-in form
 *   - TOKEN_EXPIRED       → silently refresh, the user shouldn't notice
 *   - REFRESH_REJECTED    → the session is genuinely over, sign out
 *
 * The frontend switches on `code` and renders its own Persian copy, so wording
 * can change on either side without breaking the other. `message` stays in
 * English: it's for logs and for developers, never shown raw to a student.
 */
export const ApiErrorCode = {
  // 400 / 422
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BAD_REQUEST: 'BAD_REQUEST',
  // 401
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_MISSING: 'TOKEN_MISSING',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  REFRESH_REJECTED: 'REFRESH_REJECTED',
  ACCOUNT_GONE: 'ACCOUNT_GONE',
  UNAUTHORIZED: 'UNAUTHORIZED',
  // 403
  FORBIDDEN: 'FORBIDDEN',
  WRONG_PASSWORD: 'WRONG_PASSWORD',
  // 404 / 409 / 413 / 415
  NOT_FOUND: 'NOT_FOUND',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  // 429
  RATE_LIMITED: 'RATE_LIMITED',
  // 5xx
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

/** The exact JSON body every failed API request returns. */
export interface ApiErrorBody {
  statusCode: number;
  /** Stable machine-readable cause — switch on THIS, not on the message. */
  code: ApiErrorCode;
  /** English, developer-facing. The PWA renders Persian from `code`. */
  message: string;
  /** Per-field validation problems, when the failure was a bad payload. */
  details?: string[];
  /** Seconds to wait before retrying — set on 429. */
  retryAfter?: number;
  /** Ties this response to the matching server log line. */
  requestId: string;
  path: string;
  timestamp: string;
}

/**
 * An HttpException that also carries an ApiErrorCode.
 *
 * NestJS's built-in exceptions (`UnauthorizedException` & co.) accept an object
 * as their body, so this is really just a typed, self-documenting way to build
 * one — `throw new ApiException(401, ApiErrorCode.INVALID_CREDENTIALS, '...')`
 * instead of remembering the shape by hand at every throw site.
 */
export class ApiException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: string[],
  ) {
    super({ code, message, details }, status);
  }
}
