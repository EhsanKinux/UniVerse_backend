import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Contact, ContactGroup, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_CONTACT_ICON, isKnownContactIcon } from './dto/contact-icons';
import { PhoneBookGroupDto, PublicContactDto } from './dto/phone-book.dto';

/** The plain text form fields for creating/updating a contact group. */
export interface ContactGroupInput {
  title?: string;
  icon?: string;
  sortOrder?: string | number | null;
  isPublished?: boolean;
}

/** The plain text form fields for creating/updating a single contact. */
export interface ContactInput {
  name?: string;
  phone?: string;
  ext?: string | null;
  note?: string | null;
  email?: string | null;
}

// A group row with its contacts loaded (for both the tree DTO and admin edit).
type GroupWithContacts = ContactGroup & { contacts: Contact[] };

// Contacts always render in the order staff arranged them (then oldest-first).
const CONTACT_ORDER: Prisma.ContactOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { createdAt: 'asc' },
];

// Groups render by their manual order, ties broken by title.
const GROUP_ORDER: Prisma.ContactGroupOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { title: 'asc' },
];

@Injectable()
export class PhoneBookService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // READ (public API)
  // ---------------------------------------------------------------------------

  /**
   * The whole published directory in one call — every published group that has at
   * least one number, with its contacts. Empty or hidden groups are omitted so
   * students never see a dead card. Always succeeds (an empty array when nothing
   * is published yet), so the PWA shows an empty state rather than handling a 404.
   */
  async getPublishedTree(): Promise<PhoneBookGroupDto[]> {
    const groups = await this.prisma.contactGroup.findMany({
      where: { isPublished: true, contacts: { some: {} } },
      orderBy: GROUP_ORDER,
      include: { contacts: { orderBy: CONTACT_ORDER } },
    });
    return groups.map((group) => this.toGroupDto(group));
  }

  // ---------------------------------------------------------------------------
  // READ (admin display)
  // ---------------------------------------------------------------------------

  /** Every group (published or not) with its contacts — for the admin list. */
  listAllGroups(): Promise<GroupWithContacts[]> {
    return this.prisma.contactGroup.findMany({
      orderBy: GROUP_ORDER,
      include: { contacts: { orderBy: CONTACT_ORDER } },
    });
  }

  /** The raw group row — 404 if it's gone. */
  async getGroup(id: string): Promise<ContactGroup> {
    const group = await this.prisma.contactGroup.findUnique({ where: { id } });
    if (!group) {
      throw new NotFoundException('Contact group not found.');
    }
    return group;
  }

  /** The group plus its contacts — for the admin edit form. */
  async getGroupWithContacts(id: string): Promise<GroupWithContacts> {
    const group = await this.prisma.contactGroup.findUnique({
      where: { id },
      include: { contacts: { orderBy: CONTACT_ORDER } },
    });
    if (!group) {
      throw new NotFoundException('Contact group not found.');
    }
    return group;
  }

  // ---------------------------------------------------------------------------
  // WRITE — groups (admin)
  // ---------------------------------------------------------------------------

  createGroup(input: ContactGroupInput): Promise<ContactGroup> {
    return this.prisma.contactGroup.create({
      data: this.toGroupData(input),
    });
  }

  async updateGroup(
    id: string,
    input: ContactGroupInput,
  ): Promise<ContactGroup> {
    await this.getGroup(id); // 404 if it's gone
    return this.prisma.contactGroup.update({
      where: { id },
      data: this.toGroupData(input),
    });
  }

  async removeGroup(id: string): Promise<void> {
    await this.getGroup(id);
    // Cascade (declared on Contact) removes the group's contacts too.
    await this.prisma.contactGroup.delete({ where: { id } });
  }

  /** Flip a group's published flag (quick toggle from the admin list). */
  async toggleGroup(id: string): Promise<void> {
    const group = await this.getGroup(id);
    await this.prisma.contactGroup.update({
      where: { id },
      data: { isPublished: !group.isPublished },
    });
  }

  // ---------------------------------------------------------------------------
  // WRITE — contacts (admin)
  // ---------------------------------------------------------------------------

  /** Add one number to a group, appended after its existing contacts. */
  async addContact(groupId: string, input: ContactInput): Promise<Contact> {
    await this.getGroup(groupId); // 404 if the group is gone
    const nextSortOrder = await this.prisma.contact.count({
      where: { groupId },
    });
    return this.prisma.contact.create({
      data: {
        groupId,
        ...this.toContactData(input),
        sortOrder: nextSortOrder,
      },
    });
  }

  /** Edit one number in place (fix a typo / extension without re-adding it). */
  async updateContact(contactId: string, input: ContactInput): Promise<Contact> {
    await this.getContact(contactId); // 404 if it's gone
    return this.prisma.contact.update({
      where: { id: contactId },
      data: this.toContactData(input),
    });
  }

  /** Remove one number; returns its groupId so the controller can redirect back. */
  async removeContact(contactId: string): Promise<string> {
    const contact = await this.getContact(contactId);
    await this.prisma.contact.delete({ where: { id: contactId } });
    return contact.groupId;
  }

  /** The raw contact row — 404 if it's gone. */
  async getContact(id: string): Promise<Contact> {
    const contact = await this.prisma.contact.findUnique({ where: { id } });
    if (!contact) {
      throw new NotFoundException('Contact not found.');
    }
    return contact;
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  private toGroupDto(group: GroupWithContacts): PhoneBookGroupDto {
    return {
      id: group.id,
      title: group.title,
      icon: group.icon,
      contacts: group.contacts.map((c) => this.toContactDto(c)),
    };
  }

  private toContactDto(contact: Contact): PublicContactDto {
    return {
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      ext: contact.ext,
      note: contact.note,
      email: contact.email,
    };
  }

  /** Validate + normalise the group form input into a Prisma data object. */
  private toGroupData(input: ContactGroupInput) {
    return {
      title: this.requireText(input.title, 'عنوان گروه را وارد کنید.'),
      icon: this.validateIcon(input.icon),
      sortOrder: this.parseSortOrder(input.sortOrder),
      isPublished: input.isPublished ?? true,
    };
  }

  /** Validate + normalise the contact form input into a Prisma data object. */
  private toContactData(input: ContactInput) {
    return {
      name: this.requireText(input.name, 'نام مخاطب را وارد کنید.'),
      phone: this.requirePhone(input.phone),
      ext: this.cleanOptional(input.ext),
      note: this.cleanOptional(input.note),
      email: this.cleanEmail(input.email),
    };
  }

  private validateIcon(icon?: string): string {
    const text = icon?.trim();
    if (!text) {
      return DEFAULT_CONTACT_ICON;
    }
    if (!isKnownContactIcon(text)) {
      throw new BadRequestException('آیکون انتخاب‌شده معتبر نیست.');
    }
    return text;
  }

  /**
   * The phone is required and kept as typed, but we strip spaces so the `tel:`
   * link the PWA builds is always dial-safe. Everything else (digits, +, -, #, *,
   * Persian digits) is left untouched.
   */
  private requirePhone(value?: string | null): string {
    const text = value?.trim().replace(/\s+/g, '');
    if (!text) {
      throw new BadRequestException('شماره تماس را وارد کنید.');
    }
    return text;
  }

  /** Optional email: blank → null; otherwise a light sanity check for an «@». */
  private cleanEmail(value?: string | null): string | null {
    const text = value?.trim();
    if (!text) {
      return null;
    }
    if (!text.includes('@') || /\s/.test(text)) {
      throw new BadRequestException('ایمیل وارد‌شده معتبر نیست.');
    }
    return text;
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

  /** Turn empty/blank strings into null for optional columns. */
  private cleanOptional(value?: string | null): string | null {
    const text = value?.trim();
    return text ? text : null;
  }
}
