import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CALENDAR_TIME_ZONE } from '../calendar/jalali.util';
import { FoodPlaceDto } from './dto/food.dto';

/**
 * Live "nearby food places" for the map on the تغذیه page, proxied from
 * OpenStreetMap's Overpass API. A proxy (rather than the browser calling
 * Overpass directly) because:
 *   • the PWA keeps its strict same-origin `/api` policy (no third-party CORS),
 *   • results are CACHED here, so a lecture hall full of students opening the
 *     page produces ONE upstream query instead of hundreds (Overpass rate-limits
 *     aggressively),
 *   • the raw OSM tag soup is normalised into a small, stable DTO the client
 *     can render without knowing anything about OSM.
 *
 * There is deliberately NO database table behind this — the whole point of the
 * live feed is that nobody has to curate it.
 */

// Public Overpass endpoints, tried in order. Both accept POSTed QL and answer
// with permissive CORS/no auth; kumi.systems is the customary fallback mirror.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
] as const;

const UPSTREAM_TIMEOUT_MS = 12_000;

// Radius bounds (metres): enough to cover a campus neighbourhood, small enough
// to keep Overpass responses snappy.
const MIN_RADIUS_M = 200;
const MAX_RADIUS_M = 5_000;
export const DEFAULT_RADIUS_M = 1_500;

// One cache entry serves every request whose coordinates round to the same
// ~110 m cell (3 decimal places) and radius — students on one campus share it.
const CACHE_TTL_MS = 10 * 60_000;
const MAX_CACHE_ENTRIES = 50;

// Cap the payload: the nearest N places are plenty for a phone screen.
const MAX_RESULTS = 60;

// The OSM amenity/shop values that count as "food a student can buy".
const FOOD_AMENITIES = ['restaurant', 'fast_food', 'cafe', 'food_court', 'ice_cream'];
const FOOD_SHOPS = ['bakery', 'confectionery', 'pastry', 'supermarket', 'convenience'];

/** Persian labels per normalised category slug (the badge on a place card). */
const CATEGORY_LABELS: Record<string, string> = {
  restaurant: 'رستوران',
  fast_food: 'فست‌فود',
  cafe: 'کافه',
  food_court: 'فودکورت',
  ice_cream: 'بستنی‌فروشی',
  bakery: 'نانوایی',
  confectionery: 'قنادی',
  supermarket: 'سوپرمارکت',
  other: 'خوراکی',
};

// The shape of one element in an Overpass JSON answer (nodes carry lat/lon
// directly; ways carry a `center` because of `out center`).
interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface CacheEntry {
  expires: number;
  places: Promise<FoodPlaceDto[]>;
}

@Injectable()
export class FoodPlacesService {
  private readonly logger = new Logger(FoodPlacesService.name);

  // Keyed by rounded-coordinates + radius. Stores the PROMISE, so concurrent
  // identical requests coalesce into one upstream query.
  private readonly cache = new Map<string, CacheEntry>();

  /** Nearby food places around a point, nearest first. */
  async findNearby(
    latRaw: string | undefined,
    lngRaw: string | undefined,
    radiusRaw: string | undefined,
  ): Promise<FoodPlaceDto[]> {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new BadRequestException('مختصات معتبر نیست.');
    }
    const requested = Number(radiusRaw ?? DEFAULT_RADIUS_M);
    const radius = Number.isFinite(requested)
      ? Math.min(Math.max(Math.trunc(requested), MIN_RADIUS_M), MAX_RADIUS_M)
      : DEFAULT_RADIUS_M;

