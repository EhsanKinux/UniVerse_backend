import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Body of DELETE /auth/me. Deleting an account is destructive and irreversible,
 * so we require the user's CURRENT password as confirmation (re-authentication)
 * — the same pattern real apps use for "delete my account".
 */
export class DeleteAccountDto {
  @ApiProperty({ description: 'Current password, to confirm the deletion.' })
  @IsString()
  @IsNotEmpty({ message: 'رمز عبور را وارد کنید.' })
  password!: string;
}
