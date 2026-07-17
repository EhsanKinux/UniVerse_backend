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
  DormAnnouncement,
  DormAnnouncementAttachment,
  DormForm,
  DormInfoItem,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import {
  dormAnnouncementCategoryLabel,
  isKnownDormAnnouncementCategory,
  isKnownDormInfoSection,
} from './dto/dorm-categories';
import {
  DormAnnouncementDetailDto,
  DormAnnouncementDto,
  DormFormDto,
  DormHubDto,
  DormInfoItemDto,
  DormStreamEvent,
  DormStreamType,
} from './dto/dorm.dto';

/** The plain text form fields for creating/updating an announcement. */
export interface DormAnnouncementInput {
  title?: string;
  category?: string;
  body?: string;
  link?: string | null;
  pinned?: boolean;
  isPublished?: boolean;
}

/** What the admin hands us after multer has written an upload to disk. */
export interface UploadedDormFile {
  storedName: string;
  originalName: string;
  mimeType: string;
  size: number;
}

/** The files that came with an announcement: an optional cover + attachments. */
export interface DormAnnouncementFiles {
  cover?: UploadedDormFile;
  attachments?: UploadedDormFile[];
}

/** The plain text form fields for a rule/facility row. (`sortOrder` arrives as a
 *  string from the admin form; DormService.toSortOrder normalises it.) */
export interface DormInfoInput {
  section?: string;
  title?: string;
  detail?: string | null;
  sortOrder?: number | string | null;
  isPublished?: boolean;
}

/** The plain text form fields for a form/document. */
export interface DormFormInput {
  title?: string;
  description?: string | null;
  sortOrder?: number | string | null;
  isPublished?: boolean;
}

/** A stored file opened for streaming, with the metadata the controller needs. */
export interface DormFileHandle {
  stream: Readable;
  mimeType: string;
  originalName: string;
  size: number;
}

// An announcement row with the attachment count (for the list/card DTO).
type AnnouncementRow = DormAnnouncement & { _count: { attachments: number } };
// An announcement row with its attachments loaded (for the detail DTO).
type AnnouncementDetailRow = AnnouncementRow & {
  attachments: DormAnnouncementAttachment[];
};

// Every list DTO needs the attachment count. (No `as const`: Prisma's argument
// types don't accept deeply-readonly includes.)
const COUNT_INCLUDE = { _count: { select: { attachments: true } } };

const HEARTBEAT_MS = 30_000;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;

/**
 * The single service behind the whole خوابگاه hub: announcements (with OS push +
 * a real-time SSE stream, exactly like NewsService), the قوانین/امکانات info
 * lists, and the فرم‌ها file library. Keeping all three here means the admin panel
 * and the public API share ONE place that understands the dorm's data rules.
 */
@Injectable()
export class DormService {
  // Fans announcement changes out to every connected SSE client.
  private readonly events$ = new Subject<DormStreamEvent>();