    const key = `${lat.toFixed(3)},${lng.toFixed(3)},${radius}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.places;
    }

    const places = this.queryOverpass(lat, lng, radius);
    this.cache.set(key, { expires: Date.now() + CACHE_TTL_MS, places });
    this.pruneCache();

    try {
      return await places;
    } catch (error) {
      // A failed upstream query must not poison the cache for ten minutes.
      this.cache.delete(key);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Overpass
  // ---------------------------------------------------------------------------

  private async queryOverpass(
    lat: number,
    lng: number,
    radius: number,
  ): Promise<FoodPlaceDto[]> {
    const amenity = FOOD_AMENITIES.join('|');
    const shop = FOOD_SHOPS.join('|');
    const around = `around:${radius},${lat},${lng}`;
    // `nw` = nodes + ways; `out center` gives ways a single representative
    // coordinate so both kinds normalise the same way (body verbosity already
    // includes each element's tags — appending `tags` gets a 406 from Apache).
    const query = `
      [out:json][timeout:10];
      (
        nw["amenity"~"^(${amenity})$"](${around});
        nw["shop"~"^(${shop})$"](${around});
      );
      out center;
    `;

    let lastError: unknown;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            // Overpass policy requires an identifying User-Agent — and its
            // Apache 406-rejects the bare default one Node's fetch sends.
            'User-Agent': 'uni-verse-campus-pwa/1.0 (+https://uni.dowloadfiles.ir)',
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        });
        if (!res.ok) {
          throw new Error(`Overpass answered ${res.status}`);
        }
        const payload = (await res.json()) as { elements?: OverpassElement[] };
        return this.normalise(payload.elements ?? [], lat, lng);
      } catch (error) {
        lastError = error;
        this.logger.warn(`Overpass endpoint failed (${endpoint}): ${String(error)}`);
      }
    }

    this.logger.error(`All Overpass endpoints failed: ${String(lastError)}`);
    throw new ServiceUnavailableException(
      'دریافت مکان‌های اطراف از OpenStreetMap ممکن نشد. کمی بعد دوباره تلاش کنید.',
    );
  }

  /** Raw OSM elements → sorted, capped, display-ready DTOs. */
  private normalise(
    elements: OverpassElement[],
    lat: number,
    lng: number,
  ): FoodPlaceDto[] {
    const places: FoodPlaceDto[] = [];
    for (const el of elements) {
      const tags = el.tags ?? {};
      // Unnamed POIs are unverifiable blobs on the map — skip them.
      const name = tags['name:fa']?.trim() || tags.name?.trim();
      if (!name) continue;

      const pLat = el.lat ?? el.center?.lat;
      const pLng = el.lon ?? el.center?.lon;
      if (pLat === undefined || pLng === undefined) continue;

      const category = this.toCategory(tags);
      const distance = Math.round(haversineMetres(lat, lng, pLat, pLng));
      const openingHours = tags.opening_hours?.trim() || null;

      places.push({
        id: `${el.type}/${el.id}`,
        name,
        category,
        categoryLabel: CATEGORY_LABELS[category] ?? CATEGORY_LABELS.other,
        lat: pLat,
        lng: pLng,
        distance,
        distanceLabel: formatDistance(distance),
        phone: tags.phone?.trim() || tags['contact:phone']?.trim() || null,
        openingHours,
        openNow: openingHours ? isOpenNow(openingHours) : null,
        website: tags.website?.trim() || tags['contact:website']?.trim() || null,
      });
    }
    places.sort((a, b) => a.distance - b.distance);
    return places.slice(0, MAX_RESULTS);
  }

  /** OSM tag soup → one of our category slugs. `shop=convenience` folds into
   *  supermarket and `shop=pastry` into confectionery so the UI's filter set
   *  stays small. */
  private toCategory(tags: Record<string, string>): string {
    const amenity = tags.amenity;
    if (amenity && FOOD_AMENITIES.includes(amenity)) return amenity;
    const shop = tags.shop;
    if (shop === 'convenience') return 'supermarket';
    if (shop === 'pastry') return 'confectionery';
    if (shop && FOOD_SHOPS.includes(shop)) return shop;
    return 'other';
  }

  private pruneCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expires <= now) this.cache.delete(key);
    }
    // Insertion order ≈ age, so trimming from the front drops the oldest.
    while (this.cache.size > MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }
}

// -----------------------------------------------------------------------------
// Pure helpers (module-level so they stay trivially unit-testable)
// -----------------------------------------------------------------------------

/** Great-circle distance between two WGS-84 points, in metres. */
export function haversineMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** e.g. «۲۴۰ متر» below 1 km, «۱٫۲ کیلومتر» above. */
export function formatDistance(metres: number): string {
  if (metres < 1000) {
    return `${new Intl.NumberFormat('fa-IR').format(metres)} متر`;
  }
  const km = new Intl.NumberFormat('fa-IR', {
    maximumFractionDigits: 1,
  }).format(metres / 1000);
  return `${km} کیلومتر`;
}

// OSM's two-letter day codes, indexed like JavaScript's getDay() (Su = 0).
const OSM_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

/**
 * Best-effort evaluation of an OSM `opening_hours` value against the current
 * time in the university's timezone. Handles the patterns that cover the vast
 * majority of real tags — "24/7", rules like "Mo-Fr 08:00-22:00; Sa 09:00-13:00",
 * day lists ("Mo,We,Fr"), bare time ranges ("08:00-22:00" = every day), and
 * ranges wrapping midnight ("20:00-02:00"). Anything more exotic returns null
 * (= unknown), and the UI simply shows no open/closed badge.
 */
export function isOpenNow(
  openingHours: string,
  now: Date = new Date(),
): boolean | null {
  if (openingHours === '24/7') return true;

  // Current weekday + minutes-of-day in the campus timezone.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CALENDAR_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const dayIndex = OSM_DAYS.findIndex((d) => get('weekday').startsWith(d));
  // Intl can emit "24" for midnight with hour12:false — normalise it.
  const minutes = ((Number(get('hour')) % 24) * 60 + Number(get('minute'))) % 1440;
  if (dayIndex < 0 || Number.isNaN(minutes)) return null;

  let open = false;
  let understoodAny = false;

  for (const rawRule of openingHours.split(';')) {
    const rule = rawRule.trim();
    if (!rule) continue;
    // Public/school-holiday rules don't apply to a normal day — skip them.
    if (/^(PH|SH)\b/i.test(rule)) continue;

    const match = /^([A-Za-z ,-]+?)?\s*((?:\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\s*,?\s*)+|off|closed)$/.exec(
      rule,
    );
    if (!match) return null; // an exotic clause — admit we don't know

    const [, daysPart, timesPart] = match;
    const days = parseDays(daysPart?.trim());
    if (days === null) return null;
    understoodAny = true;
    if (!days.has(dayIndex)) continue;

    if (/^(off|closed)$/i.test(timesPart.trim())) {
      // A later rule overrides earlier ones in opening_hours semantics.
      open = false;
      continue;
    }

    open = timesPart
      .split(',')
      .map((range) => range.trim())
      .filter(Boolean)
      .some((range) => {
        const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(range);
        if (!m) return false;
        const from = Number(m[1]) * 60 + Number(m[2]);
        const to = (Number(m[3]) % 24) * 60 + Number(m[4]);
        // "20:00-02:00" wraps past midnight.
        return from <= to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
      });
  }

  return understoodAny ? open : null;
}

/** "Mo-Fr", "Sa,Su", "Sa-Th" (wrapping), or blank (= all week) → a set of
 *  getDay() indices. Unknown tokens → null. */
function parseDays(daysPart: string | undefined): Set<number> | null {
  if (!daysPart) return new Set([0, 1, 2, 3, 4, 5, 6]);
  const result = new Set<number>();
  for (const token of daysPart.split(',')) {
    const item = token.trim();
    if (!item) continue;
    const range = /^([A-Za-z]{2})\s*-\s*([A-Za-z]{2})$/.exec(item);
    if (range) {
      const from = OSM_DAYS.indexOf(range[1] as (typeof OSM_DAYS)[number]);
      const to = OSM_DAYS.indexOf(range[2] as (typeof OSM_DAYS)[number]);
      if (from < 0 || to < 0) return null;
      // "Sa-Th" wraps around the week end.
      for (let d = from; ; d = (d + 1) % 7) {
        result.add(d);
        if (d === to) break;
      }
    } else {
      const day = OSM_DAYS.indexOf(item as (typeof OSM_DAYS)[number]);
      if (day < 0) return null;
      result.add(day);
    }
  }
  return result;
}
