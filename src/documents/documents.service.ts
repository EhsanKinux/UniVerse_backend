import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { CALENDAR_TIME_ZONE } from '../calendar/jalali.util';
import { Document } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  documentCategoryLabel,
  isKnownCategory,
} from './dto/document-categories';
import { CategoryDocumentsDto, DocumentDto } from './dto/document.dto';
import { resolveUploadDir } from './upload.config';

/** What the admin hands us after multer has written the file to disk. */
export interface UploadedFileInput {
  storedName: string; // multer's generated, on-disk filename
  originalName: string; // the name the staff member's file had
  mimeType: string;
  size: number; // bytes
}

/** The plain form fields for a new document (page count arrives as a string). */
export interface CreateDocumentInput {
  category?: string;
  title?: string;
  description?: string | null;
  pageCount?: string | number | null;
  makeActive?: boolean;
}

@Injectable()
export class DocumentsService {
  private readonly uploadDir: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.uploadDir = resolveUploadDir(config);
  }

  // ---------------------------------------------------------------------------
  // READ (public API + admin display)
  // ---------------------------------------------------------------------------

  /**
   * The active file + the archive for one category — the courses page's single
   * call. Always succeeds (active is null and archive empty when nothing's been
   * uploaded yet), so the PWA shows an empty state rather than handling a 404.
   */
  async getCategoryDocuments(category: string): Promise<CategoryDocumentsDto> {
    const docs = await this.prisma.document.findMany({
      where: { category },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
    const active = docs.find((d) => d.isActive) ?? null;
    const archive = docs.filter((d) => !d.isActive);
    return {
      category,
      categoryLabel: documentCategoryLabel(category),
      active: active ? this.toDto(active) : null,
      archive: archive.map((d) => this.toDto(d)),
    };
  }

  /** Every document, grouped by category then newest-first — for the admin list. */
  listAll(): Promise<Document[]> {
    return this.prisma.document.findMany({
      orderBy: [{ category: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /** The raw row — 404 if it's gone. */
  async getDocument(id: string): Promise<Document> {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) {
      throw new NotFoundException('Document not found.');
    }
    return doc;
  }

  // ---------------------------------------------------------------------------
  // FILE STREAMING
  // ---------------------------------------------------------------------------

  /** Open the stored file as a stream, with the metadata the controller needs to
   *  set the response headers. 404 if the DB row or the on-disk file is missing. */
  async openFile(id: string): Promise<{
    stream: Readable;
    mimeType: string;
    originalName: string;
    size: number;
  }> {
    const doc = await this.getDocument(id);
    const path = join(this.uploadDir, doc.storedName);
    if (!existsSync(path)) {
      throw new NotFoundException('The stored file is missing on disk.');
    }
    return {
      stream: createReadStream(path),
      mimeType: doc.mimeType,
      originalName: doc.originalName,
      size: doc.size,
    };
  }

  // ---------------------------------------------------------------------------
  // WRITE (admin)
  // ---------------------------------------------------------------------------

  async create(
    input: CreateDocumentInput,
    file: UploadedFileInput,
  ): Promise<Document> {
    const category = this.validateCategory(input.category);
    const doc = await this.prisma.document.create({
      data: {
        category,
        title: this.requireText(input.title, 'عنوان سند را وارد کنید.'),
        description: this.cleanOptional(input.description),
        storedName: file.storedName,
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: file.size,
        pageCount: this.parsePageCount(input.pageCount),
        isActive: false,
      },
    });

    // When staff tick "publish", make this the active file for its category.
    if (input.makeActive) {
      await this.activate(doc.id);
    }
    return doc;
  }

  /** Publish one document and, in the SAME transaction, unpublish the others in
   *  its category — that's how we keep "only one active per category". */
  async activate(id: string): Promise<void> {
    const doc = await this.getDocument(id);
    await this.prisma.$transaction([
      this.prisma.document.updateMany({
        where: { category: doc.category },
        data: { isActive: false },
      }),
      this.prisma.document.update({
        where: { id },
        data: { isActive: true },
      }),
    ]);
  }

  async remove(id: string): Promise<void> {
    const doc = await this.getDocument(id);
    await this.prisma.document.delete({ where: { id } });
    // Best-effort: also drop the file from disk. If it's already gone, ignore —
    // the database row (the source of truth) is already removed.
    await unlink(join(this.uploadDir, doc.storedName)).catch(() => undefined);
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  private toDto(doc: Document): DocumentDto {
    return {
      id: doc.id,
      category: doc.category,
      title: doc.title,
      description: doc.description,
      originalName: doc.originalName,
      mimeType: doc.mimeType,
      size: doc.size,
      sizeLabel: this.formatSize(doc.size),
      pageCount: doc.pageCount,
      isActive: doc.isActive,
      updatedAt: doc.updatedAt.toISOString(),
      updatedAtLabel: this.formatJalaliDay(doc.updatedAt),
    };
  }

  /** Bytes → a Persian-digit label, e.g. «۸۱۲ کیلوبایت» or «۴٫۲ مگابایت». */
  private formatSize(bytes: number): string {
    const kb = bytes / 1024;
    if (kb < 1024) {
      return `${this.toPersianNumber(Math.max(1, Math.round(kb)))} کیلوبایت`;
    }
    const mb = kb / 1024;
    return `${this.toPersianNumber(Number(mb.toFixed(1)))} مگابایت`;
  }

  /**
   * Format a timestamp as a Jalali day in the university's timezone, e.g.
   * «۳ تیر ۱۴۰۵». We use Tehran time (not UTC) here because `updatedAt` is a real
   * timestamp — unlike the calendar's date-only `@db.Date` values, which the
   * shared jalali util formats in UTC.
   */
  private formatJalaliDay(date: Date): string {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      timeZone: CALENDAR_TIME_ZONE,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }

  private toPersianNumber(value: number): string {
    return new Intl.NumberFormat('fa-IR', { useGrouping: false }).format(value);
  }

  private validateCategory(category?: string): string {
    const text = category?.trim();
    if (!text || !isKnownCategory(text)) {
      throw new BadRequestException('دستهٔ انتخاب‌شده معتبر نیست.');
    }
    return text;
  }

  /** Optional page count: blank → null, otherwise a positive integer. */
  private parsePageCount(value?: string | number | null): number | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0 || n > 100000) {
      throw new BadRequestException('تعداد صفحات باید یک عدد صحیح مثبت باشد.');
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

  /** Turn empty/blank strings into null for optional columns. */
  private cleanOptional(value?: string | null): string | null {
    const text = value?.trim();
    return text ? text : null;
  }
}
