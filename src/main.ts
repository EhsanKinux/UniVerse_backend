import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

/**
 * The application entry point. NestFactory builds the app from AppModule, then
 * we attach a few global behaviors before listening for requests.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

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
  // Lets your Next.js front end (a different origin) call this API from the
  // browser. Without it, the browser blocks the requests.
  const corsOrigin = configService.get<string>('CORS_ORIGIN');
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',').map((o) => o.trim()) : true,
    credentials: true,
  });

  // --- Swagger / OpenAPI -----------------------------------------------------
  // Generates interactive API documentation, served at /docs.
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

  // --- Start listening -------------------------------------------------------
  const port = configService.get<number>('PORT') ?? 3001;
  await app.listen(port);

  console.log(`🚀 uni-verse API running at http://localhost:${port}`);
  console.log(`📚 Swagger docs at        http://localhost:${port}/docs`);
}

// `void` marks this floating promise as intentional (satisfies the linter).
void bootstrap();
