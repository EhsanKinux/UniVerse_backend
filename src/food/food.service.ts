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
import { resolveUploadDir } from '../documents/upload.config';
import {
  FoodAnnouncement,
  FoodAnnouncementAttachment,
  FoodMenuFile,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import {
  foodAnnouncementCategoryLabel,
  isKnownFoodAnnouncementCategory,
} from './dto/food-categories';
import {
  FoodAnnouncementDetailDto,
  FoodAnnouncementDto,
  FoodHubDto,
  FoodMenuDto,
  FoodStreamEvent,
  FoodStreamType,
} from './dto/food.dto';

/** The plain text form fields for creating/updating an announcement. */
export interface FoodAnnouncementInput {
  title?: string;
  category?: string;
  body?: string;
  link?: string | null;
  pinned?: boolean;
  isPublished?: boolean;
}

/** What the admin hands us after multer has written an upload to disk. */
export interface UploadedFoodFile {
  storedName: string;
  originalName: string;
  mimeType: string;
  size: number;
}

/** The files that came with an announcement: an optional cover + attachments. */
export interface FoodAnnouncementFiles {
  cover?: UploadedFoodFile;
  attachments?: UploadedFoodFile[];
}

/** The plain text form fields for a weekly menu upload. */
export interface FoodMenuInput {
  weekLabel?: string | null;
  isPublished?: boolean;
}

/** A stored file opened for streaming, with the metadata the controller needs. */
export interface FoodFileHandle {
  stream: Readable;
  mimeType: string;
  originalName: string;
  size: number;
}

// An announcement row with the attachment count (for the list/card DTO).
type AnnouncementRow = FoodAnnouncement & { _count: { attachments: number } };
// An announcement row with its attachments loaded (for the detail DTO).
type AnnouncementDetailRow = AnnouncementRow & {
  attachments: FoodAnnouncementAttachment[];
};

// Every list DTO needs the attachment count. (No `as const`: Prisma's argument
// types don't accept deeply-readonly includes.)
const COUNT_INCLUDE = { _count: { select: { attachments: true } } };

const HEARTBEAT_MS = 30_000;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;

/**
 * The single service behind the تغذیه hub's staff-managed data: announcements
 * (with OS push + a real-time SSE stream, exactly like DormService) and the
 * weekly menu file. The live nearby-places map is served by FoodPlacesService —
 * it has no staff-managed state, so it stays out of here.
 */
@Injectable()
export class FoodService {
  // Fans announcement changes out to every connected SSE client.
  private readonly events$ = new Subject<FoodStreamEvent>();

  // The shared uploads folder — the SAME one the documents/news/dorm features use.
  private readonly uploadDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    config: ConfigService,
  ) {
    this.uploadDir = resolveUploadDir(config);
  }

  // ===========================================================================
  // HUB — one call the PWA uses to render the staff-managed half of the page.
  // ===========================================================================

  async getHub(): Promise<FoodHubDto> {
    const [menu, announcements] = await Promise.all([
      this.getCurrentMenu(),
      this.listPublishedAnnouncements(),
    ]);
    return { menu, announcements };
  }

  // ===========================================================================
  // WEEKLY MENU (منوی هفته)
  // ===========================================================================

  /** The newest published menu file, or null before staff upload one. */
  async getCurrentMenu(): Promise<FoodMenuDto | null> {
    const row = await this.prisma.foodMenuFile.findFirst({
      where: { isPublished: true },
      orderBy: { createdAt: 'desc' },
    });
    return row ? this.toMenuDto(row) : null;
  }

  /** Every uploaded menu, newest first — for the admin history list. */
  listAllMenus(): Promise<FoodMenuFile[]> {
    return this.prisma.foodMenuFile.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createMenu(
    input: FoodMenuInput,
    file: UploadedFoodFile,
  ): Promise<FoodMenuFile> {
    return this.prisma.foodMenuFile.create({
      data: {
        weekLabel: this.cleanOptional(input.weekLabel),
        storedName: file.storedName,
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: file.size,
        isPublished: input.isPublished ?? true,
      },
    });
  }

  async removeMenu(id: string): Promise<void> {
    const row = await this.prisma.foodMenuFile.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('Menu file not found.');
    }
    await this.prisma.foodMenuFile.delete({ where: { id } });
    await this.unlinkStored(row.storedName);
  }

  /** Open a published menu's file for streaming (view/download). */
  async openMenu(id: string): Promise<FoodFileHandle> {
    const row = await this.prisma.foodMenuFile.findFirst({
      where: { id, isPublished: true },
    });
    if (!row) {
      throw new NotFoundException('Menu file not found.');
    }
    return this.openStored(row.storedName, row.mimeType, row.originalName);
  }

  // ===========================================================================
  // ANNOUNCEMENTS
  // ===========================================================================

  /** Published items only, pinned first then newest — the PWA feed. */
  async listPublishedAnnouncements(limit?: number): Promise<FoodAnnouncementDto[]> {
    const requested = Math.trunc(limit ?? DEFAULT_LIST_LIMIT);
    const take = Number.isFinite(requested)
      ? Math.min(Math.max(requested, 1), MAX_LIST_LIMIT)
      : DEFAULT_LIST_LIMIT;

    const rows = await this.prisma.foodAnnouncement.findMany({
      where: { isPublished: true },
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
      include: COUNT_INCLUDE,
      take,
    });
    return rows.map((row) => this.toAnnouncementDto(row));
  }

  /** One published item with its attachments — the detail page. 404 if it's a
   *  draft or gone, so a stale/guessed id can't reveal an unpublished item. */
  async getPublishedAnnouncement(id: string): Promise<FoodAnnouncementDetailDto> {
    const row = await this.prisma.foodAnnouncement.findFirst({
      where: { id, isPublished: true },
      include: {
        attachments: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { attachments: true } },
      },
    });
    if (!row) {
      throw new NotFoundException('Announcement not found.');
    }
    return this.toAnnouncementDetailDto(row);
  }

  /** Everything, including drafts — for the admin list. */
  listAllAnnouncements(): Promise<FoodAnnouncement[]> {
    return this.prisma.foodAnnouncement.findMany({
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
    });
  }

  async getAnnouncement(id: string): Promise<FoodAnnouncement> {
    const row = await this.prisma.foodAnnouncement.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('Announcement not found.');
    }
    return row;
  }

  async getAnnouncementWithAttachments(
    id: string,
  ): Promise<FoodAnnouncement & { attachments: FoodAnnouncementAttachment[] }> {
    const row = await this.prisma.foodAnnouncement.findUnique({
      where: { id },
      include: { attachments: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!row) {
      throw new NotFoundException('Announcement not found.');
    }
    return row;
  }

  async createAnnouncement(
    input: FoodAnnouncementInput,
    files?: FoodAnnouncementFiles,
  ): Promise<FoodAnnouncement> {
    const row = await this.prisma.foodAnnouncement.create({
      data: {
        ...this.toAnnouncementData(input),
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
    // A freshly published item is "new" → clients toast it + get an OS push.
    if (row.isPublished) {
      this.notifyNew(row);
    }
    return row;
  }

  async updateAnnouncement(
    id: string,
    input: FoodAnnouncementInput,
    files?: FoodAnnouncementFiles,
  ): Promise<FoodAnnouncement> {
    const existing = await this.getAnnouncement(id);

    const nextSortOrder = files?.attachments?.length
      ? await this.prisma.foodAnnouncementAttachment.count({
          where: { announcementId: id },
        })
      : 0;

    const row = await this.prisma.foodAnnouncement.update({
      where: { id },
      data: {
        ...this.toAnnouncementData(input),
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

    if (files?.cover && existing.coverStoredName) {
      await this.unlinkStored(existing.coverStoredName);
    }

    if (!row.isPublished) {
      this.events$.next({ type: 'deleted', id: row.id });
    } else if (!existing.isPublished) {
      this.notifyNew(row);
    } else {
      this.broadcast('updated', row);
    }
    return row;
  }

  async removeAnnouncement(id: string): Promise<void> {
    const row = await this.prisma.foodAnnouncement.findUnique({
      where: { id },
      include: { attachments: true },
    });
    if (!row) {
      throw new NotFoundException('Announcement not found.');
    }
    await this.prisma.foodAnnouncement.delete({ where: { id } });
    const storedNames = [
      row.coverStoredName,
      ...row.attachments.map((a) => a.storedName),
    ].filter((name): name is string => Boolean(name));
    await Promise.all(storedNames.map((name) => this.unlinkStored(name)));
    this.events$.next({ type: 'deleted', id: row.id });
  }

  async removeAttachment(attachmentId: string): Promise<void> {
    const att = await this.prisma.foodAnnouncementAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!att) {
      throw new NotFoundException('Attachment not found.');
    }
    await this.prisma.foodAnnouncementAttachment.delete({
      where: { id: attachmentId },
    });
    await this.unlinkStored(att.storedName);
    await this.broadcastChange(att.announcementId);
  }

  async removeCover(announcementId: string): Promise<void> {
    const row = await this.getAnnouncement(announcementId);
    if (!row.coverStoredName) {
      return;
    }
    await this.prisma.foodAnnouncement.update({
      where: { id: announcementId },
      data: { coverStoredName: null, coverMimeType: null },
    });
    await this.unlinkStored(row.coverStoredName);
    await this.broadcastChange(announcementId);
  }

  /** Open an attachment for streaming — only if its announcement is published. */
  async openAttachment(attachmentId: string): Promise<FoodFileHandle> {
    const att = await this.prisma.foodAnnouncementAttachment.findUnique({
      where: { id: attachmentId },
      include: { announcement: { select: { isPublished: true } } },
    });
    if (!att || !att.announcement.isPublished) {
      throw new NotFoundException('Attachment not found.');
    }
    return this.openStored(att.storedName, att.mimeType, att.originalName);
  }

  /** Open a published item's cover image for inline streaming. */
  async openCover(announcementId: string): Promise<FoodFileHandle> {
    const row = await this.prisma.foodAnnouncement.findFirst({
      where: { id: announcementId, isPublished: true },
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

  // ---- Real-time stream (SSE) ----

  stream(): Observable<MessageEvent> {
    const changes$ = this.events$.pipe(map((event) => ({ data: event })));
    const heartbeat$ = interval(HEARTBEAT_MS).pipe(
      map(() => ({ data: { type: 'ping' satisfies FoodStreamType } })),
    );
    return merge(changes$, heartbeat$);
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private openStored(
    storedName: string,
    mimeType: string,
    originalName: string,
  ): FoodFileHandle {
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

  private async broadcastChange(announcementId: string): Promise<void> {
    const row = await this.prisma.foodAnnouncement.findUnique({
      where: { id: announcementId },
      include: COUNT_INCLUDE,
    });
    if (!row || !row.isPublished) {
      this.events$.next({ type: 'deleted', id: announcementId });
      return;
    }
    this.broadcast('updated', row);
  }

  private broadcast(
    type: Exclude<FoodStreamType, 'deleted' | 'ping'>,
    row: AnnouncementRow,
  ) {
    this.events$.next({ type, item: this.toAnnouncementDto(row) });
  }

  /**
   * A newly-published announcement: announce it on the SSE stream (→ in-app
   * toast/bell) AND fan it out as an OS push notification (fire-and-forget). Both
   * deep-link to the item's detail page inside the تغذیه section.
   */
  private notifyNew(row: AnnouncementRow): void {
    const item = this.toAnnouncementDto(row);
    this.events$.next({ type: 'created', item });
    void this.push.sendToAll({
      title: item.title,
      // Push payloads are capped (~4 KB after encryption); truncate the body.
      body: this.toPushBody(item.body),
      url: `/food-week/announcements/${item.id}`,
      tag: `food-${item.id}`,
    });
  }

  private toPushBody(body: string): string {
    const MAX = 180;
    const text = body.trim();
    if (text.length <= MAX) return text;
    return `${text.slice(0, MAX - 1).trimEnd()}…`;
  }

  private toAnnouncementData(input: FoodAnnouncementInput) {
    return {
      title: this.requireText(input.title, 'عنوان اطلاعیه را وارد کنید.'),
      category: this.validateCategory(input.category),
      body: this.requireText(input.body, 'متن اطلاعیه را وارد کنید.'),
      link: this.cleanOptional(input.link),
      pinned: input.pinned ?? false,
      isPublished: input.isPublished ?? true,
    };
  }

  private toAttachmentData(file: UploadedFoodFile, sortOrder: number) {
    return {
      storedName: file.storedName,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      sortOrder,
    };
  }

  private toAnnouncementDto(row: AnnouncementRow): FoodAnnouncementDto {
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      categoryLabel: foodAnnouncementCategoryLabel(row.category),
      body: row.body,
      link: row.link,
      pinned: row.pinned,
      publishedAt: row.publishedAt.toISOString(),
      dateLabel: this.formatDate(row.publishedAt),
      hasCover: row.coverStoredName != null,
      attachmentCount: row._count.attachments,
    };
  }

  private toAnnouncementDetailDto(
    row: AnnouncementDetailRow,
  ): FoodAnnouncementDetailDto {
    return {
      ...this.toAnnouncementDto(row),
      attachments: row.attachments.map((a) => ({
        id: a.id,
        originalName: a.originalName,
        mimeType: a.mimeType,
        size: a.size,
        sizeLabel: formatFileSize(a.size),
      })),
    };
  }

  private toMenuDto(row: FoodMenuFile): FoodMenuDto {
    return {
      id: row.id,
      weekLabel: row.weekLabel,
      originalName: row.originalName,
      mimeType: row.mimeType,
      isImage: row.mimeType.startsWith('image/'),
      size: row.size,
      sizeLabel: formatFileSize(row.size),
      dateLabel: this.formatDate(row.createdAt),
    };
  }

  /** e.g. «شنبه ۱۶ خرداد» — weekday + day + month in the university's timezone. */
  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      timeZone: CALENDAR_TIME_ZONE,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(date);
  }

  private validateCategory(category?: string): string {
    const text = category?.trim();
    if (!text || !isKnownFoodAnnouncementCategory(text)) {
      throw new BadRequestException('دستهٔ انتخاب‌شده معتبر نیست.');
    }
    return text;
  }

  private requireText(value: string | undefined | null, message: string): string {
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

  private async unlinkStored(storedName: string): Promise<void> {
    await unlink(join(this.uploadDir, storedName)).catch(() => undefined);
  }
}
