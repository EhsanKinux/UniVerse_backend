import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { formatFileSize } from '../common/file-size.util';
import { resolveUploadDir } from '../documents/upload.config';
import { ChartDepartment, ChartFile, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_CHART_COLOR, isKnownChartColor } from './dto/chart-colors';
import { ChartDepartmentDto, ChartFileDto } from './dto/chart.dto';

/** The plain text form fields for creating/updating a department. */
export interface DepartmentInput {
  slug?: string;
  title?: string;
  icon?: string;
  color?: string;
  sortOrder?: string | number | null;
  isPublished?: boolean;
}

/** The plain text form fields that accompany a chart-PDF upload. */
export interface ChartFileInput {
  title?: string;
  badge?: string | null;
}

/** What the admin hands us after multer has written an upload to disk. */
export interface UploadedChartFile {
  storedName: string; // multer's generated, on-disk filename
  originalName: string; // the name the staff member's file had
  mimeType: string;
  size: number; // bytes
}

/** A stored file opened for streaming, with the metadata the controller needs. */
export interface ChartFileHandle {
  stream: Readable;
  mimeType: string;
  originalName: string;
  size: number;
}

// A department row with its files loaded (for both the tree DTO and admin edit).
type DepartmentWithFiles = ChartDepartment & { files: ChartFile[] };

// Files always render in the order staff arranged them (then oldest-first).
const FILE_ORDER: Prisma.ChartFileOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { createdAt: 'asc' },
];

// Departments render by their manual order, ties broken by title.
const DEPARTMENT_ORDER: Prisma.ChartDepartmentOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { title: 'asc' },
];

// A slug is a lowercase, URL-safe key (letters, digits, single hyphens). Keeping
// it strict lets the PWA use it directly as a colour-token key and list key.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

