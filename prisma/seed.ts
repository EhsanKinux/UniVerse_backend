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

// The university phone directory shown on the شماره‌های دانشگاه page. This used to
// be hard-coded in the PWA (lib/phone-data.ts); we seed the same starting data so
// nothing is lost, then staff manage it from /admin/phone-book. `icon` is a key
// from CONTACT_GROUP_ICONS (mapped to a line icon in the PWA).
interface SeedContact {
  name: string;
  phone: string;
  ext?: string;
}
interface SeedContactGroup {
  title: string;
  icon: string; // must be one of CONTACT_GROUP_ICONS
  contacts: SeedContact[];
}

const CONTACT_GROUPS: SeedContactGroup[] = [
  {
    title: 'معاونت آموزشی',
    icon: 'education',
    contacts: [
      { name: 'دفتر معاونت آموزشی', phone: '02133334455', ext: '۲۱۰' },
      { name: 'اداره ثبت‌نام و امتحانات', phone: '02133334456', ext: '۲۱۵' },
      { name: 'اداره فارغ‌التحصیلان', phone: '02133334457', ext: '۲۲۰' },
    ],
  },
  {
    title: 'امور دانشجویی',
    icon: 'students',
    contacts: [
      { name: 'اداره خوابگاه‌ها', phone: '02133334460', ext: '۳۱۰' },
      { name: 'صندوق رفاه دانشجویان', phone: '02133334461', ext: '۳۱۵' },
      { name: 'مرکز مشاوره', phone: '02133334462', ext: '۳۲۰' },
    ],
  },
  {
    title: 'کتابخانه مرکزی',
    icon: 'library',
    contacts: [
      { name: 'میز امانت', phone: '02133334470', ext: '۴۱۰' },
      { name: 'بخش مرجع و پایان‌نامه', phone: '02133334471', ext: '۴۱۵' },
    ],
  },
  {
    title: 'اداره تغذیه',
    icon: 'food',
    contacts: [
      { name: 'سلف مرکزی', phone: '02133334480', ext: '۵۱۰' },
      { name: 'واحد رزرو غذا', phone: '02133334481', ext: '۵۱۵' },
    ],
  },
  {
    title: 'فناوری اطلاعات',
    icon: 'it',
    contacts: [
      { name: 'پشتیبانی سامانه‌ها', phone: '02133334490', ext: '۶۱۰' },
      { name: 'پشتیبانی اینترنت و شبکه', phone: '02133334491', ext: '۶۱۵' },
    ],
  },
  {
    title: 'حراست',
    icon: 'security',
    contacts: [{ name: 'دفتر حراست دانشگاه', phone: '02133334400', ext: '۱۰۰' }],
  },
  {
    title: 'اورژانس و درمانگاه',
    icon: 'emergency',
    contacts: [
      { name: 'درمانگاه دانشگاه', phone: '02133334411', ext: '۱۱۰' },
      { name: 'اورژانس (شبانه‌روزی)', phone: '115' },
    ],
  },
  {
    title: 'تلفن‌خانه مرکزی',
    icon: 'phone',
    contacts: [{ name: 'روابط عمومی دانشگاه', phone: '02133334000' }],
  },
];

// The joinable groups/channels shown on the گروه‌ها page. This used to be
// hard-coded in the PWA (lib/data/groups-data.ts); we seed the same starting data
// so nothing is lost, then staff manage it from /admin/groups. Each group carries
// one or more join options; the seed uses simple "link" options. `platform` is a
// free-text badge (any messenger name).
interface SeedGroupLink {
  kind: 'link' | 'handle' | 'qr';
  label?: string;
  url?: string;
  handle?: string;
}
interface SeedGroup {
  title: string;
  description?: string;
  platform?: string;
  links: SeedGroupLink[];
}
interface SeedGroupCategory {
  title: string;
  groups: SeedGroup[];
}

