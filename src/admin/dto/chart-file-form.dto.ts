import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The "add a chart PDF" form body (multipart). Every field is optional at this
 * layer so the global ValidationPipe only sanitises; the real rules (required
 * title, PDF-only) live in ChartService and the multer config. The actual FILE is
 * handled by FileInterceptor, not by this DTO.
 */
export class ChartFileFormDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  badge?: string;
}
