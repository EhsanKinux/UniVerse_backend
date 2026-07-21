/**
 * Teach TypeScript about the field RequestIdMiddleware adds to every request.
 * `declare global` is how you extend Express's own `Request` interface — the
 * same trick as express-session.d.ts next door.
 */
declare global {
  namespace Express {
    interface Request {
      /** Short correlation id, echoed to the client as `X-Request-Id`. */
      requestId?: string;
    }
  }
}

export {};
