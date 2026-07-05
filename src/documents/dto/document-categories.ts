/**
 * The known document categories — one per PWA page that hosts a managed file.
 * The category is a plain string in the database (so adding a new one needs NO
 * migration), but admin uploads are validated against this set, and the labels
 * drive both the admin dropdown and the API's `categoryLabel`.
 *
 * To host a file on a new page, add a slug + label here — that's the only code
 * change required.
 */
// NOTE: the educational chart («چارت آموزشی») is NOT a document category — it has
// its own feature (src/chart) because a department carries several PDFs, which the
// single-active-file-per-category Document model can't represent.
export const DOCUMENT_CATEGORIES = ['courses', 'forms'] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/** Persian labels shown to staff (admin dropdown) and returned to the PWA. */
export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  courses: 'دروس ارائه‌شده',
  forms: 'فرم‌ها و آیین‌نامه‌ها',
};

/** Persian label for a category slug, falling back to the slug itself. */
export function documentCategoryLabel(category: string): string {
  return DOCUMENT_CATEGORY_LABELS[category as DocumentCategory] ?? category;
}

/** Type-guard: is this slug one we recognise? Used to validate admin uploads. */
export function isKnownCategory(
  category: string,
): category is DocumentCategory {
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(category);
}
