import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  NEWS_CATEGORIES,
  NEWS_CATEGORY_LABELS,
  newsCategoryLabel,
} from '../news/dto/news-categories';
import { NewsInput, NewsService } from '../news/news.service';
import { AdminAuthFilter } from './admin-auth.filter';
import { AdminGuard } from './admin.guard';
import { NewsFormDto } from './dto/news-form.dto';

/** The blank item used to render an empty "create" form. */
const EMPTY_NEWS = {
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
 * Every route is gated by AdminGuard.
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
  async create(@Body() dto: NewsFormDto, @Res() res: Response): Promise<void> {
    try {
      await this.news.create(this.fromDto(dto));
      res.redirect('/admin/news');
    } catch (error) {
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
    const r = await this.news.getNews(id);
    res.render(
      'admin/news-form',
      this.formContext({
        mode: 'edit',
        action: `/admin/news/${id}`,
        news: {
          title: r.title,
          category: r.category,
          body: r.body,
          link: r.link ?? '',
          pinned: r.pinned,
          isPublished: r.isPublished,
        },
        error: null,
      }),
    );
  }

  @Post(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: NewsFormDto,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.news.update(id, this.fromDto(dto));
      res.redirect('/admin/news');
    } catch (error) {
      res.status(400).render(
        'admin/news-form',
        this.formContext({
          mode: 'edit',
          action: `/admin/news/${id}`,
          news: this.dtoToView(dto),
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

  /** The form's view shape, used to re-fill the form after a validation error. */
  private dtoToView(dto: NewsFormDto) {
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
    news: typeof EMPTY_NEWS;
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
