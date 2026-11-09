import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type {
  CategorySlug,
  ExternalReviewsResponse,
  LatLng,
  NearbyResponse,
  PlaceDetail,
  PlaceSummary,
  ProviderStatus,
  SurpriseResponse,
} from '@mam/shared-types';
import type { CreatePlaceInput, NearbyQuery, SurpriseQuery } from '@mam/validation';
import { haversineMeters } from '../../common/geo';
import { CategoriesService } from '../categories/categories.service';
import { BASE_FOOD_TYPES, TEXT_QUERY_FALLBACK, categoriesFromTypes } from '../categories/category-mapping';
import { LOCALITY_PREFIX, parseLocalPlaceKey } from '@mam/shared-types';
import { CommunityStatsService } from '../restaurants/community-stats.service';
import { LocalPlacesService } from '../restaurants/local-places.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { applyFilters, mergeWithLocal, sortPlaces, surpriseScore } from './discovery';
import {
  FIELD_MASKS,
  GooglePlacesClient,
  GooglePlacesError,
  type RawPlace,
  normalizePhoto,
  normalizePriceLevel,
  normalizePriceRange,
  normalizeReviews,
} from './google-places.client';

const ok: ProviderStatus = { provider: 'GOOGLE', ok: true };
const osmOk: ProviderStatus = { provider: 'OSM', ok: true };

function providerError(e: unknown): ProviderStatus {
  if (e instanceof GooglePlacesError) {
    const reason = e.reason === 'NOT_FOUND' || e.reason === 'INVALID_REQUEST' ? 'UPSTREAM_ERROR' : e.reason;
    const message =
      reason === 'NOT_CONFIGURED'
        ? 'Integrasi Google Maps belum dikonfigurasi. Menampilkan data komunitas MAM! saja.'
        : reason === 'TIMEOUT'
          ? 'Google Maps lambat merespons. Menampilkan data komunitas MAM! saja.'
          : reason === 'QUOTA_EXCEEDED'
            ? 'Kuota Google Maps habis untuk sementara. Menampilkan data komunitas MAM! saja.'
            : 'Google Maps sedang bermasalah. Menampilkan data komunitas MAM! saja.';
    return { provider: 'GOOGLE', ok: false, reason, message };
  }
  return { provider: 'GOOGLE', ok: false, reason: 'UPSTREAM_ERROR', message: 'Google Maps sedang bermasalah.' };
}

@Injectable()
export class PlacesService {
  private readonly logger = new Logger('Places');

  constructor(
    private readonly google: GooglePlacesClient,
    private readonly categories: CategoriesService,
    private readonly restaurants: RestaurantsService,
    private readonly stats: CommunityStatsService,
    private readonly local: LocalPlacesService,
  ) {}

  private async normalize(raw: RawPlace[], center: LatLng | null): Promise<PlaceSummary[]> {
    const defs = await this.categories.all();
    const valid = raw.filter((p) => p.id && p.location && p.displayName?.text);
    const idMap = await this.restaurants.idsForPlaceIds(valid.map((p) => p.id));
    const statsMap = await this.stats.forMany([...idMap.values()]);
    const items = valid.map<PlaceSummary>((p) => {
      const location = { lat: p.location!.latitude, lng: p.location!.longitude };
      const restaurantId = idMap.get(p.id) ?? null;
      const s = restaurantId ? statsMap.get(restaurantId) : undefined;
      return {
        placeId: p.id,
        source: 'GOOGLE' as const,
        local: null,
        restaurantId,
        name: p.displayName!.text,
        address: p.shortFormattedAddress ?? p.formattedAddress ?? null,
        location,
        distanceMeters: null,
        primaryType: p.primaryType ?? null,
        categories: categoriesFromTypes(p.types, defs),
        openNow: p.currentOpeningHours?.openNow ?? null,
        photo: p.photos?.[0] ? normalizePhoto(p.photos[0]) : null,
        google: {
          rating: p.rating ?? null,
          userRatingCount: p.userRatingCount ?? null,
          priceLevel: normalizePriceLevel(p.priceLevel),
          priceRange: normalizePriceRange(p.priceRange),
          mapsUri: p.googleMapsUri ?? null,
        },
        community: s && s.reviewCount > 0 ? { reviewCount: s.reviewCount, averageOverall: s.averageOverall, medianPricePaid: s.medianPricePaid, lastReviewedAt: s.lastReviewedAt } : null,
      };
    });
    if (center) {
      for (const it of items) it.distanceMeters = Math.round(haversineMeters(center, it.location));
    }
    // Keep the ≤30-day coordinate cache fresh for referenced restaurants (Google ToS-permitted).
    void this.restaurants.refreshLocations(items.filter((i) => i.restaurantId).map((i) => ({ restaurantId: i.restaurantId!, location: i.location })));
    return items;
  }

