import { Controller, Get } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CalendarService } from './calendar.service';
import { ActiveCalendarDto } from './dto/active-calendar.dto';

// Public, read-only calendar API consumed by the PWA. The matching write side
// (creating/editing events) lives in the staff-only admin panel, not here.
@ApiTags('calendar')
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('active')
  @ApiOperation({
    summary: 'Active semester + its calendar events, formatted for display',
  })
  @ApiOkResponse({ type: ActiveCalendarDto })
  @ApiNotFoundResponse({ description: 'No active semester published yet' })
  getActive(): Promise<ActiveCalendarDto> {
    return this.calendarService.getActiveCalendar();
  }
}
