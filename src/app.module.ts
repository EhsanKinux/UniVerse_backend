import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

/**
 * The root module. NestJS starts here and pulls in every feature module.
 * Think of it as the table of contents for the whole backend.
 */
@Module({
  imports: [
    // Reads .env once, validates it (see config/env.validation.ts), and makes
    // ConfigService injectable everywhere (isGlobal). If a required variable is
    // missing or malformed, the app refuses to start with a clear error.
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule, // database access (global)
    UsersModule, // user records
    AuthModule, // register / login / refresh / logout / me
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
