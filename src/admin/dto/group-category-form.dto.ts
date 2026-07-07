import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The add/edit group-category form body. Lenient here (the global ValidationPipe
 * only sanitises); the real rules (required title) live in GroupsService, which
 * throws Persian messages the controller re-renders. The `isPublished` checkbox
 * arrives as the string "on" when ticked.
 */
export class GroupCategoryFormDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  sortOrder?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  isPublished?: string;
}
