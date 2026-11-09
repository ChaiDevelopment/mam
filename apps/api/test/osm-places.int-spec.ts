import { resetEnvCache } from '../src/config/env';
import { TestCtx, ageUsers, auth, createTestApp, login, makeOsmPlace, resetDb, reviewBody } from './helpers';

describe('OpenStreetMap & community places (integration, no Google key)', () => {
  let ctx: TestCtx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx.app.close());
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
    resetEnvCache();
  });

  // Yogyakarta (Tugu)
  const center = { lat: -7.7829, lng: 110.367 };
  const east = (m: number) => ({ lat: center.lat, lng: center.lng + m / (111_320 * Math.cos((center.lat * Math.PI) / 180)) });

  it('discovers OSM places within the radius only, nearest first, labelled as OSM', async () => {
    const a = await makeOsmPlace(ctx.prisma, east(300).lat, east(300).lng, 'Gudeg Yu Djum', { categories: ['indonesian'], city: 'Yogyakarta' });
    const b = await makeOsmPlace(ctx.prisma, east(2500).lat, east(2500).lng, 'Kopi Klotok', { categories: ['coffee'] });
    await makeOsmPlace(ctx.prisma, east(5600).lat, east(5600).lng, 'Terlalu Jauh');

    const res = await ctx.http().get(`/api/v1/places/nearby?lat=${center.lat}&lng=${center.lng}`).expect(200);
    expect(res.body.providers).toEqual([{ provider: 'OSM', ok: true }]);
    expect(res.body.items.map((i: { placeId: string }) => i.placeId)).toEqual([a.placeId, b.placeId]);
    const first = res.body.items[0];
    expect(first).toMatchObject({ source: 'OSM', restaurantId: a.id, name: 'Gudeg Yu Djum', categories: ['indonesian'] });
    expect(first.local).toMatchObject({ city: 'Yogyakarta', attribution: '© OpenStreetMap contributors' });
    expect(first.local.osmUrl).toMatch(/^https:\/\/www\.openstreetmap\.org\/node\/\d+$/);
    expect(first.distanceMeters).toBeGreaterThan(280);
    expect(first.distanceMeters).toBeLessThan(320);
    expect(first.google.rating).toBeNull();

    const r1 = await ctx.http().get(`/api/v1/places/nearby?lat=${center.lat}&lng=${center.lng}&radius=1000`).expect(200);
    expect(r1.body.items).toHaveLength(1);
    const coffee = await ctx.http().get(`/api/v1/places/nearby?lat=${center.lat}&lng=${center.lng}&categories=coffee`).expect(200);
    expect(coffee.body.items.map((i: { name: string }) => i.name)).toEqual(['Kopi Klotok']);
  });

  it('reports the full count in the radius and pages with limit (places beyond the first page are not lost)', async () => {
    for (let i = 0; i < 12; i++) await makeOsmPlace(ctx.prisma, east(200 + i * 300).lat, east(200 + i * 300).lng, `Bakery ${i}`, { categories: ['bakery'] });
    const page1 = await ctx.http().get(`/api/v1/places/nearby?lat=${center.lat}&lng=${center.lng}&radius=5000&limit=5`).expect(200);
    expect(page1.body.items).toHaveLength(5);
    expect(page1.body.total).toBe(12);
    expect(page1.body.hasMore).toBe(true);
    expect(page1.body.items.map((i: { name: string }) => i.name)).toEqual(['Bakery 0', 'Bakery 1', 'Bakery 2', 'Bakery 3', 'Bakery 4']);
    const all = await ctx.http().get(`/api/v1/places/nearby?lat=${center.lat}&lng=${center.lng}&radius=5000&limit=100`).expect(200);
    expect(all.body.items).toHaveLength(12);
    expect(all.body.hasMore).toBe(false);
    const r2 = await ctx.http().get(`/api/v1/places/nearby?lat=${center.lat}&lng=${center.lng}&radius=2000&limit=100`).expect(200);
    expect(r2.body.total).toBe(6); // 200, 500, … 1700 m
    expect(r2.body.items.every((i: { distanceMeters: number }) => i.distanceMeters <= 2000)).toBe(true);
    await ctx.http().get(`/api/v1/places/nearby?lat=${center.lat}&lng=${center.lng}&limit=5000`).expect(400);
  });

  it('rating sorts bring reviewed places into the first page even when they are far', async () => {
    for (let i = 0; i < 6; i++) await makeOsmPlace(ctx.prisma, east(100 + i * 100).lat, east(100 + i * 100).lng, `Dekat ${i}`);
    const far = await makeOsmPlace(ctx.prisma, east(4500).lat, east(4500).lng, 'Jauh tapi diulas');
    const u = await login(ctx, 'rater@mam.local');
    await ageUsers(ctx.prisma);
    await ctx.http().post('/api/v1/reviews').set(auth(u.token)).send(reviewBody(far.id)).expect(201);
    const near = await ctx.http().get(`/api/v1/places/nearby?lat=${center.lat}&lng=${center.lng}&limit=3`).expect(200);
    expect(near.body.items.map((i: { name: string }) => i.name)).not.toContain('Jauh tapi diulas');
    const rated = await ctx.http().get(`/api/v1/places/nearby?lat=${center.lat}&lng=${center.lng}&limit=3&sort=COMMUNITY_RATING`).expect(200);
    expect(rated.body.items[0].name).toBe('Jauh tapi diulas');
  });

  it('shows the brand with its freely licensed logo and attribution', async () => {
    await ctx.prisma.brand.create({
      data: {
        wikidata: 'Q19726345',
        name: 'Holland Bakery',
        description: 'Jaringan toko roti lokal Indonesia.',
        logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/x/xx/Logo.svg',
        logoThumbUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/x/xx/Logo.svg/256px-Logo.svg.png',
        logoLicense: 'Public domain',
        logoAuthor: 'Holland Bakery',
        logoSourceUrl: 'https://commons.wikimedia.org/wiki/File:Logo.svg',
      },
    });
    const p = await makeOsmPlace(ctx.prisma, east(100).lat, east(100).lng, 'Holland Bakery Malioboro', { categories: ['bakery'] });
    await ctx.prisma.restaurant.update({ where: { id: p.id }, data: { brand: 'Holland Bakery', brandWikidata: 'Q19726345' } });
    const plain = await makeOsmPlace(ctx.prisma, east(200).lat, east(200).lng, 'Warung Biasa');

    const res = await ctx.http().get(`/api/v1/places/nearby?lat=${center.lat}&lng=${center.lng}&radius=1000`).expect(200);
    const [hb, other] = res.body.items;
    expect(hb.local.brand).toMatchObject({
      name: 'Holland Bakery',
      wikidata: 'Q19726345',
      description: 'Jaringan toko roti lokal Indonesia.',
      logo: { license: 'Public domain', author: 'Holland Bakery', thumbUrl: expect.stringMatching(/^https:\/\/thumb\.wikimedia\.org\//) },
      image: null,
    });
    expect(other.placeId).toBe(plain.placeId);
    expect(other.local.brand).toBeNull();
    const d = await ctx.http().get(`/api/v1/places/${p.placeId}`).expect(200);
    expect(d.body.place.local.brand.name).toBe('Holland Bakery');
  });

  it('serves detail and empty Google reviews for mam- keys, and finds places by name', async () => {
    const p = await makeOsmPlace(ctx.prisma, east(100).lat, east(100).lng, 'Bakmi Jawa Mbah Gito');
    const d = await ctx.http().get(`/api/v1/places/${p.placeId}`).expect(200);
    expect(d.body.provider).toMatchObject({ provider: 'OSM', ok: true });
    expect(d.body.place).toMatchObject({ placeId: p.placeId, source: 'OSM', name: 'Bakmi Jawa Mbah Gito', photos: [] });

    const ext = await ctx.http().get(`/api/v1/places/${p.placeId}/external-reviews`).expect(200);
    expect(ext.body.reviews).toEqual([]);
    expect(ext.body.googleMapsUri).toBeNull();

    const s = await ctx.http().get(`/api/v1/places/search?q=mbah%20gito&lat=${center.lat}&lng=${center.lng}`).expect(200);
    expect(s.body.items.map((i: { placeId: string }) => i.placeId)).toEqual([p.placeId]);
    // LIKE wildcards in user input are escaped
    const wild = await ctx.http().get(`/api/v1/places/search?q=%25%25&lat=${center.lat}&lng=${center.lng}`).expect(200);
    expect(wild.body.items).toEqual([]);

    await ctx.http().get('/api/v1/places/mam-00000000-0000-4000-8000-000000000000').expect(404);
  });

  it('suggests localities for manual location search and resolves their coordinates', async () => {
    await ctx.prisma.$executeRaw`INSERT INTO localities (id, osm_id, name, kind, population, location, updated_at)
      VALUES (gen_random_uuid(), 'node/1', 'Yogyakarta', 'city', 400000, ST_SetSRID(ST_MakePoint(110.3647, -7.8014), 4326)::geography, now()),
             (gen_random_uuid(), 'node/2', 'Yogyakarta Baru', 'village', NULL, ST_SetSRID(ST_MakePoint(110.1, -7.9), 4326)::geography, now())`;
    const res = await ctx.http().get('/api/v1/places/autocomplete?input=yogya&kind=geocode').expect(200);
    expect(res.body.provider).toMatchObject({ provider: 'OSM', ok: true });
    expect(res.body.suggestions[0]).toMatchObject({ text: 'Yogyakarta', secondaryText: 'Kota' });
    const loc = await ctx.http().get(`/api/v1/places/${res.body.suggestions[0].placeId}/location`).expect(200);
    expect(loc.body.location.lat).toBeCloseTo(-7.8014, 3);
    expect(loc.body.location.lng).toBeCloseTo(110.3647, 3);
  });

  it('lets a logged-in user add a missing place, rejects near-duplicates and invalid input', async () => {
    await ctx.http().post('/api/v1/places').send({ name: 'Anonim', lat: center.lat, lng: center.lng, categories: ['other'] }).expect(401);
    const u = await login(ctx, 'adder@mam.local');
    const body = { name: 'Angkringan Lik Man', lat: east(50).lat, lng: east(50).lng, categories: ['street-food'], address: 'Jl. Wongsodirjan', phone: '', website: '' };
    const created = await ctx.http().post('/api/v1/places').set(auth(u.token)).send(body).expect(201);
    expect(created.body).toMatchObject({ status: 'PENDING', name: 'Angkringan Lik Man', categories: ['street-food'], address: 'Jl. Wongsodirjan', phone: null, website: null });
    expect(created.body.placeId).toMatch(/^mam-/);

    // Same name 20 m away → duplicate of the pending submission.
    const dup = await ctx.http().post('/api/v1/places').set(auth(u.token)).send({ ...body, lng: east(70).lng }).expect(409);
    expect(dup.body.details).toMatchObject({ restaurantId: created.body.id, status: 'PENDING' });
    expect(dup.body.message).toMatch(/menunggu persetujuan/);
    // Same name 2 km away → a different branch, allowed.
    await ctx.http().post('/api/v1/places').set(auth(u.token)).send({ ...body, lng: east(2000).lng }).expect(201);

    await ctx.http().post('/api/v1/places').set(auth(u.token)).send({ ...body, name: 'Di luar Indonesia', lat: 13.75, lng: 100.5 }).expect(400);
    await ctx.http().post('/api/v1/places').set(auth(u.token)).send({ ...body, name: 'Tanpa kategori', categories: [] }).expect(400);
    await ctx.http().post('/api/v1/places').set(auth(u.token)).send({ ...body, name: 'Situs aneh', website: 'javascript:alert(1)' }).expect(400);

    // Pending submissions are not discoverable until a moderator approves them.
    const near = await ctx.http().get(`/api/v1/places/nearby?lat=${center.lat}&lng=${center.lng}&radius=1000`).expect(200);
    expect(near.body.items).toEqual([]);
    const mine = await ctx.http().get('/api/v1/places/submissions/mine').set(auth(u.token)).expect(200);
    expect(mine.body.map((m: { status: string }) => m.status)).toEqual(['PENDING', 'PENDING']);
  });

  it('OSM places can be reviewed, favorited and collected via their internal id', async () => {
    const p = await makeOsmPlace(ctx.prisma, east(200).lat, east(200).lng, 'Sate Klathak Pak Pong');
    const u = await login(ctx, 'reviewer@mam.local');
    await ageUsers(ctx.prisma);
    const rev = await ctx.http().post('/api/v1/reviews').set(auth(u.token)).send(reviewBody(p.id)).expect(201);
    expect(rev.body.restaurantId).toBe(p.id);
    expect(rev.body.placeKey).toBe(p.placeId); // links in feeds/profile must open the OSM place
    expect(rev.body.googlePlaceId).toBeNull();
    await ctx.http().post(`/api/v1/favorites/${p.id}`).set(auth(u.token)).expect((r) => expect([200, 201, 204]).toContain(r.status));
    // Clients that only know the place key may send it as googlePlaceId; it resolves to the same restaurant.
    const col = await ctx.http().post('/api/v1/collections').set(auth(u.token)).send({ name: 'Jogja', isPublic: false }).expect(201);
    await ctx.http().post(`/api/v1/collections/${col.body.id}/items`).set(auth(u.token)).send({ googlePlaceId: p.placeId }).expect(201);
    const favs = await ctx.http().get('/api/v1/favorites').set(auth(u.token)).expect(200);
    expect((favs.body.items ?? favs.body)[0].restaurant.placeKey).toBe(p.placeId);
    const items = await ctx.http().get(`/api/v1/collections/${col.body.id}`).set(auth(u.token)).expect(200);
    expect(JSON.stringify(items.body)).toContain(p.placeId);
    const view = await ctx.http().get(`/api/v1/restaurants/${p.id}`).expect(200);
    expect(view.body).toMatchObject({ source: 'OSM', nameSource: 'OSM', placeKey: p.placeId, name: 'Sate Klathak Pak Pong' });

    const near = await ctx.http().get(`/api/v1/places/nearby?lat=${center.lat}&lng=${center.lng}`).expect(200);
    expect(near.body.items[0].community.reviewCount).toBe(1);
  });

  it('keeps OSM coordinates out of the 30-day Google location purge', async () => {
    const p = await makeOsmPlace(ctx.prisma, east(10).lat, east(10).lng, 'Permanen');
    await ctx.prisma.$executeRaw`UPDATE restaurants SET location_cached_at = NULL WHERE id = ${p.id}::uuid`;
    const purged = await ctx.prisma.$executeRaw`
      UPDATE restaurants SET location = NULL, location_cached_at = NULL
       WHERE location_cached_at IS NOT NULL AND location_cached_at < now() - interval '30 days'`;
    expect(purged).toBe(0);
    await expect(
      ctx.prisma.$executeRaw`UPDATE restaurants SET location = NULL WHERE id = ${p.id}::uuid`,
    ).rejects.toThrow(/restaurants_local_has_location/);
  });
});
