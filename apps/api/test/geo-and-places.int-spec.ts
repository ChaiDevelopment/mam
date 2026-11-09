import { RestaurantsService } from '../src/modules/restaurants/restaurants.service';
import { resetEnvCache } from '../src/config/env';
import { TestCtx, createTestApp, makeRestaurant, resetDb } from './helpers';

describe('Geographic radius & Google discovery (integration)', () => {
  let ctx: TestCtx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx.app.close());
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
    resetEnvCache();
    jest.restoreAllMocks();
  });

  const center = { lat: -6.2, lng: 106.8 };
  const east = (m: number) => ({ lat: center.lat, lng: center.lng + m / (111_320 * Math.cos((center.lat * Math.PI) / 180)) });

  it('PostGIS radius query includes ≤ radius and excludes beyond, with accurate distance', async () => {
    const near = await makeRestaurant(ctx.prisma, east(900).lat, east(900).lng, 'Dekat');
    const edge = await makeRestaurant(ctx.prisma, east(4900).lat, east(4900).lng, 'Tepi');
    const far = await makeRestaurant(ctx.prisma, east(5200).lat, east(5200).lng, 'Jauh');
    const svc = ctx.app.get(RestaurantsService);
    const res = await svc.nearbyCommunity(center, 5000);
    const ids = res.map((r) => r.id);
    expect(ids).toEqual([near.id, edge.id]);
    expect(ids).not.toContain(far.id);
    expect(res[0].distanceMeters).toBeGreaterThan(880);
    expect(res[0].distanceMeters).toBeLessThan(920);
    expect((await svc.nearbyCommunity(center, 1000)).map((r) => r.id)).toEqual([near.id]);
  });

  it('without a Google key, nearby runs on OpenStreetMap/community data with no error notice', async () => {
    await makeRestaurant(ctx.prisma, east(500).lat, east(500).lng, 'Warung Komunitas');
    const res = await ctx.http().get(`/api/v1/places/nearby?lat=${center.lat}&lng=${center.lng}`).expect(200);
    expect(res.body.radiusMeters).toBe(5000);
    expect(res.body.providers).toEqual([{ provider: 'OSM', ok: true }]);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].google.rating).toBeNull();
  });

  it('with Google: normalizes results, keeps only places inside the radius, sorts by distance', async () => {
    process.env.GOOGLE_MAPS_SERVER_API_KEY = 'test-key';
    resetEnvCache();
    const mk = (id: string, m: number, extra: Record<string, unknown> = {}) => ({
      id,
      displayName: { text: `Tempat ${id}` },
      shortFormattedAddress: 'Jl. Contoh',
      location: { latitude: east(m).lat, longitude: east(m).lng },
      primaryType: 'indonesian_restaurant',
      types: ['indonesian_restaurant', 'restaurant'],
      rating: 4.5,
      userRatingCount: 120,
      currentOpeningHours: { openNow: true },
      googleMapsUri: `https://maps.google.com/?cid=${id}`,
      ...extra,
    });
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ places: [mk('placeFarAway01', 5600), mk('placeNear00001', 1200), mk('placeNearest01', 300)] }), { status: 200 }),
    );
    const res = await ctx.http().get(`/api/v1/places/nearby?lat=${center.lat}&lng=${center.lng}&radius=5000`).expect(200);
    expect(fetchSpy).toHaveBeenCalled();
    expect(res.body.providers[0].ok).toBe(true);
    expect(res.body.items.map((p: { placeId: string }) => p.placeId)).toEqual(['placeNearest01', 'placeNear00001']);
    expect(res.body.items[0].categories).toContain('indonesian');
    expect(res.body.items[0].google).toMatchObject({ rating: 4.5, userRatingCount: 120 });
    expect(res.body.items[0].community).toBeNull();
  });

  it('with Google failing, the app stays usable (fallback + explicit status)', async () => {
    process.env.GOOGLE_MAPS_SERVER_API_KEY = 'test-key';
    resetEnvCache();
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{"error":{"message":"boom"}}', { status: 500 }));
    const res = await ctx.http().get(`/api/v1/places/nearby?lat=${center.lat}&lng=${center.lng}`).expect(200);
    expect(res.body.providers[0]).toMatchObject({ ok: false, reason: 'UPSTREAM_ERROR' });
    const ext = await ctx.http().get('/api/v1/places/ChIJsomething123/external-reviews').expect(200);
    expect(ext.body.reviews).toEqual([]);
    expect(ext.body.provider.ok).toBe(false);
    expect(ext.body.googleMapsUri).toContain('query_place_id=ChIJsomething123');
  });

  it('external reviews: max 5, author attribution and Google Maps links preserved', async () => {
    process.env.GOOGLE_MAPS_SERVER_API_KEY = 'test-key';
    resetEnvCache();
    const reviews = Array.from({ length: 5 }, (_, i) => ({
      rating: 5 - (i % 2),
      text: { text: `Enak ${i}` },
      relativePublishTimeDescription: 'sebulan lalu',
      authorAttribution: { displayName: `Penulis ${i}`, uri: `https://www.google.com/maps/contrib/${i}` },
    }));
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'ChIJreviews0001', rating: 4.6, userRatingCount: 2310, reviews, googleMapsUri: 'https://maps.google.com/?cid=1', googleMapsLinks: { writeAReviewUri: 'https://search.google.com/local/writereview?placeid=ChIJreviews0001' } }), { status: 200 }),
    );
    const res = await ctx.http().get('/api/v1/places/ChIJreviews0001/external-reviews').expect(200);
    expect(res.body.reviews).toHaveLength(5);
    expect(res.body.totalOnGoogle).toBe(2310);
    expect(res.body.reviews[0].author.displayName).toBe('Penulis 0');
    expect(res.body.reviews[0].author.uri).toContain('google.com/maps/contrib');
    expect(res.body.writeReviewUri).toContain('writereview');
  });

  it('Surprise Me never returns a place outside the radius and explains the pick', async () => {
    process.env.GOOGLE_MAPS_SERVER_API_KEY = 'test-key';
    resetEnvCache();
    const p = (id: string, m: number) => ({
      id,
      displayName: { text: id },
      location: { latitude: east(m).lat, longitude: east(m).lng },
      types: ['restaurant'],
      rating: 4.8,
      userRatingCount: 900,
    });
    jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ places: [p('insideA000001', 1500), p('outside000001', 2600)] }), { status: 200 }));
    for (let i = 0; i < 10; i++) {
      const res = await ctx.http().get(`/api/v1/places/surprise?lat=${center.lat}&lng=${center.lng}&radius=2000`).expect(200);
      expect(res.body.pick.placeId).toBe('insideA000001');
      expect(res.body.pick.distanceMeters).toBeLessThanOrEqual(2000);
      expect(res.body.reasons.map((r: { code: string }) => r.code)).toEqual(expect.arrayContaining(['WITHIN_RADIUS', 'GOOGLE_RATING', 'RANDOMIZED']));
    }
  });

  it('rejects malformed place IDs and photo names (no SSRF / path tricks)', async () => {
    await ctx.http().get('/api/v1/places/..%2F..%2Fetc').expect(400);
    await ctx.http().get('/api/v1/places/photo?name=https://evil.example/x').expect(400);
  });
});
