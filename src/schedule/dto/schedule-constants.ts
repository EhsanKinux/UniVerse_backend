// Closed value-sets for the weekly schedule, shared by the DTO validators and
// the service. They're plain strings in the database (adding one later needs no
// migration) — this file is the single place that says what's currently legal.

/** Colour slugs the PWA can render. Must stay in sync with the frontend palette. */
export const COURSE_COLORS = [
  'teal',
  'sky',
  'violet',
  'amber',
  'rose',
  'emerald',
  'indigo',
  'fuchsia',
] as const;
export type CourseColor = (typeof COURSE_COLORS)[number];

/** Session kinds: نظری / عملی. */
export const SESSION_TYPES = ['theory', 'practical'] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

/** Week parity: every week / odd (فرد) weeks / even (زوج) weeks. */
export const SESSION_PARITIES = ['all', 'odd', 'even'] as const;
export type SessionParity = (typeof SESSION_PARITIES)[number];

/**
 * University week days: 0 = شنبه … 5 = پنجشنبه. Friday (6) is deliberately NOT
 * accepted — the timetable UI covers Saturday–Thursday.
 */
export const MAX_DAY_OF_WEEK = 5;

/** "HH:mm", 00:00–23:59. */
export const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Reminder lead-time bounds (minutes before class start). */
export const MIN_REMINDER_LEAD = 5;
export const MAX_REMINDER_LEAD = 120;
