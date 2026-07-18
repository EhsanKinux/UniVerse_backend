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
} from '@nestjs/swagger';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { Observable } from 'rxjs';
import { contentDisposition } from '../common/content-disposition.util';
import {
  FoodAnnouncementDetailDto,
  FoodAnnouncementDto,
  FoodHubDto,
  FoodPlaceDto,
} from './dto/food.dto';
import { FoodPlacesService } from './food-places.service';
import { FoodService } from './food.service';

/**
 * Public, read-only food API consumed by the PWA. The write side (announcements
 * + weekly menu) lives in the staff-only admin panel. Endpoints:
 *   • GET /food                          — menu + announcements in one call.
 *   • GET /food/places?lat&lng&radius    — live nearby food places (OSM proxy).
 *   • GET /food/announcements            — the published announcements feed.
 *   • GET /food/announcements/stream     — an SSE feed of announcement changes.
 *   • GET /food/announcements/file/:id   — stream an attachment (inline; ?download=1).
 *   • GET /food/announcements/:id/cover  — stream an announcement's cover image.
 *   • GET /food/announcements/:id        — one published announcement + attachments.
 *   • GET /food/menu/file/:id            — stream a weekly menu file (inline; ?download=1).
 */
@ApiTags('food')
@Controller('food')
export class FoodController {
  constructor(
    private readonly food: FoodService,
    private readonly places: FoodPlacesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'The staff-managed تغذیه hub (weekly menu + announcements)' })
  @ApiOkResponse({ type: FoodHubDto })
  hub(): Promise<FoodHubDto> {
    return this.food.getHub();
  }

  @Get('places')
  @ApiOperation({
    summary: 'Live nearby food places from OpenStreetMap, nearest first',
  })
  @ApiQuery({ name: 'lat', description: 'Latitude of the search centre' })
  @ApiQuery({ name: 'lng', description: 'Longitude of the search centre' })
  @ApiQuery({
    name: 'radius',
    required: false,
    description: 'Search radius in metres (200–5000, default 1500)',
  })
  @ApiOkResponse({ type: [FoodPlaceDto] })
  nearbyPlaces(
    @Query('lat') lat: string | undefined,
    @Query('lng') lng: string | undefined,
    @Query('radius') radius: string | undefined,
  ): Promise<FoodPlaceDto[]> {
    return this.places.findNearby(lat, lng, radius);
  }

  @Get('announcements')
  @ApiOperation({ summary: 'Published food announcements (pinned first, then newest)' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse({ type: [FoodAnnouncementDto] })
  listAnnouncements(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<FoodAnnouncementDto[]> {
    return this.food.listPublishedAnnouncements(limit);
  }

  // Declared before the `:id` routes so "stream" is never read as an id.
  @Sse('announcements/stream')
  @ApiOperation({ summary: 'Real-time SSE stream of announcement changes' })
  stream(): Observable<MessageEvent> {
    return this.food.stream();
  }

  @Get('announcements/file/:id')
  @ApiOperation({ summary: 'Stream an announcement attachment (inline; ?download=1 forces)' })
  @ApiParam({ name: 'id', description: 'Attachment id' })
  async streamAttachment(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.food.openAttachment(id);
    return this.streamFile(res, file, download);
  }

  @Get('menu/file/:id')
  @ApiOperation({ summary: 'Stream a weekly menu file (inline; ?download=1 forces)' })
  @ApiParam({ name: 'id', description: 'Menu file id' })
  async streamMenu(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.food.openMenu(id);
    return this.streamFile(res, file, download);
  }

  @Get('announcements/:id/cover')
  @ApiOperation({ summary: "Stream an announcement's cover image (inline)" })
  @ApiParam({ name: 'id', description: 'Announcement id' })
  async streamCover(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.food.openCover(id);
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
  @ApiOkResponse({ type: FoodAnnouncementDetailDto })
  detail(@Param('id') id: string): Promise<FoodAnnouncementDetailDto> {
    return this.food.getPublishedAnnouncement(id);
  }

  /** Shared header-setting + StreamableFile wrap for the file endpoints. */
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
