import { ValidationPipe } from '@nestjs/common';
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

/**
 * The application entry point. NestFactory builds the app from AppModule, then
 * we attach a few global behaviors before listening for requests.
 */
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

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
  // In production the PWA reaches this API through the Next.js server's
  // same-origin `/api` proxy (browser → Next → here), so requests arrive from a
  // local upstream. Trust `X-Forwarded-*` ONLY from a loopback address, so
  // `req.ip` / `req.protocol` reflect the real client instead of the proxy —
  // without letting a direct, non-local caller spoof those headers.
  app.set('trust proxy', 'loopback');

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

  // --- CORS ------------------------------------------------------------------
  // The PWA now calls this API through the Next.js same-origin `/api` proxy, so
  // those requests are server-to-server and NOT subject to browser CORS. CORS
  // therefore only governs DIRECT browser calls: a dev "escape hatch" base URL,
  // or the server-rendered /admin panel and /docs. Set CORS_ORIGIN to the exact
  // front-end origin(s) in production; when unset we reflect the request origin,
  // which is convenient for local development only.
  const corsOrigin = configService.get<string>('CORS_ORIGIN');
  app.enableCors({
    origin: corsOrigin
      ? corsOrigin
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)
      : // No explicit origins configured: reflect any origin in development
        // (convenient), but in production allow NO cross-origin browser calls —
        // reflecting arbitrary origins WITH credentials would let any website
        // a user visits call this API from their browser.
        !isProduction,
    credentials: true,
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
}

// `void` marks this floating promise as intentional (satisfies the linter).
void bootstrap();
