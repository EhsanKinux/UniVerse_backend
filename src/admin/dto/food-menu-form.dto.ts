import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The upload form body for a weekly menu file (FoodMenuFile). The file itself is
 * handled by the Multer interceptor (not the body); the real validation lives in
 * FoodService. The checkbox arrives as "on".
 */
export class FoodMenuFormDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  weekLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  isPublished?: string;
}
