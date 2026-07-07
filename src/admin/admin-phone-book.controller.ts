import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  CONTACT_GROUP_ICONS,
  CONTACT_ICON_LABELS,
} from '../phone-book/dto/contact-icons';
import {
  ContactGroupInput,
  PhoneBookService,
} from '../phone-book/phone-book.service';
import { AdminAuthFilter } from './admin-auth.filter';
import { AdminGuard } from './admin.guard';
import { ContactFormDto } from './dto/contact-form.dto';
import { ContactGroupFormDto } from './dto/contact-group-form.dto';

/** One contact row as the edit form renders it (an inline, per-row edit form). */
interface ContactView {
  id: string;
  name: string;
  phone: string;
  ext: string;
  note: string;
  email: string;
}

/** The view shape used to render (and re-fill) the group form. */
interface GroupFormView {
  id?: string;
  title: string;
  icon: string;
  sortOrder: string;
  isPublished: boolean;
  contacts?: ContactView[];
}

/** A blank "add contact" form (also the shape re-filled after a validation error). */
const EMPTY_CONTACT_FORM = { name: '', phone: '', ext: '', note: '', email: '' };

/** The blank group used to render an empty "create" form. */
const EMPTY_GROUP: GroupFormView = {
  title: '',
  icon: CONTACT_GROUP_ICONS[0],
  sortOrder: '0',
  isPublished: true,
};

/**
 * The staff-facing «شماره‌های دانشگاه» admin section under /admin/phone-book. It
 * reuses PhoneBookService for every read/write, so the directory rules live in one
 * place. A group is created/edited with the plain form; its numbers are added,
 * edited in place, or removed from the edit page — mirroring how the chart admin
 * manages a department's files. Every route is gated by AdminGuard.
 */
@ApiExcludeController()
@Controller('admin/phone-book')
@UseFilters(AdminAuthFilter)
@UseGuards(AdminGuard)
export class AdminPhoneBookController {
  constructor(private readonly phoneBook: PhoneBookService) {}

  // ---------------------------------------------------------------------------
  // GROUPS
  // ---------------------------------------------------------------------------

  @Get()
  async list(@Res() res: Response): Promise<void> {
    const groups = await this.phoneBook.listAllGroups();
    res.render('admin/phone-book', {
      title: 'شماره‌های دانشگاه',
      nav: true,
      activeNav: 'phone-book',
      hasItems: groups.length > 0,
      items: groups.map((g) => ({
        id: g.id,
        title: g.title,
        icon: g.icon,
        iconLabel: CONTACT_ICON_LABELS[g.icon] ?? g.icon,
        isPublished: g.isPublished,
        contactCount: g.contacts.length,
      })),
    });
  }

  @Get('new')
  newForm(@Res() res: Response): void {
    res.render(
      'admin/phone-book-form',
      this.formContext({
        mode: 'create',
        action: '/admin/phone-book',
        group: EMPTY_GROUP,
        error: null,
      }),
    );
  }

