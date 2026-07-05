import { ApiProperty } from '@nestjs/swagger';
import { NEWS_CATEGORIES } from './news-categories';

/** One news item, formatted for display so the PWA needs no date logic. */
export class NewsDto {
  @ApiProperty({ example: 'clx0news1234' })
  id!: string;

  @ApiProperty({ example: 'زمان انتخاب واحد نیمسال جدید' })
  title!: string;

  @ApiProperty({ example: 'academic', enum: NEWS_CATEGORIES })
  category!: string;

  @ApiProperty({ example: 'آموزشی', description: 'Persian category label.' })
  categoryLabel!: string;

  @ApiProperty({ example: 'انتخاب واحد از ساعت ۸ صبح فعال می‌شود.' })
  body!: string;

  @ApiProperty({
    example: 'https://example.com',
    nullable: true,
    description: 'Optional "read more" link.',
  })
  link!: string | null;

  @ApiProperty({
    example: false,
    description: 'Pinned items sort to the front.',
  })
  pinned!: boolean;

  @ApiProperty({
    example: '2026-06-06T08:00:00.000Z',
    description: 'ISO publish timestamp.',
  })
  publishedAt!: string;

  @ApiProperty({
    example: 'شنبه ۱۶ خرداد',
    description: 'Pre-formatted Persian date for the card.',
  })
  dateLabel!: string;

  @ApiProperty({
    example: true,
    description:
      'Whether this item has a cover image (stream it at /news/:id/cover).',
  })
  hasCover!: boolean;

  @ApiProperty({
    example: 2,
    description: 'How many files are attached to this item.',
  })
  attachmentCount!: number;
}

/** One file attached to a news item, formatted for display. The client builds the
 *  file URL from the id (GET /news/file/:id), mirroring the documents feature. */
export class NewsAttachmentDto {
  @ApiProperty({ example: 'clx0att1234' })
  id!: string;

  @ApiProperty({ example: 'بخشنامه.pdf', description: 'Original filename.' })
  originalName!: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType!: string;

  @ApiProperty({ example: 512000, description: 'File size in bytes.' })
  size!: number;

  @ApiProperty({
    example: '۵۰۰ کیلوبایت',
    description: 'Ready-to-show Persian size.',
  })
  sizeLabel!: string;
}

/** The full news item shown on the detail page — the list fields plus attachments. */
export class NewsDetailDto extends NewsDto {
  @ApiProperty({ type: [NewsAttachmentDto] })
  attachments!: NewsAttachmentDto[];
}

/** What kind of change happened, pushed over the SSE stream. */
export type NewsStreamType = 'created' | 'updated' | 'deleted' | 'ping';

/**
 * A single Server-Sent Event payload. `created`/`updated` carry the full `item`;
 * `deleted` carries only its `id`; `ping` is a keep-alive the client ignores.
 */
export interface NewsStreamEvent {
  type: NewsStreamType;
  item?: NewsDto;
  id?: string;
}
