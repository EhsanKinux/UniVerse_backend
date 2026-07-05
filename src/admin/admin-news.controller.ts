import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Res,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { unlink } from 'node:fs/promises';
import { formatFileSize } from '../common/file-size.util';
import {
  NEWS_CATEGORIES,
  NEWS_CATEGORY_LABELS,
  newsCategoryLabel,
} from '../news/dto/news-categories';
import {
  createNewsMulterOptions,
  NEWS_MAX_ATTACHMENTS,
} from '../news/news-upload.config';
import {
  NewsFiles,
  NewsInput,
  NewsService,
  UploadedNewsFile,
} from '../news/news.service';
import { AdminAuthFilter } from './admin-auth.filter';
import { AdminGuard } from './admin.guard';
import { NewsFormDto } from './dto/news-form.dto';

/** The two file fields on the news form: a single cover + many attachments. */
const NEWS_FILE_FIELDS = [
  { name: 'cover', maxCount: 1 },
  { name: 'files', maxCount: NEWS_MAX_ATTACHMENTS },
];

/** What FileFieldsInterceptor hands back for those two fields. */
interface NewsUploadFields {
  cover?: Express.Multer.File[];
  files?: Express.Multer.File[];
}

/** The view shape used to render (and re-fill) the news form. */
interface NewsFormView {
  title: string;
  category: string;
  body: string;
  link: string;
  pinned: boolean;
  isPublished: boolean;
  id?: string;
  hasCover?: boolean;
  attachments?: { id: string; originalName: string; sizeLabel: string }[];
}

/** The blank item used to render an empty "create" form. */
const EMPTY_NEWS: NewsFormView = {
  title: '',
  category: 'academic',
  body: '',
  link: '',
  pinned: false,
  isPublished: true,
};

/**
 * The staff-facing "news & announcements" admin section under /admin/news. It
 * reuses NewsService for every read/write — so the publish rules AND the
 * real-time broadcast (NewsService emits on each change) happen in one place.
 * Every route is gated by AdminGuard. The create/edit forms are multipart so
 * staff can attach a cover image + files; those go through the news-specific
 * Multer config (broader MIME allowlist than the documents PDF-only one).
 */
@ApiExcludeController()
@Controller('admin/news')
@UseFilters(AdminAuthFilter)
@UseGuards(AdminGuard)
export class AdminNewsController {
  constructor(private readonly news: NewsService) {}

