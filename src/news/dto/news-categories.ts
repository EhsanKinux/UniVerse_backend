/**
 * Known news categories — they drive the coloured badge on each card. The value
 * is a plain string in the DB (so adding one needs NO migration), but admin
 * input is validated against this set and the labels feed the admin dropdown and
 * the API's `categoryLabel`.
 */
export const NEWS_CATEGORIES = [
  'academic', // آموزشی
  'services', // خدمات
  'student', // دانشجویی
  'general', // عمومی
] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

/** Persian labels shown to staff (admin dropdown) and returned to the PWA. */
export const NEWS_CATEGORY_LABELS: Record<NewsCategory, string> = {
  academic: 'آموزشی',
  services: 'خدمات',
  student: 'دانشجویی',
  general: 'عمومی',
};

/** Persian label for a category slug, falling back to the slug itself. */
export function newsCategoryLabel(category: string): string {
  return NEWS_CATEGORY_LABELS[category as NewsCategory] ?? category;
}

/** Type-guard used to validate admin input. */
export function isKnownNewsCategory(
  category: string,
): category is NewsCategory {
  return (NEWS_CATEGORIES as readonly string[]).includes(category);
}
