import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import {
  currentWeekParity,
  getTehranNow,
  minutesToHhmmFa,
  TehranNow,
} from './tehran-time.util';

/**
 * If the exact reminder minute is missed (a cron tick can be delayed, or the
 * server can restart), the reminder still goes out for up to this many minutes
 * afterwards instead of being silently dropped.
 */
const CATCH_UP_WINDOW_MINUTES = 5;

/**
 * The background job behind "notify me before class starts". Once a minute it
 * looks at today's sessions (in Tehran time), figures out whose reminder moment
 * has arrived — respecting each student's lead time, master switch, and week
 * parity — and sends a Web Push to that student's devices.
 */
@Injectable()
export class ScheduleRemindersService {
  private readonly logger = new Logger(ScheduleRemindersService.name);

  // Sessions already reminded TODAY, so the catch-up window can't double-send.
  // Key: `${sessionId}:${dateMs}`. In-memory on purpose: worst case after a
  // restart is one repeated reminder — not worth a database table.
  private sentToday = new Set<string>();
  private sentTodayDateMs = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async remindUpcomingClasses(): Promise<void> {
    // Without VAPID keys nothing can be delivered — skip the queries entirely.
    if (!this.push.isEnabled) return;

    const now = getTehranNow();
    this.resetDedupeOnNewDay(now);

    // Today's sessions whose owner has at least one push-linked device. The
    // volume here is tiny (each row is one student's one class today), so we
    // fetch once and do the per-user filtering in code where it's readable.
    const sessions = await this.prisma.courseSession.findMany({
      where: {
        dayOfWeek: now.weekday,
        course: { user: { pushSubscriptions: { some: {} } } },
      },
      include: {
        course: {
          select: {
            name: true,
            userId: true,
            user: { select: { scheduleSettings: true } },
          },
        },
      },
    });

    for (const session of sessions) {
      const settings = session.course.user.scheduleSettings;

      // No settings row yet = the defaults (reminders on, 30 minutes) — same
      // defaults ScheduleService serves, so what the student sees is what runs.
      if (settings && !settings.remindersEnabled) continue;
      const lead = settings?.reminderLeadMinutes ?? 30;

      // Skip زوج sessions on a فرد week (and vice versa). If the student never
      // declared the parity (null), we can't tell the weeks apart — remind for
      // everything rather than silently missing half their classes.
      if (session.parity !== 'all') {
        const parityNow = currentWeekParity(
          settings?.oddWeekAnchor ?? null,
          now,
        );
        if (parityNow !== null && session.parity !== parityNow) continue;
      }

      const remindAt = session.startMinute - lead;
      const minutesSinceDue = now.minutes - remindAt;
      if (minutesSinceDue < 0 || minutesSinceDue >= CATCH_UP_WINDOW_MINUTES) {
        continue;
      }

      const dedupeKey = `${session.id}:${now.dateMs}`;
      if (this.sentToday.has(dedupeKey)) continue;
      this.sentToday.add(dedupeKey);

      const minutesLeft = session.startMinute - now.minutes;
      await this.push.sendToUser(session.course.userId, {
        title: `یادآوری کلاس: ${session.course.name}`,
        body: this.composeBody(minutesLeft, session.startMinute, session.room),
        url: '/weekly-schedule',
        // One tag per session per day: a re-send replaces the notification
        // instead of stacking a duplicate on the student's phone.
        tag: `class-reminder:${session.id}`,
      });
      this.logger.log(
        `Reminded user ${session.course.userId} of "${session.course.name}" (${minutesLeft} min before start).`,
      );
    }
  }

  /** e.g. «۳۰ دقیقه دیگر شروع می‌شود (ساعت ۱۰:۰۰ — کلاس ۲۰۴)». */
  private composeBody(
    minutesLeft: number,
    startMinute: number,
    room: string | null,
  ): string {
    const time = minutesToHhmmFa(startMinute);
    const where = room ? ` — ${room}` : '';
    if (minutesLeft <= 0) {
      return `همین حالا شروع می‌شود (ساعت ${time}${where})`;
    }
    const count = minutesLeft.toLocaleString('fa-IR');
    return `${count} دقیقه دیگر شروع می‌شود (ساعت ${time}${where})`;
  }

  private resetDedupeOnNewDay(now: TehranNow): void {
    if (now.dateMs !== this.sentTodayDateMs) {
      this.sentToday.clear();
      this.sentTodayDateMs = now.dateMs;
    }
  }
}