@Injectable()
export class ChartService {
  // The shared uploads folder — the SAME one the documents & news features use.
  // Chart PDFs live here on disk; only metadata lives in the DB.
  private readonly uploadDir: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.uploadDir = resolveUploadDir(config);
  }

  // ---------------------------------------------------------------------------
  // READ (public API)
  // ---------------------------------------------------------------------------

  /**
   * The whole published tree in one call — every published department that has at
   * least one chart, with its files. Empty or hidden departments are omitted so
   * students never see a dead card. Always succeeds (an empty array when nothing
   * is published yet), so the PWA shows an empty state rather than handling a 404.
   */
  async getPublishedTree(): Promise<ChartDepartmentDto[]> {
    const departments = await this.prisma.chartDepartment.findMany({
      where: { isPublished: true, files: { some: {} } },
      orderBy: DEPARTMENT_ORDER,
      include: { files: { orderBy: FILE_ORDER } },
    });
    return departments.map((dept) => this.toDepartmentDto(dept));
  }

  // ---------------------------------------------------------------------------
  // READ (admin display)
  // ---------------------------------------------------------------------------

  /** Every department (published or not) with its files — for the admin list. */
  listAllDepartments(): Promise<DepartmentWithFiles[]> {
    return this.prisma.chartDepartment.findMany({
      orderBy: DEPARTMENT_ORDER,
      include: { files: { orderBy: FILE_ORDER } },
    });
  }

  /** The raw department row — 404 if it's gone. */
  async getDepartment(id: string): Promise<ChartDepartment> {
    const dept = await this.prisma.chartDepartment.findUnique({
      where: { id },
    });
    if (!dept) {
      throw new NotFoundException('Department not found.');
    }
    return dept;
  }

  /** The department plus its files — for the admin edit form. */
  async getDepartmentWithFiles(id: string): Promise<DepartmentWithFiles> {
    const dept = await this.prisma.chartDepartment.findUnique({
      where: { id },
      include: { files: { orderBy: FILE_ORDER } },
    });
    if (!dept) {
      throw new NotFoundException('Department not found.');
    }
    return dept;
  }

  // ---------------------------------------------------------------------------
  // FILE STREAMING (public)
  // ---------------------------------------------------------------------------

  /** Open a chart PDF for streaming — only if its department is published, so a
   *  guessed id can't reveal a file from a hidden department. */
  async openFile(fileId: string): Promise<ChartFileHandle> {
    const file = await this.prisma.chartFile.findUnique({
      where: { id: fileId },
      include: { department: { select: { isPublished: true } } },
    });
    if (!file || !file.department.isPublished) {
      throw new NotFoundException('Chart file not found.');
    }
    const path = join(this.uploadDir, file.storedName);
    if (!existsSync(path)) {
      throw new NotFoundException('The stored file is missing on disk.');
    }
    return {
      stream: createReadStream(path),
      mimeType: file.mimeType,
      originalName: file.originalName,
      size: statSync(path).size,
    };
  }

  // ---------------------------------------------------------------------------
  // WRITE — departments (admin)
  // ---------------------------------------------------------------------------

  async createDepartment(input: DepartmentInput): Promise<ChartDepartment> {
    try {
      return await this.prisma.chartDepartment.create({
        data: this.toDepartmentData(input),
      });
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  async updateDepartment(
    id: string,
    input: DepartmentInput,
  ): Promise<ChartDepartment> {
    await this.getDepartment(id); // 404 if it's gone
    try {
      return await this.prisma.chartDepartment.update({
        where: { id },
        data: this.toDepartmentData(input),
      });
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  async removeDepartment(id: string): Promise<void> {
    const dept = await this.prisma.chartDepartment.findUnique({
      where: { id },
      include: { files: true },
    });
    if (!dept) {
      throw new NotFoundException('Department not found.');
    }
    // Deleting the row cascades the file rows; we still own the on-disk PDFs, so
    // unlink each afterwards (best-effort).
    await this.prisma.chartDepartment.delete({ where: { id } });
    await Promise.all(dept.files.map((f) => this.unlinkStored(f.storedName)));
  }

  /** Flip a department's published flag (quick toggle from the admin list). */
  async toggleDepartment(id: string): Promise<void> {
    const dept = await this.getDepartment(id);
    await this.prisma.chartDepartment.update({
      where: { id },
      data: { isPublished: !dept.isPublished },
    });
  }

  // ---------------------------------------------------------------------------
  // WRITE — files (admin)
  // ---------------------------------------------------------------------------

  /** Attach one uploaded PDF to a department, appended after its existing files. */
  async addFile(
    departmentId: string,
    input: ChartFileInput,
    file: UploadedChartFile,
  ): Promise<ChartFile> {
    await this.getDepartment(departmentId); // 404 if the department is gone
    const nextSortOrder = await this.prisma.chartFile.count({
      where: { departmentId },
    });
    return this.prisma.chartFile.create({
      data: {
        departmentId,
        title: this.requireText(input.title, 'عنوان چارت را وارد کنید.'),
        badge: this.cleanOptional(input.badge),
        storedName: file.storedName,
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: file.size,
        sortOrder: nextSortOrder,
      },
    });
  }

  /** Remove one chart file (row + on-disk PDF). */
  async removeFile(fileId: string): Promise<string> {
    const file = await this.prisma.chartFile.findUnique({
      where: { id: fileId },
    });
    if (!file) {
      throw new NotFoundException('Chart file not found.');
    }
    await this.prisma.chartFile.delete({ where: { id: fileId } });
    await this.unlinkStored(file.storedName);
    return file.departmentId; // so the controller can redirect back to the edit page
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  private toDepartmentDto(dept: DepartmentWithFiles): ChartDepartmentDto {
    return {
      id: dept.id,
      slug: dept.slug,
      title: dept.title,
      icon: dept.icon,
      color: dept.color,
      files: dept.files.map((f) => this.toFileDto(f)),
    };
  }

  private toFileDto(file: ChartFile): ChartFileDto {
    return {
      id: file.id,
      title: file.title,
      badge: file.badge,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      sizeLabel: formatFileSize(file.size),
    };
  }

  /** Validate + normalise the department form input into a Prisma data object. */
  private toDepartmentData(input: DepartmentInput) {
    return {
      slug: this.validateSlug(input.slug),
      title: this.requireText(input.title, 'نام رشته را وارد کنید.'),
      icon: this.cleanIcon(input.icon),
      color: this.validateColor(input.color),
      sortOrder: this.parseSortOrder(input.sortOrder),
      isPublished: input.isPublished ?? true,
    };
  }

  private validateSlug(slug?: string): string {
    const text = slug?.trim().toLowerCase();
    if (!text) {
      throw new BadRequestException('شناسهٔ رشته (اسلاگ) را وارد کنید.');
    }
    if (!SLUG_PATTERN.test(text)) {
      throw new BadRequestException(
        'شناسه فقط می‌تواند شامل حروف کوچک انگلیسی، عدد و خط تیره باشد (مثلاً computer).',
      );
    }
    return text;
  }

  private validateColor(color?: string): string {
    const text = color?.trim();
    if (!text) {
      return DEFAULT_CHART_COLOR;
    }
    if (!isKnownChartColor(text)) {
      throw new BadRequestException('رنگ انتخاب‌شده معتبر نیست.');
    }
    return text;
  }

  /** An emoji/icon is optional; fall back to a book so a card is never blank. */
  private cleanIcon(icon?: string): string {
    const text = icon?.trim();
    return text ? text : '📚';
  }

  /** Optional ordering number: blank → 0, otherwise a non-negative integer. */
  private parseSortOrder(value?: string | number | null): number {
    if (value === undefined || value === null || value === '') {
      return 0;
    }
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 100000) {
      throw new BadRequestException('ترتیب باید یک عدد صحیح نامنفی باشد.');
    }
    return n;
  }

  private requireText(
    value: string | undefined | null,
    message: string,
  ): string {
    const text = value?.trim();
    if (!text) {
      throw new BadRequestException(message);
    }
    return text;
  }

  private cleanOptional(value?: string | null): string | null {
    const text = value?.trim();
    return text ? text : null;
  }

  /** Best-effort delete of a stored file; ignore if it's already gone. */
  private async unlinkStored(storedName: string): Promise<void> {
    await unlink(join(this.uploadDir, storedName)).catch(() => undefined);
  }

  /** Turn a duplicate-slug clash into a friendly 409 instead of a raw Prisma error. */
  private mapWriteError(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException('این شناسهٔ رشته قبلاً استفاده شده است.');
    }
    return error;
  }
}
