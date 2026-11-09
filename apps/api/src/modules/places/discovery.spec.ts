import type { PlaceSummary } from '@mam/shared-types';
import { DEFAULT_RADIUS_METERS } from '@mam/shared-types';
import { nearbyQuerySchema, surpriseQuerySchema } from '@mam/validation';
import { applyFilters, matchesBudget, mergeWithLocal, normalizeName, sortPlaces, surpriseScore } from './discovery';

const center = { lat: -6.2, lng: 106.8 };
function place(id: string, dLngDeg: number, extra: Partial<PlaceSummary> = {}): PlaceSummary {
  return {
    placeId: `place_${id}_xxxxxxxx`,
    source: 'GOOGLE',
    local: null,
    restaurantId: null,
    name: id,
    address: null,
    location: { lat: center.lat, lng: center.lng + dLngDeg },
    distanceMeters: null,
    primaryType: 'restaurant',
    categories: [],
    openNow: null,
    photo: null,
    google: { rating: null, userRatingCount: null, priceLevel: null, priceRange: null, mapsUri: null },
    community: null,
    ...extra,
  };
}
// 0.009° of longitude at -6.2° latitude ≈ 995 m
const km = (n: number) => n * 0.009045;

describe('discovery defaults', () => {
  it('default radius is exactly 5 km', () => {
    expect(DEFAULT_RADIUS_METERS).toBe(5000);
    expect(nearbyQuerySchema.parse({ lat: '-6.2', lng: '106.8' }).radius).toBe(5000);
    expect(surpriseQuerySchema.parse({ lat: '-6.2', lng: '106.8' }).radius).toBe(5000);
  });

  it('accepts only the selectable radii', () => {
    for (const r of [1000, 2000, 3000, 5000, 10000]) expect(nearbyQuerySchema.parse({ lat: 0, lng: 0, radius: String(r) }).radius).toBe(r);
    expect(() => nearbyQuerySchema.parse({ lat: 0, lng: 0, radius: '4000' })).toThrow();
    expect(() => nearbyQuerySchema.parse({ lat: 0, lng: 0, radius: '50000' })).toThrow();
  });
});

describe('applyFilters', () => {
  it('never returns places outside the radius and computes geodesic distance', () => {
    const items = [place('a', km(0.5)), place('b', km(4.9)), place('c', km(5.2)), place('d', km(12))];
    const { items: out } = applyFilters(items, { center, radiusMeters: 5000 });
    expect(out.map((p) => p.name)).toEqual(['a', 'b']);
    expect(out[0].distanceMeters).toBeGreaterThan(450);
    expect(out[0].distanceMeters).toBeLessThan(550);
  });

  it('respects a smaller selected radius', () => {
    const items = [place('a', km(0.5)), place('b', km(1.5)), place('c', km(2.5))];
    expect(applyFilters(items, { center, radiusMeters: 2000 }).items.map((p) => p.name)).toEqual(['a', 'b']);
  });

  it('filters by category', () => {
    const items = [place('sushi', km(1), { categories: ['japanese'] }), place('soto', km(1), { categories: ['indonesian'] })];
    expect(applyFilters(items, { center, radiusMeters: 5000, categories: ['japanese'] }).items.map((p) => p.name)).toEqual(['sushi']);
  });

  it('budget uses community-reported price first and never guesses from Google price level', () => {
    const items = [
      place('cheap-community', km(1), { community: { reviewCount: 3, averageOverall: 4, medianPricePaid: 15000, lastReviewedAt: null } }),
      place('google-range', km(1), { google: { rating: 4, userRatingCount: 10, priceLevel: null, priceRange: { min: 10000, max: 25000, currency: 'IDR' }, mapsUri: null } }),
      place('only-price-level', km(1), { google: { rating: 4, userRatingCount: 10, priceLevel: 'PRICE_LEVEL_INEXPENSIVE', priceRange: null, mapsUri: null } }),
      place('expensive', km(1), { community: { reviewCount: 2, averageOverall: 4, medianPricePaid: 80000, lastReviewedAt: null } }),
    ];
    const r = applyFilters(items, { center, radiusMeters: 5000, budget: '10K_20K' });
    expect(r.items.map((p) => p.name)).toEqual(['cheap-community', 'google-range']);
    expect(r.excludedForMissingData).toBe(1);
  });

  it('matchesBudget handles open-ended upper bucket', () => {
    expect(matchesBudget(place('x', 0, { community: { reviewCount: 1, averageOverall: 4, medianPricePaid: 120000, lastReviewedAt: null } }), 'ABOVE_50K')).toBe(true);
    expect(matchesBudget(place('y', 0), 'ABOVE_50K')).toBeNull();
  });

  it('minimum community rating excludes places without community ratings (counted as missing data)', () => {
    const items = [
      place('good', km(1), { community: { reviewCount: 5, averageOverall: 4.6, medianPricePaid: null, lastReviewedAt: null } }),
      place('meh', km(1), { community: { reviewCount: 5, averageOverall: 3.1, medianPricePaid: null, lastReviewedAt: null } }),
      place('unknown', km(1)),
    ];
    const r = applyFilters(items, { center, radiusMeters: 5000, minCommunityRating: 4 });
    expect(r.items.map((p) => p.name)).toEqual(['good']);
    expect(r.excludedForMissingData).toBe(1);
  });

  it('openNow filter only trusts explicit data', () => {
    const items = [place('open', km(1), { openNow: true }), place('closed', km(1), { openNow: false }), place('unknown', km(1))];
    expect(applyFilters(items, { center, radiusMeters: 5000, openNow: true }).items.map((p) => p.name)).toEqual(['open']);
  });
});

