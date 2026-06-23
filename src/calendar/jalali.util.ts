import * as jalaali from 'jalaali-js';

/**
 * Helpers for the Persian (Jalali / Shamsi) calendar.
 *
 * The strategy used across the whole calendar feature:
 *   • We STORE an absolute Gregorian date (`@db.Date`, at UTC midnight).
 *   • Staff THINK in Jalali, so the admin form accepts a Jalali date
 *     (e.g. "۱۴۰۴/۱۱/۲۶") which we convert to a real date here — the INPUT path.
 *   • The PWA SHOWS Jalali, so we format the stored date back to Persian here —
 *     the OUTPUT path — using the runtime's built-in Intl + Persian calendar, so
 *     no formatting library is needed (Intl even gives us Persian digits).
 *
 * These are small pure functions (no database, no NestJS) so they're easy to
 * reason about and to unit-test.
 */

// The university is in Iran, so "today" and weekday names are computed in this
// timezone — otherwise an event could flip to "past" a few hours early on a
// server hosted elsewhere.
export const CALENDAR_TIME_ZONE = 'Asia/Tehran';

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Convert any Persian/Arabic digits in a string to plain ASCII 0-9. */
export function normalizeDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (ch) => {
    const p = PERSIAN_DIGITS.indexOf(ch);
    if (p > -1) return String(p);
    const a = ARABIC_DIGITS.indexOf(ch);
    return a > -1 ? String(a) : ch;
  });
}

export interface JalaliParts {
  jy: number;
  jm: number; // 1-12
  jd: number; // 1-31
}

/**
 * Parse a Jalali date string like "1404/11/26" (slashes or dashes, Persian or
 * ASCII digits) into numeric parts. Throws if it isn't a real Jalali date.
 */
export function parseJalali(input: string): JalaliParts {
  const cleaned = normalizeDigits(input.trim());
  const match = cleaned.match(/^(\d{3,4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (!match) {
    throw new Error(`"${input}" is not a valid Jalali date (expected YYYY/MM/DD).`);
  }
  const jy = Number(match[1]);
  const jm = Number(match[2]);
  const jd = Number(match[3]);
  if (!jalaali.isValidJalaaliDate(jy, jm, jd)) {
    throw new Error(`"${input}" is not a real day on the Jalali calendar.`);
  }
  return { jy, jm, jd };
}

/**
 * Convert Jalali parts to an absolute JS Date at UTC midnight. UTC keeps the
 * value as exactly "this calendar day" with no time-of-day or timezone baggage,
 * matching the `@db.Date` column.
 */
export function jalaliToDate({ jy, jm, jd }: JalaliParts): Date {
  const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd);
  return new Date(Date.UTC(gy, gm - 1, gd));
}

/** Parse a Jalali string straight to a Date. */
export function parseJalaliToDate(input: string): Date {
  return jalaliToDate(parseJalali(input));
}

/** Convert a stored Date back to Jalali parts (reads the UTC day). */
export function dateToJalali(date: Date): JalaliParts {
  const { jy, jm, jd } = jalaali.toJalaali(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
  return { jy, jm, jd };
}

/**
 * An ASCII "YYYY/MM/DD" Jalali string, used to pre-fill the admin date-picker
 * when editing an existing event.
 */
export function toJalaliInputValue(date: Date): string {
  const { jy, jm, jd } = dateToJalali(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${jy}/${pad(jm)}/${pad(jd)}`;
}

// --- Display formatters (Gregorian Date -> Persian text) ---------------------
// All pass timeZone 'UTC' because the stored date is UTC midnight; without it
// the server's local timezone could roll the date back to the previous day.

function persianFormatter(
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    timeZone: 'UTC',
    ...options,
  });
}

/** e.g. "۲۶ بهمن ۱۴۰۴" */
export function formatJalaliDate(date: Date): string {
  return persianFormatter({
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/** e.g. "یکشنبه" — the Persian weekday name. */
export function formatPersianWeekday(date: Date): string {
  return persianFormatter({ weekday: 'long' }).format(date);
}

/** e.g. "بهمن ۱۴۰۴" — used to group events by month in the PWA. We compose the
 *  parts ourselves because Intl renders the fa "month + year" skeleton in the
 *  reverse order ("۱۴۰۴ بهمن"). */
export function formatJalaliMonth(date: Date): string {
  const month = persianFormatter({ month: 'long' }).format(date);
  const year = persianFormatter({ year: 'numeric' }).format(date);
  return `${month} ${year}`;
}

/**
 * A human label for a single day OR a range, collapsing the shared month/year:
 *   single:                  "۲۶ بهمن ۱۴۰۴"
 *   range, same month+year:  "۶ تا ۲۲ تیر ۱۴۰۵"
 *   range, same year:        "۳۰ خرداد تا ۳ تیر ۱۴۰۵"
 *   range, different years:  "۲۹ اسفند ۱۴۰۴ تا ۲ فروردین ۱۴۰۵"
 */
export function formatJalaliRange(start: Date, end?: Date | null): string {
  if (!end || start.getTime() === end.getTime()) {
    return formatJalaliDate(start);
  }
  const s = dateToJalali(start);
  const e = dateToJalali(end);
  const dayOnly = (d: Date) => persianFormatter({ day: 'numeric' }).format(d);
  const dayMonth = (d: Date) =>
    persianFormatter({ day: 'numeric', month: 'long' }).format(d);

  if (s.jy === e.jy && s.jm === e.jm) {
    return `${dayOnly(start)} تا ${formatJalaliDate(end)}`;
  }
  if (s.jy === e.jy) {
    return `${dayMonth(start)} تا ${formatJalaliDate(end)}`;
  }
  return `${formatJalaliDate(start)} تا ${formatJalaliDate(end)}`;
}
