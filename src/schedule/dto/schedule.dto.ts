import { ApiProperty } from '@nestjs/swagger';

// Response shapes for the weekly-schedule API. Like the calendar API, times are
// pre-formatted ("HH:mm") so the client needs no conversion logic. These are
// mirrored in the frontend's lib/api/types.ts — keep the two in sync.

export class CourseSessionDto {
  @ApiProperty() id!: string;

  @ApiProperty({ description: '0 = شنبه … 5 = پنجشنبه.' })
  dayOfWeek!: number;

  @ApiProperty({ example: '10:00' }) start!: string;
  @ApiProperty({ example: '11:30' }) end!: string;

  @ApiProperty({ nullable: true, example: 'کلاس ۲۰۴' })
  room!: string | null;

  @ApiProperty({ enum: ['theory', 'practical'] })
  type!: string;

  @ApiProperty({ enum: ['all', 'odd', 'even'] })
  parity!: string;
}

export class CourseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'ساختمان داده‌ها' }) name!: string;

  @ApiProperty({ nullable: true, example: 'دکتر رضایی' })
  professor!: string | null;

  @ApiProperty({ example: 'teal' }) color!: string;

  @ApiProperty({
    type: [CourseSessionDto],
    description: 'Sorted by day, then start time.',
  })
  sessions!: CourseSessionDto[];
}

export class ScheduleSettingsDto {
  @ApiProperty() remindersEnabled!: boolean;
  @ApiProperty({ example: 30 }) reminderLeadMinutes!: number;

  @ApiProperty({
    nullable: true,
    enum: ['odd', 'even'],
    description:
      'Parity of the current Tehran week; null until the student sets it.',
  })
  currentWeekParity!: 'odd' | 'even' | null;
}

/** Full payload of GET /schedule — everything the page needs in one request. */
export class WeeklyScheduleDto {
  @ApiProperty({ type: [CourseDto] })
  courses!: CourseDto[];

  @ApiProperty({ type: ScheduleSettingsDto })
  settings!: ScheduleSettingsDto;

  @ApiProperty({
    description:
      'Today in Tehran: 0 = شنبه … 6 = جمعه (so the UI can highlight it).',
  })
  todayIndex!: number;
}
