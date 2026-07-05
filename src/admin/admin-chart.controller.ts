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
import { createChartMulterOptions } from '../chart/chart-upload.config';
import { ChartService, DepartmentInput } from '../chart/chart.service';
import {
  CHART_COLOR_LABELS,
  CHART_DEPARTMENT_COLORS,
} from '../chart/dto/chart-colors';
import { formatFileSize } from '../common/file-size.util';
import { AdminAuthFilter } from './admin-auth.filter';
import { AdminGuard } from './admin.guard';
import { ChartDepartmentFormDto } from './dto/chart-department-form.dto';
import { ChartFileFormDto } from './dto/chart-file-form.dto';

/** The view shape used to render (and re-fill) the department form. */
interface DepartmentFormView {
  id?: string;
  slug: string;
  title: string;
  icon: string;
  color: string;
  sortOrder: string;
  isPublished: boolean;
  files?: {
    id: string;
    title: string;
    badge: string | null;
    sizeLabel: string;
  }[];
}

/** The blank department used to render an empty "create" form. */
const EMPTY_DEPARTMENT: DepartmentFormView = {
  slug: '',
  title: '',
  icon: '',
  color: CHART_DEPARTMENT_COLORS[0],
  sortOrder: '0',
  isPublished: true,
};

/**
 * The staff-facing "چارت آموزشی" admin section under /admin/chart. It reuses
 * ChartService for every read/write, so the chart rules live in one place. A
 * department is created/edited with the plain form; its PDFs are added one at a
 * time (title + badge + file) from the edit page — mirroring how the news admin
 * manages attachments. Every route is gated by AdminGuard.
 */
@ApiExcludeController()
@Controller('admin/chart')
@UseFilters(AdminAuthFilter)
@UseGuards(AdminGuard)
export class AdminChartController {
  constructor(private readonly chart: ChartService) {}

  // ---------------------------------------------------------------------------
  // DEPARTMENTS
  // ---------------------------------------------------------------------------

  @Get()
  async list(@Res() res: Response): Promise<void> {
    const departments = await this.chart.listAllDepartments();
    res.render('admin/chart', {
      title: 'چارت آموزشی',
      nav: true,
      activeNav: 'chart',
      hasItems: departments.length > 0,
      items: departments.map((d) => ({
        id: d.id,
        slug: d.slug,
        title: d.title,
        icon: d.icon,
        color: d.color,
        isPublished: d.isPublished,
        fileCount: d.files.length,
      })),
    });
  }

  @Get('new')
  newForm(@Res() res: Response): void {
    res.render(
      'admin/chart-form',
      this.formContext({
        mode: 'create',
        action: '/admin/chart',
        department: EMPTY_DEPARTMENT,
        error: null,
      }),
    );
  }

