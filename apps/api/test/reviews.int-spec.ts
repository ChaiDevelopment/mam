import { Prisma } from '@prisma/client';
import { TestCtx, ageUsers, auth, createTestApp, login, makeRestaurant, resetDb, reviewBody } from './helpers';

describe('Reviews (integration)', () => {
  let ctx: TestCtx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx.app.close());
  beforeEach(async () => resetDb(ctx.prisma));

  async function setup() {
    const u = await login(ctx, `rev${Date.now()}@mam.test`);
    await ageUsers(ctx.prisma);
    const r = await makeRestaurant(ctx.prisma);
    return { u, r };
  }

  it('anonymous users cannot submit reviews', async () => {
    const r = await makeRestaurant(ctx.prisma);
    await ctx.http().post('/api/v1/reviews').send(reviewBody(r.id)).expect(401);
  });

  it('creates a review with overall = mean of the five dimensions', async () => {
    const { u, r } = await setup();
    const res = await ctx.http().post('/api/v1/reviews').set(auth(u.token)).send(reviewBody(r.id)).expect(201);
    expect(res.body.ratings.overall).toBe(4);
    expect(res.body.status).toBe('PUBLISHED');
    expect(res.body.currency).toBe('IDR');
  });

  it('prevents duplicate reviews for the same restaurant (API → 409)', async () => {
    const { u, r } = await setup();
    const first = await ctx.http().post('/api/v1/reviews').set(auth(u.token)).send(reviewBody(r.id)).expect(201);
    const dup = await ctx.http().post('/api/v1/reviews').set(auth(u.token)).send(reviewBody(r.id, { text: 'Ulasan kedua yang berbeda dan cukup panjang sekali.' })).expect(409);
    expect(dup.body.details.existingReviewId).toBe(first.body.id);
    expect(await ctx.prisma.review.count({ where: { restaurantId: r.id } })).toBe(1);
  });

  it('enforces the (user_id, restaurant_id) uniqueness at the database level', async () => {
    const { u, r } = await setup();
    const data = {
      userId: u.userId,
      restaurantId: r.id,
      tasteRating: 4,
      priceRating: 4,
      portionRating: 4,
      cleanliness: undefined,
      cleanlinessRating: 4,
      serviceRating: 4,
      overallRating: new Prisma.Decimal(4),
      reviewText: 'langsung ke database',
      visitType: 'DINE_IN' as const,
    };
    delete (data as Record<string, unknown>).cleanliness;
    await ctx.prisma.review.create({ data });
    await expect(ctx.prisma.review.create({ data })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('database CHECK constraints reject invalid ratings and inconsistent overall values', async () => {
    const { u, r } = await setup();
    await expect(
      ctx.prisma.$executeRaw`INSERT INTO reviews (id, user_id, restaurant_id, taste_rating, price_rating, portion_rating, cleanliness_rating, service_rating, overall_rating, review_text, visit_type, updated_at)
        VALUES (gen_random_uuid(), ${u.userId}::uuid, ${r.id}::uuid, 6, 4, 4, 4, 4, 4.4, 'x', 'DINE_IN', now())`,
    ).rejects.toThrow(/reviews_taste_rating_range/);
    await expect(
      ctx.prisma.$executeRaw`INSERT INTO reviews (id, user_id, restaurant_id, taste_rating, price_rating, portion_rating, cleanliness_rating, service_rating, overall_rating, review_text, visit_type, updated_at)
        VALUES (gen_random_uuid(), ${u.userId}::uuid, ${r.id}::uuid, 5, 5, 5, 5, 5, 3.00, 'x', 'DINE_IN', now())`,
    ).rejects.toThrow(/reviews_overall_is_mean/);
  });

  it('editing updates the same record and records a revision', async () => {
    const { u, r } = await setup();
    const c = await ctx.http().post('/api/v1/reviews').set(auth(u.token)).send(reviewBody(r.id)).expect(201);
    const e = await ctx.http()
      .patch(`/api/v1/reviews/${c.body.id}`)
      .set(auth(u.token))
      .send({ ratings: { taste: 5, price: 5, portion: 5, cleanliness: 4, service: 5 }, text: 'Setelah kunjungan kedua, ternyata makin enak dan bersih.' })
      .expect(200);
    expect(e.body.id).toBe(c.body.id);
    expect(e.body.ratings.overall).toBe(4.8);
    expect(e.body.edited).toBe(true);
    expect(await ctx.prisma.review.count({ where: { userId: u.userId } })).toBe(1);
    expect(await ctx.prisma.reviewRevision.count({ where: { reviewId: c.body.id, reason: 'AUTHOR_EDIT' } })).toBe(1);
  });

  it('only the author can edit or delete', async () => {
    const { u, r } = await setup();
    const other = await login(ctx, 'other@mam.test');
    const c = await ctx.http().post('/api/v1/reviews').set(auth(u.token)).send(reviewBody(r.id)).expect(201);
    await ctx.http().patch(`/api/v1/reviews/${c.body.id}`).set(auth(other.token)).send({ text: 'Saya mencoba mengubah ulasan orang lain.' }).expect(403);
    await ctx.http().delete(`/api/v1/reviews/${c.body.id}`).set(auth(other.token)).expect(403);
  });

  it('delete is soft; re-creating revives the same row (no duplicate active reviews)', async () => {
    const { u, r } = await setup();
    const c = await ctx.http().post('/api/v1/reviews').set(auth(u.token)).send(reviewBody(r.id)).expect(201);
    await ctx.http().delete(`/api/v1/reviews/${c.body.id}`).set(auth(u.token)).expect(204);
    await ctx.http().get(`/api/v1/reviews/${c.body.id}`).expect(404);
    const row = await ctx.prisma.review.findUniqueOrThrow({ where: { id: c.body.id } });
    expect(row.status).toBe('DELETED');
    expect(row.deletedAt).not.toBeNull();
    const again = await ctx.http().post('/api/v1/reviews').set(auth(u.token)).send(reviewBody(r.id)).expect(201);
    expect(again.body.id).toBe(c.body.id);
    expect(await ctx.prisma.review.count({ where: { userId: u.userId, restaurantId: r.id } })).toBe(1);
  });

  it('a review deleted by a moderator cannot be revived by its author', async () => {
    const { u, r } = await setup();
    const mod = await login(ctx, 'mod@mam.test', 'MODERATOR');
    const c = await ctx.http().post('/api/v1/reviews').set(auth(u.token)).send(reviewBody(r.id)).expect(201);
    await ctx.http().post(`/api/v1/admin/reviews/${c.body.id}/moderate`).set(auth(mod.token)).send({ action: 'DELETE', reason: 'Pelanggaran berat' }).expect(201);
    await ctx.http().post('/api/v1/reviews').set(auth(u.token)).send(reviewBody(r.id)).expect(403);
  });

  it('enforces the configurable minimum text length', async () => {
    const { u, r } = await setup();
    await ctx.http().post('/api/v1/reviews').set(auth(u.token)).send(reviewBody(r.id, { text: 'enak' })).expect(400);
  });

  it('holds reviews with links for moderation (PENDING) and hides them from the public', async () => {
    const { u, r } = await setup();
    const c = await ctx.http().post('/api/v1/reviews').set(auth(u.token)).send(reviewBody(r.id, { text: 'Promo besar! Kunjungi www.promo-palsu.example sekarang juga.' })).expect(201);
    expect(c.body.status).toBe('PENDING');
    await ctx.http().get(`/api/v1/reviews/${c.body.id}`).expect(404);
    await ctx.http().get(`/api/v1/reviews/${c.body.id}`).set(auth(u.token)).expect(200);
    const list = await ctx.http().get(`/api/v1/restaurants/${r.id}/reviews`).expect(200);
    expect(list.body.total).toBe(0);
  });

  it('rate-limits review creation per day', async () => {
    const { u } = await setup();
    for (let i = 0; i < 10; i++) {
      const r = await makeRestaurant(ctx.prisma);
      await ctx.http().post('/api/v1/reviews').set(auth(u.token)).send(reviewBody(r.id, { text: `Ulasan nomor ${i} dengan isi yang berbeda-beda dan cukup panjang.` })).expect(201);
    }
    const r = await makeRestaurant(ctx.prisma);
    await ctx.http().post('/api/v1/reviews').set(auth(u.token)).send(reviewBody(r.id, { text: 'Ulasan kesebelas hari ini tidak boleh lewat.' })).expect(429);
  });

  it('reactions: idempotent, no self-reactions, counted per type', async () => {
    const { u, r } = await setup();
    const other = await login(ctx, 'reactor@mam.test');
    const c = await ctx.http().post('/api/v1/reviews').set(auth(u.token)).send(reviewBody(r.id)).expect(201);
    await ctx.http().post(`/api/v1/reviews/${c.body.id}/reactions`).set(auth(u.token)).send({ type: 'HELPFUL' }).expect(400);
    await ctx.http().post(`/api/v1/reviews/${c.body.id}/reactions`).set(auth(other.token)).send({ type: 'HELPFUL' }).expect(200);
    const again = await ctx.http().post(`/api/v1/reviews/${c.body.id}/reactions`).set(auth(other.token)).send({ type: 'HELPFUL' }).expect(200);
    expect(again.body.HELPFUL).toBe(1);
    expect(again.body.mine).toEqual(['HELPFUL']);
    const off = await ctx.http().delete(`/api/v1/reviews/${c.body.id}/reactions/HELPFUL`).set(auth(other.token)).expect(200);
    expect(off.body.HELPFUL).toBe(0);
  });

  it('community statistics only count published reviews', async () => {
    const { u, r } = await setup();
    const u2 = await login(ctx, 'second@mam.test');
    await ageUsers(ctx.prisma);
    await ctx.http().post('/api/v1/reviews').set(auth(u.token)).send(reviewBody(r.id)).expect(201);
    await ctx.http().post('/api/v1/reviews').set(auth(u2.token)).send(reviewBody(r.id, { ratings: { taste: 2, price: 2, portion: 2, cleanliness: 2, service: 2 }, pricePaid: 15000, text: 'Kurang cocok di lidah saya, agak hambar dan dingin.' })).expect(201);
    const s = await ctx.http().get(`/api/v1/restaurants/${r.id}/statistics`).expect(200);
    expect(s.body.reviewCount).toBe(2);
    expect(s.body.averageOverall).toBe(3);
    expect(s.body.medianPricePaid).toBe(15000);
  });

  it('awards the First Bite badge from verifiable activity', async () => {
    const { u, r } = await setup();
    await ctx.http().post('/api/v1/reviews').set(auth(u.token)).send(reviewBody(r.id)).expect(201);
    const me = await ctx.http().get('/api/v1/users/me').set(auth(u.token)).expect(200);
    expect(me.body.badges.map((b: { code: string }) => b.code)).toContain('FIRST_BITE');
  });
});
