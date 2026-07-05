import { ApiProperty } from '@nestjs/swagger';
import { CHART_DEPARTMENT_COLORS } from './chart-colors';

/**
 * One downloadable chart PDF, formatted for display so the PWA needs no
 * formatting logic of its own (the size arrives ready to show). The client builds
 * the file URL from the id (GET /chart/file/:id), mirroring the news + documents
 * features.
 */
export class ChartFileDto {
  @ApiProperty({ example: 'clx0file1234' })
  id!: string;

  @ApiProperty({ example: 'کارشناسی مهندسی نرم‌افزار قبل ۱۴۰۳' })
  title!: string;

  @ApiProperty({
    example: 'قبل ۱۴۰۳',
    nullable: true,
    description: 'Optional era/entry-year tag rendered as a small pill.',
  })
  badge!: string | null;

  @ApiProperty({
    example: 'chart-software.pdf',
    description: 'The original filename; the suggested name when downloaded.',
  })
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

/**
 * One department (رشته) with its chart PDFs — the shape the PWA renders as a
 * collapsible card. The whole tree ships in a single GET /chart call because the
 * data is small and changes at most once a term.
 */
export class ChartDepartmentDto {
  @ApiProperty({ example: 'clx0dept1234' })
  id!: string;

  @ApiProperty({
    example: 'computer',
    description:
      'Stable key the PWA maps to a colour token and uses as list key.',
  })
  slug!: string;

  @ApiProperty({ example: 'مهندسی کامپیوتر' })
  title!: string;

  @ApiProperty({
    example: '💻',
    description: 'Emoji shown in the card avatar.',
  })
  icon!: string;

  @ApiProperty({ example: 'computer', enum: CHART_DEPARTMENT_COLORS })
  color!: string;

  @ApiProperty({ type: [ChartFileDto] })
  files!: ChartFileDto[];
}
