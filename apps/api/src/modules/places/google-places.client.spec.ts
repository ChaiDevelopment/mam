import { resetEnvCache } from '../../config/env';
import { FIELD_MASKS, GooglePlacesClient, GooglePlacesError, normalizePriceRange, normalizeReviews } from './google-places.client';

const health = { record: jest.fn() } as never;

function setEnv(extra: Record<string, string | undefined>) {
  process.env.DATABASE_URL = 'postgresql://x@localhost/x';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(40);
  process.env.COOKIE_SECRET = 'b'.repeat(40);
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCache();
}

describe('GooglePlacesClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('field masks are explicit — never wildcards', () => {
    for (const mask of Object.values(FIELD_MASKS)) {
      expect(mask).not.toContain('*');
      expect(mask.length).toBeGreaterThan(0);
    }
    expect(FIELD_MASKS.nearby).toContain('places.id');
    expect(FIELD_MASKS.reviews).toContain('reviews');
  });

  it('reports NOT_CONFIGURED without calling Google when the key is missing', async () => {
    setEnv({ GOOGLE_MAPS_SERVER_API_KEY: undefined });
    const f = jest.spyOn(global, 'fetch');
    const c = new GooglePlacesClient(health);
    await expect(c.searchNearby({ center: { lat: 0, lng: 0 }, radiusMeters: 5000, includedTypes: ['restaurant'], rankBy: 'DISTANCE' })).rejects.toMatchObject({ reason: 'NOT_CONFIGURED' });
    expect(f).not.toHaveBeenCalled();
  });

  it('sends a circle restriction with the requested radius, the API key header and the field mask', async () => {
    setEnv({ GOOGLE_MAPS_SERVER_API_KEY: 'test-key' });
    const f = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ places: [] }), { status: 200 }));
    await new GooglePlacesClient(health).searchNearby({ center: { lat: -6.2, lng: 106.8 }, radiusMeters: 5000, includedTypes: ['restaurant'], rankBy: 'DISTANCE' });
    const [url, init] = f.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe('https://places.googleapis.com/v1/places:searchNearby');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Goog-Api-Key']).toBe('test-key');
    expect(headers['X-Goog-FieldMask']).toBe(FIELD_MASKS.nearby);
    const body = JSON.parse(String(init.body));
    expect(body.locationRestriction.circle).toEqual({ center: { latitude: -6.2, longitude: 106.8 }, radius: 5000 });
    expect(body.maxResultCount).toBe(20);
  });

  it('maps HTTP errors to typed reasons', async () => {
    setEnv({ GOOGLE_MAPS_SERVER_API_KEY: 'test-key' });
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{"error":{"message":"quota"}}', { status: 429 }));
    await expect(new GooglePlacesClient(health).details('ChIJxxxxxxxxxx')).rejects.toMatchObject({ reason: 'QUOTA_EXCEEDED' });
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 404 }));
    await expect(new GooglePlacesClient(health).details('ChIJxxxxxxxxxx')).rejects.toBeInstanceOf(GooglePlacesError);
  });

  it('normalizes at most five Google reviews and keeps author attribution', () => {
    const raw = {
      id: 'x',
      reviews: Array.from({ length: 7 }, (_, i) => ({
        rating: 4,
        text: { text: `review ${i}`, languageCode: 'id' },
        authorAttribution: { displayName: `Author ${i}`, uri: `https://maps.google.com/contrib/${i}`, photoUri: 'https://lh3.googleusercontent.com/a' },
        relativePublishTimeDescription: 'seminggu lalu',
      })),
    };
    const out = normalizeReviews(raw);
    expect(out).toHaveLength(5);
    expect(out[0].author).toEqual({ displayName: 'Author 0', uri: 'https://maps.google.com/contrib/0', photoUri: 'https://lh3.googleusercontent.com/a' });
  });

  it('normalizes price ranges without inventing values', () => {
    expect(normalizePriceRange(undefined)).toBeNull();
    expect(normalizePriceRange({ startPrice: { currencyCode: 'IDR', units: '20000' } })).toEqual({ min: 20000, max: null, currency: 'IDR' });
  });
});
