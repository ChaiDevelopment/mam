import sharp from 'sharp';
import { TestCtx, ageUsers, auth, createTestApp, login, makeRestaurant, resetDb, reviewBody } from './helpers';

describe('Community, moderation, uploads, platform links (integration)', () => {
  let ctx: TestCtx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx.app.close());
  beforeEach(async () => resetDb(ctx.prisma));

  it('favorites: add (idempotent), list, status, remove', async () => {
    const u = await login(ctx, 'fav@mam.test');
    const r = await makeRestaurant(ctx.prisma, -6.2, 106.8, 'Soto Favorit');
    await ctx.http().post(`/api/v1/favorites/${r.id}`).set(auth(u.token)).expect(204);
    await ctx.http().post(`/api/v1/favorites/${r.id}`).set(auth(u.token)).expect(204);
    const list = await ctx.http().get('/api/v1/favorites').set(auth(u.token)).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].restaurant.name).toBe('Soto Favorit');
    expect((await ctx.http().get(`/api/v1/favorites/${r.id}`).set(auth(u.token))).body.favorited).toBe(true);
    await ctx.http().delete(`/api/v1/favorites/${r.id}`).set(auth(u.token)).expect(204);
    expect((await ctx.http().get('/api/v1/favorites').set(auth(u.token))).body).toHaveLength(0);
  });

  it('collections: create, add item, no duplicates, privacy, delete', async () => {
    const u = await login(ctx, 'col@mam.test');
    const other = await login(ctx, 'peek@mam.test');
    const r = await makeRestaurant(ctx.prisma, -6.2, 106.8, 'Nasi Uduk');
    const c = await ctx.http().post('/api/v1/collections').set(auth(u.token)).send({ name: 'Sarapan Enak', isPublic: false }).expect(201);
    await ctx.http().post(`/api/v1/collections/${c.body.id}/items`).set(auth(u.token)).send({ restaurantId: r.id, note: 'Datang pagi' }).expect(201);
    await ctx.http().post(`/api/v1/collections/${c.body.id}/items`).set(auth(u.token)).send({ restaurantId: r.id }).expect(409);
    const got = await ctx.http().get(`/api/v1/collections/${c.body.id}`).set(auth(u.token)).expect(200);
    expect(got.body.items).toHaveLength(1);
    await ctx.http().get(`/api/v1/collections/${c.body.id}`).set(auth(other.token)).expect(404);
    await ctx.http().post(`/api/v1/collections/${c.body.id}/items`).set(auth(other.token)).send({ restaurantId: r.id }).expect(403);
    await ctx.http().patch(`/api/v1/collections/${c.body.id}`).set(auth(u.token)).send({ isPublic: true }).expect(200);
    await ctx.http().get(`/api/v1/collections/${c.body.id}`).expect(200);
    await ctx.http().delete(`/api/v1/collections/${c.body.id}`).set(auth(u.token)).expect(204);
    expect((await ctx.http().get('/api/v1/collections').set(auth(u.token))).body).toHaveLength(0);
  });

  it('report → moderator resolves with HIDE → review hidden, reporter + author notified, audited', async () => {
    const author = await login(ctx, 'author@mam.test');
    const reporter = await login(ctx, 'reporter@mam.test');
    const mod = await login(ctx, 'mod@mam.test', 'MODERATOR');
    await ageUsers(ctx.prisma);
    const r = await makeRestaurant(ctx.prisma);
    const rev = await ctx.http().post('/api/v1/reviews').set(auth(author.token)).send(reviewBody(r.id)).expect(201);
    await ctx.http().post(`/api/v1/reviews/${rev.body.id}/report`).set(auth(author.token)).send({ reason: 'SPAM' }).expect(400);
    const rep = await ctx.http().post(`/api/v1/reviews/${rev.body.id}/report`).set(auth(reporter.token)).send({ reason: 'OFFENSIVE', details: 'Kata-kata kasar' }).expect(201);
    await ctx.http().post(`/api/v1/reviews/${rev.body.id}/report`).set(auth(reporter.token)).send({ reason: 'OFFENSIVE' }).expect(409);

    const queue = await ctx.http().get('/api/v1/admin/reports').set(auth(mod.token)).expect(200);
    expect(queue.body.items.map((x: { id: string }) => x.id)).toContain(rep.body.id);
    await ctx.http().patch(`/api/v1/admin/reports/${rep.body.id}`).set(auth(mod.token)).send({ status: 'RESOLVED_ACTION_TAKEN', note: 'Tidak sesuai pedoman' }).expect(400);
    await ctx.http()
      .patch(`/api/v1/admin/reports/${rep.body.id}`)
      .set(auth(mod.token))
      .send({ status: 'RESOLVED_ACTION_TAKEN', reviewAction: 'HIDE', note: 'Bahasa kasar melanggar pedoman' })
      .expect(200);

    await ctx.http().get(`/api/v1/reviews/${rev.body.id}`).expect(404);
    const row = await ctx.prisma.review.findUniqueOrThrow({ where: { id: rev.body.id } });
    expect(row.status).toBe('HIDDEN');
    expect(await ctx.prisma.moderationAction.count({ where: { reviewId: rev.body.id, moderatorId: mod.userId, action: 'HIDE' } })).toBe(1);
    expect(await ctx.prisma.adminAuditLog.count({ where: { action: { in: ['REVIEW_HIDE', 'REPORT_RESOLVED'] } } })).toBe(2);
    const authorNotes = await ctx.http().get('/api/v1/notifications').set(auth(author.token)).expect(200);
    expect(authorNotes.body.items.some((n: { type: string }) => n.type === 'REVIEW_MODERATED')).toBe(true);
    const reporterNotes = await ctx.http().get('/api/v1/notifications').set(auth(reporter.token)).expect(200);
    expect(reporterNotes.body.items.some((n: { type: string }) => n.type === 'REPORT_RESOLVED')).toBe(true);

    // Restore
    await ctx.http().post(`/api/v1/admin/reviews/${rev.body.id}/moderate`).set(auth(mod.token)).send({ action: 'RESTORE', reason: 'Banding diterima' }).expect(201);
    await ctx.http().get(`/api/v1/reviews/${rev.body.id}`).expect(200);
  });

  it('five distinct reports auto-hide a review pending moderator review', async () => {
    const author = await login(ctx, 'popular@mam.test');
    await ageUsers(ctx.prisma);
    const r = await makeRestaurant(ctx.prisma);
    const rev = await ctx.http().post('/api/v1/reviews').set(auth(author.token)).send(reviewBody(r.id)).expect(201);
    for (let i = 0; i < 5; i++) {
      const rep = await login(ctx, `rep${i}@mam.test`);
      await ctx.http().post(`/api/v1/reviews/${rev.body.id}/report`).set(auth(rep.token)).send({ reason: 'FAKE_REVIEW' }).expect(201);
    }
    expect((await ctx.prisma.review.findUniqueOrThrow({ where: { id: rev.body.id } })).status).toBe('HIDDEN');
  });

  it('uploads: strips metadata, attaches to review, rejects non-images', async () => {
    const u = await login(ctx, 'photo@mam.test');
    await ageUsers(ctx.prisma);
    const r = await makeRestaurant(ctx.prisma);
    const jpg = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#ff9f43' } })
      .jpeg()
      .withExif({ IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '6/1 10/1 0/1' } })
      .toBuffer();
    const up = await ctx.http().post('/api/v1/uploads/review-photo').set(auth(u.token)).attach('file', jpg, { filename: 'makan.jpg', contentType: 'image/jpeg' }).expect(201);
    expect(up.body.url).toMatch(/\.webp$/);
    const file = await ctx.http().get(up.body.url).expect(200);
    expect((await sharp(file.body).metadata()).exif).toBeUndefined();

    await ctx.http().post('/api/v1/uploads/review-photo').set(auth(u.token)).attach('file', Buffer.from('MZ\x90\x00 not an image at all'), { filename: 'virus.exe', contentType: 'application/octet-stream' }).expect(400);
    await ctx.http().post('/api/v1/uploads/review-photo').set(auth(u.token)).attach('file', Buffer.from('MZ\x90\x00 fake jpeg'), { filename: 'x.jpg', contentType: 'image/jpeg' }).expect(400);

    const rev = await ctx.http().post('/api/v1/reviews').set(auth(u.token)).send(reviewBody(r.id, { photoIds: [up.body.id] })).expect(201);
    expect(rev.body.photos).toHaveLength(1);
    const other = await login(ctx, 'thief@mam.test');
    const r2 = await makeRestaurant(ctx.prisma);
    await ctx.http().post('/api/v1/reviews').set(auth(other.token)).send(reviewBody(r2.id, { photoIds: [up.body.id] })).expect(400);
  });

  it('platform links: NOT_INTEGRATED by default, never fabricated; user links are UNVERIFIED; admin verifies', async () => {
    const u = await login(ctx, 'linker@mam.test');
    const admin = await login(ctx, 'admin@mam.test', 'ADMIN');
    const r = await makeRestaurant(ctx.prisma);
    const initial = await ctx.http().get(`/api/v1/restaurants/${r.id}/platform-links`).expect(200);
    expect(initial.body).toHaveLength(3);
    for (const l of initial.body) {
      expect(l.availability).toBe('NOT_INTEGRATED');
      expect(l.url).toBeNull();
      expect(l.lastVerifiedAt).toBeNull();
    }
    await ctx.http().post(`/api/v1/restaurants/${r.id}/platform-links`).set(auth(u.token)).send({ provider: 'GOFOOD', url: 'https://evil.example/gofood' }).expect(400);
    const sub = await ctx.http().post(`/api/v1/restaurants/${r.id}/platform-links`).set(auth(u.token)).send({ provider: 'GOFOOD', url: 'https://gofood.co.id/jakarta/restaurant/x' }).expect(201);
    expect(sub.body).toMatchObject({ availability: 'UNVERIFIED', source: 'USER_SUBMITTED' });
    const ver = await ctx.http()
      .put(`/api/v1/admin/restaurants/${r.id}/platform-links`)
      .set(auth(admin.token))
      .send({ provider: 'GOFOOD', url: 'https://gofood.co.id/jakarta/restaurant/x', availability: 'VERIFIED', reason: 'Dicek manual' })
      .expect(200);
    expect(ver.body.availability).toBe('VERIFIED');
    expect(ver.body.lastVerifiedAt).not.toBeNull();
  });

  it('admin merge moves reviews/favorites and resolves duplicate reviews safely', async () => {
    const sa = await login(ctx, 'merger@mam.test', 'SUPER_ADMIN');
    const u = await login(ctx, 'both@mam.test');
    await ageUsers(ctx.prisma);
    const a = await makeRestaurant(ctx.prisma, -6.2, 106.8, 'Dup A');
    const b = await makeRestaurant(ctx.prisma, -6.20001, 106.80001, 'Dup B');
    await ctx.http().post('/api/v1/reviews').set(auth(u.token)).send(reviewBody(a.id)).expect(201);
    await ctx.http().post('/api/v1/reviews').set(auth(u.token)).send(reviewBody(b.id, { text: 'Tempat yang sama tapi tercatat dua kali di sistem.' })).expect(201);
    await ctx.http().post(`/api/v1/favorites/${a.id}`).set(auth(u.token)).expect(204);
    const dups = await ctx.http().get('/api/v1/admin/restaurants/duplicates').set(auth(sa.token)).expect(200);
    expect(dups.body).toHaveLength(1);
    const m = await ctx.http().post(`/api/v1/admin/restaurants/${a.id}/merge`).set(auth(sa.token)).send({ targetRestaurantId: b.id, reason: 'Duplikat lokasi sama' }).expect(201);
    expect(m.body.merge).toMatchObject({ retiredDuplicateReviews: 1, favorites: 1 });
    expect(await ctx.prisma.review.count({ where: { userId: u.userId, status: { not: 'DELETED' } } })).toBe(1);
    // Old ID transparently resolves to the surviving restaurant
    const view = await ctx.http().get(`/api/v1/restaurants/${a.id}`).expect(200);
    expect(view.body.id).toBe(b.id);
  });

  it('feed lists published reviews; leaderboard is quality-weighted', async () => {
    const u = await login(ctx, 'feeder@mam.test');
    await ageUsers(ctx.prisma);
    const r = await makeRestaurant(ctx.prisma);
    await ctx.http().post('/api/v1/reviews').set(auth(u.token)).send(reviewBody(r.id, { text: 'Tempatnya nyaman, kuah soto bening tapi kaya rasa, daging empuk, sambalnya segar. '.repeat(4) })).expect(201);
    const feed = await ctx.http().get('/api/v1/reviews/feed').expect(200);
    expect(feed.body.total).toBe(1);
    const lb = await ctx.http().get('/api/v1/community/leaderboard').expect(200);
    expect(lb.body[0].userId).toBe(u.userId);
    expect(lb.body[0].qualityScore).toBeGreaterThan(0);
  });
});
