import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import session from 'express-session';
import helmet from 'helmet';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import hbs from 'hbs';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/errors/api-exception.filter';
import { requestIdMiddleware } from './common/request-id.middleware';
import { parseTrustProxy } from './common/throttler/client-ip.util';

/**
 * The application entry point. NestFactory builds the app from AppModule, then
 * we attach a few global behaviors before listening for requests.
 */
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  const logger = new Logger('Bootstrap');

  // --- Graceful shutdown -------------------------------------------------------
  // Without this, SIGTERM/SIGINT (Ctrl+C, docker stop, a deploy) kills the
  // process instantly: in-flight requests are cut off and Prisma's
  // onModuleDestroy never runs. With it, NestJS drains connections and closes
  // the database pool cleanly before exiting.
  app.enableShutdownHooks();

  // --- Security headers (helmet) ----------------------------------------------
  // Sets the standard protective headers on every response: X-Content-Type-
  // Options (no MIME sniffing), X-Frame-Options (no clickjacking iframes),
  // Strict-Transport-Security (HTTPS only, when served over HTTPS), and a
  // Content-Security-Policy. The CSP only really matters for the HTML we render
  // (the /admin panel and /docs); it's tuned to allow their inline
  // styles/scripts and the jsdelivr CDN (Vazirmatn font + the Jalali
  // date-picker) and nothing else.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
          scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
          fontSrc: ["'self'", 'https://cdn.jsdelivr.net'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          // Auto-upgrade http:// subresources to https:// — right on the HTTPS
          // production server, wrong on plain http://localhost in development
          // (it would point the admin panel's forms at a non-existent
          // https://localhost). null removes helmet's default.
          upgradeInsecureRequests: isProduction ? [] : null,
        },
      },
      // Our images/PDFs (news covers, QR codes, documents) may be embedded by
      // the PWA from a different origin during development; the default
      // same-origin policy would block that.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // --- Reverse-proxy awareness -----------------------------------------------
  // Nothing reaches this API directly in production: a TLS-terminating reverse
  // proxy (and possibly a CDN in front of it) forwards every request, so the
  // TCP connection always appears to come from that proxy. `trust proxy` tells
  // Express how many of those hops to believe when reading `X-Forwarded-For`,
  // which is what makes `req.ip` the STUDENT's address rather than the proxy's.
  //
  // Why this matters beyond tidiness: every per-IP rate limit is keyed on
  // req.ip. Get this wrong and the whole university shares one bucket, so
  // students start getting "too many requests" for something they didn't do.
  //
  // Default 'loopback' = one proxy on this machine (the documented Caddy/nginx
  // setup). Add a CDN in front and it becomes 2 hops → set TRUST_PROXY=2.
  // Verify from a phone with GET /_diagnostics/client — see AppController.
  const trustProxy = parseTrustProxy(configService.get<string>('TRUST_PROXY'));
  app.set('trust proxy', trustProxy);

  // --- Request correlation id --------------------------------------------------
  // Must run before everything else so EVERY response — including a rate-limit
  // rejection or a crash — carries an id that also appears in the server log.
  app.use(requestIdMiddleware);

  // --- Admin session + view engine -------------------------------------------
  // The /admin panel is server-rendered (Handlebars templates) and gated by a
  // simple shared login held in a signed session cookie (no per-user roles).
  app.use(
    session({
      secret: configService.getOrThrow<string>('SESSION_SECRET'),
      resave: false, // don't re-write unchanged sessions on every request
      saveUninitialized: false, // don't create empty sessions for anonymous hits
      cookie: {
        httpOnly: true, // the browser's JavaScript can't read this cookie
        sameSite: 'lax',
        // 'auto' = mark the cookie Secure (HTTPS-only) whenever the request
        // itself arrived over HTTPS. Works with `trust proxy` above, so behind
        // an HTTPS reverse proxy the admin cookie can never leak over plain
        // HTTP, while local http://localhost development keeps working.
        secure: 'auto',
        maxAge: 1000 * 60 * 60 * 8, // sign back in after 8 hours
      },
    }),
  );

  // Server-rendered admin views live in /views (.hbs), sharing partials.
  app.setBaseViewsDir(join(process.cwd(), 'views'));
  // Register shared partials SYNCHRONOUSLY. hbs.registerPartials() reads the
  // directory asynchronously and can race with the first request (a partial then
  // "could not be found"), so we read + register each one up-front instead.
  const partialsDir = join(process.cwd(), 'views', 'partials');
  for (const file of readdirSync(partialsDir)) {
    if (file.endsWith('.hbs')) {
      hbs.registerPartial(
        file.replace(/\.hbs$/, ''),
        readFileSync(join(partialsDir, file), 'utf8'),
      );
    }
  }
  // A tiny helper so a template can mark the selected <option> in a dropdown.
  hbs.registerHelper('eq', (a: unknown, b: unknown) => a === b);
  app.setViewEngine('hbs');

  // --- Global validation -----------------------------------------------------
  // Applies our DTO rules (class-validator) to EVERY incoming request body.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties not declared in the DTO
      forbidNonWhitelisted: true, // ...and reject the request if extras are sent
      transform: true, // turn plain JSON into typed DTO class instances
    }),
  );

  // --- Uniform error responses -------------------------------------------------
  // Every failure — a wrong password, a rate limit, a database outage, a crash —
  // leaves through here as the same JSON envelope with a machine-readable
  // `code` and a `requestId`. That is what lets the PWA tell those cases apart
  // and show the student something true, instead of one catch-all sentence.
  app.useGlobalFilters(new ApiExceptionFilter());

  // --- CORS ------------------------------------------------------------------
  // Whether CORS applies depends on how the PWA is deployed. Behind the Next.js
  // same-origin `/api` proxy the calls are server-to-server and CORS never
  // enters the picture; when the browser calls this API on its own domain
  // (NEXT_PUBLIC_API_BASE_URL=https://unib.…) EVERY request is policed by it.
  //
  // A rejected origin is uniquely nasty to debug: the browser refuses to hand
  // the response to JavaScript, so the app sees no status and no body at all —
  // it looks *identical* to the phone being offline, and the PWA used to say
  // "check your internet connection" when the real problem was one missing
  // entry in CORS_ORIGIN. We can't change what the browser reports, but we CAN
  // make the server say so out loud, once per offending origin.
  const allowedOrigins = (configService.get<string>('CORS_ORIGIN') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const reportedOrigins = new Set<string>();

  app.enableCors({
    origin: (requestOrigin: string | undefined, callback) => {
      // No Origin header: not a cross-origin browser call at all (curl, a
      // health check, the Next.js server-side proxy). Nothing to police.
      if (!requestOrigin) return callback(null, true);

      if (allowedOrigins.includes(requestOrigin)) return callback(null, true);

      // Nothing configured: reflect any origin in development (convenient),
      // but allow NOTHING in production — reflecting arbitrary origins WITH
      // credentials would let any site a student visits call this API as them.
      if (allowedOrigins.length === 0 && !isProduction) {
        return callback(null, true);
      }

      if (!reportedOrigins.has(requestOrigin)) {
        reportedOrigins.add(requestOrigin);
        logger.error(
          `CORS refused origin "${requestOrigin}". The browser will report this ` +
            `to the app as a network failure with no status code. ` +
            `Fix: add it to CORS_ORIGIN (currently ${allowedOrigins.length ? allowedOrigins.join(', ') : '<unset>'}) and restart.`,
        );
      }
      callback(null, false);
    },
    credentials: true,
    // Response headers are invisible to cross-origin JavaScript unless they are
    // explicitly exposed. Without this the PWA cannot read how long to wait
    // after a 429, nor show the request id a student would quote to us.
    exposedHeaders: ['Retry-After', 'X-Request-Id'],
  });

  // --- Swagger / OpenAPI -----------------------------------------------------
  // Generates interactive API documentation, served at /docs. In production the
  // docs are OFF by default (they hand anyone a complete map of the API);
  // set SWAGGER_ENABLED=true to serve them anyway.
  const swaggerEnabled =
    !isProduction || configService.get<string>('SWAGGER_ENABLED') === 'true';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('uni-verse API')
      .setDescription('Backend API for the uni-verse PWA')
      .setVersion('1.0')
      // Two named "Authorize" boxes in the docs — one per token type.
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'refresh-token',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true }, // keep token across reloads
    });
  }

  // --- Start listening -------------------------------------------------------
  const port = configService.get<number>('PORT') ?? 3001;
  // Bind to all interfaces by default. On a server that fronts this API with the
  // Next.js `/api` proxy on the SAME host, set HOST=127.0.0.1 to keep the API
  // private — reachable only by the local proxy, never the public network.
  const host = configService.get<string>('HOST') ?? '0.0.0.0';
  await app.listen(port, host);

  console.log(`🚀 uni-verse API running on ${host}:${port}`);
  if (swaggerEnabled) {
    console.log(`📚 Swagger docs at        http://localhost:${port}/docs`);
  }
  // Print the two settings that silently break logins for everyone when wrong,
  // so a deploy either confirms them at a glance or shows you the problem.
  console.log(`🔐 trust proxy            ${String(trustProxy)}`);
  console.log(
    `🌐 CORS origins           ${allowedOrigins.length ? allowedOrigins.join(', ') : isProduction ? '<unset — all cross-origin browser calls will be refused>' : '<unset — reflecting any origin (development)>'}`,
  );
}

// `void` marks this floating promise as intentional (satisfies the linter).
void bootstrap();
