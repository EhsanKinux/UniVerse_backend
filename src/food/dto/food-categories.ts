/**
 * Known slugs for the food (تغذیه) feature. Each is a plain string in the
 * database (so adding one needs NO migration), but admin input is validated
 * against these sets and the labels feed the admin dropdowns and the API's
 * `*Label` fields. Mirrors dorm-categories.ts.
 */

// ---------------------------------------------------------------------------
// Announcement categories (دستهٔ اطلاعیه) — drive the coloured badge on a card.
// ---------------------------------------------------------------------------
export const FOOD_ANNOUNCEMENT_CATEGORIES = [
  'general', // عمومی
  'menu', // منوی غذایی
  'hours', // ساعات کاری سلف
  'event', // رویداد
  'closure', // تعطیلی و اختلال
] as const;

export type FoodAnnouncementCategory =
  (typeof FOOD_ANNOUNCEMENT_CATEGORIES)[number];

export const FOOD_ANNOUNCEMENT_CATEGORY_LABELS: Record<
  FoodAnnouncementCategory,
  string
> = {
  general: 'عمومی',
  menu: 'منوی غذایی',
  hours: 'ساعات کاری',
  event: 'رویداد',
  closure: 'تعطیلی و اختلال',
};

/** Persian label for an announcement category slug, falling back to the slug. */
export function foodAnnouncementCategoryLabel(category: string): string {
  return (
    FOOD_ANNOUNCEMENT_CATEGORY_LABELS[category as FoodAnnouncementCategory] ??
    category
  );
}

/** Type-guard used to validate admin input. */
export function isKnownFoodAnnouncementCategory(
  category: string,
): category is FoodAnnouncementCategory {
  return (FOOD_ANNOUNCEMENT_CATEGORIES as readonly string[]).includes(category);
}
