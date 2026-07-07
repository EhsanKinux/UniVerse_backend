import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { unlink } from 'node:fs/promises';
import { contentDisposition } from '../common/content-disposition.util';
import {
  GROUP_LINK_KIND_LABELS,
  GROUP_LINK_KINDS,
  GroupLinkKind,
  isKnownGroupLinkKind,
} from '../groups/dto/group-kinds';
import { createGroupsMulterOptions } from '../groups/groups-upload.config';
import {
  GroupCategoryInput,
  GroupInput,
  GroupLinkInput,
  GroupsService,
} from '../groups/groups.service';
import { AdminAuthFilter } from './admin-auth.filter';
import { AdminGuard } from './admin.guard';
import { GroupCategoryFormDto } from './dto/group-category-form.dto';
import { GroupFormDto } from './dto/group-form.dto';
import { GroupLinkFormDto } from './dto/group-link-form.dto';

/** One group card as the category edit page lists it. */
interface GroupRow {
  id: string;
  title: string;
  platform: string;
  linkCount: number;
  isPublished: boolean;
}

/** The view shape used to render (and re-fill) the category form. */
interface CategoryFormView {
  id?: string;
  title: string;
  sortOrder: string;
  isPublished: boolean;
  groups?: GroupRow[];
}

/** One join option as the group edit page lists it. */
interface LinkRow {
  id: string;
  kind: string;
  kindLabel: string;
  label: string;
  url: string;
  handle: string;
  hasQr: boolean;
  qrUrl: string;
}

/** The view shape used to render (and re-fill) the group form. */
interface GroupFormView {
  id: string;
  categoryId: string;
  title: string;
  description: string;
  platform: string;
  sortOrder: string;
  isPublished: boolean;
  links?: LinkRow[];
}

const EMPTY_CATEGORY: CategoryFormView = {
  title: '',
  sortOrder: '0',
  isPublished: true,
};
const EMPTY_GROUP_FORM = {
  title: '',
  description: '',
  platform: '',
  sortOrder: '0',
  isPublished: true,
};
const EMPTY_LINK_FORM = {
  kind: GROUP_LINK_KINDS[0] as string,
  label: '',
  url: '',
  handle: '',
};

/**
 * The staff-facing «گروه‌ها» admin section under /admin/groups. It reuses
 * GroupsService for every read/write, so the directory rules live in one place.
 * It's a three-level tree, so it has two edit pages: a category page (edit the
 * category + manage its group cards) and a group page (edit the card + manage its
 * join options — links, copyable ids and QR images). Every route is gated by
 * AdminGuard. The add-join-option route is multipart so staff can upload a QR.
 */
@ApiExcludeController()
@Controller('admin/groups')
@UseFilters(AdminAuthFilter)
@UseGuards(AdminGuard)
export class AdminGroupsController {
  constructor(private readonly groups: GroupsService) {}

  // ===========================================================================
  // CATEGORIES
  // ===========================================================================

  @Get()
  async list(@Res() res: Response): Promise<void> {
    const categories = await this.groups.listAllCategories();
    res.render('admin/groups', {
      title: 'گروه‌ها',
      nav: true,
      activeNav: 'groups',
      hasItems: categories.length > 0,
      items: categories.map((c) => ({
        id: c.id,
        title: c.title,
        groupCount: c._count.groups,
        isPublished: c.isPublished,
      })),
    });
  }

  @Get('new')
  newCategoryForm(@Res() res: Response): void {
    res.render(
      'admin/group-category-form',
      this.categoryContext({
        mode: 'create',
        action: '/admin/groups',
        category: EMPTY_CATEGORY,
        error: null,
      }),
    );
  }