  private async includedTypes(categories?: CategorySlug[]): Promise<{ types: string[]; textQueries: string[] }> {
    if (!categories?.length) return { types: BASE_FOOD_TYPES, textQueries: [] };
    const defs = await this.categories.active();
    const types = new Set<string>();
    const textQueries: string[] = [];
    for (const slug of categories) {
      const def = defs.find((d) => d.slug === slug);
      def?.googleTypes.forEach((t) => types.add(t));
      if (!def?.googleTypes.length && TEXT_QUERY_FALLBACK[slug]) textQueries.push(TEXT_QUERY_FALLBACK[slug]!);
    }
    if (!types.size && !textQueries.length) return { types: BASE_FOOD_TYPES, textQueries: [] };
    return { types: [...types].slice(0, 50), textQueries };
  }

  /** Fetches Google candidates for discovery. Text-query categories are searched in parallel. */
  private async fetchCandidates(center: LatLng, radius: number, categories: CategorySlug[] | undefined, rankBy: 'DISTANCE' | 'POPULARITY'): Promise<RawPlace[]> {
    const { types, textQueries } = await this.includedTypes(categories);
    const calls: Promise<RawPlace[]>[] = [];
    if (types.length) calls.push(this.google.searchNearby({ center, radiusMeters: radius, includedTypes: types, rankBy }));
    for (const q of textQueries) calls.push(this.google.searchText({ query: q, center, radiusMeters: radius }));
    const results = await Promise.all(calls);
    const seen = new Set<string>();
    return results.flat().filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }

  /** Community-only results used when Google is unavailable (keeps the app usable). */
  private async communityFallback(center: LatLng, radius: number): Promise<PlaceSummary[]> {
    const near = await this.restaurants.nearbyCommunity(center, radius, 40);
    if (!near.length) return [];
    const rows = await this.restaurants.loadMany(near.map((n) => n.id));
    const views = await this.restaurants.toViews(rows, { liveName: false });
    const dist = new Map(near.map((n) => [n.id, n.distanceMeters]));
    return views
      .filter((v) => v.location && v.googlePlaceId && v.source === 'GOOGLE')
      .map((v) => ({
        placeId: v.googlePlaceId!,
        source: 'GOOGLE' as const,
        local: null,
        restaurantId: v.id,
        name: v.name ?? 'Nama tidak tersedia saat ini',
        address: null,
        location: v.location!,
        distanceMeters: Math.round(dist.get(v.id) ?? 0),
        primaryType: null,
        categories: v.categories,
        openNow: null,
        photo: null,
        google: { rating: null, userRatingCount: null, priceLevel: null, priceRange: null, mapsUri: `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(v.googlePlaceId!)}` },
        community: v.stats.reviewCount ? { reviewCount: v.stats.reviewCount, averageOverall: v.stats.averageOverall, medianPricePaid: v.stats.medianPricePaid, lastReviewedAt: v.stats.lastReviewedAt } : null,
      }));
  }

  /**
   * Discovery = places stored in MAM! (OpenStreetMap + community, always available) merged with live Google results
   * when a Google key is configured. Without a key the app runs fully on OSM/community data, with no error notice.
   */
  async nearby(q: NearbyQuery): Promise<NearbyResponse> {
    const center = { lat: q.lat, lng: q.lng };
    let osmStatus: ProviderStatus = osmOk;
    const limit = q.limit ?? 100;
    const localP = this.local
      .nearby(center, q.radius, { categories: q.categories, limit, reviewedFirst: q.sort !== 'NEAREST' })
      .catch((e) => {
        this.logger.warn(`local places failed: ${(e as Error).message}`);
        osmStatus = { provider: 'OSM', ok: false, reason: 'UPSTREAM_ERROR', message: 'Data tempat MAM! sedang tidak dapat dimuat.' };
        return { items: [] as PlaceSummary[], total: 0 };
      });
    const providers: ProviderStatus[] = [];
    let googleItems: PlaceSummary[] = [];
    if (this.google.isConfigured()) {
      try {
        const raw = await this.fetchCandidates(center, q.radius, q.categories, q.sort === 'NEAREST' ? 'DISTANCE' : 'POPULARITY');
        googleItems = await this.normalize(raw, center);
        providers.push(ok);
      } catch (e) {
        providers.push(providerError(e));
        googleItems = await this.communityFallback(center, q.radius);
      }
    } else {
      // Google-referenced restaurants the community already reviewed (≤30-day cached coordinates) stay discoverable.
      googleItems = await this.communityFallback(center, q.radius);
    }
    const local = await localP;
    const merged = mergeWithLocal(googleItems, local.items);
    providers.push(osmStatus);
    const filtered = applyFilters(merged, { center, radiusMeters: q.radius, categories: q.categories, budget: q.budget, minCommunityRating: q.minRating, openNow: q.openNow });
    const sorted = sortPlaces(filtered.items, q.sort).slice(0, limit);
    const localMore = local.total > local.items.length;
    // Post-filters (budget/rating/open) depend on community/Google data, so their total is what we could verify.
    const postFiltered = !!(q.budget || q.minRating !== undefined || q.openNow);
    // When everything in the radius was fetched, count what is actually shown (identical radius check); otherwise use
    // the database count for the whole radius.
    const total = postFiltered || !localMore ? filtered.items.length : Math.max(sorted.length, local.total + (merged.length - local.items.length));
    return {
      center,
      radiusMeters: q.radius,
      items: sorted,
      total,
      hasMore: localMore || filtered.items.length > sorted.length,
      providers,
      excludedForMissingData: filtered.excludedForMissingData,
    };
  }

