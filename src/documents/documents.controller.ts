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
import { DocumentsService } from './documents.service';
import { CategoryDocumentsDto } from './dto/document.dto';

/**
 * Public, read-only documents API consumed by the PWA. The matching write side
 * (upload / activate / delete) lives in the staff-only admin panel, not here.
 */
@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  // Declared before `:category` so "file" is never mistaken for a category. (It
  // wouldn't be anyway — this path has an extra segment — but order makes intent
  // clear.) This is the URL the PWA links to for viewing/downloading.
  @Get('file/:id')
  @ApiOperation({
    summary:
      "Stream a document's file (inline; add ?download=1 to force a download)",
  })
  @ApiParam({ name: 'id', description: 'Document id' })
  @ApiProduces('application/pdf')
  async streamFile(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.documents.openFile(id);
    const disposition = download !== undefined ? 'attachment' : 'inline';
    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.size),
      'Content-Disposition': contentDisposition(disposition, file.originalName),
      // The file changes at most once a term, so let browsers cache it a day.
      'Cache-Control': 'public, max-age=86400',
    });
    return new StreamableFile(file.stream);
  }

  @Get(':category')
  @ApiOperation({
    summary: 'Active document + archive for a category (e.g. "courses")',
  })
  @ApiParam({ name: 'category', example: 'courses' })
  @ApiOkResponse({ type: CategoryDocumentsDto })
  getCategory(
    @Param('category') category: string,
  ): Promise<CategoryDocumentsDto> {
    return this.documents.getCategoryDocuments(category);
  }
}