  // The shared uploads folder — the SAME one the documents/news features use.
  private readonly uploadDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    config: ConfigService,
  ) {
    this.uploadDir = resolveUploadDir(config);
  }

  // ===========================================================================
  // HUB — one call the PWA uses to render the whole خوابگاه page.
  // ===========================================================================

  async getHub(): Promise<DormHubDto> {
    const [announcements, rules, facilities, forms] = await Promise.all([
      this.listPublishedAnnouncements(),
      this.listPublishedInfo('rules'),
      this.listPublishedInfo('facilities'),
      this.listPublishedForms(),
    ]);
    return { announcements, rules, facilities, forms };
  }

  // ===========================================================================
  // ANNOUNCEMENTS
  // ===========================================================================

  /** Published items only, pinned first then newest — the PWA feed. */
  async listPublishedAnnouncements(limit?: number): Promise<DormAnnouncementDto[]> {
    const requested = Math.trunc(limit ?? DEFAULT_LIST_LIMIT);
    const take = Number.isFinite(requested)
      ? Math.min(Math.max(requested, 1), MAX_LIST_LIMIT)
      : DEFAULT_LIST_LIMIT;

    const rows = await this.prisma.dormAnnouncement.findMany({
      where: { isPublished: true },
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
      include: COUNT_INCLUDE,
      take,
    });
    return rows.map((row) => this.toAnnouncementDto(row));
  }

  /** One published item with its attachments — the detail page. 404 if it's a
   *  draft or gone, so a stale/guessed id can't reveal an unpublished item. */
  async getPublishedAnnouncement(id: string): Promise<DormAnnouncementDetailDto> {
    const row = await this.prisma.dormAnnouncement.findFirst({
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
  listAllAnnouncements(): Promise<DormAnnouncement[]> {
    return this.prisma.dormAnnouncement.findMany({
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
    });
  }

  async getAnnouncement(id: string): Promise<DormAnnouncement> {
    const row = await this.prisma.dormAnnouncement.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('Announcement not found.');
    }
    return row;
  }

  async getAnnouncementWithAttachments(
    id: string,
  ): Promise<DormAnnouncement & { attachments: DormAnnouncementAttachment[] }> {
    const row = await this.prisma.dormAnnouncement.findUnique({
      where: { id },
      include: { attachments: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!row) {
      throw new NotFoundException('Announcement not found.');
    }
    return row;
  }

  async createAnnouncement(
    input: DormAnnouncementInput,
    files?: DormAnnouncementFiles,
  ): Promise<DormAnnouncement> {
    const row = await this.prisma.dormAnnouncement.create({
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
    input: DormAnnouncementInput,
    files?: DormAnnouncementFiles,
  ): Promise<DormAnnouncement> {
    const existing = await this.getAnnouncement(id);

    const nextSortOrder = files?.attachments?.length
      ? await this.prisma.dormAnnouncementAttachment.count({
          where: { announcementId: id },
        })
      : 0;

    const row = await this.prisma.dormAnnouncement.update({
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
    const row = await this.prisma.dormAnnouncement.findUnique({
      where: { id },
      include: { attachments: true },
    });
    if (!row) {
      throw new NotFoundException('Announcement not found.');
    }
    await this.prisma.dormAnnouncement.delete({ where: { id } });
    const storedNames = [
      row.coverStoredName,
      ...row.attachments.map((a) => a.storedName),
    ].filter((name): name is string => Boolean(name));
    await Promise.all(storedNames.map((name) => this.unlinkStored(name)));
    this.events$.next({ type: 'deleted', id: row.id });
  }

  async removeAttachment(attachmentId: string): Promise<void> {
    const att = await this.prisma.dormAnnouncementAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!att) {
      throw new NotFoundException('Attachment not found.');
    }
    await this.prisma.dormAnnouncementAttachment.delete({
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
    await this.prisma.dormAnnouncement.update({
      where: { id: announcementId },
      data: { coverStoredName: null, coverMimeType: null },
    });
    await this.unlinkStored(row.coverStoredName);
    await this.broadcastChange(announcementId);
  }

  /** Open an attachment for streaming — only if its announcement is published. */
  async openAttachment(attachmentId: string): Promise<DormFileHandle> {
    const att = await this.prisma.dormAnnouncementAttachment.findUnique({
      where: { id: attachmentId },
      include: { announcement: { select: { isPublished: true } } },
    });
    if (!att || !att.announcement.isPublished) {
      throw new NotFoundException('Attachment not found.');
    }
    return this.openStored(att.storedName, att.mimeType, att.originalName);
  }

  /** Open a published item's cover image for inline streaming. */
  async openCover(announcementId: string): Promise<DormFileHandle> {
    const row = await this.prisma.dormAnnouncement.findFirst({
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
      map(() => ({ data: { type: 'ping' satisfies DormStreamType } })),
    );
    return merge(changes$, heartbeat$);
  }

  // ===========================================================================
  // INFO ITEMS (rules + facilities)
  // ===========================================================================

  /** Published rows of one section, in display order — for the public hub. */
  async listPublishedInfo(section: string): Promise<DormInfoItemDto[]> {
    const rows = await this.prisma.dormInfoItem.findMany({
      where: { section, isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => this.toInfoDto(row));
  }

  /** Every row of one section, including hidden — for the admin list. */
  listAllInfo(section: string): Promise<DormInfoItem[]> {
    return this.prisma.dormInfoItem.findMany({
      where: { section },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async getInfoItem(id: string): Promise<DormInfoItem> {
    const row = await this.prisma.dormInfoItem.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('Info item not found.');
    }
    return row;
  }

  async createInfoItem(input: DormInfoInput): Promise<DormInfoItem> {
    return this.prisma.dormInfoItem.create({
      data: {
        section: this.validateSection(input.section),
        title: this.requireText(input.title, 'عنوان را وارد کنید.'),
        detail: this.cleanOptional(input.detail),
        sortOrder: this.toSortOrder(input.sortOrder),
        isPublished: input.isPublished ?? true,
      },
    });
  }

  async updateInfoItem(id: string, input: DormInfoInput): Promise<DormInfoItem> {
    await this.getInfoItem(id);
    return this.prisma.dormInfoItem.update({
      where: { id },
      data: {
        title: this.requireText(input.title, 'عنوان را وارد کنید.'),
        detail: this.cleanOptional(input.detail),
        sortOrder: this.toSortOrder(input.sortOrder),
        isPublished: input.isPublished ?? false,
      },
    });
  }

  async removeInfoItem(id: string): Promise<void> {
    await this.getInfoItem(id);
    await this.prisma.dormInfoItem.delete({ where: { id } });
  }

  // ===========================================================================
  // FORMS (فرم‌ها و مدارک)
  // ===========================================================================

  /** Published forms, in display order — for the public hub. */
  async listPublishedForms(): Promise<DormFormDto[]> {
    const rows = await this.prisma.dormForm.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.toFormDto(row));
  }

  /** Every form, including hidden — for the admin list. */
  listAllForms(): Promise<DormForm[]> {
    return this.prisma.dormForm.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getForm(id: string): Promise<DormForm> {
    const row = await this.prisma.dormForm.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('Form not found.');
    }
    return row;
  }

  async createForm(
    input: DormFormInput,
    file: UploadedDormFile,
  ): Promise<DormForm> {
    return this.prisma.dormForm.create({
      data: {
        title: this.requireText(input.title, 'عنوان فرم را وارد کنید.'),
        description: this.cleanOptional(input.description),
        storedName: file.storedName,
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: file.size,
        sortOrder: this.toSortOrder(input.sortOrder),
        isPublished: input.isPublished ?? true,
      },
    });
  }

  async removeForm(id: string): Promise<void> {
    const row = await this.getForm(id);
    await this.prisma.dormForm.delete({ where: { id } });
    await this.unlinkStored(row.storedName);
  }

  /** Open a published form's file for streaming (view/download). */
  async openForm(id: string): Promise<DormFileHandle> {
    const row = await this.prisma.dormForm.findFirst({
      where: { id, isPublished: true },
    });
    if (!row) {
      throw new NotFoundException('Form not found.');
    }
    return this.openStored(row.storedName, row.mimeType, row.originalName);
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private openStored(
    storedName: string,
    mimeType: string,
    originalName: string,
  ): DormFileHandle {
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
    const row = await this.prisma.dormAnnouncement.findUnique({
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
    type: Exclude<DormStreamType, 'deleted' | 'ping'>,
    row: AnnouncementRow,
  ) {
    this.events$.next({ type, item: this.toAnnouncementDto(row) });
  }

  /**
   * A newly-published announcement: announce it on the SSE stream (→ in-app
   * toast/bell) AND fan it out as an OS push notification (fire-and-forget). Both
   * deep-link to the item's detail page inside the خوابگاه section.
   */
  private notifyNew(row: AnnouncementRow): void {
    const item = this.toAnnouncementDto(row);
    this.events$.next({ type: 'created', item });
    void this.push.sendToAll({
      title: item.title,
      // Push payloads are capped (~4 KB after encryption); truncate the body.
      body: this.toPushBody(item.body),
      url: `/dormitory/announcements/${item.id}`,
      tag: `dorm-${item.id}`,
    });
  }

  private toPushBody(body: string): string {
    const MAX = 180;
    const text = body.trim();
    if (text.length <= MAX) return text;
    return `${text.slice(0, MAX - 1).trimEnd()}…`;
  }

  private toAnnouncementData(input: DormAnnouncementInput) {
    return {
      title: this.requireText(input.title, 'عنوان اطلاعیه را وارد کنید.'),
      category: this.validateCategory(input.category),
      body: this.requireText(input.body, 'متن اطلاعیه را وارد کنید.'),
      link: this.cleanOptional(input.link),
      pinned: input.pinned ?? false,
      isPublished: input.isPublished ?? true,
    };
  }

  private toAttachmentData(file: UploadedDormFile, sortOrder: number) {
    return {
      storedName: file.storedName,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      sortOrder,
    };
  }

  private toAnnouncementDto(row: AnnouncementRow): DormAnnouncementDto {
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      categoryLabel: dormAnnouncementCategoryLabel(row.category),
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
  ): DormAnnouncementDetailDto {
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

  private toInfoDto(row: DormInfoItem): DormInfoItemDto {
    return { id: row.id, title: row.title, detail: row.detail };
  }

  private toFormDto(row: DormForm): DormFormDto {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      originalName: row.originalName,
      mimeType: row.mimeType,
      size: row.size,
      sizeLabel: formatFileSize(row.size),
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
    if (!text || !isKnownDormAnnouncementCategory(text)) {
      throw new BadRequestException('دستهٔ انتخاب‌شده معتبر نیست.');
    }
    return text;
  }

  private validateSection(section?: string): string {
    const text = section?.trim();
    if (!text || !isKnownDormInfoSection(text)) {
      throw new BadRequestException('بخش انتخاب‌شده معتبر نیست.');
    }
    return text;
  }

  /** Optional sort order: blank/garbage → 0, otherwise a clamped integer. */
  private toSortOrder(value?: number | string | null): number {
    if (value === undefined || value === null || value === '') return 0;
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), 100000) : 0;
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
