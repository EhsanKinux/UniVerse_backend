import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  COURSE_COLORS,
  HHMM_PATTERN,
  MAX_DAY_OF_WEEK,
  SESSION_PARITIES,
  SESSION_TYPES,
} from './schedule-constants';

/**
 * One weekly meeting inside the course form. Times travel as "HH:mm" strings
 * (what <input type="time"> produces); the service converts them to minutes.
 * "end after start" is checked in the service, where we can name the offending
 * session in the error message.
 */
export class SessionFormDto {
  @ApiProperty({
    example: 0,
    minimum: 0,
    maximum: MAX_DAY_OF_WEEK,
    description: 'Day of the university week: 0 = شنبه … 5 = پنجشنبه.',
  })
  @IsInt()
  @Min(0)
  @Max(MAX_DAY_OF_WEEK)
  dayOfWeek!: number;

  @ApiProperty({
    example: '10:00',
    description: 'Start time, "HH:mm" (Tehran).',
  })
  @IsString()
  @Matches(HHMM_PATTERN, { message: 'start must be in HH:mm format.' })
  start!: string;

  @ApiProperty({ example: '11:30', description: 'End time, "HH:mm" (Tehran).' })
  @IsString()
  @Matches(HHMM_PATTERN, { message: 'end must be in HH:mm format.' })
  end!: string;

  @ApiProperty({
    example: 'کلاس ۲۰۴',
    required: false,
    description: 'Optional room/location.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  room?: string;

  @ApiProperty({
    enum: SESSION_TYPES,
    example: 'theory',
    description: 'نظری یا عملی.',
  })
  @IsIn(SESSION_TYPES)
  type!: string;

  @ApiProperty({
    enum: SESSION_PARITIES,
    example: 'all',
    description: 'Week parity: all = هر هفته, odd = فرد, even = زوج.',
  })
  @IsIn(SESSION_PARITIES)
  parity!: string;
}

/** Body of POST /schedule/courses and PATCH /schedule/courses/:id. */
export class CourseFormDto {
  @ApiProperty({ example: 'ساختمان داده‌ها', description: 'Course name.' })
  @IsString()
  @MinLength(1, { message: 'Course name is required.' })
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    example: 'دکتر رضایی',
    required: false,
    description: 'Optional professor name.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  professor?: string;

  @ApiProperty({
    enum: COURSE_COLORS,
    example: 'teal',
    description: 'Palette slug for the UI.',
  })
  @IsIn(COURSE_COLORS)
  color!: string;

  @ApiProperty({
    type: [SessionFormDto],
    description: 'The weekly meetings (at least one).',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'A course needs at least one session.' })
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SessionFormDto) // tells class-transformer what the array items are
  sessions!: SessionFormDto[];
}