  @Get()
  async list(@Res() res: Response): Promise<void> {
    const rows = await this.news.listAll();
    res.render('admin/news', {
      title: 'اخبار و اطلاعیه‌ها',
      nav: true,
      activeNav: 'news',
      hasItems: rows.length > 0,
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        categoryLabel: newsCategoryLabel(r.category),
        pinned: r.pinned,
        isPublished: r.isPublished,
        date: this.formatDate(r.publishedAt),
      })),
    });
  }

  @Get('new')
  newForm(@Res() res: Response): void {
    res.render(
      'admin/news-form',
      this.formContext({
        mode: 'create',
        action: '/admin/news',
        news: EMPTY_NEWS,
        error: null,
      }),
    );
  }

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(NEWS_FILE_FIELDS, createNewsMulterOptions()),
  )
  async create(
    @Body() dto: NewsFormDto,
    @UploadedFiles() files: NewsUploadFields,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.news.create(this.fromDto(dto), this.toNewsFiles(files));
      res.redirect('/admin/news');
    } catch (error) {
      await this.cleanupUploads(files);
      res.status(400).render(
        'admin/news-form',
        this.formContext({
          mode: 'create',
          action: '/admin/news',
          news: this.dtoToView(dto),
          error: this.errorMessage(error),
        }),
      );
    }
  }

  @Get(':id/edit')
  async editForm(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const r = await this.news.getNewsWithAttachments(id);
    res.render(
      'admin/news-form',
      this.formContext({
        mode: 'edit',
        action: `/admin/news/${id}`,
        news: {
          id: r.id,
          title: r.title,
          category: r.category,
          body: r.body,
          link: r.link ?? '',
          pinned: r.pinned,
          isPublished: r.isPublished,
          hasCover: r.coverStoredName != null,
          attachments: r.attachments.map((a) => ({
            id: a.id,
            originalName: a.originalName,
            sizeLabel: formatFileSize(a.size),
          })),
        },
        error: null,
      }),
    );
  }

  @Post(':id')
  @UseInterceptors(
    FileFieldsInterceptor(NEWS_FILE_FIELDS, createNewsMulterOptions()),
  )
  async update(
    @Param('id') id: string,
    @Body() dto: NewsFormDto,
    @UploadedFiles() files: NewsUploadFields,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.news.update(id, this.fromDto(dto), this.toNewsFiles(files));
      res.redirect('/admin/news');
    } catch (error) {
      await this.cleanupUploads(files);
      // Re-load the item's existing files so the re-rendered form still shows them.
      const existing = await this.news
        .getNewsWithAttachments(id)
        .catch(() => null);
      res.status(400).render(
        'admin/news-form',
        this.formContext({
          mode: 'edit',
          action: `/admin/news/${id}`,
          news: {
            ...this.dtoToView(dto),
            id,
            hasCover: existing?.coverStoredName != null,
            attachments:
              existing?.attachments.map((a) => ({
                id: a.id,
                originalName: a.originalName,
                sizeLabel: formatFileSize(a.size),
              })) ?? [],
          },
          error: this.errorMessage(error),
        }),
      );
    }
  }

  @Post(':id/delete')
  async remove(@Param('id') id: string, @Res() res: Response): Promise<void> {
    await this.news.remove(id);
    res.redirect('/admin/news');
  }

  /** Delete a single attachment, then return to the edit form. */
  @Post(':id/attachments/:attId/delete')
  async removeAttachment(
    @Param('id') id: string,
    @Param('attId') attId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.news.removeAttachment(attId);
    res.redirect(`/admin/news/${id}/edit`);
  }

  /** Remove the cover image, then return to the edit form. */
  @Post(':id/cover/delete')
  async removeCover(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.news.removeCover(id);
    res.redirect(`/admin/news/${id}/edit`);
  }

  /** Quick publish/unpublish toggle from the list (flips isPublished). */
  @Post(':id/toggle')
  async toggle(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const r = await this.news.getNews(id);
    await this.news.update(id, {
      title: r.title,
      category: r.category,
      body: r.body,
      link: r.link,
      pinned: r.pinned,
      isPublished: !r.isPublished,
    });
    res.redirect('/admin/news');
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  /** Map the raw form DTO (strings + "on" checkboxes) to the service input. */
  private fromDto(dto: NewsFormDto): NewsInput {
    return {
      title: dto.title,
      category: dto.category,
      body: dto.body,
      link: dto.link,
      pinned: dto.pinned === 'on',
      isPublished: dto.isPublished === 'on',
    };
  }

  /** Turn multer's uploaded files into the service's NewsFiles shape. */
  private toNewsFiles(files?: NewsUploadFields): NewsFiles {
    const cover = files?.cover?.[0];
    return {
      cover: cover ? this.toUploaded(cover) : undefined,
      attachments: (files?.files ?? []).map((f) => this.toUploaded(f)),
    };
  }

  private toUploaded(f: Express.Multer.File): UploadedNewsFile {
    return {
      storedName: f.filename,
      originalName: f.originalname,
      mimeType: f.mimetype,
      size: f.size,
    };
  }

  /** Multer already wrote the uploads to disk; if we won't keep them (validation
   *  failed), delete the orphans before re-rendering the form. */
  private async cleanupUploads(files?: NewsUploadFields): Promise<void> {
    // diskStorage always sets `path`, so every entry maps to a real unlink.
    const all = [...(files?.cover ?? []), ...(files?.files ?? [])];
    await Promise.all(all.map((f) => unlink(f.path).catch(() => undefined)));
  }

  /** The form's view shape, used to re-fill the form after a validation error. */
  private dtoToView(dto: NewsFormDto): NewsFormView {
    return {
      title: dto.title ?? '',
      category: dto.category ?? 'academic',
      body: dto.body ?? '',
      link: dto.link ?? '',
      pinned: dto.pinned === 'on',
      isPublished: dto.isPublished === 'on',
    };
  }

  private formContext(params: {
    mode: 'create' | 'edit';
    action: string;
    news: NewsFormView;
    error: string | null;
  }) {
    return {
      title: params.mode === 'create' ? 'خبر جدید' : 'ویرایش خبر',
      nav: true,
      activeNav: 'news',
      isEdit: params.mode === 'edit',
      action: params.action,
      categoryOptions: NEWS_CATEGORIES.map((value) => ({
        value,
        label: NEWS_CATEGORY_LABELS[value],
      })),
      news: params.news,
      error: params.error,
    };
  }

  /** e.g. «۱۶ خرداد ۱۴۰۵» — the publish date for the admin list. */
  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      timeZone: 'Asia/Tehran',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
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
