/**
 * Known slugs for the dormitory feature. Each is a plain string in the database
 * (so adding one needs NO migration), but admin input is validated against these
 * sets and the labels feed the admin dropdowns and the API's `*Label` fields.
 */

// ---------------------------------------------------------------------------
// Announcement categories (دستهٔ اطلاعیه) — drive the coloured badge on a card.
// ---------------------------------------------------------------------------
export const DORM_ANNOUNCEMENT_CATEGORIES = [
  'general', // عمومی
  'facility', // امکانات و تعمیرات
  'financial', // مالی و تسویه
  'event', // رویداد
  'maintenance', // قطعی و اختلال (آب/برق/اینترنت)
] as const;

export type DormAnnouncementCategory =
  (typeof DORM_ANNOUNCEMENT_CATEGORIES)[number];

export const DORM_ANNOUNCEMENT_CATEGORY_LABELS: Record<
  DormAnnouncementCategory,
  string
> = {
  general: 'عمومی',
  facility: 'امکانات',
  financial: 'مالی و تسویه',
  event: 'رویداد',
  maintenance: 'قطعی و اختلال',
};

/** Persian label for an announcement category slug, falling back to the slug. */
export function dormAnnouncementCategoryLabel(category: string): string {
  return (
    DORM_ANNOUNCEMENT_CATEGORY_LABELS[category as DormAnnouncementCategory] ??
    category
  );
}

/** Type-guard used to validate admin input. */
export function isKnownDormAnnouncementCategory(
  category: string,
): category is DormAnnouncementCategory {
  return (DORM_ANNOUNCEMENT_CATEGORIES as readonly string[]).includes(category);
}

// ---------------------------------------------------------------------------
// Info sections — the قوانین و مقررات and امکانات و ساعات کاری lists share one
// table (DormInfoItem), told apart by this slug.
// ---------------------------------------------------------------------------
export const DORM_INFO_SECTIONS = [
  'rules', // قوانین و مقررات خوابگاه
  'facilities', // امکانات و ساعات کاری
] as const;

export type DormInfoSection = (typeof DORM_INFO_SECTIONS)[number];

export const DORM_INFO_SECTION_LABELS: Record<DormInfoSection, string> = {
  rules: 'قوانین و مقررات',
  facilities: 'امکانات و ساعات کاری',
};

/** Persian label for a section slug, falling back to the slug itself. */
export function dormInfoSectionLabel(section: string): string {
  return DORM_INFO_SECTION_LABELS[section as DormInfoSection] ?? section;
}

/** Type-guard used to validate admin input. */
export function isKnownDormInfoSection(
  section: string,
): section is DormInfoSection {
  return (DORM_INFO_SECTIONS as readonly string[]).includes(section);
}
