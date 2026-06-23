import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The admin login form. Kept lenient on purpose: the controller compares the
 * values against the configured credentials and re-renders the page with a
 * friendly Persian message on any mismatch (including blanks).
 */
export class AdminLoginDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;
}
