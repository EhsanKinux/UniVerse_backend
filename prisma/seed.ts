import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { parseJalaliToDate } from '../src/calendar/jalali.util';

/**
 * Seeds the academic calendar with the second semester of 1404-1405, taken from
 * the official university notice. Running this is SAFE to repeat: it first
 * deletes any previous copy of this semester, then recreates it as the active
 * one. Staff normally do this from the /admin panel — this script just gives us
 * realistic starting data.
 *
 *   Run with:  npm run db:seed
 */

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const SEMESTER_TITLE = 'نیمسال دوم ۱۴۰۴-۱۴۰۵';

interface SeedEvent {
  title: string;
  category: string; // registration | addDrop | exams | academic | holiday
  cohort?: string; // entry-year audience; omit = everyone
  start: string; // Jalali "YYYY/MM/DD"
  end?: string; // Jalali end for multi-day ranges
}

// The engineering departments shown on the چارت آموزشی page. Seeding gives staff a
// ready structure to upload PDFs into — the actual chart files are added from the
// /admin panel (there are no bundled PDFs to seed). Upserting by slug makes this
// safe to re-run and never touches files staff have already uploaded.
interface SeedDepartment {
  slug: string;
  title: string;
  icon: string;
  color: string; // must be one of CHART_DEPARTMENT_COLORS
}

const CHART_DEPARTMENTS: SeedDepartment[] = [
  { slug: 'computer', title: 'مهندسی کامپیوتر', icon: '💻', color: 'computer' },
  { slug: 'material', title: 'مهندسی مواد', icon: '🔬', color: 'material' },
  { slug: 'mechanical', title: 'مهندسی مکانیک', icon: '⚙️', color: 'mechanical' },
  { slug: 'mining', title: 'مهندسی معدن', icon: '⛏️', color: 'mining' },
  { slug: 'chemical', title: 'مهندسی شیمی', icon: '🧪', color: 'chemical' },
  { slug: 'biomedical', title: 'مهندسی پزشکی', icon: '🏥', color: 'biomedical' },
  { slug: 'electrical', title: 'مهندسی برق', icon: '⚡', color: 'electrical' },
];

// Rows transcribed from the notice, top to bottom.
const EVENTS: SeedEvent[] = [
  { title: 'انتخاب واحد', cohort: 'ورودی ۴۰۲ و ماقبل', category: 'registration', start: '1404/11/26' },
  { title: 'انتخاب واحد', cohort: 'ورودی ۴۰۳', category: 'registration', start: '1404/11/27' },
  { title: 'انتخاب واحد', cohort: 'ورودی ۴۰۴', category: 'registration', start: '1404/11/28' },
  { title: 'انتخاب واحد با تأخیر', cohort: 'کلیه ورودی‌ها', category: 'registration', start: '1404/11/29' },
  { title: 'شروع کلاس‌ها', category: 'academic', start: '1404/12/02' },
  { title: 'حذف و اضافه', cohort: 'ورودی ۴۰۲ و ماقبل', category: 'addDrop', start: '1404/12/10' },
  { title: 'حذف و اضافه', cohort: 'ورودی ۴۰۳ و ۴۰۴', category: 'addDrop', start: '1404/12/11' },
  { title: 'حذف تک‌درس', category: 'addDrop', start: '1405/03/17', end: '1405/03/18' },
  { title: 'ارزشیابی اساتید', category: 'academic', start: '1405/03/16', end: '1405/03/29' },
  { title: 'پیش‌ثبت‌نام', cohort: 'ورودی ۴۰۲ و ماقبل', category: 'registration', start: '1405/03/24' },
  { title: 'پیش‌ثبت‌نام', cohort: 'ورودی ۴۰۴ و ۴۰۳', category: 'registration', start: '1405/03/25' },
  { title: 'پایان کلاس‌ها', category: 'academic', start: '1405/04/03' },
  { title: 'امتحانات دروس عملی', category: 'exams', start: '1405/03/30', end: '1405/04/03' },
  { title: 'امتحانات', category: 'exams', start: '1405/04/06', end: '1405/04/22' },
];

async function main(): Promise<void> {
  // Make re-runs idempotent: drop the old copy (cascade removes its events).
  await prisma.semester.deleteMany({ where: { title: SEMESTER_TITLE } });

  // Enforce "only one active semester" before publishing this one.
  await prisma.semester.updateMany({ data: { isActive: false } });

  const semester = await prisma.semester.create({
    data: {
      title: SEMESTER_TITLE,
      subtitle: 'تقویم آموزشی مصوب شورای آموزشی دانشگاه',
      isActive: true,
      events: {
        create: EVENTS.map((e, index) => ({
          title: e.title,
          category: e.category,
          cohort: e.cohort ?? null,
          startDate: parseJalaliToDate(e.start),
          endDate: e.end ? parseJalaliToDate(e.end) : null,
          sortOrder: index,
        })),
      },
    },
    include: { events: true },
  });

  console.log(
    `✅ Seeded "${semester.title}" with ${semester.events.length} events (set active).`,
  );

  await seedChartDepartments();
}

/**
 * Upsert the engineering departments for the چارت آموزشی page. Idempotent (keyed
 * by the unique slug), so re-running only refreshes the department metadata and
 * never disturbs the chart PDFs staff have uploaded.
 */
async function seedChartDepartments(): Promise<void> {
  for (const [index, dept] of CHART_DEPARTMENTS.entries()) {
    await prisma.chartDepartment.upsert({
      where: { slug: dept.slug },
      create: {
        slug: dept.slug,
        title: dept.title,
        icon: dept.icon,
        color: dept.color,
        sortOrder: index,
        isPublished: true,
      },
      // On re-run keep it in sync but leave isPublished (staff may have hidden it).
      update: {
        title: dept.title,
        icon: dept.icon,
        color: dept.color,
        sortOrder: index,
      },
    });
  }

  console.log(
    `✅ Seeded ${CHART_DEPARTMENTS.length} chart departments (upload PDFs from /admin/chart).`,
  );
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
