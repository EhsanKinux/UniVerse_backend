import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module';
import { AdminAuthFilter } from './admin-auth.filter';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';

/**
 * The server-rendered staff admin panel. It imports CalendarModule to reuse
 * CalendarService for all reads/writes, so there is exactly one place that
 * understands the calendar's data + date rules.
 */
@Module({
  imports: [CalendarModule],
  controllers: [AdminController],
  providers: [AdminGuard, AdminAuthFilter],
})
export class AdminModule {}
