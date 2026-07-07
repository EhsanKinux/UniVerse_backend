import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { resolveUploadDir } from '../documents/upload.config';
import {
  Group,
  GroupCategory,
  GroupLink,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_GROUP_LINK_KIND,
  GroupLinkKind,
  isKnownGroupLinkKind,
} from './dto/group-kinds';
import { GroupCategoryDto, GroupDto, GroupLinkDto } from './dto/groups.dto';

/** The plain text form fields for creating/updating a category. */
export interface GroupCategoryInput {
  title?: string;
  sortOrder?: string | number | null;
  isPublished?: boolean;
}

/** The plain text form fields for creating/updating a group card. */
export interface GroupInput {
  title?: string;
  description?: string | null;
  platform?: string | null;
  sortOrder?: string | number | null;
  isPublished?: boolean;
}

/** The plain text form fields for creating a join option. */
export interface GroupLinkInput {
  kind?: string;
  label?: string | null;
  url?: string | null;
  handle?: string | null;
}

/** What the admin hands us after multer has written a QR image to disk. */
export interface UploadedQr {
  storedName: string; // multer's generated, on-disk filename
  mimeType: string;
}

/** A stored QR image opened for streaming, with the metadata the controller needs. */
export interface GroupFileHandle {
  stream: Readable;
  mimeType: string;
  originalName: string;
  size: number;
}

// Rows with their children loaded, for the admin edit pages.
type CategoryWithGroups = GroupCategory & {
  groups: (Group & { _count: { links: number } })[];
};
type GroupWithLinks = Group & { links: GroupLink[] };
// The full published tree, three levels deep.
type CategoryTree = GroupCategory & {
  groups: GroupWithLinks[];
};

// Links always render in the order staff arranged them (then oldest-first).
const LINK_ORDER: Prisma.GroupLinkOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { createdAt: 'asc' },
];

// Groups render by their manual order, ties broken by title.
const GROUP_ORDER: Prisma.GroupOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { title: 'asc' },
];

// Categories render by their manual order, ties broken by title.
const CATEGORY_ORDER: Prisma.GroupCategoryOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { title: 'asc' },
];

@Injectable()
export class GroupsService {
  // The shared uploads folder — the SAME one documents/news use. QR images live
  // here on disk; only metadata lives in the DB.
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
   * The whole published directory in one call — every published category that has
   * at least one published group that in turn has at least one join option. Empty
   * or hidden nodes are pruned so students never see a dead card. Always succeeds
   * (an empty array when nothing is published), so the PWA shows an empty state
   * rather than handling a 404.
   */
  async getPublishedTree(): Promise<GroupCategoryDto[]> {
    const publishedGroup: Prisma.GroupWhereInput = {
      isPublished: true,
      links: { some: {} },
    };
    const categories = await this.prisma.groupCategory.findMany({
      where: { isPublished: true, groups: { some: publishedGroup } },
      orderBy: CATEGORY_ORDER,
      include: {
        groups: {
          where: publishedGroup,
          orderBy: GROUP_ORDER,
          include: { links: { orderBy: LINK_ORDER } },
        },
      },
    });
    return categories.map((category) => this.toCategoryDto(category));
  }

  // ---------------------------------------------------------------------------
  // READ (admin display)
  // ---------------------------------------------------------------------------

  /** Every category (published or not) with a live count of its groups. */
  listAllCategories(): Promise<
    (GroupCategory & { _count: { groups: number } })[]
  > {
    return this.prisma.groupCategory.findMany({
      orderBy: CATEGORY_ORDER,
      include: { _count: { select: { groups: true } } },
    });
  }

