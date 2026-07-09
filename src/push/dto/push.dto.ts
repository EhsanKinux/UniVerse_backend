import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** The encryption keys from the browser's PushSubscription. */
export class PushKeysDto {
  @ApiProperty({ description: "The browser's public key (base64url)." })
  @IsString()
  @IsNotEmpty()
  // Real keys are ~88 chars; the cap just keeps junk out of the database.
  @MaxLength(512)
  p256dh!: string;

  @ApiProperty({ description: 'The auth secret (base64url).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  auth!: string;
}

/** Body of POST /push/subscribe — the parts of a PushSubscription we store. */
export class PushSubscriptionDto {
  @ApiProperty({ example: 'https://fcm.googleapis.com/fcm/send/abc123…' })
  // Browser push services (FCM, Mozilla, Apple) only ever hand out HTTPS URLs,
  // so anything else is garbage — and since WE make requests to this URL when
  // sending, validating it also stops the table being seeded with URLs that
  // point our push traffic at arbitrary third parties.
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
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
  @MaxLength(2048)
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
