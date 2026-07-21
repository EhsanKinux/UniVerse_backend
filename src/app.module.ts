import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CalendarModule } from './calendar/calendar.module';
import { ChartModule } from './chart/chart.module';
import { AppThrottlerGuard } from './common/throttler/app-throttler.guard';
import {
  IDENTITY_THROTTLER,
  identityThrottleSkip,
} from './common/throttler/throttle-identity';
import { validateEnv } from './config/env.validation';
import { DocumentsModule } from './documents/documents.module';
import { DormModule } from './dorm/dorm.module';
import { FoodModule } from './food/food.module';
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
    // Rate limiting (in memory). TWO throttlers work together — see
    // common/throttler/throttle-identity.ts for the full reasoning:
    //
    //   'default'  per client IP. A pure anti-flood backstop, deliberately
    //              generous: hundreds of students share one public IP through
    //              campus NAT, so anything tight here throttles innocent people.
    //              Tune with RATE_LIMIT_PER_MINUTE without touching code.
    //   'identity' per ACCOUNT / SESSION / DEVICE. Inert unless a route opts in
    //              with @ThrottleIdentity(); this is what actually stops
    //              password guessing, and it can never punish a bystander who
    //              merely shares an IP with the attacker.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60_000,
            limit: config.get<number>('RATE_LIMIT_PER_MINUTE') ?? 1000,
          },
          {
            name: IDENTITY_THROTTLER,
            ttl: 60_000,
            // Never reached: routes that opt in always override both numbers,
            // and every other route skips this throttler entirely.
            limit: Number.MAX_SAFE_INTEGER,
            skipIf: identityThrottleSkip,
          },
        ],
      }),
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
    DormModule, // خوابگاه: announcements (push+SSE) + rules/facilities/forms
    FoodModule, // تغذیه: weekly menu + announcements (push+SSE) + nearby-places proxy
    PushModule, // Web Push (OS notifications): VAPID + subscriptions
    WeeklyScheduleModule, // برنامه هفتگی: per-student timetable + class reminders
    ProfileModule, // student-owned profile: fields, points, avatar
    AdminModule, // server-rendered staff panel at /admin
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Registering the throttler guard as an APP_GUARD applies the rate limits
    // above to EVERY route automatically; over-limit requests get a 429.
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
  ],
})
export class AppModule {}
