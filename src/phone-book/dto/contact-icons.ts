/**
 * The icon keys a contact group may use. Each key maps, on the PWA side, to a
 * HugeIcons line icon (see lib/phone-meta.ts) rendered in the group's icon box —
 * so the set here MUST stay in step with the map in the front end.
 *
 * We store an icon KEY (a slug) rather than an emoji so the directory keeps its
 * current monochrome, line-icon look. The value is a plain string in the database
 * (so adding an icon needs NO migration), but admin input is validated against
 * this set, and the labels drive the admin icon dropdown. To add an icon: add its
 * entry to lib/phone-meta.ts in the PWA, then a key + label here.
 */
export const CONTACT_GROUP_ICONS = [
  'education', // معاونت آموزشی
  'students', // امور دانشجویی
  'library', // کتابخانه
  'food', // تغذیه / سلف
  'it', // فناوری اطلاعات
  'security', // حراست
  'emergency', // اورژانس و درمانگاه
  'dorm', // خوابگاه
  'groups', // امور فرهنگی / گروه‌ها
  'building', // اداری / ساختمان
  'phone', // تلفن‌خانه / عمومی
] as const;

export type ContactGroupIcon = (typeof CONTACT_GROUP_ICONS)[number];

/** The icon used when none is supplied or an unknown one slips through. */
export const DEFAULT_CONTACT_ICON: ContactGroupIcon = 'phone';

/** Persian labels shown to staff in the admin icon dropdown. */
export const CONTACT_ICON_LABELS: Record<ContactGroupIcon, string> = {
  education: 'آموزشی (کلاه فارغ‌التحصیلی)',
  students: 'دانشجویی (مدرسه)',
  library: 'کتابخانه (کتاب)',
  food: 'تغذیه (کاسه غذا)',
  it: 'فناوری اطلاعات (رایانه)',
  security: 'حراست (سپر)',
  emergency: 'اورژانس (آمبولانس)',
  dorm: 'خوابگاه (خانه)',
  groups: 'فرهنگی/گروه‌ها (کاربران)',
  building: 'اداری (ساختمان)',
  phone: 'عمومی/تلفن‌خانه (تلفن)',
};

/** Type-guard: is this key one of the known contact-group icons? */
export function isKnownContactIcon(icon: string): icon is ContactGroupIcon {
  return (CONTACT_GROUP_ICONS as readonly string[]).includes(icon);
}
