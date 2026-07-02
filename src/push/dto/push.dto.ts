import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsString,
  ValidateNested,
} from 'class-validator';

/** The encryption keys from the browser's PushSubscription. */
export class PushKeysDto {
  @ApiProperty({ description: "The browser's public key (base64url)." })
  @IsString()
  @IsNotEmpty()
  p256dh!: string;

  @ApiProperty({ description: 'The auth secret (base64url).' })
  @IsString()
  @IsNotEmpty()
  auth!: string;
}

/** Body of POST /push/subscribe — the parts of a PushSubscription we store. */
export class PushSubscriptionDto {
  @ApiProperty({ example: 'https://fcm.googleapis.com/fcm/send/abc123…' })
  @IsString()
  @IsNotEmpty()
  endpoint!: string;

  @ApiProperty({ type: PushKeysDto })
  @IsObject()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}

/** Body of POST /push/unsubscribe. */
export class PushUnsubscribeDto {
  @ApiProperty({ example: 'https://fcm.googleapis.com/fcm/send/abc123…' })
  @IsString()
  @IsNotEmpty()
  endpoint!: string;
}

/** Response of GET /push/public-key. */
export class PublicKeyDto {
  @ApiProperty({
    nullable: true,
    description:
      'VAPID public key, or null when push is disabled on the server.',
  })
  publicKey!: string | null;
}
