import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The add/edit form body for a قوانین/امکانات row (DormInfoItem). `section` is a
 * hidden field on the form ("rules" | "facilities"); the real validation lives in
 * DormService. `sortOrder` arrives as a string; the checkbox as "on".
 */
export class DormInfoFormDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  section?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  detail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  sortOrder?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  isPublished?: string;
}