  @Post()
  async createCategory(
    @Body() dto: GroupCategoryFormDto,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.groups.createCategory(this.fromCategoryDto(dto));
      res.redirect('/admin/groups');
    } catch (error) {
      res.status(400).render(
        'admin/group-category-form',
        this.categoryContext({
          mode: 'create',
          action: '/admin/groups',
          category: this.categoryDtoToView(dto),
          error: this.errorMessage(error),
        }),
      );
    }
  }

  @Get(':id/edit')
  async editCategoryForm(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const category = await this.groups.getCategoryWithGroups(id);
    res.render(
      'admin/group-category-form',
      this.categoryContext({
        mode: 'edit',
        action: `/admin/groups/${id}`,
        category: this.categoryToView(category),
        error: null,
      }),
    );
  }

  @Post(':id')
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: GroupCategoryFormDto,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.groups.updateCategory(id, this.fromCategoryDto(dto));
      res.redirect('/admin/groups');
    } catch (error) {
      const existing = await this.groups
        .getCategoryWithGroups(id)
        .catch(() => null);
      res.status(400).render(
        'admin/group-category-form',
        this.categoryContext({
          mode: 'edit',
          action: `/admin/groups/${id}`,
          category: {
            ...this.categoryDtoToView(dto),
            id,
            groups: existing ? this.categoryToView(existing).groups : [],
          },
          error: this.errorMessage(error),
        }),
      );
    }
  }

  @Post(':id/delete')
  async removeCategory(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.groups.removeCategory(id);
    res.redirect('/admin/groups');
  }

  @Post(':id/toggle')
  async toggleCategory(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.groups.toggleCategory(id);
    res.redirect('/admin/groups');
  }

  // ===========================================================================
  // GROUP CARDS
  // ===========================================================================

  /** Add a group to a category, then jump to its edit page to add join options. */
  @Post(':id/groups')
  async addGroup(
    @Param('id') categoryId: string,
    @Body() dto: GroupFormDto,
    @Res() res: Response,
  ): Promise<void> {
    try {
      // The quick add-group form has no «نمایش» checkbox, so a new card defaults
      // to visible (staff hide it later from its own edit page if needed). It only
      // surfaces publicly once it has at least one join option anyway.
      const group = await this.groups.addGroup(categoryId, {
        ...this.fromGroupDto(dto),
        isPublished: true,
      });
      res.redirect(`/admin/groups/groups/${group.id}/edit`);
    } catch (error) {
      const existing = await this.groups
        .getCategoryWithGroups(categoryId)
        .catch(() => null);
      res.status(400).render(
        'admin/group-category-form',
        this.categoryContext({
          mode: 'edit',
          action: `/admin/groups/${categoryId}`,
          category: existing
            ? this.categoryToView(existing)
            : { ...EMPTY_CATEGORY, id: categoryId, groups: [] },
          error: this.errorMessage(error),
          groupForm: {
            title: dto.title ?? '',
            description: dto.description ?? '',
            platform: dto.platform ?? '',
            sortOrder: dto.sortOrder ?? '0',
            isPublished: dto.isPublished === 'on',
          },
        }),
      );
    }
  }

  @Get('groups/:groupId/edit')
  async editGroupForm(
    @Param('groupId') groupId: string,
    @Res() res: Response,
  ): Promise<void> {
    const group = await this.groups.getGroupWithLinks(groupId);
    res.render(
      'admin/group-form',
      this.groupContext({
        group: this.groupToView(group),
        error: null,
      }),
    );
  }

  @Post('groups/:groupId')
  async updateGroup(
    @Param('groupId') groupId: string,
    @Body() dto: GroupFormDto,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const group = await this.groups.updateGroup(
        groupId,
        this.fromGroupDto(dto),
      );
      res.redirect(`/admin/groups/${group.categoryId}/edit`);
    } catch (error) {
      const existing = await this.groups
        .getGroupWithLinks(groupId)
        .catch(() => null);
      res.status(400).render(
        'admin/group-form',
        this.groupContext({
          group: existing
            ? { ...this.groupToView(existing), ...this.groupDtoToView(dto) }
            : { ...this.groupDtoToView(dto), id: groupId, categoryId: '' },
          error: this.errorMessage(error),
        }),
      );
    }
  }

  @Post('groups/:groupId/delete')
  async removeGroup(
    @Param('groupId') groupId: string,
    @Res() res: Response,
  ): Promise<void> {
    const categoryId = await this.groups.removeGroup(groupId);
    res.redirect(`/admin/groups/${categoryId}/edit`);
  }

  @Post('groups/:groupId/toggle')
  async toggleGroup(
    @Param('groupId') groupId: string,
    @Res() res: Response,
  ): Promise<void> {
    const categoryId = await this.groups.toggleGroup(groupId);
    res.redirect(`/admin/groups/${categoryId}/edit`);
  }

  // ===========================================================================
  // JOIN OPTIONS (links / handles / QR)
  // ===========================================================================

  @Post('groups/:groupId/links')
  @UseInterceptors(FileInterceptor('qr', createGroupsMulterOptions()))
  async addLink(
    @Param('groupId') groupId: string,
    @Body() dto: GroupLinkFormDto,
    @UploadedFile() qr: Express.Multer.File | undefined,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.groups.addLink(
        groupId,
        this.fromLinkDto(dto),
        qr ? { storedName: qr.filename, mimeType: qr.mimetype } : undefined,
      );
      res.redirect(`/admin/groups/groups/${groupId}/edit`);
    } catch (error) {
      if (qr) {
        await unlink(qr.path).catch(() => undefined);
      }
      const existing = await this.groups
        .getGroupWithLinks(groupId)
        .catch(() => null);
      res.status(400).render(
        'admin/group-form',
        this.groupContext({
          group: existing
            ? this.groupToView(existing)
            : { ...EMPTY_GROUP_FORM, id: groupId, categoryId: '', links: [] },
          error: this.errorMessage(error),
          linkForm: {
            kind: dto.kind ?? EMPTY_LINK_FORM.kind,
            label: dto.label ?? '',
            url: dto.url ?? '',
            handle: dto.handle ?? '',
          },
        }),
      );
    }
  }

  @Post('links/:linkId/delete')
  async removeLink(
    @Param('linkId') linkId: string,
    @Res() res: Response,
  ): Promise<void> {
    const groupId = await this.groups.removeLink(linkId);
    res.redirect(`/admin/groups/groups/${groupId}/edit`);
  }

  /** Preview a QR image in the admin, even for an unpublished card. */
  @Get('links/:linkId/qr')
  async previewQr(
    @Param('linkId') linkId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.groups.openQr(linkId, false);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.size),
      'Content-Disposition': contentDisposition('inline', file.originalName),
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(file.stream);
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private fromCategoryDto(dto: GroupCategoryFormDto): GroupCategoryInput {
    return {
      title: dto.title,
      sortOrder: dto.sortOrder,
      isPublished: dto.isPublished === 'on',
    };
  }

  private categoryDtoToView(dto: GroupCategoryFormDto): CategoryFormView {
    return {
      title: dto.title ?? '',
      sortOrder: dto.sortOrder ?? '0',
      isPublished: dto.isPublished === 'on',
    };
  }

  private categoryToView(category: {
    id: string;
    title: string;
    sortOrder: number;
    isPublished: boolean;
    groups: {
      id: string;
      title: string;
      platform: string | null;
      isPublished: boolean;
      _count: { links: number };
    }[];
  }): CategoryFormView {
    return {
      id: category.id,
      title: category.title,
      sortOrder: String(category.sortOrder),
      isPublished: category.isPublished,
      groups: category.groups.map((g) => ({
        id: g.id,
        title: g.title,
        platform: g.platform ?? '',
        linkCount: g._count.links,
        isPublished: g.isPublished,
      })),
    };
  }

  private fromGroupDto(dto: GroupFormDto): GroupInput {
    return {
      title: dto.title,
      description: dto.description,
      platform: dto.platform,
      sortOrder: dto.sortOrder,
      isPublished: dto.isPublished === 'on',
    };
  }

  private groupDtoToView(dto: GroupFormDto): {
    title: string;
    description: string;
    platform: string;
    sortOrder: string;
    isPublished: boolean;
  } {
    return {
      title: dto.title ?? '',
      description: dto.description ?? '',
      platform: dto.platform ?? '',
      sortOrder: dto.sortOrder ?? '0',
      isPublished: dto.isPublished === 'on',
    };
  }

  private groupToView(group: {
    id: string;
    categoryId: string;
    title: string;
    description: string | null;
    platform: string | null;
    sortOrder: number;
    isPublished: boolean;
    links: {
      id: string;
      kind: string;
      label: string | null;
      url: string | null;
      handle: string | null;
      qrStoredName: string | null;
    }[];
  }): GroupFormView {
    return {
      id: group.id,
      categoryId: group.categoryId,
      title: group.title,
      description: group.description ?? '',
      platform: group.platform ?? '',
      sortOrder: String(group.sortOrder),
      isPublished: group.isPublished,
      links: group.links.map((l) => ({
        id: l.id,
        kind: l.kind,
        kindLabel: isKnownGroupLinkKind(l.kind)
          ? GROUP_LINK_KIND_LABELS[l.kind]
          : l.kind,
        label: l.label ?? '',
        url: l.url ?? '',
        handle: l.handle ?? '',
        hasQr: l.qrStoredName != null,
        qrUrl: `/admin/groups/links/${l.id}/qr`,
      })),
    };
  }

  private fromLinkDto(dto: GroupLinkFormDto): GroupLinkInput {
    return {
      kind: dto.kind,
      label: dto.label,
      url: dto.url,
      handle: dto.handle,
    };
  }

  private categoryContext(params: {
    mode: 'create' | 'edit';
    action: string;
    category: CategoryFormView;
    error: string | null;
    groupForm?: typeof EMPTY_GROUP_FORM;
  }) {
    return {
      title: params.mode === 'create' ? 'دسته‌بندی جدید' : 'ویرایش دسته‌بندی',
      nav: true,
      activeNav: 'groups',
      isEdit: params.mode === 'edit',
      action: params.action,
      category: params.category,
      groupForm: params.groupForm ?? EMPTY_GROUP_FORM,
      error: params.error,
    };
  }

  private groupContext(params: {
    group: GroupFormView;
    error: string | null;
    linkForm?: typeof EMPTY_LINK_FORM;
  }) {
    const linkForm = params.linkForm ?? EMPTY_LINK_FORM;
    return {
      title: 'ویرایش گروه',
      nav: true,
      activeNav: 'groups',
      action: `/admin/groups/groups/${params.group.id}`,
      backTo: `/admin/groups/${params.group.categoryId}/edit`,
      group: params.group,
      linkForm,
      kindOptions: GROUP_LINK_KINDS.map((value) => ({
        value,
        label: GROUP_LINK_KIND_LABELS[value as GroupLinkKind],
        selected: value === linkForm.kind,
      })),
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
