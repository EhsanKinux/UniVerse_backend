import type { Request } from 'express';

/**
 * Who is this request actually from?
 *
 * In production nothing connects to this API directly: a TLS-terminating
 * reverse proxy (Caddy/nginx) sits in front, so every TCP connection appears to
 * come from the proxy. Express only reports the true client in `req.ip` when
 * `trust proxy` is configured to match the real hop count (see parseTrustProxy
 * + TRUST_PROXY in .env). Get that wrong and EVERY student looks like one
 * single IP address — which quietly turns every per-IP rate limit into a
 * campus-wide limit, and students start getting "too many requests" for
 * something they didn't do.
 *
 * `::ffff:1.2.3.4` is how Node reports an IPv4 client on a dual-stack socket;
 * stripping the prefix keeps one client from occupying two rate-limit buckets.
 */
export function resolveClientIp(req: Request): string {
  const raw = req.ip ?? req.socket?.remoteAddress ?? '';
  const ip = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  return ip || 'unknown';
}

/**
 * Translate the TRUST_PROXY env value into what `app.set('trust proxy', …)`
 * expects. Accepted forms, in the order you're most likely to need them:
 *
 *   (unset)          → 'loopback'  — proxy runs on this machine (the default
 *                      Caddy/nginx setup, and correct for local development)
 *   '1' / '2'        → trust that many proxy hops (use 2 when a CDN sits in
 *                      front of your own reverse proxy)
 *   'loopback'       → same as the default, written explicitly
 *   '10.0.0.5,::1'   → trust these specific proxy addresses / subnets
 *   'false'          → trust nothing; req.ip is the raw socket address
 *   'true'           → trust the whole X-Forwarded-For chain. NEVER in
 *                      production: anyone can then forge their own IP and slip
 *                      past every rate limit.
 */
export function parseTrustProxy(value?: string): boolean | number | string {
  const raw = value?.trim();
  if (!raw) return 'loopback';
  if (raw === 'false') return false;
  if (raw === 'true') return true;
  const hops = Number(raw);
  return Number.isInteger(hops) && hops >= 0 ? hops : raw;
}
