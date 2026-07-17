import {
  Controller,
  Get,
  type MessageEvent,
  Param,
  ParseIntPipe,
  Query,
  Res,
  Sse,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { Observable } from 'rxjs';
import { contentDisposition } from '../common/content-disposition.util';
import {
  DormAnnouncementDetailDto,
  DormAnnouncementDto,
  DormHubDto,
} from './dto/dorm.dto';
import { DormService } from './dorm.service';

/**
 * Public, read-only dormitory API consumed by the PWA. The write side (create /
 * edit / delete for every section) lives in the staff-only admin panel. Endpoints:
 *   • GET /dorm                          — the whole hub in one call.
 *   • GET /dorm/announcements            — the published announcements feed.
 *   • GET /dorm/announcements/stream     — an SSE feed of announcement changes.
 *   • GET /dorm/announcements/file/:id   — stream an attachment (inline; ?download=1).
 *   • GET /dorm/announcements/:id/cover  — stream an announcement's cover image.
 *   • GET /dorm/announcements/:id        — one published announcement + attachments.
 *   • GET /dorm/forms/file/:id           — stream a form's file (inline; ?download=1).
 */
@ApiTags('dorm')
@Controller('dorm')
export class DormController {
  constructor(private readonly dorm: DormService) {}

  @Get()
  @ApiOperation({ summary: 'The whole خوابگاه hub (announcements, rules, facilities, forms)' })
  @ApiOkResponse({ type: DormHubDto })
  hub(): Promise<DormHubDto> {
    return this.dorm.getHub();
  }

  @Get('announcements')
  @ApiOperation({ summary: 'Published dorm announcements (pinned first, then newest)' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse({ type: [DormAnnouncementDto] })
  listAnnouncements(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<DormAnnouncementDto[]> {
    return this.dorm.listPublishedAnnouncements(limit);
  }

  // Declared before the `:id` routes so "stream" is never read as an id.
  @Sse('announcements/stream')
  @ApiOperation({ summary: 'Real-time SSE stream of announcement changes' })
  stream(): Observable<MessageEvent> {
    return this.dorm.stream();
  }

  @Get('announcements/file/:id')
  @ApiOperation({ summary: 'Stream an announcement attachment (inline; ?download=1 forces)' })
  @ApiParam({ name: 'id', description: 'Attachment id' })
  async streamAttachment(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.dorm.openAttachment(id);
    return this.streamFile(res, file, download);
  }

  @Get('forms/file/:id')
  @ApiOperation({ summary: 'Stream a dorm form file (inline; ?download=1 forces)' })
  @ApiParam({ name: 'id', description: 'Form id' })
  async streamForm(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.dorm.openForm(id);
    return this.streamFile(res, file, download);
  }

  @Get('announcements/:id/cover')
  @ApiOperation({ summary: "Stream an announcement's cover image (inline)" })
  @ApiParam({ name: 'id', description: 'Announcement id' })
  async streamCover(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.dorm.openCover(id);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.size),
      'Content-Disposition': contentDisposition('inline', file.originalName),
      'Cache-Control': 'public, max-age=86400',
    });
    return new StreamableFile(file.stream);
  }

  @Get('announcements/:id')
  @ApiOperation({ summary: 'One published announcement with its attachments' })
  @ApiParam({ name: 'id', description: 'Announcement id' })
  @ApiOkResponse({ type: DormAnnouncementDetailDto })
  detail(@Param('id') id: string): Promise<DormAnnouncementDetailDto> {
    return this.dorm.getPublishedAnnouncement(id);
  }

  /** Shared header-setting + StreamableFile wrap for the two file endpoints. */
  private streamFile(
    res: Response,
    file: { mimeType: string; size: number; originalName: string; stream: Readable },
    download: string | undefined,
  ): StreamableFile {
    const disposition = download !== undefined ? 'attachment' : 'inline';
    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.size),
      'Content-Disposition': contentDisposition(disposition, file.originalName),
      'Cache-Control': 'public, max-age=86400',
    });
    return new StreamableFile(file.stream);
  }
}
