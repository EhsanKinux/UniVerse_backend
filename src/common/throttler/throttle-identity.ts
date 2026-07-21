import { applyDecorators, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { ThrottlerGetTrackerFunction } from '@nestjs/throttler';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { normalizeEmail } from '../normalize-email.decorator';
import { resolveClientIp } from './client-ip.util';

/**
 * ---------------------------------------------------------------------------
 * Rate limiting that can't punish the wrong person
 * ---------------------------------------------------------------------------
 * The obvious way to rate-limit a login endpoint is "N attempts per minute per
 * IP address". On a university campus that is actively harmful: hundreds of
 * students share a handful of public IPs through NAT, and behind a reverse
 * proxy they can even all appear as ONE address. A limit meant to stop a
 * password-guessing script then locks out an entire building — intermittently,
 * unpredictably, and with a message that makes no sense to the student.
 *
 * So we split the job in two:
 *
 *   - the `default` throttler stays per-IP but deliberately generous — it only
 *     exists to stop a flood, and is never the thing a real student hits;
 *   - the `identity` throttler (this file) keys on WHO/WHAT is being attacked
 *     — one account, one session, one device — so the limit follows the actual
 *     target instead of the network everyone happens to share.
 *
 * The identity throttler is inert unless a route opts in with
 * @ThrottleIdentity(), which is what `identityThrottleSkip` below checks.
 */

/** Name of the second throttler registered in AppModule. */
export const IDENTITY_THROTTLER = 'identity';

/** Marks a handler as having opted into the identity throttler. */
const IDENTITY_THROTTLE_ENABLED = 'throttler:identity-enabled';

export interface IdentityThrottleOptions {
  /** How many attempts are allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  ttl: number;
  /** How long to stay blocked after the limit trips (defaults to `ttl`). */
  blockDuration?: number;
  /** Derives the identity being protected from the request. */
  getTracker: ThrottlerGetTrackerFunction;
}

/**
 * Apply a per-identity rate limit to a route, e.g.
 *
 *   @ThrottleIdentity({ limit: 10, ttl: 5 * 60_000, getTracker: byAccountEmail })
 *
 * The route still carries the global per-IP backstop on top of this.
 */
export function ThrottleIdentity(
  options: IdentityThrottleOptions,
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(IDENTITY_THROTTLE_ENABLED, true),
    Throttle({ [IDENTITY_THROTTLER]: options }),
  );
}

/**
 * Wired into the module options as the identity throttler's `skipIf`, so it
 * costs nothing on the ~99% of routes that never opt in.
 */
export function identityThrottleSkip(context: ExecutionContext): boolean {
  if (context.getType() !== 'http') return true;
  return (
    Reflect.getMetadata(IDENTITY_THROTTLE_ENABLED, context.getHandler()) !==
    true
  );
}

// ---------------------------------------------------------------------------
// Trackers — "what identity is this request acting on?"
// ---------------------------------------------------------------------------

/** Short, non-reversible key. Raw tokens/endpoints must never become map keys. */
const fingerprint = (value: string): string =>
  createHash('sha256').update(value).digest('hex').slice(0, 32);

/**
 * Login: limit attempts against ONE ACCOUNT.
 *
 * This is the control that actually stops password guessing — an attacker
 * hammering student@uni.ac.ir is capped no matter how many IPs they rotate
 * through, and a student on campus Wi-Fi is unaffected by the 500 people
 * sharing their address.
 *
 * Guards run before pipes, so `req.body` here is the raw parsed JSON — the
 * DTO's normalisation hasn't happened yet and we must lowercase it ourselves,
 * or "Ali@x.com" and "ali@x.com" would get one bucket each.
 */
export const byAccountEmail: ThrottlerGetTrackerFunction = (req) => {
  const body = (req as Request).body as { email?: unknown } | undefined;
  const email =
    typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
  return email
    ? `account:${fingerprint(email)}`
    : `ip:${resolveClientIp(req as Request)}`;
};

/**
 * Refresh: limit per SESSION (the refresh token itself), not per IP.
 *
 * Every app open refreshes once, so a per-IP limit here is the single most
 * dangerous one in the app: behind a proxy it would cap the whole university at
 * N refreshes a minute, and a refused refresh reads to the client as "your
 * session ended" — mass random logouts. Keyed by token, one broken device can
 * only ever throttle itself.
 */
export const bySessionToken: ThrottlerGetTrackerFunction = (req) => {
  const header = (req as Request).headers?.authorization ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  return token
    ? `session:${fingerprint(token)}`
    : `ip:${resolveClientIp(req as Request)}`;
};

/**
 * Push subscribe/unsubscribe: limit per DEVICE.
 *
 * The push endpoint URL is unique per browser install, which makes it a perfect
 * identity here — and again avoids capping every student behind one IP, since
 * the PWA re-subscribes on every app open.
 */
export const byPushEndpoint: ThrottlerGetTrackerFunction = (req) => {
  const body = (req as Request).body as { endpoint?: unknown } | undefined;
  return typeof body?.endpoint === 'string'
    ? `push:${fingerprint(body.endpoint)}`
    : `ip:${resolveClientIp(req as Request)}`;
};

/**
 * Admin login: limit per USERNAME. Staff are few and often on the same office
 * network, so per-IP would have them locking each other out.
 */
export const byAdminUsername: ThrottlerGetTrackerFunction = (req) => {
  const body = (req as Request).body as { username?: unknown } | undefined;
  return typeof body?.username === 'string'
    ? `admin:${fingerprint(body.username.trim().toLowerCase())}`
    : `ip:${resolveClientIp(req as Request)}`;
};