describe('sortPlaces', () => {
  const items = applyFilters(
    [
      place('far-popular', km(3), { community: { reviewCount: 20, averageOverall: 4.1, medianPricePaid: null, lastReviewedAt: '2026-10-01T00:00:00Z' } }),
      place('near', km(0.3)),
      place('mid-top', km(1.5), { community: { reviewCount: 4, averageOverall: 4.9, medianPricePaid: null, lastReviewedAt: '2026-11-05T00:00:00Z' } }),
    ],
    { center, radiusMeters: 5000 },
  ).items;
  it('NEAREST', () => expect(sortPlaces(items, 'NEAREST').map((p) => p.name)).toEqual(['near', 'mid-top', 'far-popular']));
  it('COMMUNITY_RATING', () => expect(sortPlaces(items, 'COMMUNITY_RATING')[0].name).toBe('mid-top'));
  it('MOST_REVIEWED', () => expect(sortPlaces(items, 'MOST_REVIEWED')[0].name).toBe('far-popular'));
  it('RECENTLY_REVIEWED', () => expect(sortPlaces(items, 'RECENTLY_REVIEWED')[0].name).toBe('mid-top'));
});

describe('surpriseScore', () => {
  it('is deterministic given the random source and explains itself', () => {
    const p = { ...place('x', km(0.5)), distanceMeters: 500, community: { reviewCount: 9, averageOverall: 4.5, medianPricePaid: null, lastReviewedAt: null } };
    const a = surpriseScore(p, 5000, () => 0.5);
    const b = surpriseScore(p, 5000, () => 0.5);
    expect(a.score).toBe(b.score);
    expect(a.score).toBeGreaterThan(0);
    expect(a.score).toBeLessThanOrEqual(1);
    expect(a.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(['CLOSE_BY', 'COMMUNITY_RATING']));
  });

  it('labels Google rating explicitly when no community data exists', () => {
    const p = { ...place('g', km(3)), distanceMeters: 3000, google: { rating: 4.4, userRatingCount: 300, priceLevel: null, priceRange: null, mapsUri: null } };
    expect(surpriseScore(p, 5000, () => 0).reasons.map((r) => r.code)).toEqual(['GOOGLE_RATING']);
  });
});

describe('merging Google results with OpenStreetMap/community places', () => {
  const local = (id: string, name: string, dLngDeg: number): PlaceSummary =>
    place(id, dLngDeg, { placeId: `mam-${id}`, source: 'OSM', name, restaurantId: `00000000-0000-0000-0000-00000000000${id}` });

  it('normalizes Indonesian place-name prefixes', () => {
    expect(normalizeName('RM. Sederhana')).toBe('sederhana');
    expect(normalizeName('Warung Bu Tini')).toBe('bu tini');
    expect(normalizeName('Kopi Kenangan')).toBe('kopi kenangan');
  });

  it('returns local places unchanged when Google is not configured', () => {
    const l = [local('1', 'Bakso Pak Kumis', 0)];
    expect(mergeWithLocal([], l)).toEqual(l);
  });

  it('drops a local duplicate of a nearby Google place with the same name', () => {
    const g = [place('g', 0, { name: 'Rumah Makan Sederhana' })];
    const merged = mergeWithLocal(g, [local('1', 'RM Sederhana', 0.0002), local('2', 'Sate Khas Senayan', 0.0002)]);
    expect(merged.map((p) => p.name)).toEqual(['Rumah Makan Sederhana', 'Sate Khas Senayan']);
  });

  it('keeps same-name places that are far apart (different branches)', () => {
    const g = [place('g', 0, { name: 'Sederhana' })];
    expect(mergeWithLocal(g, [local('1', 'Sederhana', km(1))])).toHaveLength(2);
  });
});
