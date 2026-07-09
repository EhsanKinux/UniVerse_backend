import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Describes + validates the JSON body of POST /auth/login. */
export class LoginDto {
  @ApiProperty({ example: 'student@univers.app' })
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
