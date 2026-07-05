import { Profile } from '../generated/prisma/client';
import {
  FIELD_POINTS,
  LEVELS,
  MAX_POINTS,
  ProfileLevel,
  ScoredField,
  TOTAL_FIELDS,
} from './profile.constants';

/**
 * The completion summary returned to the PWA (and rendered in the admin panel).
 * `score`/`maxScore` drive the numeric badge; `percent` drives the ring; `level`
 * is the tier label. `filled` lists exactly which scored fields count as done,
 * so the PWA can show a "what's missing" checklist without re-deriving the rules.
 */
export interface ProfileCompletion {
  score: number;
  maxScore: number;
  percent: number;
  filledCount: number;
  totalCount: number;
  level: ProfileLevel;
  filled: Record<ScoredField, boolean>;
}

/** True when a string column actually holds a value (null/blank => not filled). */
const has = (v: string | null | undefined): boolean => !!v && v.trim() !== '';

/**
 * Decide, field by field, whether each scored piece of the profile is complete.
 * A couple of fields combine several columns:
 *   - `location`  needs a city (you wouldn't set a city without a province)
 *   - `emergency` needs a contact phone (the actionable part of the contact)
 * KEEP THESE RULES IN SYNC with the PWA's lib/profile-fields.ts `isFilled`.
 */
function filledMap(
  name: string | null | undefined,
  p: Profile | null,
): Record<ScoredField, boolean> {
  return {
    name: has(name),
    phone: has(p?.phone),
    nationalId: has(p?.nationalId),
    birthDate: has(p?.birthDate),
    gender: has(p?.gender),
    location: has(p?.city),
    studentId: has(p?.studentId),
    major: has(p?.major),
    faculty: has(p?.faculty),
    degree: has(p?.degree),
    entryYear: p?.entryYear != null,
    advisor: has(p?.advisor),
    avatar: has(p?.avatarStoredName),
    bio: has(p?.bio),
    emergency: has(p?.emergencyPhone),
    telegram: has(p?.telegram),
  };
}

/** Highest level tier whose threshold `score` has reached. */
function levelForScore(score: number): ProfileLevel {
  let current: ProfileLevel = LEVELS[0];
  for (const tier of LEVELS) {
    if (score >= tier.min) current = { key: tier.key, label: tier.label };
  }
  return current;
}

/**
 * Compute the completion/score/level summary for a user + their profile row.
 * Pure and side-effect free, so both ProfileService and the admin controller
 * can call it. `name` comes from User.name (the display name lives there).
 */
export function computeCompletion(
  name: string | null | undefined,
  profile: Profile | null,
): ProfileCompletion {
  const filled = filledMap(name, profile);

  let score = 0;
  let filledCount = 0;
  for (const key of Object.keys(FIELD_POINTS) as ScoredField[]) {
    if (filled[key]) {
      score += FIELD_POINTS[key];
      filledCount += 1;
    }
  }

  return {
    score,
    maxScore: MAX_POINTS,
    percent: Math.round((score / MAX_POINTS) * 100),
    filledCount,
    totalCount: TOTAL_FIELDS,
    level: levelForScore(score),
    filled,
  };
}