  /** The raw category row — 404 if it's gone. */
  async getCategory(id: string): Promise<GroupCategory> {
    const category = await this.prisma.groupCategory.findUnique({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException('Group category not found.');
    }
    return category;
  }

  /** A category plus its groups (each with a link count) — for the category edit page. */
  async getCategoryWithGroups(id: string): Promise<CategoryWithGroups> {
    const category = await this.prisma.groupCategory.findUnique({
      where: { id },
      include: {
        groups: {
          orderBy: GROUP_ORDER,
          include: { _count: { select: { links: true } } },
        },
      },
    });
    if (!category) {
      throw new NotFoundException('Group category not found.');
    }
    return category;
  }

  /** The raw group row — 404 if it's gone. */
  async getGroup(id: string): Promise<Group> {
    const group = await this.prisma.group.findUnique({ where: { id } });
    if (!group) {
      throw new NotFoundException('Group not found.');
    }
    return group;
  }

  /** A group plus its join options — for the group edit page. */
  async getGroupWithLinks(id: string): Promise<GroupWithLinks> {
    const group = await this.prisma.group.findUnique({
      where: { id },
      include: { links: { orderBy: LINK_ORDER } },
    });
    if (!group) {
      throw new NotFoundException('Group not found.');
    }
    return group;
  }

  /** The raw link row — 404 if it's gone. */
  async getLink(id: string): Promise<GroupLink> {
    const link = await this.prisma.groupLink.findUnique({ where: { id } });
    if (!link) {
      throw new NotFoundException('Join option not found.');
    }
    return link;
  }

  // ---------------------------------------------------------------------------
  // WRITE — categories (admin)
  // ---------------------------------------------------------------------------

  createCategory(input: GroupCategoryInput): Promise<GroupCategory> {
    return this.prisma.groupCategory.create({
      data: this.toCategoryData(input),
    });
  }

  async updateCategory(
    id: string,
    input: GroupCategoryInput,
  ): Promise<GroupCategory> {
    await this.getCategory(id); // 404 if it's gone
    return this.prisma.groupCategory.update({
      where: { id },
      data: this.toCategoryData(input),
    });
  }

  async removeCategory(id: string): Promise<void> {
    await this.getCategory(id);
    // Gather every QR image under this category BEFORE the cascade removes the
    // rows, so we can unlink the on-disk files afterwards.
    const storedNames = await this.qrStoredNamesForCategory(id);
    await this.prisma.groupCategory.delete({ where: { id } });
    await this.unlinkAll(storedNames);
  }

  /** Flip a category's published flag (quick toggle from the admin list). */
  async toggleCategory(id: string): Promise<void> {
    const category = await this.getCategory(id);
    await this.prisma.groupCategory.update({
      where: { id },
      data: { isPublished: !category.isPublished },
    });
  }

  // ---------------------------------------------------------------------------
  // WRITE — groups (admin)
  // ---------------------------------------------------------------------------

  /** Add one group card to a category, appended after its existing groups. */
  async addGroup(categoryId: string, input: GroupInput): Promise<Group> {
    await this.getCategory(categoryId); // 404 if the category is gone
    const nextSortOrder = await this.prisma.group.count({
      where: { categoryId },
    });
    return this.prisma.group.create({
      data: {
        categoryId,
        ...this.toGroupData(input),
        sortOrder: this.parseSortOrder(input.sortOrder) || nextSortOrder,
      },
    });
  }

  async updateGroup(id: string, input: GroupInput): Promise<Group> {
    await this.getGroup(id); // 404 if it's gone
    return this.prisma.group.update({
      where: { id },
      data: this.toGroupData(input),
    });
  }

  /** Remove one group; returns its categoryId so the controller can redirect back. */
  async removeGroup(id: string): Promise<string> {
    const group = await this.prisma.group.findUnique({
      where: { id },
      include: { links: true },
    });
    if (!group) {
      throw new NotFoundException('Group not found.');
    }
    await this.prisma.group.delete({ where: { id } });
    await this.unlinkAll(
      group.links
        .map((l) => l.qrStoredName)
        .filter((n): n is string => Boolean(n)),
    );
    return group.categoryId;
  }

  /** Flip a group's published flag (quick toggle from the category edit page). */
  async toggleGroup(id: string): Promise<string> {
    const group = await this.getGroup(id);
    await this.prisma.group.update({
      where: { id },
      data: { isPublished: !group.isPublished },
    });
    return group.categoryId;
  }

  // ---------------------------------------------------------------------------
  // WRITE — join options / links (admin)
  // ---------------------------------------------------------------------------

  /**
   * Add one join option to a group, appended after its existing links. The QR
   * image (only for kind="qr") is passed in after multer wrote it to disk.
   */
  async addLink(
    groupId: string,
    input: GroupLinkInput,
    qr?: UploadedQr,
  ): Promise<GroupLink> {
    await this.getGroup(groupId); // 404 if the group is gone
    const data = this.toLinkData(input, qr);
    const nextSortOrder = await this.prisma.groupLink.count({
      where: { groupId },
    });
    return this.prisma.groupLink.create({
      data: { groupId, ...data, sortOrder: nextSortOrder },
    });
  }

  /** Remove one join option; returns its groupId so the controller can redirect back. */
  async removeLink(id: string): Promise<string> {
    const link = await this.getLink(id);
    await this.prisma.groupLink.delete({ where: { id } });
    if (link.qrStoredName) {
      await this.unlinkStored(link.qrStoredName);
    }
    return link.groupId;
  }

  // ---------------------------------------------------------------------------
  // FILE STREAMING (public)
  // ---------------------------------------------------------------------------

  /**
   * Open a link's QR image for inline streaming. The public endpoint passes
   * `requirePublished` so a hidden card's image stays private; the admin preview
   * passes false so staff can see a QR before publishing.
   */
  async openQr(
    linkId: string,
    requirePublished = true,
  ): Promise<GroupFileHandle> {
    const link = await this.prisma.groupLink.findUnique({
      where: { id: linkId },
      include: {
        group: {
          select: {
            isPublished: true,
            category: { select: { isPublished: true } },
          },
        },
      },
    });
    const isVisible =
      link?.group.isPublished && link.group.category.isPublished;
    if (
      !link?.qrStoredName ||
      !link.qrMimeType ||
      (requirePublished && !isVisible)
    ) {
      throw new NotFoundException('QR image not found.');
    }
    return this.openStored(
      link.qrStoredName,
      link.qrMimeType,
      `qr${extname(link.qrStoredName)}`,
    );
  }

  // ---------------------------------------------------------------------------
  // PRIVATE — DTO mapping
  // ---------------------------------------------------------------------------

  private toCategoryDto(category: CategoryTree): GroupCategoryDto {
    return {
      id: category.id,
      title: category.title,
      groups: category.groups.map((g) => this.toGroupDto(g)),
    };
  }

  private toGroupDto(group: GroupWithLinks): GroupDto {
    return {
      id: group.id,
      title: group.title,
      description: group.description,
      platform: group.platform,
      links: group.links.map((l) => this.toLinkDto(l)),
    };
  }

  private toLinkDto(link: GroupLink): GroupLinkDto {
    return {
      id: link.id,
      kind: link.kind,
      label: link.label,
      url: link.url,
      handle: link.handle,
      hasQr: link.qrStoredName != null,
    };
  }

  // ---------------------------------------------------------------------------
  // PRIVATE — validate + normalise form input
  // ---------------------------------------------------------------------------

  private toCategoryData(input: GroupCategoryInput) {
    return {
      title: this.requireText(input.title, 'عنوان دسته‌بندی را وارد کنید.'),
      sortOrder: this.parseSortOrder(input.sortOrder),
      isPublished: input.isPublished ?? true,
    };
  }

  private toGroupData(input: GroupInput) {
    return {
      title: this.requireText(input.title, 'عنوان گروه را وارد کنید.'),
      description: this.cleanOptional(input.description),
      platform: this.cleanOptional(input.platform),
      sortOrder: this.parseSortOrder(input.sortOrder),
      isPublished: input.isPublished ?? true,
    };
  }

  /**
   * Validate a join option against its kind and produce a Prisma data object.
   * Exactly one payload is kept; the other fields are nulled so a kind change
   * never leaves stale data behind.
   */
  private toLinkData(input: GroupLinkInput, qr?: UploadedQr) {
    const kind = this.validateKind(input.kind);
    const label = this.cleanOptional(input.label);

    if (kind === 'link') {
      return {
        kind,
        label,
        url: this.requireUrl(input.url),
        handle: null,
        qrStoredName: null,
        qrMimeType: null,
      };
    }
    if (kind === 'handle') {
      return {
        kind,
        label,
        url: null,
        handle: this.requireText(
          input.handle,
          'شناسه یا کد عضویت را وارد کنید.',
        ),
        qrStoredName: null,
        qrMimeType: null,
      };
    }
    // kind === 'qr'
    if (!qr) {
      throw new BadRequestException('برای گزینهٔ QR باید یک تصویر بارگذاری کنید.');
    }
    return {
      kind,
      label,
      url: null,
      handle: null,
      qrStoredName: qr.storedName,
      qrMimeType: qr.mimeType,
    };
  }

  private validateKind(kind?: string): GroupLinkKind {
    const text = kind?.trim();
    if (!text) {
      return DEFAULT_GROUP_LINK_KIND;
    }
    if (!isKnownGroupLinkKind(text)) {
      throw new BadRequestException('نوع گزینهٔ عضویت معتبر نیست.');
    }
    return text;
  }

  /**
   * A join URL is required and normalised: a missing scheme gets `https://`
   * prepended (staff often paste «t.me/x»), then it must parse as a real URL.
   */
  private requireUrl(value?: string | null): string {
    const text = value?.trim();
    if (!text) {
      throw new BadRequestException('لینک عضویت را وارد کنید.');
    }
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
      ? text
      : `https://${text}`;
    try {
      // Throws for clearly malformed input; we keep the (possibly scheme-added) text.
      new URL(withScheme);
    } catch {
      throw new BadRequestException('لینک واردشده معتبر نیست.');
    }
    return withScheme;
  }

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

  /** Turn empty/blank strings into null for optional columns. */
  private cleanOptional(value?: string | null): string | null {
    const text = value?.trim();
    return text ? text : null;
  }

  // ---------------------------------------------------------------------------
  // PRIVATE — file helpers
  // ---------------------------------------------------------------------------

  /** Open a stored file as a stream; 404 if the DB says it exists but the disk
   *  file is missing. */
  private openStored(
    storedName: string,
    mimeType: string,
    originalName: string,
  ): GroupFileHandle {
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

  /** Every QR image stored under a category (across all its groups' links). */
  private async qrStoredNamesForCategory(
    categoryId: string,
  ): Promise<string[]> {
    const links = await this.prisma.groupLink.findMany({
      where: { group: { categoryId }, qrStoredName: { not: null } },
      select: { qrStoredName: true },
    });
    return links
      .map((l) => l.qrStoredName)
      .filter((n): n is string => Boolean(n));
  }

  private async unlinkAll(storedNames: string[]): Promise<void> {
    await Promise.all(storedNames.map((name) => this.unlinkStored(name)));
  }

  /** Best-effort delete of a stored file; ignore if it's already gone. */
  private async unlinkStored(storedName: string): Promise<void> {
    await unlink(join(this.uploadDir, storedName)).catch(() => undefined);
  }
}
