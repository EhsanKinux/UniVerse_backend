// Time helpers for the weekly schedule. Class times are wall-clock times in
// Tehran (the university's timezone), but the server could be running anywhere
// with any system timezone — so every "what time is it / what day is it"
// question must be answered THROUGH the Asia/Tehran timezone, never with plain
// `new Date().getHours()`. Node's built-in Intl API does the conversion for us
// (including Iran's historical DST rules) with no extra dependency.

/** Persian weekday names indexed by university day: 0 = شنبه … 6 = جمعه. */
export const WEEKDAY_NAMES_FA = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
] as const;

/** A moment expressed in Tehran wall-clock terms. */
export interface TehranNow {
  /** University weekday: 0 = شنبه (Saturday) … 6 = جمعه (Friday). */
  weekday: number;
  /** Minutes since local midnight, e.g. 10:30 → 630. */
  minutes: number;
  /** The Gregorian civil date in Tehran, as UTC-midnight epoch ms. Two calls on
   *  the same Tehran day produce the same value — handy as a dedupe key. */
  dateMs: number;
}

// Intl weekday abbreviations → university day index (week starts on Saturday).
const WEEKDAY_INDEX: Record<string, number> = {
  Sat: 0,
  Sun: 1,
  Mon: 2,
  Tue: 3,
  Wed: 4,
  Thu: 5,
  Fri: 6,
};

const tehranFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tehran',
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23', // 0–23 hours (avoids "24:xx" that h24 can produce)
});

/** What time is it in Tehran right now (or at `at`, for tests)? */
export function getTehranNow(at: Date = new Date()): TehranNow {
  const parts: Record<string, string> = {};
  for (const part of tehranFormatter.formatToParts(at)) {
    parts[part.type] = part.value;
  }

  return {
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    dateMs: Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
    ),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The Saturday that starts the (Tehran) week containing `now`, as UTC-midnight ms. */
export function saturdayOfWeekMs(now: TehranNow): number {
  return now.dateMs - now.weekday * DAY_MS;
}

/**
 * Which parity is the current week, given the stored anchor (a Saturday known to
 * start an ODD/فرد week)? Even weeks are an odd number of weeks away from it.
 * Returns null when the user hasn't set an anchor yet.
 */
export function currentWeekParity(
  oddWeekAnchor: Date | null,
  now: TehranNow,
): 'odd' | 'even' | null {
  if (!oddWeekAnchor) return null;

  // @db.Date columns come back as UTC midnight already; normalize defensively.
  const anchorMs = Date.UTC(
    oddWeekAnchor.getUTCFullYear(),
    oddWeekAnchor.getUTCMonth(),
    oddWeekAnchor.getUTCDate(),
  );

  const diffWeeks = Math.round(
    (saturdayOfWeekMs(now) - anchorMs) / (7 * DAY_MS),
  );
  // A negative diff (anchor in the future) must still alternate correctly, and
  // JS `%` keeps the sign of the dividend — hence the double-mod dance.
  return ((diffWeeks % 2) + 2) % 2 === 0 ? 'odd' : 'even';
}

/** "10:05" → 605. Assumes the DTO already validated the HH:mm shape. */
export function hhmmToMinutes(value: string): number {
  const [h, m] = value.split(':');
  return Number(h) * 60 + Number(m);
}

/** 605 → "10:05". */
export function minutesToHhmm(value: number): string {
  const h = String(Math.floor(value / 60)).padStart(2, '0');
  const m = String(value % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/** 605 → «۱۰:۰۵» — for Persian push-notification texts. */
export function minutesToHhmmFa(value: number): string {
  return minutesToHhmm(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}
