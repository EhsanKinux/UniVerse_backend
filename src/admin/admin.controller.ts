import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { CalendarService } from '../calendar/calendar.service';
import {
  EVENT_CATEGORIES,
  EVENT_CATEGORY_LABELS,
} from '../calendar/dto/active-calendar.dto';
import { toJalaliInputValue } from '../calendar/jalali.util';
import { AdminAuthFilter } from './admin-auth.filter';
import { AdminGuard } from './admin.guard';
import { AdminLoginDto } from './dto/login.dto';
import { EventFormDto } from './dto/event-form.dto';
import { SemesterFormDto } from './dto/semester-form.dto';

/** Persian labels for the status badge shown in the dashboard table. */
const STATUS_LABELS: Record<string, string> = {
  past: 'برگزار شد',
  current: 'در حال برگزاری',
  upcoming: 'پیش‌رو',
};

/** The blank event used to render an empty "create" form. */
const EMPTY_EVENT = {
  title: '',
  category: 'academic',
  cohort: '',
  startDate: '',
  endDate: '',
  description: '',
};

/**
 * The staff-facing admin panel, served by NestJS as server-rendered Handlebars
 * pages under /admin and gated by a shared login (no per-user roles). It's
 * excluded from the Swagger/JSON docs because it returns HTML, not an API.
 */
@ApiExcludeController()
@Controller('admin')
@UseFilters(AdminAuthFilter)
export class AdminController {
  constructor(
    private readonly calendar: CalendarService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // AUTH
  // ---------------------------------------------------------------------------

  @Get('login')
  loginPage(@Req() req: Request, @Res() res: Response): void {
    if (req.session?.isAdmin) {
      res.redirect('/admin');
      return;
    }
    res.render('admin/login', { title: 'ورود', error: null });
  }

  @Post('login')
  // The admin login guards EVERYTHING staff can do, so it gets the strictest
  // rate limit in the app: 5 attempts per minute per IP.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(
    @Body() dto: AdminLoginDto,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    const usernameOk = this.safeEquals(
      dto.username ?? '',
      this.config.getOrThrow<string>('ADMIN_USERNAME'),
    );
    const passwordOk = this.safeEquals(
      dto.password ?? '',
      this.config.getOrThrow<string>('ADMIN_PASSWORD'),
    );

    if (!usernameOk || !passwordOk) {
      res.status(401).render('admin/login', {
        title: 'ورود',
        error: 'نام کاربری یا رمز عبور نادرست است.',
      });
      return;
    }

    // Issue a FRESH session id on login (session fixation defence): any cookie
    // the browser held before authenticating can never become an admin session.
    req.session.regenerate((err) => {
      if (err) {
        res.status(500).render('admin/login', {
          title: 'ورود',
          error: 'خطایی رخ داد. دوباره تلاش کنید.',
        });
        return;
      }
      req.session.isAdmin = true;
      res.redirect('/admin');
    });
  }

  @Post('logout')
  logout(@Req() req: Request, @Res() res: Response): void {
    req.session.destroy(() => res.redirect('/admin/login'));
  }

  // ---------------------------------------------------------------------------
  // DASHBOARD
  // ---------------------------------------------------------------------------

  @Get()
  @UseGuards(AdminGuard)
  async dashboard(
    @Query('semester') semesterId: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const semesters = await this.calendar.listSemesters();

    if (semesters.length === 0) {
      res.render('admin/dashboard', {
        title: 'داشبورد',
        nav: true,
        activeNav: 'calendar',
        hasSemesters: false,
        semesters: [],
      });
      return;
    }

    const selectedId =
      semesterId && semesters.some((s) => s.id === semesterId)
        ? semesterId
        : (semesters.find((s) => s.isActive)?.id ?? semesters[0].id);

    const calendar = await this.calendar.getSemesterCalendar(selectedId);

    res.render('admin/dashboard', {
      title: 'داشبورد',
      nav: true,
      activeNav: 'calendar',
      hasSemesters: true,
      semesters: semesters.map((s) => ({
        id: s.id,
        title: s.title,
        isActive: s.isActive,
        count: s._count.events,
        selected: s.id === selectedId,
      })),
      selected: calendar.semester,
      selectedId,
      events: calendar.events,
      categoryLabels: EVENT_CATEGORY_LABELS,
      statusLabels: STATUS_LABELS,
    });
  }

  // ---------------------------------------------------------------------------
  // SEMESTERS
  // ---------------------------------------------------------------------------

  @Post('semesters')
  @UseGuards(AdminGuard)
  async createSemester(
    @Body() dto: SemesterFormDto,
    @Res() res: Response,
  ): Promise<void> {
    const semester = await this.calendar.createSemester(dto);
    res.redirect(`/admin?semester=${semester.id}`);
  }

