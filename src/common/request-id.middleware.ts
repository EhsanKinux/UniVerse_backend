import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

/** Header used both to accept an upstream id and to hand ours back. */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Stamp every request with a short correlation id.
 *
 * The point is turning "a student says login is broken" into something you can
 * actually investigate. The PWA shows this id under the error message, so the
 * student can read it out and you can find the exact server log line:
 *
 *     grep 8f3c1a2b logs/api.log
 *
 * If a reverse proxy (Caddy/nginx/Cloudflare) already assigned an id we keep
 * it, so one id follows the request across every hop. Untrusted input is capped
 * and sanitised — it ends up in a response header and in log lines, and a
 * header value containing a newline is a log-injection vector.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const cleaned = candidate?.replace(/[^\w.-]/g, '').slice(0, 64);

  req.requestId = cleaned || randomUUID().replace(/-/g, '').slice(0, 12);
  res.setHeader('X-Request-Id', req.requestId);
  next();
}
