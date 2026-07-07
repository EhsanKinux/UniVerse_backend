import { ApiProperty } from '@nestjs/swagger';
import { GROUP_LINK_KINDS } from './group-kinds';

/**
 * One way to join a group. Exactly one payload field is meaningful per `kind`:
 *   • kind="link"   → `url` is set (a clickable invite URL).
 *   • kind="handle" → `handle` is set (a copyable @username / invite code).
 *   • kind="qr"     → `hasQr` is true; the PWA builds the image URL from `id`
 *                     (GET /groups/links/:id/qr) — the bytes never ship in JSON.
 */
export class GroupLinkDto {
  @ApiProperty({ example: 'clx0link12345' })
  id!: string;

  @ApiProperty({ example: 'link', enum: GROUP_LINK_KINDS })
  kind!: string;

  @ApiProperty({
    example: 'کانال اصلی',
    nullable: true,
    description: 'Optional button label; null → the PWA uses a default per kind.',
  })
  label!: string | null;

  @ApiProperty({
    example: 'https://t.me/example',
    nullable: true,
    description: 'The join URL for kind="link"; null otherwise.',
  })
  url!: string | null;

  @ApiProperty({
    example: '@university_channel',
    nullable: true,
    description: 'A copyable handle/code for kind="handle"; null otherwise.',
  })
  handle!: string | null;

  @ApiProperty({
    example: true,
    description:
      'True for kind="qr" with an image on disk. Stream it from GET /groups/links/:id/qr.',
  })
  hasQr!: boolean;
}

/**
 * One joinable group/channel — the shape the PWA renders as a card. The whole
 * directory ships in a single GET /groups call because the data is small and
 * changes rarely.
 */
export class GroupDto {
  @ApiProperty({ example: 'clx0group1234' })
  id!: string;

  @ApiProperty({ example: 'اطلاع‌رسانی آموزش دانشگاه' })
  title!: string;

  @ApiProperty({
    example: 'اخبار رسمی، اطلاعیه‌ها و رویدادهای آموزشی',
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({
    example: 'تلگرام',
    nullable: true,
    description: 'Free-text platform badge staff typed; null → no badge shown.',
  })
  platform!: string | null;

  @ApiProperty({ type: [GroupLinkDto] })
  links!: GroupLinkDto[];
}

/**
 * One category (e.g. «کانال‌های رسمی») with its group cards — the shape the PWA
 * renders as a titled section.
 */
export class GroupCategoryDto {
  @ApiProperty({ example: 'clx0cat123456' })
  id!: string;

  @ApiProperty({ example: 'کانال‌های رسمی' })
  title!: string;

  @ApiProperty({ type: [GroupDto] })
  groups!: GroupDto[];
}
