/**
 * The single source of truth for profile "enums", their Persian labels, and the
 * POINTS awarded for completing each field. Both the profile API (scoring +
 * validation) and the admin panel (labels) import from here, so the rules never
 * drift. The PWA keeps a hand-mirrored copy in lib/profile-fields.ts.
 */

// ---- Constrained values (validated in the DTO) ----------------------------

export const GENDERS = ['male', 'female'] as const;
export type Gender = (typeof GENDERS)[number];

export const DEGREES = ['associate', 'bachelor', 'master', 'phd'] as const;
export type Degree = (typeof DEGREES)[number];

export const GENDER_LABELS: Record<string, string> = {
  male: 'مرد',
  female: 'زن',
};

export const DEGREE_LABELS: Record<string, string> = {
  associate: 'کاردانی',
  bachelor: 'کارشناسی',
  master: 'کارشناسی ارشد',
  phd: 'دکتری',
};

// ---- Scoring ---------------------------------------------------------------
// Each "scored field" is a logical piece of the profile. A few map to more than
// one column (e.g. `location` = province + city), so the keys here are NOT a 1:1
// mirror of the Prisma columns — see profile-scoring.ts for how each is judged
// "filled". The weights simply reflect how much each field matters.

export const FIELD_POINTS = {
  // personal
  name: 10,
  phone: 10,
  nationalId: 10,
  birthDate: 5,
  gender: 5,
  location: 5, // province + city
  // academic
  studentId: 10,
  major: 10,
  faculty: 5,
  degree: 5,
  entryYear: 5,
  advisor: 5,
  // media & bio
  avatar: 15,
  bio: 5,
  emergency: 5, // emergencyName + emergencyPhone
  telegram: 5,
} as const;

export type ScoredField = keyof typeof FIELD_POINTS;

/** The most points a fully completed profile can earn (sum of all weights). */
export const MAX_POINTS = Object.values(FIELD_POINTS).reduce(
  (a, b) => a + b,
  0,
);

/** How many distinct fields contribute to completion. */
export const TOTAL_FIELDS = Object.keys(FIELD_POINTS).length;

/**
 * Level tiers, keyed by the minimum score needed to reach them. The student's
 * level is the highest tier whose `min` they've reached. Ordered ascending.
 */
export const LEVELS = [
  { min: 0, key: 'newcomer', label: 'تازه‌وارد' },
  { min: 30, key: 'building', label: 'در حال تکمیل' },
  { min: 60, key: 'active', label: 'فعال' },
  { min: 90, key: 'pro', label: 'حرفه‌ای' },
  { min: MAX_POINTS, key: 'complete', label: 'تکمیل‌شده' },
] as const;

export type ProfileLevel = {
  key: string;
  label: string;
};
