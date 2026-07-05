import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Profile } from '../generated/prisma/client';
import { DEGREE_LABELS, GENDER_LABELS } from '../profile/profile.constants';
import { computeCompletion } from '../profile/profile-scoring';
import { UsersService } from '../users/users.service';
import { AdminAuthFilter } from './admin-auth.filter';
import { AdminGuard } from './admin.guard';

const PAGE_SIZE = 20;

/** Format a date as a Persian (Jalali) medium date, e.g. «۱۴ تیر ۱۴۰۵». */
function jalaliDate(date: Date): string {
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(date);
}

/** A labelled value row for the detail page ("—" when empty). */
function row(label: string, value: string | number | null | undefined) {
  const str =
    value === null || value === undefined || value === '' ? '' : String(value);
  return { label, value: str || '—', empty: !str };
}

/**
 * The staff-facing "signed-up users" section, server-rendered under /admin/users
 * and gated by the same shared admin login as the rest of the panel. Read-only:
 * a searchable, paginated list plus a per-user detail page. It reuses
 * UsersService and the shared completion scorer, so nothing about the profile
 * rules is duplicated here.
 */
@ApiExcludeController()
@Controller('admin/users')
@UseFilters(AdminAuthFilter)
@UseGuards(AdminGuard)
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list(
    @Query('q') q: string | undefined,
    @Query('page') pageParam: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const search = q?.trim() || undefined;
    const page = Math.max(1, Number(pageParam) || 1);

    const { users, total } = await this.users.listWithProfiles({
      search,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const qs = search ? `q=${encodeURIComponent(search)}&` : '';

    res.render('admin/users', {
      title: 'کاربران',
      nav: true,
      activeNav: 'users',
      search: search ?? '',
      total,
      hasUsers: users.length > 0,
      users: users.map((u) => {
        const completion = computeCompletion(u.name, u.profile);
        return {
          id: u.id,
          email: u.email,
          name: u.name || '—',
          studentId: u.profile?.studentId || '—',
          percent: completion.percent,
          score: completion.score,
          maxScore: completion.maxScore,
          joined: jalaliDate(u.createdAt),
          avatarUrl: this.avatarUrl(u.id, u.profile),
        };
      }),
      // Pagination
      page,
      totalPages,
      showPagination: totalPages > 1,
      hasPrev: page > 1,
      hasNext: page < totalPages,
      prevUrl: `/admin/users?${qs}page=${page - 1}`,
      nextUrl: `/admin/users?${qs}page=${page + 1}`,
    });
  }

  @Get(':id')
  async detail(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const user = await this.users.findByIdWithProfile(id);
    if (!user) {
      res.status(404).render('admin/user-detail', {
        title: 'کاربر',
        nav: true,
        activeNav: 'users',
        notFound: true,
      });
      return;
    }

    const p = user.profile;
    const completion = computeCompletion(user.name, p);

    res.render('admin/user-detail', {
      title: user.name || user.email,
      nav: true,
      activeNav: 'users',
      notFound: false,
      user: {
        id: user.id,
        email: user.email,
        name: user.name || '—',
        joined: jalaliDate(user.createdAt),
        avatarUrl: this.avatarUrl(user.id, p),
      },
      completion,
      // Grouped, ready-to-render field rows.
      personal: [
        row('نام و نام خانوادگی', user.name),
        row('شماره تماس', p?.phone),
        row('کد ملی', p?.nationalId),
        row('تاریخ تولد', p?.birthDate),
        row('جنسیت', p?.gender ? GENDER_LABELS[p.gender] : null),
        row('استان', p?.province),
        row('شهر', p?.city),
      ],
      academic: [
        row('شماره دانشجویی', p?.studentId),
        row('رشته تحصیلی', p?.major),
        row('دانشکده', p?.faculty),
        row('مقطع', p?.degree ? DEGREE_LABELS[p.degree] : null),
        row('سال ورود', p?.entryYear),
        row('استاد راهنما', p?.advisor),
      ],
      extra: [
        row('درباره', p?.bio),
        row('مخاطب اضطراری', p?.emergencyName),
        row('شماره اضطراری', p?.emergencyPhone),
        row('پیام‌رسان', p?.telegram),
      ],
    });
  }

  @Post(':id/delete')
  async remove(@Param('id') id: string, @Res() res: Response): Promise<void> {
    // Tolerate a stale delete (user already gone) — just return to the list.
    const existing = await this.users.findById(id);
    if (existing) {
      await this.users.purgeAndDelete(id);
    }
    res.redirect('/admin/users');
  }

  /** Cache-busted avatar URL (same scheme as the profile API), or null. */
  private avatarUrl(userId: string, profile: Profile | null): string | null {
    return profile?.avatarStoredName
      ? `/profile/${userId}/avatar?v=${profile.updatedAt.getTime()}`
      : null;
  }
}
