import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CalendarModule } from './calendar/calendar.module';
import { ChartModule } from './chart/chart.module';
import { validateEnv } from './config/env.validation';
import { DocumentsModule } from './documents/documents.module';
import { GroupsModule } from './groups/groups.module';
import { NewsModule } from './news/news.module';
import { PhoneBookModule } from './phone-book/phone-book.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfileModule } from './profile/profile.module';
import { PushModule } from './push/push.module';
import { WeeklyScheduleModule } from './schedule/schedule.module';
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
    // Enables @Cron() decorators app-wide (the class-reminder job uses one).
    ScheduleModule.forRoot(),
    // Rate limiting (per client IP, in memory). This global ceiling is a pure
    // anti-abuse backstop — deliberately generous, because many students on
    // campus Wi-Fi can share one public IP (NAT) and must not throttle each
    // other. The endpoints that are actually worth attacking (login, register,
    // refresh, admin login, push subscribe) carry much stricter @Throttle()
    // overrides directly on their handlers.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 1000 }],
    }),
    PrismaModule, // database access (global)
    UsersModule, // user records
    AuthModule, // register / login / refresh / logout / me
    CalendarModule, // academic calendar: public read API
    DocumentsModule, // staff-managed files (e.g. the courses PDF): public read API
    ChartModule, // چارت آموزشی: departments + their chart PDFs, public read API
    PhoneBookModule, // شماره‌های دانشگاه: contact groups + numbers, public read API
    GroupsModule, // گروه‌ها: joinable group/channel directory, public read API
    NewsModule, // news/announcements: public read API + real-time SSE stream
    PushModule, // Web Push (OS notifications): VAPID + subscriptions
    WeeklyScheduleModule, // برنامه هفتگی: per-student timetable + class reminders
    ProfileModule, // student-owned profile: fields, points, avatar
    AdminModule, // server-rendered staff panel at /admin
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Registering ThrottlerGuard as an APP_GUARD applies the rate limits above
    // to EVERY route automatically; over-limit requests get a 429 response.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
