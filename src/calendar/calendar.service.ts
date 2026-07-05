import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CalendarEvent } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ActiveCalendarDto,
  EVENT_CATEGORIES,
  EventCategory,
  EventStatus,
  PublicCalendarEventDto,
} from './dto/active-calendar.dto';
import {
  CALENDAR_TIME_ZONE,
  formatJalaliMonth,
  formatJalaliRange,
  formatPersianWeekday,
  parseJalaliToDate,
} from './jalali.util';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Plain shape the admin panel hands us for an event. Dates arrive as Jalali
 * strings (e.g. "1404/11/26"); we parse + validate them here so the controller
 * stays thin.
 */
export interface EventInput {
  title?: string;
  category?: string;
  cohort?: string | null;
  startDate?: string; // Jalali
  endDate?: string | null; // Jalali (for ranges)
  description?: string | null;
}

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // READ (public API + admin display)
  // ---------------------------------------------------------------------------

  /**
   * The PWA's single read endpoint: the active semester plus its events, each
   * pre-formatted (Jalali label, weekday, status, countdown) so the front end
   * needs no date logic of its own.
   */
  async getActiveCalendar(): Promise<ActiveCalendarDto> {
    const semester = await this.prisma.semester.findFirst({
      where: { isActive: true },
      include: {
        events: { orderBy: [{ startDate: 'asc' }, { sortOrder: 'asc' }] },
      },
    });

    if (!semester) {
      throw new NotFoundException('No active semester has been published yet.');
    }

    return {
      semester: this.toSemesterHeader(semester),
      events: this.mapEvents(semester.events),
    };
  }

  /** Same shape as the public calendar, but for ANY semester (admin preview). */
  async getSemesterCalendar(semesterId: string): Promise<ActiveCalendarDto> {
    const semester = await this.prisma.semester.findUnique({
      where: { id: semesterId },
      include: {
        events: { orderBy: [{ startDate: 'asc' }, { sortOrder: 'asc' }] },
      },
    });
    if (!semester) {
      throw new NotFoundException('Semester not found.');
    }
    return {
      semester: this.toSemesterHeader(semester),
      events: this.mapEvents(semester.events),
    };
  }

  // ---------------------------------------------------------------------------
  // SEMESTER MANAGEMENT (admin)
  // ---------------------------------------------------------------------------

  /** All semesters, newest first, each with its event count (for the dashboard). */
  listSemesters() {
    return this.prisma.semester.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { events: true } } },
    });
  }

  createSemester(input: { title?: string; subtitle?: string | null }) {
    return this.prisma.semester.create({
      data: {
        title: this.requireText(input.title, 'عنوان نیمسال را وارد کنید.'),
        subtitle: this.cleanOptional(input.subtitle),
      },
    });
  }

  /** Make one semester active and, in the same transaction, deactivate the rest
   *  — that's how we keep the "only one active at a time" rule. */
  async activateSemester(id: string): Promise<void> {
    await this.ensureSemesterExists(id);
    await this.prisma.$transaction([
      this.prisma.semester.updateMany({ data: { isActive: false } }),
      this.prisma.semester.update({ where: { id }, data: { isActive: true } }),
    ]);
  }

  async deleteSemester(id: string): Promise<void> {
    await this.ensureSemesterExists(id);
    // Cascade (declared on CalendarEvent) removes the semester's events too.
    await this.prisma.semester.delete({ where: { id } });
  }

  // ---------------------------------------------------------------------------
  // EVENT MANAGEMENT (admin)
  // ---------------------------------------------------------------------------

  /** The raw event row, used to pre-fill the edit form. */
  async getEvent(id: string): Promise<CalendarEvent> {
    const event = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!event) {
      throw new NotFoundException('Event not found.');
    }
    return event;
  }

  async createEvent(
    semesterId: string,
    input: EventInput,
  ): Promise<CalendarEvent> {
    await this.ensureSemesterExists(semesterId);
    const { startDate, endDate } = this.parseDates(
      input.startDate,
      input.endDate,
    );
    return this.prisma.calendarEvent.create({
      data: {
        semesterId,
        title: this.requireText(input.title, 'عنوان رویداد را وارد کنید.'),
        category: this.validateCategory(input.category),
        cohort: this.cleanOptional(input.cohort),
        description: this.cleanOptional(input.description),
        startDate,
        endDate,
      },
    });
  }

  async updateEvent(id: string, input: EventInput): Promise<CalendarEvent> {
    await this.getEvent(id); // 404 if it's gone
    const { startDate, endDate } = this.parseDates(
      input.startDate,
      input.endDate,
    );
    return this.prisma.calendarEvent.update({
      where: { id },
      data: {
        title: this.requireText(input.title, 'عنوان رویداد را وارد کنید.'),
        category: this.validateCategory(input.category),
        cohort: this.cleanOptional(input.cohort),
        description: this.cleanOptional(input.description),
        startDate,
        endDate,
      },
    });
  }

  async deleteEvent(id: string): Promise<void> {
    await this.getEvent(id);
    await this.prisma.calendarEvent.delete({ where: { id } });
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  private toSemesterHeader(semester: {
    id: string;
    title: string;
    subtitle: string | null;
  }) {
    return {
      id: semester.id,
      title: semester.title,
      subtitle: semester.subtitle,
    };
  }

  /** Map stored rows to their display-ready shape (computes "today" once). */
  private mapEvents(events: CalendarEvent[]): PublicCalendarEventDto[] {
    const today = this.startOfToday();
    return events.map((event) => this.toPublicEvent(event, today));
  }

  private toPublicEvent(
    event: CalendarEvent,
    today: Date,
  ): PublicCalendarEventDto {
    const start = event.startDate;
    const end = event.endDate ?? null;
    const status = this.computeStatus(start, end, today);

    return {
      id: event.id,
      title: event.title,
      category: event.category,
      cohort: event.cohort,
      description: event.description,
      startDate: this.toIsoDate(start),
      endDate: end ? this.toIsoDate(end) : null,
      dateLabel: formatJalaliRange(start, end),
      weekday: formatPersianWeekday(start),
      monthLabel: formatJalaliMonth(start),
      status,
      daysUntil: this.computeDaysUntil(start, status, today),
    };
  }

  /**
   * Where an event sits relative to "today":
   *   • upcoming — hasn't started yet
   *   • current  — today is within [start, end] (end defaults to start)
   *   • past     — the end day is already behind us
   */
  private computeStatus(
    start: Date,
    end: Date | null,
    today: Date,
  ): EventStatus {
    const last = end ?? start;
    if (today.getTime() < start.getTime()) return 'upcoming';
    if (today.getTime() > last.getTime()) return 'past';
    return 'current';
  }

  /** Days until the start: positive if upcoming, 0 if current, null if past. */
  private computeDaysUntil(
    start: Date,
    status: EventStatus,
    today: Date,
  ): number | null {
    if (status === 'past') return null;
    if (status === 'current') return 0;
    return Math.round((start.getTime() - today.getTime()) / MS_PER_DAY);
  }

  /** Today (in the university's timezone) as a UTC-midnight Date, so it compares
   *  cleanly against the stored `@db.Date` values. */
  private startOfToday(): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: CALENDAR_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const [y, m, d] = parts.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  private toIsoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  /** Parse the Jalali start (required) and optional end, validating the order. */
  private parseDates(
    startJalali?: string | null,
    endJalali?: string | null,
  ): { startDate: Date; endDate: Date | null } {
    const startText = startJalali?.trim();
    if (!startText) {
      throw new BadRequestException('تاریخ شروع را انتخاب کنید.');
    }
    let startDate: Date;
    try {
      startDate = parseJalaliToDate(startText);
    } catch {
      throw new BadRequestException('تاریخ شروع معتبر نیست.');
    }

    const endText = endJalali?.trim();
    if (!endText) {
      return { startDate, endDate: null };
    }
    let endDate: Date;
    try {
      endDate = parseJalaliToDate(endText);
    } catch {
      throw new BadRequestException('تاریخ پایان معتبر نیست.');
    }
    if (endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException(
        'تاریخ پایان نباید پیش از تاریخ شروع باشد.',
      );
    }
    return { startDate, endDate };
  }

  private validateCategory(category?: string): string {
    if (!category || !EVENT_CATEGORIES.includes(category as EventCategory)) {
      throw new BadRequestException('دستهٔ انتخاب‌شده معتبر نیست.');
    }
    return category;
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

  private async ensureSemesterExists(id: string): Promise<void> {
    const found = await this.prisma.semester.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException('Semester not found.');
    }
  }
}
