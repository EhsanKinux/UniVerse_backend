import { ApiProperty } from '@nestjs/swagger';

/**
 * One document, formatted for display so the PWA needs no formatting logic of
 * its own (size and date arrive ready to show, mirroring how the calendar API
 * pre-formats its dates).
 */
export class DocumentDto {
  @ApiProperty({ example: 'clx0doc1234' })
  id!: string;

  @ApiProperty({ example: 'courses' })
  category!: string;

  @ApiProperty({ example: 'دروس ارائه‌شده نیمسال دوم ۱۴۰۴-۱۴۰۵' })
  title!: string;

  @ApiProperty({ example: 'برگرفته از سامانهٔ گلستان', nullable: true })
  description!: string | null;

  @ApiProperty({
    example: 'download.pdf',
    description: 'The original filename; suggested name when downloaded.',
  })
  originalName!: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType!: string;

  @ApiProperty({ example: 4404019, description: 'File size in bytes.' })
  size!: number;

  @ApiProperty({
    example: '۴٫۲ مگابایت',
    description: 'Pre-formatted Persian size.',
  })
  sizeLabel!: string;

  @ApiProperty({
    example: 81,
    nullable: true,
    description: 'Page count, when staff provided one.',
  })
  pageCount!: number | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({
    example: '2026-06-24T08:30:00.000Z',
    description: 'ISO timestamp of the last change.',
  })
  updatedAt!: string;

  @ApiProperty({
    example: '۳ تیر ۱۴۰۵',
    description: 'Pre-formatted Persian date of the last change.',
  })
  updatedAtLabel!: string;
}

/** Everything a page needs in one call: the active file plus the archive. */
export class CategoryDocumentsDto {
  @ApiProperty({ example: 'courses' })
  category!: string;

  @ApiProperty({
    example: 'دروس ارائه‌شده',
    description: 'Persian category label.',
  })
  categoryLabel!: string;

  @ApiProperty({
    type: DocumentDto,
    nullable: true,
    description: 'The currently published file, or null if none yet.',
  })
  active!: DocumentDto | null;

  @ApiProperty({
    type: [DocumentDto],
    description: 'Older (non-active) files, newest first.',
  })
  archive!: DocumentDto[];
}
