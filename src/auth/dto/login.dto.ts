import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { NormalizeEmail } from '../../common/normalize-email.decorator';

/** Describes + validates the JSON body of POST /auth/login. */
export class LoginDto {
  @ApiProperty({ example: 'student@univers.app' })
  // Lowercase + trim BEFORE we look the account up, so "Ali@Gmail.com " and
  // "ali@gmail.com" are the same login (see NormalizeEmail for the full story).
  @NormalizeEmail()
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'P@ssw0rd123' })
  @IsString()
  @IsNotEmpty()
  // Registration caps passwords at 72 (bcrypt's limit), so anything longer can
  // never be a real password — reject it up front instead of hashing it.
  @MaxLength(72)
  password!: string;
}
