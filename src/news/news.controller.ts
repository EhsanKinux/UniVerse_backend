import {
  Controller,
  Get,
  type MessageEvent,
  Param,
  Query,
  Res,
  Sse,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { contentDisposition } from '../common/content-disposition.util';
import { NewsDetailDto, NewsDto } from './dto/news.dto';
import { NewsService } from './news.service';

/**
 * Public, read-only news API consumed by the PWA. The write side (create / edit /
 * delete) lives in the staff-only admin panel. Endpoints:
 *   • GET /news                — the current published list (React Query reads this).
 *   • GET /news/stream         — a Server-Sent Events feed of changes.
 *   • GET /news/file/:id       — stream an attachment (inline; ?download=1 forces).
 *   • GET /news/:id/cover      — stream an item's cover image (inline).
 *   • GET /news/:id            — one published item with its attachments (detail).
 */
@ApiTags('news')
@Controller('news')
export class NewsController {
  constructor(private readonly news: NewsService) {}

  @Get()
  @ApiOperation({
    summary: 'Published news/announcements (pinned first, then newest)',
  })
  @ApiOkResponse({ type: [NewsDto] })
  list(): Promise<NewsDto[]> {
    return this.news.listPublished();
  }

  // @Sse marks this as a Server-Sent Events endpoint: NestJS keeps the HTTP
  // response open and streams every value the Observable emits as a `data:`
  // frame. The browser connects with `new EventSource('/news/stream')`.
  @Sse('stream')
  @ApiOperation({
    summary:
      'Real-time stream (SSE) of news changes: created / updated / deleted',
  })
  stream(): Observable<MessageEvent> {
    return this.news.stream();
  }

  // Declared before `:id` so these literal/extra-segment paths are never mistaken
  // for a news id (mirrors how the documents controller orders `file/:id`).
  @Get('file/:id')
  @ApiOperation({
    summary:
      'Stream a news attachment (inline; add ?download=1 to force a download)',
  })
  @ApiParam({ name: 'id', description: 'Attachment id' })
  async streamAttachment(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.news.openAttachment(id);
    const disposition = download !== undefined ? 'attachment' : 'inline';
    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.size),
      'Content-Disposition': contentDisposition(disposition, file.originalName),
      'Cache-Control': 'public, max-age=86400',
    });
    return new StreamableFile(file.stream);
  }

  @Get(':id/cover')
  @ApiOperation({ summary: "Stream a news item's cover image (inline)" })
  @ApiParam({ name: 'id', description: 'News id' })
  async streamCover(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.news.openCover(id);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.size),
      'Content-Disposition': contentDisposition('inline', file.originalName),
      'Cache-Control': 'public, max-age=86400',
    });
    return new StreamableFile(file.stream);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One published news item with its attachments' })
  @ApiParam({ name: 'id', description: 'News id' })
  @ApiOkResponse({ type: NewsDetailDto })
  detail(@Param('id') id: string): Promise<NewsDetailDto> {
    return this.news.getPublishedDetail(id);
  }
}
