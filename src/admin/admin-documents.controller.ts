import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { unlink } from 'node:fs/promises';
import { DocumentsService } from '../documents/documents.service';
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
} from '../documents/dto/document-categories';
import { AdminAuthFilter } from './admin-auth.filter';
import { AdminGuard } from './admin.guard';
import { DocumentFormDto } from './dto/document-form.dto';

/**
 * The staff-facing "documents & files" admin section, served as server-rendered
 * Handlebars under /admin/documents. It reuses DocumentsService for every
 * read/write, so the file rules live in exactly one place — mirroring how the
 * calendar admin reuses CalendarService. Every route is gated by AdminGuard.
 */
@ApiExcludeController()
@Controller('admin/documents')
@UseFilters(AdminAuthFilter)
@UseGuards(AdminGuard)
export class AdminDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  async dashboard(@Res() res: Response): Promise<void> {
    res.render('admin/documents', await this.buildDashboard());
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Body() dto: DocumentFormDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Res() res: Response,
  ): Promise<void> {
    try {
      if (!file) {
        throw new BadRequestException('فایلی انتخاب نشده است.');
      }
      await this.documents.create(
        {
          category: dto.category,
          title: dto.title,
          description: dto.description,
          pageCount: dto.pageCount,
          makeActive: dto.makeActive === 'on',
        },
        {
          storedName: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
        },
      );
      res.redirect('/admin/documents');
    } catch (error) {
      // Multer already wrote the file to disk; since we're NOT keeping a row for
      // it, delete the orphan before re-rendering the form with the error.
      if (file?.path) {
        await unlink(file.path).catch(() => undefined);
      }
      res.status(400).render(
        'admin/documents',
        await this.buildDashboard({
          error: this.errorMessage(error),
          form: dto,
        }),
      );
    }
  }

  @Post(':id/activate')
  async activate(@Param('id') id: string, @Res() res: Response): Promise<void> {
    await this.documents.activate(id);
    res.redirect('/admin/documents');
  }

  @Post(':id/delete')
  async remove(@Param('id') id: string, @Res() res: Response): Promise<void> {
    await this.documents.remove(id);
    res.redirect('/admin/documents');
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  /** Build the page model: each known category with its files (active first),
   *  reusing the same DTO formatting (size + Jalali date) the public API uses. */
  private async buildDashboard(extra?: {
    error?: string;
    form?: Partial<DocumentFormDto>;
  }) {
    const categories = await Promise.all(
      DOCUMENT_CATEGORIES.map(async (slug) => {
        const data = await this.documents.getCategoryDocuments(slug);
        const documents = data.active
          ? [data.active, ...data.archive]
          : data.archive;
        return { slug, label: data.categoryLabel, documents };
      }),
    );
    return {
      title: 'اسناد و فایل‌ها',
      nav: true,
      activeNav: 'documents',
      categories,
      categoryOptions: DOCUMENT_CATEGORIES.map((value) => ({
        value,
        label: DOCUMENT_CATEGORY_LABELS[value],
      })),
      error: extra?.error ?? null,
      form: extra?.form ?? {},
    };
  }

  /** Pull a human (Persian) message out of whatever the service threw. */
  private errorMessage(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      const message = (response as { message?: string | string[] }).message;
      if (Array.isArray(message)) return message.join('، ');
      if (typeof message === 'string') return message;
      return error.message;
    }
    return 'خطایی رخ داد. دوباره تلاش کنید.';
  }
}
