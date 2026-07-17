import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The add/edit dorm-announcement form body. Lenient here (the global
 * ValidationPipe only sanitises); the real rules (required title/body, valid
 * category) live in DormService, which throws Persian messages the controller
 * re-renders. The two checkboxes arrive as the string "on" when ticked. Mirrors
 * NewsFormDto — the announcement shape is deliberately identical to news.
 */
export class DormAnnouncementFormDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  link?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  pinned?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  isPublished?: string;
}
