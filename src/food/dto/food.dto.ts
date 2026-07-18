import { ApiProperty } from '@nestjs/swagger';
import { FOOD_ANNOUNCEMENT_CATEGORIES } from './food-categories';

/** One food announcement, formatted for display so the PWA needs no date logic. */
export class FoodAnnouncementDto {
  @ApiProperty({ example: 'clx0food1234' })
  id!: string;

  @ApiProperty({ example: 'تعطیلی سلف مرکزی در روز اربعین' })
  title!: string;

  @ApiProperty({ example: 'closure', enum: FOOD_ANNOUNCEMENT_CATEGORIES })
  category!: string;

  @ApiProperty({ example: 'تعطیلی و اختلال', description: 'Persian category label.' })
  categoryLabel!: string;

  @ApiProperty({ example: 'سلف مرکزی روز پنجشنبه سرویس‌دهی ندارد.' })
  body!: string;

  @ApiProperty({
    example: null,
    nullable: true,
    description: 'Optional "read more" link.',
  })
  link!: string | null;

  @ApiProperty({ example: false, description: 'Pinned items sort to the front.' })
  pinned!: boolean;

  @ApiProperty({
    example: '2026-07-16T08:00:00.000Z',
    description: 'ISO publish timestamp.',
  })
  publishedAt!: string;

  @ApiProperty({
    example: 'پنجشنبه ۲۵ تیر',
    description: 'Pre-formatted Persian date for the card.',
  })
  dateLabel!: string;

  @ApiProperty({
    example: true,
    description:
      'Whether this item has a cover image (stream it at /food/announcements/:id/cover).',
  })
  hasCover!: boolean;

  @ApiProperty({ example: 1, description: 'How many files are attached.' })
  attachmentCount!: number;
}

/** One file attached to a food announcement, formatted for display. */
export class FoodAnnouncementAttachmentDto {
  @ApiProperty({ example: 'clx0att1234' })
  id!: string;

  @ApiProperty({ example: 'منوی-مهر.pdf', description: 'Original filename.' })
  originalName!: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType!: string;

  @ApiProperty({ example: 512000, description: 'File size in bytes.' })
  size!: number;

  @ApiProperty({ example: '۵۰۰ کیلوبایت', description: 'Ready-to-show Persian size.' })
  sizeLabel!: string;
}

/** The full announcement shown on the detail page — the list fields plus files. */
export class FoodAnnouncementDetailDto extends FoodAnnouncementDto {
  @ApiProperty({ type: [FoodAnnouncementAttachmentDto] })
  attachments!: FoodAnnouncementAttachmentDto[];
}

/** The current weekly menu file — the newest published FoodMenuFile row. */
export class FoodMenuDto {
  @ApiProperty({ example: 'clx0menu1234' })
  id!: string;

  @ApiProperty({
    example: 'هفتهٔ سوم مهر',
    nullable: true,
    description: 'Optional Persian label naming the menu’s week.',
  })
  weekLabel!: string | null;

  @ApiProperty({ example: 'menu-mehr-3.jpg', description: 'Original filename.' })
  originalName!: string;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType!: string;

  @ApiProperty({
    example: true,
    description: 'True when the file is an image the PWA can render inline.',
  })
  isImage!: boolean;

  @ApiProperty({ example: 512000, description: 'File size in bytes.' })
  size!: number;

  @ApiProperty({ example: '۵۰۰ کیلوبایت', description: 'Ready-to-show Persian size.' })
  sizeLabel!: string;

  @ApiProperty({
    example: 'شنبه ۱۲ مهر',
    description: 'Pre-formatted Persian upload date.',
  })
  dateLabel!: string;
}

/**
 * The whole food hub in ONE payload — the PWA's single call for the تغذیه page
 * (mirrors DormHubDto's "one call, fully formatted" approach). Always succeeds
 * with `menu: null` / empty arrays before staff add anything, so the PWA shows
 * empty states rather than handling a 404.
 */
export class FoodHubDto {
  @ApiProperty({ type: FoodMenuDto, nullable: true })
  menu!: FoodMenuDto | null;

  @ApiProperty({ type: [FoodAnnouncementDto] })
  announcements!: FoodAnnouncementDto[];
}

/** One nearby food place, normalised from an OpenStreetMap POI. */
export class FoodPlaceDto {
  @ApiProperty({
    example: 'node/123456',
    description: 'Stable OSM element id ("node/…" or "way/…").',
  })
  id!: string;

  @ApiProperty({ example: 'رستوران ارکیده' })
  name!: string;

  @ApiProperty({
    example: 'restaurant',
    description:
      'Normalised category slug: restaurant | fast_food | cafe | bakery | confectionery | supermarket | other',
  })
  category!: string;

  @ApiProperty({ example: 'رستوران', description: 'Persian category label.' })
  categoryLabel!: string;

  @ApiProperty({ example: 35.700212 })
  lat!: number;

  @ApiProperty({ example: 51.391415 })
  lng!: number;

  @ApiProperty({
    example: 240,
    description: 'Great-circle distance in metres from the requested point.',
  })
  distance!: number;

  @ApiProperty({ example: '۲۴۰ متر', description: 'Ready-to-show Persian distance.' })
  distanceLabel!: string;

  @ApiProperty({
    example: '+98 21 1234 5678',
    nullable: true,
    description: 'Phone number when OSM has one (for a tap-to-call button).',
  })
  phone!: string | null;

  @ApiProperty({
    example: 'Sa-Th 08:00-22:00',
    nullable: true,
    description: 'Raw OSM opening_hours string, when tagged.',
  })
  openingHours!: string | null;

  @ApiProperty({
    example: true,
    nullable: true,
    description:
      'Best-effort "open right now" computed from opening_hours; null when the tag is missing or too complex to parse.',
  })
  openNow!: boolean | null;

  @ApiProperty({
    example: 'https://example.ir',
    nullable: true,
    description: 'Website when OSM has one.',
  })
  website!: string | null;
}

/** What kind of change happened, pushed over the announcements SSE stream. */
export type FoodStreamType = 'created' | 'updated' | 'deleted' | 'ping';

/**
 * A single Server-Sent Event payload. `created`/`updated` carry the full `item`;
 * `deleted` carries only its `id`; `ping` is a keep-alive the client ignores.
 */
export interface FoodStreamEvent {
  type: FoodStreamType;
  item?: FoodAnnouncementDto;
  id?: string;
}