  @Post()
  async create(
    @Body() dto: ContactGroupFormDto,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.phoneBook.createGroup(this.fromGroupDto(dto));
      res.redirect('/admin/phone-book');
    } catch (error) {
      res.status(400).render(
        'admin/phone-book-form',
        this.formContext({
          mode: 'create',
          action: '/admin/phone-book',
          group: this.dtoToView(dto),
          error: this.errorMessage(error),
        }),
      );
    }
  }

  @Get(':id/edit')
  async editForm(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const group = await this.phoneBook.getGroupWithContacts(id);
    res.render(
      'admin/phone-book-form',
      this.formContext({
        mode: 'edit',
        action: `/admin/phone-book/${id}`,
        group: this.toView(group),
        error: null,
      }),
    );
  }

  @Post(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: ContactGroupFormDto,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.phoneBook.updateGroup(id, this.fromGroupDto(dto));
      res.redirect('/admin/phone-book');
    } catch (error) {
      // Re-load the group's existing contacts so the re-rendered form keeps them.
      const existing = await this.phoneBook
        .getGroupWithContacts(id)
        .catch(() => null);
      res.status(400).render(
        'admin/phone-book-form',
        this.formContext({
          mode: 'edit',
          action: `/admin/phone-book/${id}`,
          group: {
            ...this.dtoToView(dto),
            id,
            contacts: existing ? this.toView(existing).contacts : [],
          },
          error: this.errorMessage(error),
        }),
      );
    }
  }

  @Post(':id/delete')
  async remove(@Param('id') id: string, @Res() res: Response): Promise<void> {
    await this.phoneBook.removeGroup(id);
    res.redirect('/admin/phone-book');
  }

  /** Quick show/hide toggle from the list. */
  @Post(':id/toggle')
  async toggle(@Param('id') id: string, @Res() res: Response): Promise<void> {
    await this.phoneBook.toggleGroup(id);
    res.redirect('/admin/phone-book');
  }

  // ---------------------------------------------------------------------------
  // CONTACTS (phone numbers)
  // ---------------------------------------------------------------------------

  @Post(':id/contacts')
  async addContact(
    @Param('id') id: string,
    @Body() dto: ContactFormDto,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.phoneBook.addContact(id, dto);
      res.redirect(`/admin/phone-book/${id}/edit`);
    } catch (error) {
      const existing = await this.phoneBook
        .getGroupWithContacts(id)
        .catch(() => null);
      res.status(400).render(
        'admin/phone-book-form',
        this.formContext({
          mode: 'edit',
          action: `/admin/phone-book/${id}`,
          group: existing
            ? this.toView(existing)
            : { ...EMPTY_GROUP, id, contacts: [] },
          error: this.errorMessage(error),
          contactForm: {
            name: dto.name ?? '',
            phone: dto.phone ?? '',
            ext: dto.ext ?? '',
            note: dto.note ?? '',
            email: dto.email ?? '',
          },
        }),
      );
    }
  }

  @Post('contacts/:contactId')
  async updateContact(
    @Param('contactId') contactId: string,
    @Body() dto: ContactFormDto,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const updated = await this.phoneBook.updateContact(contactId, dto);
      res.redirect(`/admin/phone-book/${updated.groupId}/edit`);
    } catch (error) {
      // Find the owning group so we can re-render its edit page with the error.
      const contact = await this.phoneBook
        .getContact(contactId)
        .catch(() => null);
      if (!contact) {
        res.redirect('/admin/phone-book');
        return;
      }
      const existing = await this.phoneBook
        .getGroupWithContacts(contact.groupId)
        .catch(() => null);
      res.status(400).render(
        'admin/phone-book-form',
        this.formContext({
          mode: 'edit',
          action: `/admin/phone-book/${contact.groupId}`,
          group: existing
            ? this.toView(existing)
            : { ...EMPTY_GROUP, id: contact.groupId, contacts: [] },
          error: this.errorMessage(error),
        }),
      );
    }
  }

  @Post('contacts/:contactId/delete')
  async removeContact(
    @Param('contactId') contactId: string,
    @Res() res: Response,
  ): Promise<void> {
    const groupId = await this.phoneBook.removeContact(contactId);
    res.redirect(`/admin/phone-book/${groupId}/edit`);
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  /** Map the raw group form DTO (strings + "on" checkbox) to the service input. */
  private fromGroupDto(dto: ContactGroupFormDto): ContactGroupInput {
    return {
      title: dto.title,
      icon: dto.icon,
      sortOrder: dto.sortOrder,
      isPublished: dto.isPublished === 'on',
    };
  }

  /** The form's view shape, used to re-fill the group form after an error. */
  private dtoToView(dto: ContactGroupFormDto): GroupFormView {
    return {
      title: dto.title ?? '',
      icon: dto.icon ?? CONTACT_GROUP_ICONS[0],
      sortOrder: dto.sortOrder ?? '0',
      isPublished: dto.isPublished === 'on',
    };
  }

  /** Turn a stored group (+ contacts) into the edit-form view shape. */
  private toView(group: {
    id: string;
    title: string;
    icon: string;
    sortOrder: number;
    isPublished: boolean;
    contacts: {
      id: string;
      name: string;
      phone: string;
      ext: string | null;
      note: string | null;
      email: string | null;
    }[];
  }): GroupFormView {
    return {
      id: group.id,
      title: group.title,
      icon: group.icon,
      sortOrder: String(group.sortOrder),
      isPublished: group.isPublished,
      contacts: group.contacts.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        ext: c.ext ?? '',
        note: c.note ?? '',
        email: c.email ?? '',
      })),
    };
  }

  private formContext(params: {
    mode: 'create' | 'edit';
    action: string;
    group: GroupFormView;
    error: string | null;
    contactForm?: typeof EMPTY_CONTACT_FORM;
  }) {
    return {
      title: params.mode === 'create' ? 'گروه جدید' : 'ویرایش گروه',
      nav: true,
      activeNav: 'phone-book',
      isEdit: params.mode === 'edit',
      action: params.action,
      iconOptions: CONTACT_GROUP_ICONS.map((value) => ({
        value,
        label: CONTACT_ICON_LABELS[value],
      })),
      group: params.group,
      contactForm: params.contactForm ?? EMPTY_CONTACT_FORM,
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
