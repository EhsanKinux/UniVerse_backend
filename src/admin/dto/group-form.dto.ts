import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The add/edit group (card) form body. Every field is optional at this layer so
 * the global ValidationPipe only sanitises; the real rules (required title) live
 * in GroupsService. `platform` is the free-text badge staff type themselves.
 */
export class GroupFormDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  sortOrder?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  isPublished?: string;
}
