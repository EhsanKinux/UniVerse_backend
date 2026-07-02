import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Course,
  CourseSession,
  ScheduleSettings,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CourseFormDto, SessionFormDto } from './dto/course-form.dto';
import {
  CourseDto,
  ScheduleSettingsDto,
  WeeklyScheduleDto,
} from './dto/schedule.dto';
import { SettingsFormDto } from './dto/settings-form.dto';
import {
  currentWeekParity,
  getTehranNow,
  hhmmToMinutes,
  minutesToHhmm,
  saturdayOfWeekMs,
} from './tehran-time.util';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Defaults served (and later persisted) before a user ever touches settings. */
const DEFAULT_SETTINGS = {
  remindersEnabled: true,
  reminderLeadMinutes: 30,
  oddWeekAnchor: null as Date | null,
};

type CourseWithSessions = Course & { sessions: CourseSession[] };

/**
 * The student's personal weekly timetable. Every method takes the caller's
 * userId (from the JWT) and touches ONLY that user's rows — ownership is part
 * of each WHERE clause, so one student can never read or edit another's data.
 */
@Injectable()
export class ScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // READ
  // ---------------------------------------------------------------------------

  /** Everything the schedule page needs, in one payload. */
  async getSchedule(userId: string): Promise<WeeklyScheduleDto> {
    const [courses, settings] = await Promise.all([
      this.prisma.course.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        include: {
          sessions: { orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] },
        },
      }),
      this.prisma.scheduleSettings.findUnique({ where: { userId } }),
    ]);

    return {
      courses: courses.map((c) => this.toCourseDto(c)),
      settings: this.toSettingsDto(settings),
      todayIndex: getTehranNow().weekday,
    };
  }

  // ---------------------------------------------------------------------------
  // COURSES (create / update / delete)
  // ---------------------------------------------------------------------------

  async createCourse(userId: string, dto: CourseFormDto): Promise<CourseDto> {
    const sessions = this.toSessionRows(dto.sessions);

    const course = await this.prisma.course.create({
      data: {
        userId,
        name: dto.name.trim(),
        professor: dto.professor?.trim() || null,
        color: dto.color,
        sessions: { create: sessions },
      },
      include: {
        sessions: { orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] },
      },
    });

    return this.toCourseDto(course);
  }

  async updateCourse(
    userId: string,
    courseId: string,
    dto: CourseFormDto,
  ): Promise<CourseDto> {
    await this.assertOwnership(userId, courseId);
    const sessions = this.toSessionRows(dto.sessions);

    // Replace-all strategy for sessions: simpler and more reliable than diffing
    // (the form always submits the complete list). The transaction guarantees we
    // never end up with a course whose old sessions are gone but new ones absent.
    const [, , course] = await this.prisma.$transaction([
      this.prisma.courseSession.deleteMany({ where: { courseId } }),
      this.prisma.course.update({
        where: { id: courseId },
        data: {
          name: dto.name.trim(),
          professor: dto.professor?.trim() || null,
          color: dto.color,
          sessions: { create: sessions },
        },
      }),
      this.prisma.course.findUniqueOrThrow({
        where: { id: courseId },
        include: {
          sessions: { orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] },
        },
      }),
    ]);

    return this.toCourseDto(course);
  }

  async deleteCourse(userId: string, courseId: string): Promise<void> {
    await this.assertOwnership(userId, courseId);
    // Sessions go with it via the onDelete: Cascade in the schema.
    await this.prisma.course.delete({ where: { id: courseId } });
  }

  // ---------------------------------------------------------------------------
  // SETTINGS
  // ---------------------------------------------------------------------------

  async updateSettings(
    userId: string,
    dto: SettingsFormDto,
  ): Promise<ScheduleSettingsDto> {
    // «این هفته فرد/زوج است» → the Saturday anchor of a known-ODD week: this
    // week's Saturday if the student said "odd", the previous week's if "even".
    let oddWeekAnchor: Date | undefined;
    if (dto.currentWeekParity) {
      const thisSaturday = saturdayOfWeekMs(getTehranNow());
      oddWeekAnchor = new Date(
        dto.currentWeekParity === 'odd' ? thisSaturday : thisSaturday - WEEK_MS,
      );
    }

    const settings = await this.prisma.scheduleSettings.upsert({
      where: { userId },
      create: {
        userId,
        remindersEnabled:
          dto.remindersEnabled ?? DEFAULT_SETTINGS.remindersEnabled,
        reminderLeadMinutes:
          dto.reminderLeadMinutes ?? DEFAULT_SETTINGS.reminderLeadMinutes,
        oddWeekAnchor: oddWeekAnchor ?? null,
      },
      update: {
        // `undefined` means "leave unchanged" to Prisma — exactly PATCH semantics.
        remindersEnabled: dto.remindersEnabled,
        reminderLeadMinutes: dto.reminderLeadMinutes,
        oddWeekAnchor,
      },
    });

    return this.toSettingsDto(settings);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** 404 unless the course exists AND belongs to this user (no existence leak). */
  private async assertOwnership(
    userId: string,
    courseId: string,
  ): Promise<void> {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, userId },
      select: { id: true },
    });
    if (!course) {
      throw new NotFoundException('Course not found.');
    }
  }

  /** Validate cross-field rules and convert "HH:mm" strings to minute ints. */
  private toSessionRows(sessions: SessionFormDto[]) {
    return sessions.map((s, index) => {
      const startMinute = hhmmToMinutes(s.start);
      const endMinute = hhmmToMinutes(s.end);
      if (endMinute <= startMinute) {
        throw new BadRequestException(
          `Session ${index + 1}: end time must be after start time.`,
        );
      }
      return {
        dayOfWeek: s.dayOfWeek,
        startMinute,
        endMinute,
        room: s.room?.trim() || null,
        type: s.type,
        parity: s.parity,
      };
    });
  }

  private toCourseDto(course: CourseWithSessions): CourseDto {
    return {
      id: course.id,
      name: course.name,
      professor: course.professor,
      color: course.color,
      sessions: course.sessions.map((s) => ({
        id: s.id,
        dayOfWeek: s.dayOfWeek,
        start: minutesToHhmm(s.startMinute),
        end: minutesToHhmm(s.endMinute),
        room: s.room,
        type: s.type,
        parity: s.parity,
      })),
    };
  }

  private toSettingsDto(
    settings: ScheduleSettings | null,
  ): ScheduleSettingsDto {
    const anchor = settings?.oddWeekAnchor ?? DEFAULT_SETTINGS.oddWeekAnchor;
    return {
      remindersEnabled:
        settings?.remindersEnabled ?? DEFAULT_SETTINGS.remindersEnabled,
      reminderLeadMinutes:
        settings?.reminderLeadMinutes ?? DEFAULT_SETTINGS.reminderLeadMinutes,
      currentWeekParity: currentWeekParity(anchor, getTehranNow()),
    };
  }
}
