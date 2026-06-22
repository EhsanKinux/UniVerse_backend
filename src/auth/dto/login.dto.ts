import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/** Describes + validates the JSON body of POST /auth/login. */
export class LoginDto {
  @ApiProperty({ example: 'student@univers.app' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'P@ssw0rd123' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
