import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The add-join-option form body. Which field matters depends on `kind`
 * ("link" | "handle" | "qr"); GroupsService validates the right one and ignores
 * the rest. The QR image itself arrives as a multipart file, not in this DTO.
 */
export class GroupLinkFormDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  kind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  handle?: string;
}
