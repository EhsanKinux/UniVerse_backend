import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Describes + validates the JSON body of POST /auth/register.
 *
 * - The class-validator decorators (@IsEmail, @MinLength, ...) are enforced
 *   automatically by the global ValidationPipe configured in main.ts. If the
 *   body fails any rule, NestJS returns a 400 with a helpful message before our
 *   code ever runs.
 * - The @ApiProperty decorators make each field show up in the Swagger docs.
 */
export class RegisterDto {
  @ApiProperty({
    example: 'student@univers.app',
    description: 'A unique, valid email address used to log in.',
  })
  @IsEmail({}, { message: 'Please provide a valid email address.' })
  email!: string;

  @ApiProperty({
    example: 'P@ssw0rd123',
    minLength: 8,
    maxLength: 72,
    description: 'Password, 8-72 characters.',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long.' })
  // bcrypt only hashes the first 72 bytes of a password, so we cap it there.
  @MaxLength(72, { message: 'Password must be at most 72 characters long.' })
  password!: string;

  @ApiProperty({
    example: 'Ada Lovelace',
    required: false,
    description: 'Optional display name.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