  @Post()
  async create(
    @Body() dto: ChartDepartmentFormDto,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.chart.createDepartment(this.fromDto(dto));
      res.redirect('/admin/chart');
    } catch (error) {
      res.status(400).render(
        'admin/chart-form',
        this.formContext({
          mode: 'create',
          action: '/admin/chart',
          department: this.dtoToView(dto),
          error: this.errorMessage(error),
        }),
      );
    }
  }

  @Get(':id/edit')
  async editForm(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const d = await this.chart.getDepartmentWithFiles(id);
    res.render(
      'admin/chart-form',
      this.formContext({
        mode: 'edit',
        action: `/admin/chart/${id}`,
        department: {
          id: d.id,
          slug: d.slug,
          title: d.title,
          icon: d.icon,
          color: d.color,
          sortOrder: String(d.sortOrder),
          isPublished: d.isPublished,
          files: d.files.map((f) => ({
            id: f.id,
            title: f.title,
            badge: f.badge,
            sizeLabel: formatFileSize(f.size),
          })),
        },
        error: null,
      }),
    );
  }

  @Post(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: ChartDepartmentFormDto,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.chart.updateDepartment(id, this.fromDto(dto));
      res.redirect('/admin/chart');
    } catch (error) {
      // Re-load the department's existing files so the re-rendered form keeps them.
      const existing = await this.chart
        .getDepartmentWithFiles(id)
        .catch(() => null);
      res.status(400).render(
        'admin/chart-form',
        this.formContext({
          mode: 'edit',
          action: `/admin/chart/${id}`,
          department: {
            ...this.dtoToView(dto),
            id,
            files:
              existing?.files.map((f) => ({
                id: f.id,
                title: f.title,
                badge: f.badge,
                sizeLabel: formatFileSize(f.size),
              })) ?? [],
          },
          error: this.errorMessage(error),
        }),
      );
    }
  }

  @Post(':id/delete')
  async remove(@Param('id') id: string, @Res() res: Response): Promise<void> {
    await this.chart.removeDepartment(id);
    res.redirect('/admin/chart');
  }

  /** Quick publish/unpublish toggle from the list. */
  @Post(':id/toggle')
  async toggle(@Param('id') id: string, @Res() res: Response): Promise<void> {
    await this.chart.toggleDepartment(id);
    res.redirect('/admin/chart');
  }

  // ---------------------------------------------------------------------------
  // FILES (chart PDFs)
  // ---------------------------------------------------------------------------

  @Post(':id/files')
  @UseInterceptors(FileInterceptor('file', createChartMulterOptions()))
  async addFile(
    @Param('id') id: string,
    @Body() dto: ChartFileFormDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Res() res: Response,
  ): Promise<void> {
    try {
      if (!file) {
        throw new BadRequestException('فایلی انتخاب نشده است.');
      }
      await this.chart.addFile(
        id,
        { title: dto.title, badge: dto.badge },
        {
          storedName: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
        },
      );
      res.redirect(`/admin/chart/${id}/edit`);
    } catch (error) {
      // Multer already wrote the file to disk; since we're NOT keeping a row for
      // it, delete the orphan before re-rendering the form with the error.
      if (file?.path) {
        await unlink(file.path).catch(() => undefined);
      }
      const existing = await this.chart
        .getDepartmentWithFiles(id)
        .catch(() => null);
      res.status(400).render(
        'admin/chart-form',
        this.formContext({
          mode: 'edit',
          action: `/admin/chart/${id}`,
          department: {
            id,
            slug: existing?.slug ?? '',
            title: existing?.title ?? '',
            icon: existing?.icon ?? '',
            color: existing?.color ?? CHART_DEPARTMENT_COLORS[0],
            sortOrder: String(existing?.sortOrder ?? 0),
            isPublished: existing?.isPublished ?? true,
            files:
              existing?.files.map((f) => ({
                id: f.id,
                title: f.title,
                badge: f.badge,
                sizeLabel: formatFileSize(f.size),
              })) ?? [],
          },
          error: this.errorMessage(error),
          fileForm: { title: dto.title ?? '', badge: dto.badge ?? '' },
        }),
      );
    }
  }

  @Post(':id/files/:fileId/delete')
  async removeFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.chart.removeFile(fileId);
    res.redirect(`/admin/chart/${id}/edit`);
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  /** Map the raw form DTO (strings + "on" checkbox) to the service input. */
  private fromDto(dto: ChartDepartmentFormDto): DepartmentInput {
    return {
      slug: dto.slug,
      title: dto.title,
      icon: dto.icon,
      color: dto.color,
      sortOrder: dto.sortOrder,
      isPublished: dto.isPublished === 'on',
    };
  }

  /** The form's view shape, used to re-fill the form after a validation error. */
  private dtoToView(dto: ChartDepartmentFormDto): DepartmentFormView {
    return {
      slug: dto.slug ?? '',
      title: dto.title ?? '',
      icon: dto.icon ?? '',
      color: dto.color ?? CHART_DEPARTMENT_COLORS[0],
      sortOrder: dto.sortOrder ?? '0',
      isPublished: dto.isPublished === 'on',
    };
  }

  private formContext(params: {
    mode: 'create' | 'edit';
    action: string;
    department: DepartmentFormView;
    error: string | null;
    fileForm?: { title: string; badge: string };
  }) {
    return {
      title: params.mode === 'create' ? 'رشتهٔ جدید' : 'ویرایش رشته',
      nav: true,
      activeNav: 'chart',
      isEdit: params.mode === 'edit',
      action: params.action,
      colorOptions: CHART_DEPARTMENT_COLORS.map((value) => ({
        value,
        label: CHART_COLOR_LABELS[value],
      })),
      department: params.department,
      fileForm: params.fileForm ?? { title: '', badge: '' },
      error: params.error,
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
