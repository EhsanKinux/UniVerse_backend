import {
  Controller,
  Get,
  Param,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { contentDisposition } from '../common/content-disposition.util';
import { GroupCategoryDto } from './dto/groups.dto';
import { GroupsService } from './groups.service';

/**
 * Public, read-only «گروه‌ها» directory consumed by the PWA. The write side
 * (categories, groups and their join options) lives in the staff-only admin panel.
 *   • GET /groups                 — every published category → group → join option.
 *   • GET /groups/links/:id/qr    — stream a QR image (inline).
 */
@ApiTags('groups')
@Controller('groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  @ApiOperation({
    summary: 'Published group categories with their groups and join options',
  })
  @ApiOkResponse({ type: [GroupCategoryDto] })
  list(): Promise<GroupCategoryDto[]> {
    return this.groups.getPublishedTree();
  }

  // Declared under the literal `links/` segment so it's never mistaken for a
  // category id (mirrors how the news controller orders `file/:id`).
  @Get('links/:id/qr')
  @ApiOperation({ summary: 'Stream a join option’s QR image (inline)' })
  @ApiParam({ name: 'id', description: 'Join option (GroupLink) id' })
  async streamQr(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.groups.openQr(id);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.size),
      'Content-Disposition': contentDisposition('inline', file.originalName),
      'Cache-Control': 'public, max-age=86400',
    });
    return new StreamableFile(file.stream);
  }
}
