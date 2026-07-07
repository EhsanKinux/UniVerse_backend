import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The add/edit contact (phone number) form body. Every field is optional at this
 * layer so the global ValidationPipe only sanitises; the real rules (required
 * name + phone, email sanity) live in PhoneBookService.
 */
export class ContactFormDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  ext?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;
}
