import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

/**
 * Bundles the academic-calendar feature. For now it exposes the public read API;
 * the admin panel (added next) will register its own controller here and reuse
 * CalendarService, which is why we export it.
 */
@Module({
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
