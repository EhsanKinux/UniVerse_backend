import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The add/edit news form body. Lenient at this layer (the global ValidationPipe
 * only sanitises); the real rules (required title/body, valid category) live in
 * NewsService, which throws Persian messages the controller re-renders. The two
 * checkboxes arrive as the string "on" when ticked, and are absent otherwise.
 */
export class NewsFormDto {
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
