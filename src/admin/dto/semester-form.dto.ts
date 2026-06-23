import { IsOptional, IsString, MaxLength } from 'class-validator';

/** The create-semester form. Title is enforced in the service (with a Persian
 *  message), so this layer stays lenient. */
export class SemesterFormDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  subtitle?: string;
}
