import { ApiProperty } from '@nestjs/swagger';

/**
 * The categories the PWA knows how to colour and filter. Kept in sync with the
 * front end's `eventCategories` map. It's a plain string in the database, but we
 * validate admin input against this list (see the admin DTO).
 */
export const EVENT_CATEGORIES = [
  'registration', // انتخاب واحد / پیش‌ثبت‌نام
  'addDrop', // حذف و اضافه / حذف تک‌درس
  'exams', // امتحانات
  'academic', // شروع/پایان کلاس‌ها، ارزشیابی، ...
  'holiday', // تعطیلات
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/** Persian labels for each category, shown in the admin dropdown. */
export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  registration: 'انتخاب واحد / ثبت‌نام',
  addDrop: 'حذف و اضافه',
  exams: 'امتحانات',
  academic: 'آموزشی',
  holiday: 'تعطیلات',
};

export type EventStatus = 'past' | 'current' | 'upcoming';

/** One calendar row, already formatted for display so the PWA needs no date logic. */
export class PublicCalendarEventDto {
  @ApiProperty({ example: 'clx0abcd1234' })
  id!: string;

  @ApiProperty({ example: 'انتخاب واحد ورودی ۴۰۲ و ماقبل' })
  title!: string;

  @ApiProperty({ example: 'registration', enum: EVENT_CATEGORIES })
  category!: string;

  @ApiProperty({ example: 'ورودی ۴۰۲ و ماقبل', nullable: true })
  cohort!: string | null;

  @ApiProperty({ example: 'از طریق سامانه گلستان', nullable: true })
  description!: string | null;

  @ApiProperty({
    example: '2026-02-15',
    description: 'Gregorian start date (ISO, date-only).',
  })
  startDate!: string;

  @ApiProperty({
    example: '2026-02-15',
    nullable: true,
    description: 'Gregorian end date for ranges; null for a single day.',
  })
  endDate!: string | null;

  @ApiProperty({
    example: '۲۶ بهمن ۱۴۰۴',
    description: 'Ready-to-show Jalali label (single day or range).',
  })
  dateLabel!: string;

  @ApiProperty({
    example: 'یکشنبه',
    description: 'Persian weekday of the start.',
  })
  weekday!: string;

  @ApiProperty({
    example: 'بهمن ۱۴۰۴',
    description: 'Jalali month + year, for grouping rows in the timeline.',
  })
  monthLabel!: string;

  @ApiProperty({ example: 'upcoming', enum: ['past', 'current', 'upcoming'] })
  status!: EventStatus;

  @ApiProperty({
    example: 12,
    nullable: true,
    description: 'Whole days until the start; 0 if in progress, null if past.',
  })
  daysUntil!: number | null;
}

/** The lightweight header describing the active term. */
export class ActiveSemesterDto {
  @ApiProperty({ example: 'clx0semester99' })
  id!: string;

  @ApiProperty({ example: 'نیمسال دوم ۱۴۰۴-۱۴۰۵' })
  title!: string;

  @ApiProperty({
    example: 'تقویم آموزشی مصوب شورای آموزشی دانشگاه',
    nullable: true,
  })
  subtitle!: string | null;
}

/** The full payload of GET /calendar/active. */
export class ActiveCalendarDto {
  @ApiProperty({ type: ActiveSemesterDto })
  semester!: ActiveSemesterDto;

  @ApiProperty({ type: [PublicCalendarEventDto] })
  events!: PublicCalendarEventDto[];
}
