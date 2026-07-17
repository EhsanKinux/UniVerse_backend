import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Query,
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
  DORM_ANNOUNCEMENT_CATEGORIES,
  DORM_ANNOUNCEMENT_CATEGORY_LABELS,
  dormAnnouncementCategoryLabel,
  dormInfoSectionLabel,
  isKnownDormInfoSection,
} from '../dorm/dto/dorm-categories';
import {
  DormAnnouncementFiles,
  DormAnnouncementInput,
  DormService,
  UploadedDormFile,
} from '../dorm/dorm.service';
import {
  createDormAnnouncementMulterOptions,
  createDormFormMulterOptions,
  DORM_MAX_ATTACHMENTS,
} from '../dorm/dorm-upload.config';
import { AdminAuthFilter } from './admin-auth.filter';
import { AdminGuard } from './admin.guard';
import { DormAnnouncementFormDto } from './dto/dorm-announcement-form.dto';
import { DormFormFormDto } from './dto/dorm-form-form.dto';
import { DormInfoFormDto } from './dto/dorm-info-form.dto';

/** The two file fields on the announcement form: one cover + many attachments. */
const ANNOUNCEMENT_FILE_FIELDS = [
  { name: 'cover', maxCount: 1 },
  { name: 'files', maxCount: DORM_MAX_ATTACHMENTS },
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
 * The staff-facing خوابگاه admin section under /admin/dormitory. It reuses
 * DormService for every read/write — so the publish rules AND the real-time
 * broadcast (push + SSE on a new announcement) happen in one place. Every route
 * is gated by AdminGuard. Announcement create/edit are multipart (cover + files);
 * form upload is single-file.
 */
@ApiExcludeController()
@Controller('admin/dormitory')
@UseFilters(AdminAuthFilter)
@UseGuards(AdminGuard)
export class AdminDormController {
  constructor(private readonly dorm: DormService) {}

  // ===========================================================================
  // DASHBOARD — all three sections on one page.
  // ===========================================================================

  @Get()
  async dashboard(@Res() res: Response): Promise<void> {
    const [announcements, rules, facilities, forms] = await Promise.all([
      this.dorm.listAllAnnouncements(),
      this.dorm.listAllInfo('rules'),
      this.dorm.listAllInfo('facilities'),
      this.dorm.listAllForms(),
    ]);

    res.render('admin/dorm', {
      title: 'خوابگاه',
      nav: true,
      activeNav: 'dorm',
      announcements: announcements.map((a) => ({
        id: a.id,
        title: a.title,
        categoryLabel: dormAnnouncementCategoryLabel(a.category),
        pinned: a.pinned,
        isPublished: a.isPublished,
        date: this.formatDate(a.publishedAt),
      })),
      hasAnnouncements: announcements.length > 0,
      rules: rules.map((r) => this.infoRow(r)),
      hasRules: rules.length > 0,
      facilities: facilities.map((f) => this.infoRow(f)),
      hasFacilities: facilities.length > 0,
      forms: forms.map((f) => ({
        id: f.id,
        title: f.title,
        description: f.description,
        sizeLabel: formatFileSize(f.size),
        isPublished: f.isPublished,
        sortOrder: f.sortOrder,
      })),
      hasForms: forms.length > 0,
    });
  }

  // ===========================================================================
  // ANNOUNCEMENTS
  // ===========================================================================

  @Get('announcements/new')
  newAnnouncement(@Res() res: Response): void {
    res.render(
      'admin/dorm-announcement-form',
      this.announcementContext({
        mode: 'create',
        action: '/admin/dormitory/announcements',
        item: EMPTY_ANNOUNCEMENT,
        error: null,
      }),
    );
  }

  @Post('announcements')
  @UseInterceptors(
    FileFieldsInterceptor(
      ANNOUNCEMENT_FILE_FIELDS,
      createDormAnnouncementMulterOptions(),
    ),
  )
  async createAnnouncement(
    @Body() dto: DormAnnouncementFormDto,
    @UploadedFiles() files: AnnouncementUploadFields,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.dorm.createAnnouncement(
        this.fromAnnouncementDto(dto),
        this.toAnnouncementFiles(files),
      );
      res.redirect('/admin/dormitory');
    } catch (error) {
      await this.cleanupUploads(files);
      res.status(400).render(
        'admin/dorm-announcement-form',
        this.announcementContext({
          mode: 'create',
          action: '/admin/dormitory/announcements',
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
    const r = await this.dorm.getAnnouncementWithAttachments(id);
    res.render(
      'admin/dorm-announcement-form',
      this.announcementContext({
        mode: 'edit',
        action: `/admin/dormitory/announcements/${id}`,
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
      createDormAnnouncementMulterOptions(),
    ),
  )
  async updateAnnouncement(
    @Param('id') id: string,
    @Body() dto: DormAnnouncementFormDto,
    @UploadedFiles() files: AnnouncementUploadFields,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.dorm.updateAnnouncement(
        id,
        this.fromAnnouncementDto(dto),
        this.toAnnouncementFiles(files),
      );
      res.redirect('/admin/dormitory');
    } catch (error) {
      await this.cleanupUploads(files);
      const existing = await this.dorm
        .getAnnouncementWithAttachments(id)
        .catch(() => null);
      res.status(400).render(
        'admin/dorm-announcement-form',
        this.announcementContext({
          mode: 'edit',
          action: `/admin/dormitory/announcements/${id}`,
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
    await this.dorm.removeAnnouncement(id);
    res.redirect('/admin/dormitory');
  }

  @Post('announcements/:id/toggle')
  async toggleAnnouncement(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const r = await this.dorm.getAnnouncement(id);
    await this.dorm.updateAnnouncement(id, {
      title: r.title,
      category: r.category,
      body: r.body,
      link: r.link,
      pinned: r.pinned,
      isPublished: !r.isPublished,
    });
    res.redirect('/admin/dormitory');
  }

  @Post('announcements/:id/attachments/:attId/delete')
  async removeAnnouncementAttachment(
    @Param('id') id: string,
    @Param('attId') attId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.dorm.removeAttachment(attId);
    res.redirect(`/admin/dormitory/announcements/${id}/edit`);
  }

  @Post('announcements/:id/cover/delete')
  async removeAnnouncementCover(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.dorm.removeCover(id);
    res.redirect(`/admin/dormitory/announcements/${id}/edit`);
  }

  // ===========================================================================
  // INFO ITEMS (rules + facilities)
  // ===========================================================================

  @Get('info/new')
  newInfo(@Query('section') section: string | undefined, @Res() res: Response): void {
    const sec = isKnownDormInfoSection(section ?? '') ? section! : 'rules';
    res.render(
      'admin/dorm-info-form',
      this.infoContext({
        mode: 'create',
        action: '/admin/dormitory/info',
        section: sec,
        item: { title: '', detail: '', sortOrder: 0, isPublished: true },
        error: null,
      }),
    );
  }

  @Post('info')
  async createInfo(
    @Body() dto: DormInfoFormDto,
    @Res() res: Response,
  ): Promise<void> {
    const sec = isKnownDormInfoSection(dto.section ?? '') ? dto.section! : 'rules';
    try {
      await this.dorm.createInfoItem(this.fromInfoDto(dto));
      res.redirect('/admin/dormitory');
    } catch (error) {
      res.status(400).render(
        'admin/dorm-info-form',
        this.infoContext({
          mode: 'create',
          action: '/admin/dormitory/info',
          section: sec,
          item: this.infoDtoToView(dto),
          error: this.errorMessage(error),
        }),
      );
    }
  }

  @Get('info/:id/edit')
  async editInfo(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const r = await this.dorm.getInfoItem(id);
    res.render(
      'admin/dorm-info-form',
      this.infoContext({
        mode: 'edit',
        action: `/admin/dormitory/info/${id}`,
        section: r.section,
        item: {
          title: r.title,
          detail: r.detail ?? '',
          sortOrder: r.sortOrder,
          isPublished: r.isPublished,
        },
        error: null,
      }),
    );
  }

  @Post('info/:id')
  async updateInfo(
    @Param('id') id: string,
    @Body() dto: DormInfoFormDto,
    @Res() res: Response,
  ): Promise<void> {
    const existing = await this.dorm.getInfoItem(id).catch(() => null);
    try {
      await this.dorm.updateInfoItem(id, this.fromInfoDto(dto));
      res.redirect('/admin/dormitory');
    } catch (error) {
      res.status(400).render(
        'admin/dorm-info-form',
        this.infoContext({
          mode: 'edit',
          action: `/admin/dormitory/info/${id}`,
          section: existing?.section ?? 'rules',
          item: this.infoDtoToView(dto),
          error: this.errorMessage(error),
        }),
      );
    }
  }

  @Post('info/:id/delete')
  async removeInfo(@Param('id') id: string, @Res() res: Response): Promise<void> {
    await this.dorm.removeInfoItem(id);
    res.redirect('/admin/dormitory');
  }

  // ===========================================================================
  // FORMS (فرم‌ها و مدارک)
  // ===========================================================================

  @Get('forms/new')
  newFormPage(@Res() res: Response): void {
    res.render(
      'admin/dorm-form-form',
      this.formContext({
        action: '/admin/dormitory/forms',
        item: { title: '', description: '', sortOrder: 0 },
        error: null,
      }),
    );
  }

  @Post('forms')
  @UseInterceptors(FileInterceptor('file', createDormFormMulterOptions()))
  async createForm(
    @Body() dto: DormFormFormDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Res() res: Response,
  ): Promise<void> {
    try {
      if (!file) {
        throw new HttpException('یک فایل انتخاب کنید.', 400);
      }
      await this.dorm.createForm(this.fromFormDto(dto), this.toUploaded(file));
      res.redirect('/admin/dormitory');
    } catch (error) {
      if (file) {
        await unlink(file.path).catch(() => undefined);
      }
      res.status(400).render(
        'admin/dorm-form-form',
        this.formContext({
          action: '/admin/dormitory/forms',
          item: this.formDtoToView(dto),
          error: this.errorMessage(error),
        }),
      );
    }
  }

  @Post('forms/:id/delete')
  async removeForm(@Param('id') id: string, @Res() res: Response): Promise<void> {
    await this.dorm.removeForm(id);
    res.redirect('/admin/dormitory');
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private infoRow(r: {
    id: string;
    title: string;
    detail: string | null;
    isPublished: boolean;
    sortOrder: number;
  }) {
    return {
      id: r.id,
      title: r.title,
      detail: r.detail,
      isPublished: r.isPublished,
      sortOrder: r.sortOrder,
    };
  }

  // ---- Announcements ----

  private fromAnnouncementDto(dto: DormAnnouncementFormDto): DormAnnouncementInput {
    return {
      title: dto.title,
      category: dto.category,
      body: dto.body,
      link: dto.link,
      pinned: dto.pinned === 'on',
      isPublished: dto.isPublished === 'on',
    };
  }

  private toAnnouncementFiles(files?: AnnouncementUploadFields): DormAnnouncementFiles {
    const cover = files?.cover?.[0];
    return {
      cover: cover ? this.toUploaded(cover) : undefined,
      attachments: (files?.files ?? []).map((f) => this.toUploaded(f)),
    };
  }

  private toUploaded(f: Express.Multer.File): UploadedDormFile {
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

  private announcementDtoToView(dto: DormAnnouncementFormDto): AnnouncementFormView {
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
      title: params.mode === 'create' ? 'اطلاعیهٔ جدید خوابگاه' : 'ویرایش اطلاعیه',
      nav: true,
      activeNav: 'dorm',
      isEdit: params.mode === 'edit',
      action: params.action,
      categoryOptions: DORM_ANNOUNCEMENT_CATEGORIES.map((value) => ({
        value,
        label: DORM_ANNOUNCEMENT_CATEGORY_LABELS[value],
      })),
      item: params.item,
      error: params.error,
    };
  }

  // ---- Info items ----

  private fromInfoDto(dto: DormInfoFormDto) {
    return {
      section: dto.section,
      title: dto.title,
      detail: dto.detail,
      sortOrder: dto.sortOrder,
      isPublished: dto.isPublished === 'on',
    };
  }

  private infoDtoToView(dto: DormInfoFormDto) {
    return {
      title: dto.title ?? '',
      detail: dto.detail ?? '',
      sortOrder: Number(dto.sortOrder ?? 0) || 0,
      isPublished: dto.isPublished === 'on',
    };
  }

  private infoContext(params: {
    mode: 'create' | 'edit';
    action: string;
    section: string;
    item: { title: string; detail: string; sortOrder: number; isPublished: boolean };
    error: string | null;
  }) {
    return {
      title:
        (params.mode === 'create' ? 'افزودن به ' : 'ویرایش ') +
        dormInfoSectionLabel(params.section),
      nav: true,
      activeNav: 'dorm',
      isEdit: params.mode === 'edit',
      action: params.action,
      section: params.section,
      sectionLabel: dormInfoSectionLabel(params.section),
      item: params.item,
      error: params.error,
    };
  }

  // ---- Forms ----

  private fromFormDto(dto: DormFormFormDto) {
    return {
      title: dto.title,
      description: dto.description,
      sortOrder: dto.sortOrder,
      isPublished: dto.isPublished === 'on',
    };
  }

  private formDtoToView(dto: DormFormFormDto) {
    return {
      title: dto.title ?? '',
      description: dto.description ?? '',
      sortOrder: Number(dto.sortOrder ?? 0) || 0,
    };
  }

  private formContext(params: {
    action: string;
    item: { title: string; description: string; sortOrder: number };
    error: string | null;
  }) {
    return {
      title: 'بارگذاری فرم جدید',
      nav: true,
      activeNav: 'dorm',
      action: params.action,
      item: params.item,
      error: params.error,
    };
  }

  // ---- Shared ----

  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      timeZone: 'Asia/Tehran',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }

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
