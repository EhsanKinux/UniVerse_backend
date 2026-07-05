import {
  BadRequestException,
  Injectable,
  type MessageEvent,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { Observable, Subject, interval, map, merge } from 'rxjs';
import { CALENDAR_TIME_ZONE } from '../calendar/jalali.util';
import { formatFileSize } from '../common/file-size.util';
import { News, NewsAttachment } from '../generated/prisma/client';
import { resolveUploadDir } from '../documents/upload.config';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { isKnownNewsCategory, newsCategoryLabel } from './dto/news-categories';
import {
  NewsDetailDto,
  NewsDto,
  NewsStreamEvent,
  NewsStreamType,
} from './dto/news.dto';

/** The plain text form fields for creating/updating a news item. */
export interface NewsInput {
  title?: string;
  category?: string;
  body?: string;
  link?: string | null;
  pinned?: boolean;
  isPublished?: boolean;
}

/** What the admin hands us after multer has written an upload to disk. */
export interface UploadedNewsFile {
  storedName: string; // multer's generated, on-disk filename
  originalName: string; // the name the staff member's file had
  mimeType: string;
  size: number; // bytes
}

/** The files that came with a create/update: an optional cover + attachments. */
export interface NewsFiles {
  cover?: UploadedNewsFile;
  attachments?: UploadedNewsFile[];
}

/** A stored file opened for streaming, with the metadata the controller needs. */
export interface NewsFileHandle {
  stream: Readable;
  mimeType: string;
  originalName: string;
  size: number;
}

// A News row with the attachment count (for the list/card DTO).
type NewsRow = News & { _count: { attachments: number } };
// A News row with its attachments loaded (for the detail DTO).
type NewsDetailRow = NewsRow & { attachments: NewsAttachment[] };

// Every place that builds a list DTO needs the attachment count. (No `as const`:
// Prisma's argument types don't accept deeply-readonly includes.)
const COUNT_INCLUDE = { _count: { select: { attachments: true } } };

// How often to emit a keep-alive on the SSE stream. Without it, idle proxies can
// silently drop the connection; the browser would reconnect, but a heartbeat
// keeps it healthy in the first place. The client ignores these.
const HEARTBEAT_MS = 30_000;

@Injectable()
export class NewsService {
  // The hub that fans news changes out to every connected SSE client. Each write
  // method calls `.next(...)`; the @Sse() endpoint subscribes via `stream()`.
  private readonly events$ = new Subject<NewsStreamEvent>();

  // The shared uploads folder — the SAME one the documents feature uses. Cover
  // images and attachments live here on disk; only metadata lives in the DB.
  private readonly uploadDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    config: ConfigService,
  ) {
    this.uploadDir = resolveUploadDir(config);
  }

  // ---------------------------------------------------------------------------
  // READ (public API + admin display)
  // ---------------------------------------------------------------------------

  /** Published items only, pinned first then newest — the PWA carousel feed. */
  async listPublished(): Promise<NewsDto[]> {
    const rows = await this.prisma.news.findMany({
      where: { isPublished: true },
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
      include: COUNT_INCLUDE,
    });
    return rows.map((row) => this.toDto(row));
  }

  /** One published item with its attachments — the detail page. 404 if it's a
   *  draft or gone, so a stale/guessed id can't reveal an unpublished item. */
  async getPublishedDetail(id: string): Promise<NewsDetailDto> {
    const row = await this.prisma.news.findFirst({
      where: { id, isPublished: true },
      include: {
        attachments: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { attachments: true } },
      },
    });
    if (!row) {
      throw new NotFoundException('News item not found.');
    }
    return this.toDetailDto(row);
  }

  /** Everything, including drafts — for the admin list. */
  listAll(): Promise<News[]> {
    return this.prisma.news.findMany({
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
    });
  }

  /** The raw row — 404 if it's gone. */
  async getNews(id: string): Promise<News> {
    const row = await this.prisma.news.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('News item not found.');
    }
    return row;
  }

  /** The raw row plus its attachments — for the admin edit form. */
  async getNewsWithAttachments(
    id: string,
  ): Promise<News & { attachments: NewsAttachment[] }> {
    const row = await this.prisma.news.findUnique({
      where: { id },
      include: { attachments: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!row) {
      throw new NotFoundException('News item not found.');
    }
    return row;
  }

  // ---------------------------------------------------------------------------
  // FILE STREAMING (public)
  // ---------------------------------------------------------------------------

  /** Open an attachment for streaming — only if its news item is published. */
  async openAttachment(attachmentId: string): Promise<NewsFileHandle> {
    const att = await this.prisma.newsAttachment.findUnique({
      where: { id: attachmentId },
      include: { news: { select: { isPublished: true } } },
    });
    if (!att || !att.news.isPublished) {
      throw new NotFoundException('Attachment not found.');
    }
    return this.openStored(att.storedName, att.mimeType, att.originalName);
  }

  /** Open a published item's cover image for inline streaming. */
  async openCover(newsId: string): Promise<NewsFileHandle> {
    const row = await this.prisma.news.findFirst({
      where: { id: newsId, isPublished: true },
    });
    if (!row?.coverStoredName || !row.coverMimeType) {
      throw new NotFoundException('Cover image not found.');
    }
    return this.openStored(
      row.coverStoredName,
      row.coverMimeType,
      `cover${extname(row.coverStoredName)}`,
    );
  }

  // ---------------------------------------------------------------------------
  // REAL-TIME STREAM (SSE)
  // ---------------------------------------------------------------------------

  /**
   * The Observable the @Sse() endpoint returns. It merges the live change feed
   * with a periodic heartbeat. Each value becomes one `data:` frame on the wire
   * (NestJS JSON-encodes the `data` object); the browser's EventSource handles
   * reconnection automatically.
   */
  stream(): Observable<MessageEvent> {
    const changes$ = this.events$.pipe(map((event) => ({ data: event })));
    const heartbeat$ = interval(HEARTBEAT_MS).pipe(
      map(() => ({ data: { type: 'ping' satisfies NewsStreamType } })),
    );
    return merge(changes$, heartbeat$);
  }

  // ---------------------------------------------------------------------------
  // WRITE (admin)
  // ---------------------------------------------------------------------------

  async create(input: NewsInput, files?: NewsFiles): Promise<News> {
    const row = await this.prisma.news.create({
      data: {
        ...this.toData(input),
        coverStoredName: files?.cover?.storedName ?? null,
        coverMimeType: files?.cover?.mimeType ?? null,
        attachments: files?.attachments?.length
          ? {
              create: files.attachments.map((f, i) =>
                this.toAttachmentData(f, i),
              ),
            }
          : undefined,
      },
      include: COUNT_INCLUDE,
    });
    // A freshly published item is "new" → clients toast it. A draft stays silent.
    if (row.isPublished) {
      this.notifyNew(row);
    }
    return row;
  }

  async update(id: string, input: NewsInput, files?: NewsFiles): Promise<News> {
    const existing = await this.getNews(id);

    // New cover replaces the old one; new attachments append after the existing.
    const nextSortOrder = files?.attachments?.length
      ? await this.prisma.newsAttachment.count({ where: { newsId: id } })
      : 0;

    const row = await this.prisma.news.update({
      where: { id },
      data: {
        ...this.toData(input),
        ...(files?.cover
          ? {
              coverStoredName: files.cover.storedName,
              coverMimeType: files.cover.mimeType,
            }
          : {}),
        ...(files?.attachments?.length
          ? {
              attachments: {
                create: files.attachments.map((f, i) =>
                  this.toAttachmentData(f, nextSortOrder + i),
                ),
              },
            }
          : {}),
      },
      include: COUNT_INCLUDE,
    });

    // The old cover file is now orphaned — drop it (best-effort).
    if (files?.cover && existing.coverStoredName) {
      await this.unlinkStored(existing.coverStoredName);
    }

    // Decide what the change means to the public stream:
    if (!row.isPublished) {
      // It's a draft now — clients should drop it.
      this.events$.next({ type: 'deleted', id: row.id });
    } else if (!existing.isPublished) {
      // It just went from draft → published, so it's newly visible → toast it.
      this.notifyNew(row);
    } else {
      // An already-public item was edited → refresh, but don't toast.
      this.broadcast('updated', row);
    }
    return row;
  }

  async remove(id: string): Promise<void> {
    const row = await this.prisma.news.findUnique({
      where: { id },
      include: { attachments: true },
    });
    if (!row) {
      throw new NotFoundException('News item not found.');
    }
    // Deleting the row cascades the attachment rows; we still own the on-disk
    // files, so unlink the cover + every attachment afterwards (best-effort).
    await this.prisma.news.delete({ where: { id } });
    const storedNames = [
      row.coverStoredName,
      ...row.attachments.map((a) => a.storedName),
    ].filter((name): name is string => Boolean(name));
    await Promise.all(storedNames.map((name) => this.unlinkStored(name)));
    this.events$.next({ type: 'deleted', id: row.id });
  }

  /** Remove one attachment (used by the admin edit form). */
  async removeAttachment(attachmentId: string): Promise<void> {
    const att = await this.prisma.newsAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!att) {
      throw new NotFoundException('Attachment not found.');
    }
    await this.prisma.newsAttachment.delete({ where: { id: attachmentId } });
    await this.unlinkStored(att.storedName);
    await this.broadcastChange(att.newsId);
  }

  /** Remove a news item's cover image (used by the admin edit form). */
  async removeCover(newsId: string): Promise<void> {
    const row = await this.getNews(newsId);
    if (!row.coverStoredName) {
      return;
    }
    await this.prisma.news.update({
      where: { id: newsId },
      data: { coverStoredName: null, coverMimeType: null },
    });
    await this.unlinkStored(row.coverStoredName);
    await this.broadcastChange(newsId);
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  /** Open a stored file as a stream, 404 if the DB says it exists but the disk
   *  file is missing. Shared by the attachment + cover endpoints. */
  private openStored(
    storedName: string,
    mimeType: string,
    originalName: string,
  ): NewsFileHandle {
    const path = join(this.uploadDir, storedName);
    if (!existsSync(path)) {
      throw new NotFoundException('The stored file is missing on disk.');
    }
    return {
      stream: createReadStream(path),
      mimeType,
      originalName,
      size: statSync(path).size,
    };
  }

  /** Re-broadcast a published item as "updated" (or "deleted" if it's now a
   *  draft/gone) after its files changed, so open clients refresh. */
  private async broadcastChange(newsId: string): Promise<void> {
    const row = await this.prisma.news.findUnique({
      where: { id: newsId },
      include: COUNT_INCLUDE,
    });
    if (!row || !row.isPublished) {
      this.events$.next({ type: 'deleted', id: newsId });
      return;
    }
    this.broadcast('updated', row);
  }

  /** Push a published item to all SSE clients as the given change type. */
  private broadcast(
    type: Exclude<NewsStreamType, 'deleted' | 'ping'>,
    row: NewsRow,
  ) {
    this.events$.next({ type, item: this.toDto(row) });
  }

  /**
   * A newly-published item: announce it on the SSE stream (→ in-app toast) AND
   * fan it out as an OS push notification. The push is fire-and-forget, so a slow
   * or unreachable push service never delays the admin's save. Both deep-link to
   * the item's detail page.
   */
  private notifyNew(row: NewsRow): void {
    const item = this.toDto(row);
    this.events$.next({ type: 'created', item });
    void this.push.sendToAll({
      title: item.title,
      body: item.body,
      url: `/news/${item.id}`,
      tag: `news-${item.id}`,
    });
  }

  /** Validate + normalise the text form input into a Prisma data object. */
  private toData(input: NewsInput) {
    return {
      title: this.requireText(input.title, 'عنوان خبر را وارد کنید.'),
      category: this.validateCategory(input.category),
      body: this.requireText(input.body, 'متن خبر را وارد کنید.'),
      link: this.cleanOptional(input.link),
      pinned: input.pinned ?? false,
      isPublished: input.isPublished ?? true,
    };
  }

  private toAttachmentData(file: UploadedNewsFile, sortOrder: number) {
    return {
      storedName: file.storedName,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      sortOrder,
    };
  }

  private toDto(row: NewsRow): NewsDto {
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      categoryLabel: newsCategoryLabel(row.category),
      body: row.body,
      link: row.link,
      pinned: row.pinned,
      publishedAt: row.publishedAt.toISOString(),
      dateLabel: this.formatNewsDate(row.publishedAt),
      hasCover: row.coverStoredName != null,
      attachmentCount: row._count.attachments,
    };
  }

  private toDetailDto(row: NewsDetailRow): NewsDetailDto {
    return {
      ...this.toDto(row),
      attachments: row.attachments.map((a) => ({
        id: a.id,
        originalName: a.originalName,
        mimeType: a.mimeType,
        size: a.size,
        sizeLabel: formatFileSize(a.size),
      })),
    };
  }

  /** e.g. «شنبه ۱۶ خرداد» — weekday + day + month in the university's timezone. */
  private formatNewsDate(date: Date): string {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      timeZone: CALENDAR_TIME_ZONE,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(date);
  }

  private validateCategory(category?: string): string {
    const text = category?.trim();
    if (!text || !isKnownNewsCategory(text)) {
      throw new BadRequestException('دستهٔ انتخاب‌شده معتبر نیست.');
    }
    return text;
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
}
