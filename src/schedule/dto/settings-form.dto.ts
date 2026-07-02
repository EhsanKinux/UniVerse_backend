import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_REMINDER_LEAD, MIN_REMINDER_LEAD } from './schedule-constants';

/**
 * Body of PATCH /schedule/settings. Everything is optional — send only what
 * changed. Note `currentWeekParity`: the student tells us what THIS week is
 * («این هفته فرد است»), and the service converts that into the stored Saturday
 * anchor date — the client never deals with anchor math.
 */
export class SettingsFormDto {
  @ApiProperty({
    required: false,
    description: 'Master switch for class push reminders.',
  })
  @IsOptional()
  @IsBoolean()
  remindersEnabled?: boolean;

  @ApiProperty({
    required: false,
    minimum: MIN_REMINDER_LEAD,
    maximum: MAX_REMINDER_LEAD,
    example: 30,
    description: 'Minutes before class start to send the reminder.',
  })
  @IsOptional()
  @IsInt()
  @Min(MIN_REMINDER_LEAD)
  @Max(MAX_REMINDER_LEAD)
  reminderLeadMinutes?: number;

  @ApiProperty({
    required: false,
    enum: ['odd', 'even'],
    description: 'Declare the parity of the CURRENT week (فرد یا زوج).',
  })
  @IsOptional()
  @IsIn(['odd', 'even'])
  currentWeekParity?: 'odd' | 'even';
}
