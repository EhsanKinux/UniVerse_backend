import { ApiProperty } from '@nestjs/swagger';

/**
 * The "safe" shape of a user we send back to clients. Note it deliberately
 * OMITS sensitive fields like `password` and `hashedRefreshToken`.
 */
export class UserDto {
  @ApiProperty({ example: 'clp1a2b3c4d5e6f7g8h9i0j1' })
  id!: string;

  @ApiProperty({ example: 'student@univers.app' })
  email!: string;

  @ApiProperty({ example: 'Ada Lovelace', nullable: true })
  name!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

/** What POST /auth/register, /auth/login and /auth/refresh return. */
export class AuthResponseDto {
  @ApiProperty({ description: 'Short-lived token. Send it on every API call.' })
  accessToken!: string;

  @ApiProperty({
    description: 'Long-lived token. Use it to obtain a new access token.',
  })
  refreshToken!: string;

  @ApiProperty({ type: UserDto })
  user!: UserDto;
}
