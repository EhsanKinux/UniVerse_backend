import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { ScheduleRemindersService } from './schedule-reminders.service';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';

/**
 * برنامه هفتگی — each student's personal class timetable: an authenticated CRUD
 * API plus the every-minute cron that pushes "class starts soon" reminders.
 * (Named WeeklyScheduleModule to avoid clashing with @nestjs/schedule's
 * ScheduleModule, which provides the cron machinery itself.)
 */
@Module({
  imports: [PushModule], // reminders go out through PushService
  controllers: [ScheduleController],
  providers: [ScheduleService, ScheduleRemindersService],
})
export class WeeklyScheduleModule {}
