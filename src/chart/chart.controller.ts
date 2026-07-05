import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { contentDisposition } from '../common/content-disposition.util';
import { ChartService } from './chart.service';
import { ChartDepartmentDto } from './dto/chart.dto';

/**
 * Public, read-only educational-chart API consumed by the PWA. The matching write
 * side (departments + PDFs) lives in the staff-only admin panel, not here.
 *   • GET /chart          — every published department with its chart PDFs.
 *   • GET /chart/file/:id — stream one chart PDF (inline; ?download=1 forces).
 */
@ApiTags('chart')
@Controller('chart')
export class ChartController {
  constructor(private readonly chart: ChartService) {}

  // Declared before `:...` file paths — none clash here, but order mirrors the
  // documents/news controllers for consistency.
  @Get('file/:id')
  @ApiOperation({
    summary: 'Stream a chart PDF (inline; add ?download=1 to force a download)',
  })
  @ApiParam({ name: 'id', description: 'Chart file id' })
  @ApiProduces('application/pdf')
  async streamFile(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.chart.openFile(id);
    const disposition = download !== undefined ? 'attachment' : 'inline';
    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.size),
      'Content-Disposition': contentDisposition(disposition, file.originalName),
      // Charts change at most once a term, so let browsers cache them a day.
      'Cache-Control': 'public, max-age=86400',
    });
    return new StreamableFile(file.stream);
  }

  @Get()
  @ApiOperation({
    summary: 'Published departments (رشته‌ها) with their chart PDFs',
  })
  @ApiOkResponse({ type: [ChartDepartmentDto] })
  list(): Promise<ChartDepartmentDto[]> {
    return this.chart.getPublishedTree();
  }
}
