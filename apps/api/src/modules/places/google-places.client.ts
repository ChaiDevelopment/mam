import { Injectable } from '@nestjs/common';
import type { GoogleAttribution, GooglePhotoRef, GooglePriceLevel, GoogleReview, LatLng } from '@mam/shared-types';
import { env } from '../../config/env';
import { IntegrationHealthService } from '../integrations/integration-health.service';

const BASE = 'https://places.googleapis.com/v1';

/**
 * Explicit field masks (no wildcards). Each mask is the minimum needed by its screen.
 * Billing tier is determined by the most expensive field requested — keep these tight.
 */
export const FIELD_MASKS = {
  nearby: [
    'places.id',
    'places.displayName',
    'places.shortFormattedAddress',
    'places.location',
    'places.primaryType',
    'places.types',
    'places.rating',
    'places.userRatingCount',
    'places.priceLevel',
    'places.priceRange',
    'places.currentOpeningHours.openNow',
    'places.photos',
    'places.googleMapsUri',
  ].join(','),
  details: [
    'id',
    'displayName',
    'formattedAddress',
    'shortFormattedAddress',
    'location',
    'primaryType',
    'types',
    'rating',
    'userRatingCount',
    'priceLevel',
    'priceRange',
    'currentOpeningHours.openNow',
    'currentOpeningHours.weekdayDescriptions',
    'nationalPhoneNumber',
    'websiteUri',
    'googleMapsUri',
    'photos',
    'businessStatus',
  ].join(','),
  reviews: ['id', 'rating', 'userRatingCount', 'reviews', 'googleMapsUri', 'googleMapsLinks'].join(','),
  nameOnly: ['id', 'displayName'].join(','),
  locationOnly: ['id', 'location', 'displayName', 'formattedAddress'].join(','),
} as const;

/** Raw Places API (New) shapes — only the fields we request. */
export interface RawPlace {
  id: string;
  displayName?: { text: string; languageCode?: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude: number; longitude: number };
  primaryType?: string;
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  priceLevel?: GooglePriceLevel | 'PRICE_LEVEL_UNSPECIFIED';
  priceRange?: { startPrice?: { currencyCode: string; units?: string }; endPrice?: { currencyCode: string; units?: string } };
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  googleMapsLinks?: { writeAReviewUri?: string; reviewsUri?: string; placeUri?: string };
  businessStatus?: string;
  photos?: { name: string; widthPx: number; heightPx: number; authorAttributions?: RawAttribution[] }[];
  reviews?: {
    rating?: number;
    text?: { text: string; languageCode?: string };
    originalText?: { text: string; languageCode?: string };
    relativePublishTimeDescription?: string;
    publishTime?: string;
    authorAttribution?: RawAttribution;
    googleMapsUri?: string;
  }[];
}
interface RawAttribution {
  displayName?: string;
  uri?: string;
  photoUri?: string;
}

