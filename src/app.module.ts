import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CalendarModule } from './calendar/calendar.module';
import { ChartModule } from './chart/chart.module';
import { validateEnv } from './config/env.validation';
import { DocumentsModule } from './documents/documents.module';
import { NewsModule } from './news/news.module';
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
    PrismaModule, // database access (global)
    UsersModule, // user records
    AuthModule, // register / login / refresh / logout / me
    CalendarModule, // academic calendar: public read API
    DocumentsModule, // staff-managed files (e.g. the courses PDF): public read API
    ChartModule, // چارت آموزشی: departments + their chart PDFs, public read API
    NewsModule, // news/announcements: public read API + real-time SSE stream
    PushModule, // Web Push (OS notifications): VAPID + subscriptions
    WeeklyScheduleModule, // برنامه هفتگی: per-student timetable + class reminders
    ProfileModule, // student-owned profile: fields, points, avatar
    AdminModule, // server-rendered staff panel at /admin
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
