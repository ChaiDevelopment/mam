import {
  BUDGET_RANGES_IDR,
  type BudgetBucket,
  type CategorySlug,
  type LatLng,
  type PlaceSummary,
  type SortOption,
  type SurpriseReason,
} from '@mam/shared-types';
import { haversineMeters } from '../../common/geo';

/** Pure discovery helpers (filtering, sorting, scoring) — unit tested in discovery.spec.ts. */

export function matchesBudget(p: PlaceSummary, budget: BudgetBucket): boolean | null {
  const range = BUDGET_RANGES_IDR[budget];
  const inRange = (v: number) => v >= range.min && (range.max === null || v < range.max);
  const median = p.community?.medianPricePaid;
  if (median !== null && median !== undefined) return inRange(median);
  const g = p.google.priceRange;
  if (g && g.currency === 'IDR' && (g.min !== null || g.max !== null)) {
    const lo = g.min ?? g.max!;
    const hi = g.max ?? g.min!;
    // overlap of [lo, hi] with [min, max)
    return hi >= range.min && (range.max === null || lo < range.max);
  }
  return null; // no reliable price data — never guessed from Google price level
}

export interface DiscoveryFilters {
  center: LatLng;
  radiusMeters: number;
  categories?: CategorySlug[];
  budget?: BudgetBucket;
  minCommunityRating?: number;
  openNow?: boolean;
}

export function applyFilters(items: PlaceSummary[], f: DiscoveryFilters): { items: PlaceSummary[]; excludedForMissingData: number } {
  let excluded = 0;
  const out = items.filter((p) => {
    // Hard guarantee: never return a place outside the selected radius.
    const d = haversineMeters(f.center, p.location);
    p.distanceMeters = Math.round(d);
    if (d > f.radiusMeters) return false;
    if (f.categories?.length && p.categories.length && !p.categories.some((c) => f.categories!.includes(c))) return false;
    if (f.budget) {
      const m = matchesBudget(p, f.budget);
      if (m === null) {
        excluded++;
        return false;
      }
      if (!m) return false;
    }
    if (f.minCommunityRating !== undefined) {
      const r = p.community?.averageOverall;
      if (r === null || r === undefined) {
        excluded++;
        return false;
      }
      if (r < f.minCommunityRating) return false;
    }
    if (f.openNow) {
      if (p.openNow === null) {
        excluded++;
        return false;
      }
      if (!p.openNow) return false;
    }
    return true;
  });
  return { items: out, excludedForMissingData: excluded };
}

export function sortPlaces(items: PlaceSummary[], sort: SortOption): PlaceSummary[] {
  const byDistance = (a: PlaceSummary, b: PlaceSummary) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity);
  const copy = [...items];
  switch (sort) {
    case 'COMMUNITY_RATING':
      return copy.sort((a, b) => (b.community?.averageOverall ?? -1) - (a.community?.averageOverall ?? -1) || byDistance(a, b));
    case 'MOST_REVIEWED':
      return copy.sort((a, b) => (b.community?.reviewCount ?? 0) - (a.community?.reviewCount ?? 0) || byDistance(a, b));
    case 'RECENTLY_REVIEWED':
      return copy.sort(
        (a, b) =>
          (b.community?.lastReviewedAt ? Date.parse(b.community.lastReviewedAt) : 0) -
            (a.community?.lastReviewedAt ? Date.parse(a.community.lastReviewedAt) : 0) || byDistance(a, b),
      );
    case 'NEAREST':
    default:
      return copy.sort(byDistance);
  }
}

/**
 * Transparent "Surprise me" score in [0, 1]:
 *   0.35 × community rating (or 0.25 × Google rating if no community reviews, labeled as such)
 *   0.25 × proximity (1 at centre → 0 at radius edge)
 *   0.15 × confidence (log-scaled review count)
 *   0.25 × random jitter (keeps picks varied)
 */
export function surpriseScore(p: PlaceSummary, radiusMeters: number, random: () => number = Math.random): { score: number; reasons: SurpriseReason[] } {
  const reasons: SurpriseReason[] = [];
  let score = 0;
  const d = p.distanceMeters ?? radiusMeters;
  const proximity = Math.max(0, 1 - d / radiusMeters);
  score += 0.25 * proximity;
  if (d <= radiusMeters * 0.3) reasons.push({ code: 'CLOSE_BY', text: `Dekat banget — sekitar ${d < 1000 ? `${d} m` : `${(d / 1000).toFixed(1)} km`} dari kamu.` });

  const c = p.community;
  if (c?.averageOverall) {
    score += 0.35 * ((c.averageOverall - 1) / 4);
    score += 0.15 * Math.min(1, Math.log10(1 + c.reviewCount) / 2);
    reasons.push({ code: 'COMMUNITY_RATING', text: `Rating komunitas MAM! ${c.averageOverall.toFixed(1)} dari ${c.reviewCount} ulasan.` });
  } else if (p.google.rating) {
    score += 0.25 * ((p.google.rating - 1) / 4);
    score += 0.1 * Math.min(1, Math.log10(1 + (p.google.userRatingCount ?? 0)) / 3);
    reasons.push({ code: 'GOOGLE_RATING', text: `Rating Google Maps ${p.google.rating.toFixed(1)} (${p.google.userRatingCount ?? 0} ulasan di Google).` });
  }
  const jitter = random();
  score += 0.25 * jitter;
  return { score: Math.round(score * 1000) / 1000, reasons };
}

/** Lower-case, accent/punctuation-free name used to match the same place across providers. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/\b(rumah makan|rm|warung|resto|restoran|restaurant|cafe|kafe|kedai|depot)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Merges Google results with places stored in MAM! (OSM/community). A stored place is dropped when a Google place
 * with a matching name lies within `meters` — the Google entry already represents it.
 */
export function mergeWithLocal(google: PlaceSummary[], local: PlaceSummary[], meters = 60): PlaceSummary[] {
  if (!google.length) return local;
  const g = google.map((p) => ({ p, n: normalizeName(p.name) }));
  const extra = local.filter((l) => {
    const ln = normalizeName(l.name);
    if (!ln) return true;
    return !g.some(({ p, n }) => n && (n === ln || n.includes(ln) || ln.includes(n)) && haversineMeters(p.location, l.location) <= meters);
  });
  const seen = new Set(google.map((p) => p.restaurantId).filter(Boolean));
  return [...google, ...extra.filter((l) => !l.restaurantId || !seen.has(l.restaurantId))];
}
