import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Res,
  UploadedFile,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  FileFieldsInterceptor,
  FileInterceptor,
} from '@nestjs/platform-express';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { unlink } from 'node:fs/promises';
import { formatFileSize } from '../common/file-size.util';
import {
  FOOD_ANNOUNCEMENT_CATEGORIES,
  FOOD_ANNOUNCEMENT_CATEGORY_LABELS,
  foodAnnouncementCategoryLabel,
} from '../food/dto/food-categories';
import {
  FoodAnnouncementFiles,
  FoodAnnouncementInput,
  FoodService,
  UploadedFoodFile,
} from '../food/food.service';
import {
  createFoodAnnouncementMulterOptions,
  createFoodMenuMulterOptions,
  FOOD_MAX_ATTACHMENTS,
} from '../food/food-upload.config';
import { AdminAuthFilter } from './admin-auth.filter';
import { AdminGuard } from './admin.guard';
import { FoodAnnouncementFormDto } from './dto/food-announcement-form.dto';
import { FoodMenuFormDto } from './dto/food-menu-form.dto';

/** The two file fields on the announcement form: one cover + many attachments. */
const ANNOUNCEMENT_FILE_FIELDS = [
  { name: 'cover', maxCount: 1 },
  { name: 'files', maxCount: FOOD_MAX_ATTACHMENTS },
];

interface AnnouncementUploadFields {
  cover?: Express.Multer.File[];
  files?: Express.Multer.File[];
}

/** The view shape used to render (and re-fill) the announcement form. */
interface AnnouncementFormView {
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

const EMPTY_ANNOUNCEMENT: AnnouncementFormView = {
  title: '',
  category: 'general',
  body: '',
  link: '',
  pinned: false,
  isPublished: true,
};

/**
 * The staff-facing تغذیه admin section under /admin/food. It reuses FoodService
 * for every read/write — so the publish rules AND the real-time broadcast (push
 * + SSE on a new announcement) happen in one place. Every route is gated by
 * AdminGuard. Announcement create/edit are multipart (cover + files); the weekly
 * menu upload is single-file. The nearby-places map has NO admin section — it is
 * fed live from OpenStreetMap.
 */
@ApiExcludeController()
@Controller('admin/food')
@UseFilters(AdminAuthFilter)
@UseGuards(AdminGuard)
export class AdminFoodController {
  constructor(private readonly food: FoodService) {}

  // ===========================================================================
  // DASHBOARD — menu history + announcements on one page.
  // ===========================================================================

  @Get()
  async dashboard(@Res() res: Response): Promise<void> {
    const [menus, announcements] = await Promise.all([
      this.food.listAllMenus(),
      this.food.listAllAnnouncements(),
    ]);

    // The newest published row is what students currently see as «منوی هفته».
    const currentId = menus.find((m) => m.isPublished)?.id;

    res.render('admin/food', {
      title: 'تغذیه',
      nav: true,
      activeNav: 'food',
      menus: menus.map((m) => ({
        id: m.id,
        weekLabel: m.weekLabel,
        originalName: m.originalName,
        sizeLabel: formatFileSize(m.size),
        isPublished: m.isPublished,
        isCurrent: m.id === currentId,
        date: this.formatDate(m.createdAt),
      })),
      hasMenus: menus.length > 0,
      announcements: announcements.map((a) => ({
        id: a.id,
        title: a.title,
        categoryLabel: foodAnnouncementCategoryLabel(a.category),
        pinned: a.pinned,
        isPublished: a.isPublished,
        date: this.formatDate(a.publishedAt),
      })),
      hasAnnouncements: announcements.length > 0,
    });
  }

  // ===========================================================================
  // WEEKLY MENU (منوی هفته)
  // ===========================================================================

  @Get('menu/new')
  newMenu(@Res() res: Response): void {
    res.render(
      'admin/food-menu-form',
      this.menuContext({ item: { weekLabel: '' }, error: null }),
    );
  }

  @Post('menu')
  @UseInterceptors(FileInterceptor('file', createFoodMenuMulterOptions()))
  async createMenu(
    @Body() dto: FoodMenuFormDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Res() res: Response,
  ): Promise<void> {
    try {
      if (!file) {
        throw new HttpException('یک فایل انتخاب کنید.', 400);
      }
      await this.food.createMenu(
        { weekLabel: dto.weekLabel, isPublished: dto.isPublished === 'on' },
        this.toUploaded(file),
      );
      res.redirect('/admin/food');
    } catch (error) {
      if (file) {
        await unlink(file.path).catch(() => undefined);
      }
      res.status(400).render(
        'admin/food-menu-form',
        this.menuContext({
          item: { weekLabel: dto.weekLabel ?? '' },
          error: this.errorMessage(error),
        }),
      );
    }
  }

  @Post('menu/:id/delete')
  async removeMenu(@Param('id') id: string, @Res() res: Response): Promise<void> {
    await this.food.removeMenu(id);
    res.redirect('/admin/food');
  }

  // ===========================================================================
  // ANNOUNCEMENTS
  // ===========================================================================

  @Get('announcements/new')
  newAnnouncement(@Res() res: Response): void {
    res.render(
      'admin/food-announcement-form',
      this.announcementContext({
        mode: 'create',
        action: '/admin/food/announcements',
        item: EMPTY_ANNOUNCEMENT,
        error: null,
      }),
    );
  }