const GROUP_CATEGORIES: SeedGroupCategory[] = [
  {
    title: 'کانال‌های رسمی',
    groups: [
      {
        title: 'اطلاع‌رسانی آموزش دانشگاه',
        description: 'اخبار رسمی، اطلاعیه‌ها و رویدادهای آموزشی',
        platform: 'تلگرام',
        links: [{ kind: 'link', url: 'https://t.me/example_edu' }],
      },
      {
        title: 'انجمن علمی مهندسی کامپیوتر',
        description: 'کارگاه‌ها، مسابقات و فرصت‌های شغلی',
        platform: 'تلگرام',
        links: [{ kind: 'link', url: 'https://t.me/example_cs' }],
      },
    ],
  },
  {
    title: 'گروه‌های کلاسی',
    groups: [
      {
        title: 'ورودی ۱۴۰۳ - مهندسی کامپیوتر',
        description: 'هماهنگی کلاس‌ها و تکالیف هم‌ورودی‌ها',
        platform: 'تلگرام',
        links: [{ kind: 'link', url: 'https://t.me/example_1403' }],
      },
      {
        title: 'گروه درس ساختمان داده‌ها',
        description: 'پرسش و پاسخ و منابع درس',
        platform: 'واتساپ',
        links: [{ kind: 'link', url: 'https://chat.whatsapp.com/example' }],
      },
    ],
  },
  {
    title: 'انجمن‌ها و تشکل‌ها',
    groups: [
      {
        title: 'انجمن برنامه‌نویسی دانشگاه',
        description: 'دورهمی‌های فنی و پروژه‌های گروهی',
        platform: 'تلگرام',
        links: [{ kind: 'link', url: 'https://t.me/example_dev' }],
      },
      {
        title: 'کانون فرهنگی و هنری',
        description: 'رویدادهای فرهنگی، اردوها و کارگاه‌ها',
        platform: 'تلگرام',
        links: [{ kind: 'link', url: 'https://t.me/example_culture' }],
      },
    ],
  },
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
  await seedContactGroups();
  await seedGroups();
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

/**
 * Seed the phone directory ONLY when it's still empty — the numbers are staff-owned
 * after the first run, so we never overwrite their edits on a re-seed. (There's no
 * natural unique key to upsert on the way charts do with their slug, so an
 * empty-table guard is the safe, idempotent choice.)
 */
async function seedContactGroups(): Promise<void> {
  const existing = await prisma.contactGroup.count();
  if (existing > 0) {
    console.log(
      `↷ Skipped phone directory seed (${existing} group(s) already exist).`,
    );
    return;
  }

  for (const [index, group] of CONTACT_GROUPS.entries()) {
    await prisma.contactGroup.create({
      data: {
        title: group.title,
        icon: group.icon,
        sortOrder: index,
        isPublished: true,
        contacts: {
          create: group.contacts.map((c, i) => ({
            name: c.name,
            phone: c.phone,
            ext: c.ext ?? null,
            sortOrder: i,
          })),
        },
      },
    });
  }

  const numbers = CONTACT_GROUPS.reduce((s, g) => s + g.contacts.length, 0);
  console.log(
    `✅ Seeded ${CONTACT_GROUPS.length} contact groups with ${numbers} numbers (manage from /admin/phone-book).`,
  );
}

/**
 * Seed the groups/channels directory ONLY when it's still empty — it's staff-owned
 * after the first run, so we never overwrite their edits on a re-seed. (Same
 * empty-table guard as the phone directory: there's no natural unique key to
 * upsert on.)
 */
async function seedGroups(): Promise<void> {
  const existing = await prisma.groupCategory.count();
  if (existing > 0) {
    console.log(
      `↷ Skipped groups seed (${existing} category(ies) already exist).`,
    );
    return;
  }

  for (const [index, category] of GROUP_CATEGORIES.entries()) {
    await prisma.groupCategory.create({
      data: {
        title: category.title,
        sortOrder: index,
        isPublished: true,
        groups: {
          create: category.groups.map((g, gi) => ({
            title: g.title,
            description: g.description ?? null,
            platform: g.platform ?? null,
            sortOrder: gi,
            isPublished: true,
            links: {
              create: g.links.map((l, li) => ({
                kind: l.kind,
                label: l.label ?? null,
                url: l.url ?? null,
                handle: l.handle ?? null,
                sortOrder: li,
              })),
            },
          })),
        },
      },
    });
  }

  const groupCount = GROUP_CATEGORIES.reduce((s, c) => s + c.groups.length, 0);
  console.log(
    `✅ Seeded ${GROUP_CATEGORIES.length} group categories with ${groupCount} groups (manage from /admin/groups).`,
  );
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
