import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The upload form body (multipart). Like the event form, every field is optional
 * at this layer so the global ValidationPipe only sanitises; the real rules
 * (required category/title, valid page count, PDF-only) live in DocumentsService
 * and the multer config, which throw Persian messages the controller re-renders.
 * The actual FILE is handled by FileInterceptor, not by this DTO.
 */
export class DocumentFormDto {
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
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  pageCount?: string;

  // An HTML checkbox sends the string "on" when ticked, and nothing when not.
  @IsOptional()
  @IsString()
  @MaxLength(10)
  makeActive?: string;
}
