import { ApiProperty } from '@nestjs/swagger';
import { DORM_ANNOUNCEMENT_CATEGORIES } from './dorm-categories';

/** One dorm announcement, formatted for display so the PWA needs no date logic. */
export class DormAnnouncementDto {
  @ApiProperty({ example: 'clx0dorm1234' })
  id!: string;

  @ApiProperty({ example: 'قطعی آب گرم بلوک ۲' })
  title!: string;

  @ApiProperty({ example: 'maintenance', enum: DORM_ANNOUNCEMENT_CATEGORIES })
  category!: string;

  @ApiProperty({ example: 'قطعی و اختلال', description: 'Persian category label.' })
  categoryLabel!: string;

  @ApiProperty({ example: 'آب گرم بلوک ۲ فردا از ساعت ۹ تا ۱۲ قطع خواهد بود.' })
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
      'Whether this item has a cover image (stream it at /dorm/announcements/:id/cover).',
  })
  hasCover!: boolean;

  @ApiProperty({ example: 1, description: 'How many files are attached.' })
  attachmentCount!: number;
}

/** One file attached to a dorm announcement, formatted for display. */
export class DormAnnouncementAttachmentDto {
  @ApiProperty({ example: 'clx0att1234' })
  id!: string;

  @ApiProperty({ example: 'تعهدنامه.pdf', description: 'Original filename.' })
  originalName!: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType!: string;

  @ApiProperty({ example: 512000, description: 'File size in bytes.' })
  size!: number;

  @ApiProperty({ example: '۵۰۰ کیلوبایت', description: 'Ready-to-show Persian size.' })
  sizeLabel!: string;
}

/** The full announcement shown on the detail page — the list fields plus files. */
export class DormAnnouncementDetailDto extends DormAnnouncementDto {
  @ApiProperty({ type: [DormAnnouncementAttachmentDto] })
  attachments!: DormAnnouncementAttachmentDto[];
}

/** One rule or facility row (the قوانین/امکانات lists share this shape). */
export class DormInfoItemDto {
  @ApiProperty({ example: 'clx0info1234' })
  id!: string;

  @ApiProperty({ example: 'رختشویخانه', description: 'Heading line.' })
  title!: string;

  @ApiProperty({
    example: 'همه‌روزه ۸ تا ۲۲',
    nullable: true,
    description: 'Optional secondary line (hours / elaboration).',
  })
  detail!: string | null;
}

/** One downloadable dorm form, formatted for display. */
export class DormFormDto {
  @ApiProperty({ example: 'clx0form1234' })
  id!: string;

  @ApiProperty({ example: 'فرم تسویه‌حساب خوابگاه' })
  title!: string;

  @ApiProperty({
    example: 'برای پایان اسکان تکمیل و به سرپرست تحویل دهید.',
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({ example: 'tasvie.pdf', description: 'Original filename.' })
  originalName!: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType!: string;

  @ApiProperty({ example: 240000, description: 'File size in bytes.' })
  size!: number;

  @ApiProperty({ example: '۲۴۰ کیلوبایت', description: 'Ready-to-show Persian size.' })
  sizeLabel!: string;
}

/**
 * The whole dorm hub in ONE payload — the PWA's single call for the خوابگاه page
 * (mirrors the calendar's /calendar/active "one call, fully formatted" approach).
 * Always succeeds with empty arrays before staff add anything, so the PWA shows
 * empty states rather than handling a 404.
 */
export class DormHubDto {
  @ApiProperty({ type: [DormAnnouncementDto] })
  announcements!: DormAnnouncementDto[];

  @ApiProperty({ type: [DormInfoItemDto] })
  rules!: DormInfoItemDto[];

  @ApiProperty({ type: [DormInfoItemDto] })
  facilities!: DormInfoItemDto[];

  @ApiProperty({ type: [DormFormDto] })
  forms!: DormFormDto[];
}

/** What kind of change happened, pushed over the announcements SSE stream. */
export type DormStreamType = 'created' | 'updated' | 'deleted' | 'ping';

/**
 * A single Server-Sent Event payload. `created`/`updated` carry the full `item`;
 * `deleted` carries only its `id`; `ping` is a keep-alive the client ignores.
 */
export interface DormStreamEvent {
  type: DormStreamType;
  item?: DormAnnouncementDto;
  id?: string;
}
