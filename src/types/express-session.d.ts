import 'express-session';

/**
 * Teach TypeScript about the custom fields we store on the session. After a
 * successful admin login we set `req.session.isAdmin = true`; this augmentation
 * makes that property type-safe everywhere (the guard, the controller).
 */
declare module 'express-session' {
  interface SessionData {
    isAdmin?: boolean;
  }
}
