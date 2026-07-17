import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The upload form body for a فرم/مدرک (DormForm). The file itself is handled by
 * the Multer interceptor (not the body); the real validation lives in
 * DormService. `sortOrder` arrives as a string; the checkbox as "on".
 */
export class DormFormFormDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  sortOrder?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  isPublished?: string;
}