  submitPlace(input: CreatePlaceInput, user: { id: string; role: string }) {
    return this.local.submit(input, user);
  }

  mySubmissions(userId: string) {
    return this.local.submissions({ userId, pageSize: 50 });
  }

  async textSearch(query: string, center: LatLng | undefined, radius: number) {
    const localItems = await this.local.search(query, center ?? null, radius);
    if (!this.google.isConfigured()) return { items: localItems, providers: [osmOk] };
    try {
      const raw = await this.google.searchText({ query, center, radiusMeters: radius });
      const items = mergeWithLocal(await this.normalize(raw, center ?? null), localItems);
      return { items: center ? sortPlaces(items, 'NEAREST') : items, providers: [osmOk, ok] };
    } catch (e) {
      return { items: localItems, providers: [osmOk, providerError(e)] };
    }
  }

  async autocomplete(input: string, center: LatLng | undefined, sessionToken: string | undefined, kind: 'food' | 'geocode') {
    const local = kind === 'geocode' ? await this.local.suggestLocalities(input, center ?? null) : await this.local.suggestFood(input, center ?? null);
    if (!this.google.isConfigured()) return { suggestions: local, provider: osmOk };
    try {
      const g = await this.google.autocomplete({ input, center, sessionToken, kind });
      return { suggestions: [...g, ...local].slice(0, 10), provider: ok };
    } catch (e) {
      return { suggestions: local, provider: providerError(e) };
    }
  }

  /** Coordinates for manual location selection (from an autocomplete suggestion). */
  async placeLocation(placeId: string) {
    if (placeId.startsWith(LOCALITY_PREFIX)) return this.local.localityLocation(placeId.slice(LOCALITY_PREFIX.length));
    const localId = parseLocalPlaceKey(placeId);
    if (localId) {
      const p = await this.local.detail(localId, null);
      return { location: p.location, label: p.name };
    }
    try {
      const p = await this.google.details(placeId, FIELD_MASKS.locationOnly);
      if (!p.location) throw new NotFoundException('Lokasi tidak ditemukan.');
      return { location: { lat: p.location.latitude, lng: p.location.longitude }, label: p.displayName?.text ?? p.formattedAddress ?? '' };
    } catch (e) {
      if (e instanceof GooglePlacesError && e.reason === 'NOT_FOUND') throw new NotFoundException('Lokasi tidak ditemukan.');
      if (e instanceof GooglePlacesError) throw new ServiceUnavailableException(providerError(e).message);
      throw e;
    }
  }

  async detail(placeId: string, center: LatLng | null): Promise<{ place: PlaceDetail; provider: ProviderStatus }> {
    const localId = parseLocalPlaceKey(placeId);
    if (localId) return { place: await this.local.detail(localId, center), provider: osmOk };
    let raw: RawPlace;
    try {
      raw = await this.google.details(placeId);
    } catch (e) {
      if (e instanceof GooglePlacesError && (e.reason === 'NOT_FOUND' || e.reason === 'INVALID_REQUEST')) throw new NotFoundException('Tempat tidak ditemukan di Google Maps.');
      // Degrade: show what MAM! knows about the place.
      const idMap = await this.restaurants.idsForPlaceIds([placeId]);
      const rid = idMap.get(placeId);
      if (!rid) throw new ServiceUnavailableException(providerError(e).message);
      const v = await this.restaurants.view(rid, { liveName: false });
      return {
        provider: providerError(e),
        place: {
          placeId,
          source: 'GOOGLE',
          local: null,
          restaurantId: rid,
          name: v.name ?? 'Nama tidak tersedia saat ini',
          address: null,
          location: v.location ?? { lat: 0, lng: 0 },
          distanceMeters: null,
          primaryType: null,
          categories: v.categories,
          openNow: null,
          photo: null,
          google: { rating: null, userRatingCount: null, priceLevel: null, priceRange: null, mapsUri: `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(placeId)}` },
          community: v.stats.reviewCount ? { reviewCount: v.stats.reviewCount, averageOverall: v.stats.averageOverall, medianPricePaid: v.stats.medianPricePaid, lastReviewedAt: v.stats.lastReviewedAt } : null,
          phone: null,
          website: null,
          openingHours: null,
          photos: [],
          businessStatus: null,
        },
      };
    }
    const [summary] = await this.normalize([raw], center);
    if (!summary) throw new NotFoundException('Tempat tidak ditemukan.');
    return {
      provider: ok,
      place: {
        ...summary,
        address: raw.formattedAddress ?? summary.address,
        phone: raw.nationalPhoneNumber ?? null,
        website: raw.websiteUri ?? null,
        openingHours: raw.currentOpeningHours?.weekdayDescriptions ?? null,
        photos: (raw.photos ?? []).slice(0, 10).map(normalizePhoto),
        businessStatus: raw.businessStatus ?? null,
      },
    };
  }

