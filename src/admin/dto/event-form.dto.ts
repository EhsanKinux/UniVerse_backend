import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The add/edit event form body. Every field is optional at this layer so the
 * global ValidationPipe only sanitises (strips unknown fields); the real rules
 * — required title, valid category, valid Jalali dates, end-after-start — live
 * in CalendarService, which throws Persian messages the controller re-renders.
 * Dates arrive as Jalali strings (e.g. "1404/11/26").
 */
export class EventFormDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cohort?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  startDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