  @Post('semesters/:id/activate')
  @UseGuards(AdminGuard)
  async activateSemester(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.calendar.activateSemester(id);
    res.redirect(`/admin?semester=${id}`);
  }

  @Post('semesters/:id/delete')
  @UseGuards(AdminGuard)
  async deleteSemester(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.calendar.deleteSemester(id);
    res.redirect('/admin');
  }

  // ---------------------------------------------------------------------------
  // EVENTS
  // ---------------------------------------------------------------------------

  @Get('semesters/:semesterId/events/new')
  @UseGuards(AdminGuard)
  async newEvent(
    @Param('semesterId') semesterId: string,
    @Res() res: Response,
  ): Promise<void> {
    const calendar = await this.calendar.getSemesterCalendar(semesterId);
    res.render(
      'admin/event-form',
      this.eventFormContext({
        mode: 'create',
        action: `/admin/semesters/${semesterId}/events`,
        backTo: semesterId,
        semesterTitle: calendar.semester.title,
        event: EMPTY_EVENT,
        error: null,
      }),
    );
  }

  @Post('semesters/:semesterId/events')
  @UseGuards(AdminGuard)
  async createEvent(
    @Param('semesterId') semesterId: string,
    @Body() dto: EventFormDto,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.calendar.createEvent(semesterId, dto);
      res.redirect(`/admin?semester=${semesterId}`);
    } catch (error) {
      res.status(400).render(
        'admin/event-form',
        this.eventFormContext({
          mode: 'create',
          action: `/admin/semesters/${semesterId}/events`,
          backTo: semesterId,
          semesterTitle: '',
          event: { ...EMPTY_EVENT, ...dto },
          error: this.errorMessage(error),
        }),
      );
    }
  }

  @Get('events/:id/edit')
  @UseGuards(AdminGuard)
  async editEvent(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const event = await this.calendar.getEvent(id);
    res.render(
      'admin/event-form',
      this.eventFormContext({
        mode: 'edit',
        action: `/admin/events/${id}`,
        backTo: event.semesterId,
        semesterTitle: '',
        event: {
          title: event.title,
          category: event.category,
          cohort: event.cohort ?? '',
          startDate: toJalaliInputValue(event.startDate),
          endDate: event.endDate ? toJalaliInputValue(event.endDate) : '',
          description: event.description ?? '',
        },
        error: null,
      }),
    );
  }

  @Post('events/:id')
  @UseGuards(AdminGuard)
  async updateEvent(
    @Param('id') id: string,
    @Body() dto: EventFormDto,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const updated = await this.calendar.updateEvent(id, dto);
      res.redirect(`/admin?semester=${updated.semesterId}`);
    } catch (error) {
      res.status(400).render(
        'admin/event-form',
        this.eventFormContext({
          mode: 'edit',
          action: `/admin/events/${id}`,
          backTo: '',
          semesterTitle: '',
          event: { ...EMPTY_EVENT, ...dto },
          error: this.errorMessage(error),
        }),
      );
    }
  }

  @Post('events/:id/delete')
  @UseGuards(AdminGuard)
  async deleteEvent(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const event = await this.calendar.getEvent(id);
    await this.calendar.deleteEvent(id);
    res.redirect(`/admin?semester=${event.semesterId}`);
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  private categoryOptions() {
    return EVENT_CATEGORIES.map((value) => ({
      value,
      label: EVENT_CATEGORY_LABELS[value],
    }));
  }

  private eventFormContext(params: {
    mode: 'create' | 'edit';
    action: string;
    backTo: string;
    semesterTitle: string;
    event: typeof EMPTY_EVENT;
    error: string | null;
  }) {
    return {
      title: params.mode === 'create' ? 'رویداد جدید' : 'ویرایش رویداد',
      nav: true,
      activeNav: 'calendar',
      datepicker: true,
      isEdit: params.mode === 'edit',
      action: params.action,
      backTo: params.backTo,
      semesterTitle: params.semesterTitle,
      categoryOptions: this.categoryOptions(),
      event: params.event,
      error: params.error,
    };
  }

  /**
   * Compare a submitted credential against the configured one in CONSTANT time.
   * A plain `===` short-circuits at the first differing character, so response
   * times leak how much of a guess was correct. Hashing both sides first gives
   * two equal-length buffers (timingSafeEqual requires that), and the
   * comparison then always takes the same time regardless of the input.
   */
  private safeEquals(submitted: string, expected: string): boolean {
    const a = createHash('sha256').update(submitted).digest();
    const b = createHash('sha256').update(expected).digest();
    return timingSafeEqual(a, b);
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
