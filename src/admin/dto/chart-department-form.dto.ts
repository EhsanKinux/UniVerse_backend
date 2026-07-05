import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The add/edit department form body. Lenient at this layer (the global
 * ValidationPipe only sanitises); the real rules (required title, valid slug/
 * colour) live in ChartService, which throws Persian messages the controller
 * re-renders. The `isPublished` checkbox arrives as the string "on" when ticked.
 */
export class ChartDepartmentFormDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  sortOrder?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  isPublished?: string;
}