  /** Google returns at most 5 reviews per place. We say so explicitly and link to Google Maps for the rest. */
  async externalReviews(placeId: string): Promise<ExternalReviewsResponse> {
    if (parseLocalPlaceKey(placeId)) {
      // OSM and community places have no Google reviews; only MAM! community reviews exist for them.
      return { placeId, reviews: [], totalOnGoogle: null, googleMapsUri: null, writeReviewUri: null, provider: { ...osmOk, message: 'Ulasan Google tidak tersedia untuk tempat dari OpenStreetMap/komunitas MAM!.' } };
    }
    try {
      const raw = await this.google.details(placeId, FIELD_MASKS.reviews);
      return {
        placeId,
        reviews: normalizeReviews(raw),
        totalOnGoogle: raw.userRatingCount ?? null,
        googleMapsUri: raw.googleMapsLinks?.reviewsUri ?? raw.googleMapsUri ?? null,
        writeReviewUri: raw.googleMapsLinks?.writeAReviewUri ?? null,
        provider: ok,
      };
    } catch (e) {
      if (e instanceof GooglePlacesError && e.reason === 'NOT_FOUND') throw new NotFoundException('Tempat tidak ditemukan di Google Maps.');
      return {
        placeId,
        reviews: [],
        totalOnGoogle: null,
        googleMapsUri: `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(placeId)}`,
        writeReviewUri: null,
        provider: providerError(e),
      };
    }
  }

  async photoUri(name: string, maxWidth: number): Promise<string> {
    try {
      return await this.google.photoUri(name, maxWidth);
    } catch (e) {
      if (e instanceof GooglePlacesError && e.reason === 'NOT_FOUND') throw new NotFoundException('Foto tidak ditemukan.');
      throw new ServiceUnavailableException('Foto Google tidak dapat dimuat saat ini.');
    }
  }

  async surprise(q: SurpriseQuery): Promise<SurpriseResponse> {
    // Surprise draws from (up to) 1000 candidates across the whole radius, not just the nearest page.
    const nearby = await this.nearby({ lat: q.lat, lng: q.lng, radius: q.radius, categories: q.categories, budget: q.budget, minRating: q.minCommunityRating, openNow: q.openNow, sort: 'NEAREST', limit: 1000 });
    const exclude = new Set(q.excludePlaceIds ?? []);
    const candidates = nearby.items.filter((p) => !exclude.has(p.placeId) && p.distanceMeters !== null && p.distanceMeters <= q.radius);
    if (!candidates.length) return { pick: null, score: null, reasons: [], candidatesConsidered: 0, providers: nearby.providers };
    const scored = candidates.map((p) => ({ p, ...surpriseScore(p, q.radius) })).sort((a, b) => b.score - a.score);
    const best = scored[0];
    const reasons = [
      { code: 'WITHIN_RADIUS' as const, text: `Masih dalam radius ${q.radius / 1000} km yang kamu pilih.` },
      ...(q.categories?.length && best.p.categories.some((c) => q.categories!.includes(c)) ? [{ code: 'CATEGORY_MATCH' as const, text: 'Sesuai kategori pilihanmu.' }] : []),
      ...(q.budget ? [{ code: 'BUDGET_MATCH' as const, text: best.p.community?.medianPricePaid ? 'Harga yang dilaporkan komunitas sesuai budget kamu.' : 'Rentang harga di Google Maps sesuai budget kamu.' }] : []),
      ...(q.openNow && best.p.openNow ? [{ code: 'OPEN_NOW' as const, text: 'Menurut Google Maps, tempat ini sedang buka.' }] : []),
      ...best.reasons,
      { code: 'RANDOMIZED' as const, text: `Dipilih acak dari ${candidates.length} kandidat terbaik di sekitarmu.` },
    ];
    return { pick: best.p, score: best.score, reasons, candidatesConsidered: candidates.length, providers: nearby.providers };
  }
}