export class GooglePlacesError extends Error {
  constructor(
    public readonly reason: 'NOT_CONFIGURED' | 'UPSTREAM_ERROR' | 'TIMEOUT' | 'QUOTA_EXCEEDED' | 'NOT_FOUND' | 'INVALID_REQUEST',
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

@Injectable()
export class GooglePlacesClient {
  constructor(private readonly health: IntegrationHealthService) {}

  isConfigured() {
    return !!env().GOOGLE_MAPS_SERVER_API_KEY;
  }

  private async call<T>(method: 'GET' | 'POST', path: string, fieldMask: string | null, body?: unknown, query?: Record<string, string>): Promise<T> {
    const key = env().GOOGLE_MAPS_SERVER_API_KEY;
    if (!key) throw new GooglePlacesError('NOT_CONFIGURED', 'GOOGLE_MAPS_SERVER_API_KEY is not configured');
    const url = new URL(`${BASE}/${path}`);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), env().GOOGLE_PLACES_TIMEOUT_MS);
    const started = Date.now();
    try {
      const res = await fetch(url, {
        method,
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          ...(fieldMask ? { 'X-Goog-FieldMask': fieldMask } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const latency = Date.now() - started;
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const msg = (() => {
          try {
            return (JSON.parse(text) as { error?: { message?: string; status?: string } }).error?.message ?? text;
          } catch {
            return text;
          }
        })().slice(0, 300);
        if (res.status === 404) {
          this.health.record('GOOGLE', true, latency);
          throw new GooglePlacesError('NOT_FOUND', 'Tempat tidak ditemukan di Google Maps', 404);
        }
        if (res.status === 400) {
          this.health.record('GOOGLE', false, latency, `400 ${msg}`);
          throw new GooglePlacesError('INVALID_REQUEST', msg, 400);
        }
        const reason = res.status === 429 ? 'QUOTA_EXCEEDED' : 'UPSTREAM_ERROR';
        this.health.record('GOOGLE', false, latency, `${res.status} ${msg}`);
        throw new GooglePlacesError(reason, msg, res.status);
      }
      this.health.record('GOOGLE', true, latency);
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof GooglePlacesError) throw e;
      const aborted = (e as Error).name === 'AbortError';
      this.health.record('GOOGLE', false, Date.now() - started, aborted ? 'timeout' : (e as Error).message);
      throw new GooglePlacesError(aborted ? 'TIMEOUT' : 'UPSTREAM_ERROR', aborted ? 'Google Places timeout' : (e as Error).message);
    } finally {
      clearTimeout(timer);
    }
  }

  async searchNearby(params: { center: LatLng; radiusMeters: number; includedTypes: string[]; rankBy: 'DISTANCE' | 'POPULARITY' }): Promise<RawPlace[]> {
    const r = await this.call<{ places?: RawPlace[] }>('POST', 'places:searchNearby', FIELD_MASKS.nearby, {
      includedTypes: params.includedTypes,
      maxResultCount: 20,
      rankPreference: params.rankBy,
      languageCode: env().GOOGLE_PLACES_LANGUAGE,
      regionCode: env().GOOGLE_PLACES_REGION,
      locationRestriction: {
        circle: { center: { latitude: params.center.lat, longitude: params.center.lng }, radius: params.radiusMeters },
      },
    });
    return r.places ?? [];
  }

  async searchText(params: { query: string; center?: LatLng; radiusMeters: number }): Promise<RawPlace[]> {
    const r = await this.call<{ places?: RawPlace[] }>('POST', 'places:searchText', FIELD_MASKS.nearby, {
      textQuery: params.query,
      pageSize: 20,
      languageCode: env().GOOGLE_PLACES_LANGUAGE,
      regionCode: env().GOOGLE_PLACES_REGION,
      ...(params.center
        ? { locationBias: { circle: { center: { latitude: params.center.lat, longitude: params.center.lng }, radius: params.radiusMeters } } }
        : {}),
    });
    return r.places ?? [];
  }

  async autocomplete(params: { input: string; center?: LatLng; sessionToken?: string; kind: 'food' | 'geocode' }) {
    const r = await this.call<{
      suggestions?: { placePrediction?: { placeId: string; text?: { text: string }; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } }[];
    }>('POST', 'places:autocomplete', null, {
      input: params.input,
      languageCode: env().GOOGLE_PLACES_LANGUAGE,
      includedRegionCodes: [env().GOOGLE_PLACES_REGION.toLowerCase()],
      sessionToken: params.sessionToken,
      ...(params.kind === 'food' ? { includedPrimaryTypes: ['restaurant', 'cafe', 'bakery', 'meal_takeaway', 'food'] } : {}),
      ...(params.center
        ? { locationBias: { circle: { center: { latitude: params.center.lat, longitude: params.center.lng }, radius: 20000 } } }
        : {}),
    });
    return (r.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
      .map((p) => ({
        placeId: p.placeId,
        text: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
        secondaryText: p.structuredFormat?.secondaryText?.text ?? null,
      }));
  }

  details(placeId: string, mask: string = FIELD_MASKS.details, sessionToken?: string): Promise<RawPlace> {
    return this.call<RawPlace>('GET', `places/${encodeURIComponent(placeId)}`, mask, undefined, {
      languageCode: env().GOOGLE_PLACES_LANGUAGE,
      regionCode: env().GOOGLE_PLACES_REGION,
      ...(sessionToken ? { sessionToken } : {}),
    });
  }

  /** Resolves a short-lived photo URL. The image itself is served by Google and never stored by MAM!. */
  async photoUri(photoName: string, maxWidthPx: number): Promise<string> {
    const r = await this.call<{ photoUri: string }>('GET', `${photoName}/media`, null, undefined, {
      maxWidthPx: String(maxWidthPx),
      skipHttpRedirect: 'true',
    });
    return r.photoUri;
  }
}

// ───────────── Normalization helpers ─────────────
export function attribution(a?: RawAttribution): GoogleAttribution {
  return { displayName: a?.displayName ?? 'Pengguna Google', uri: a?.uri, photoUri: a?.photoUri };
}

export function normalizePhoto(p: NonNullable<RawPlace['photos']>[number]): GooglePhotoRef {
  return { name: p.name, widthPx: p.widthPx, heightPx: p.heightPx, authorAttributions: (p.authorAttributions ?? []).map(attribution) };
}

export function normalizePriceLevel(p: RawPlace['priceLevel']): GooglePriceLevel | null {
  return !p || p === 'PRICE_LEVEL_UNSPECIFIED' ? null : p;
}

export function normalizePriceRange(p: RawPlace['priceRange']) {
  if (!p?.startPrice && !p?.endPrice) return null;
  const currency = p.startPrice?.currencyCode ?? p.endPrice?.currencyCode ?? 'IDR';
  return {
    min: p.startPrice?.units ? Number(p.startPrice.units) : null,
    max: p.endPrice?.units ? Number(p.endPrice.units) : null,
    currency,
  };
}

export function normalizeReviews(raw: RawPlace): GoogleReview[] {
  return (raw.reviews ?? []).slice(0, 5).map((r) => ({
    rating: r.rating ?? null,
    text: r.text?.text ?? r.originalText?.text ?? null,
    originalLanguage: r.originalText?.languageCode ?? r.text?.languageCode ?? null,
    relativePublishTime: r.relativePublishTimeDescription ?? null,
    publishTime: r.publishTime ?? null,
    author: attribution(r.authorAttribution),
    googleMapsUri: r.googleMapsUri ?? null,
  }));
}