  @Post('announcements')
  @UseInterceptors(
    FileFieldsInterceptor(
      ANNOUNCEMENT_FILE_FIELDS,
      createFoodAnnouncementMulterOptions(),
    ),
  )
  async createAnnouncement(
    @Body() dto: FoodAnnouncementFormDto,
    @UploadedFiles() files: AnnouncementUploadFields,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.food.createAnnouncement(
        this.fromAnnouncementDto(dto),
        this.toAnnouncementFiles(files),
      );
      res.redirect('/admin/food');
    } catch (error) {
      await this.cleanupUploads(files);
      res.status(400).render(
        'admin/food-announcement-form',
        this.announcementContext({
          mode: 'create',
          action: '/admin/food/announcements',
          item: this.announcementDtoToView(dto),
          error: this.errorMessage(error),
        }),
      );
    }
  }

  @Get('announcements/:id/edit')
  async editAnnouncement(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const r = await this.food.getAnnouncementWithAttachments(id);
    res.render(
      'admin/food-announcement-form',
      this.announcementContext({
        mode: 'edit',
        action: `/admin/food/announcements/${id}`,
        item: {
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

  @Post('announcements/:id')
  @UseInterceptors(
    FileFieldsInterceptor(
      ANNOUNCEMENT_FILE_FIELDS,
      createFoodAnnouncementMulterOptions(),
    ),
  )
  async updateAnnouncement(
    @Param('id') id: string,
    @Body() dto: FoodAnnouncementFormDto,
    @UploadedFiles() files: AnnouncementUploadFields,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.food.updateAnnouncement(
        id,
        this.fromAnnouncementDto(dto),
        this.toAnnouncementFiles(files),
      );
      res.redirect('/admin/food');
    } catch (error) {
      await this.cleanupUploads(files);
      const existing = await this.food
        .getAnnouncementWithAttachments(id)
        .catch(() => null);
      res.status(400).render(
        'admin/food-announcement-form',
        this.announcementContext({
          mode: 'edit',
          action: `/admin/food/announcements/${id}`,
          item: {
            ...this.announcementDtoToView(dto),
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

  @Post('announcements/:id/delete')
  async removeAnnouncement(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.food.removeAnnouncement(id);
    res.redirect('/admin/food');
  }

  @Post('announcements/:id/toggle')
  async toggleAnnouncement(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const r = await this.food.getAnnouncement(id);
    await this.food.updateAnnouncement(id, {
      title: r.title,
      category: r.category,
      body: r.body,
      link: r.link,
      pinned: r.pinned,
      isPublished: !r.isPublished,
    });
    res.redirect('/admin/food');
  }

  @Post('announcements/:id/attachments/:attId/delete')
  async removeAnnouncementAttachment(
    @Param('id') id: string,
    @Param('attId') attId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.food.removeAttachment(attId);
    res.redirect(`/admin/food/announcements/${id}/edit`);
  }

  @Post('announcements/:id/cover/delete')
  async removeAnnouncementCover(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.food.removeCover(id);
    res.redirect(`/admin/food/announcements/${id}/edit`);
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private fromAnnouncementDto(dto: FoodAnnouncementFormDto): FoodAnnouncementInput {
    return {
      title: dto.title,
      category: dto.category,
      body: dto.body,
      link: dto.link,
      pinned: dto.pinned === 'on',
      isPublished: dto.isPublished === 'on',
    };
  }

  private toAnnouncementFiles(files?: AnnouncementUploadFields): FoodAnnouncementFiles {
    const cover = files?.cover?.[0];
    return {
      cover: cover ? this.toUploaded(cover) : undefined,
      attachments: (files?.files ?? []).map((f) => this.toUploaded(f)),
    };
  }

  private toUploaded(f: Express.Multer.File): UploadedFoodFile {
    return {
      storedName: f.filename,
      originalName: f.originalname,
      mimeType: f.mimetype,
      size: f.size,
    };
  }

  private async cleanupUploads(files?: AnnouncementUploadFields): Promise<void> {
    const all = [...(files?.cover ?? []), ...(files?.files ?? [])];
    await Promise.all(all.map((f) => unlink(f.path).catch(() => undefined)));
  }

  private announcementDtoToView(dto: FoodAnnouncementFormDto): AnnouncementFormView {
    return {
      title: dto.title ?? '',
      category: dto.category ?? 'general',
      body: dto.body ?? '',
      link: dto.link ?? '',
      pinned: dto.pinned === 'on',
      isPublished: dto.isPublished === 'on',
    };
  }

  private announcementContext(params: {
    mode: 'create' | 'edit';
    action: string;
    item: AnnouncementFormView;
    error: string | null;
  }) {
    return {
      title: params.mode === 'create' ? 'اطلاعیهٔ جدید تغذیه' : 'ویرایش اطلاعیه',
      nav: true,
      activeNav: 'food',
      isEdit: params.mode === 'edit',
      action: params.action,
      categoryOptions: FOOD_ANNOUNCEMENT_CATEGORIES.map((value) => ({
        value,
        label: FOOD_ANNOUNCEMENT_CATEGORY_LABELS[value],
      })),
      item: params.item,
      error: params.error,
    };
  }

  private menuContext(params: {
    item: { weekLabel: string };
    error: string | null;
  }) {
    return {
      title: 'بارگذاری منوی هفته',
      nav: true,
      activeNav: 'food',
      action: '/admin/food/menu',
      item: params.item,
      error: params.error,
    };
  }

  /** e.g. «شنبه ۱۶ خرداد» — matches the public DTO's date formatting. */
  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(date);
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpException) {
      const res = error.getResponse();
      if (typeof res === 'string') return res;
      if (res && typeof res === 'object' && 'message' in res) {
        const message = (res as { message: string | string[] }).message;
        return Array.isArray(message) ? message.join('، ') : message;
      }
    }
    return 'خطای غیرمنتظره‌ای رخ داد. دوباره تلاش کنید.';
  }
}
