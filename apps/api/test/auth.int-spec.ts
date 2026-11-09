import { TestCtx, auth, createTestApp, login, resetDb } from './helpers';

describe('Authentication (integration)', () => {
  let ctx: TestCtx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx.app.close());
  beforeEach(async () => resetDb(ctx.prisma));

  it('rejects unauthenticated access to protected routes', async () => {
    await ctx.http().get('/api/v1/users/me').expect(401);
    await ctx.http().post('/api/v1/reviews').send({}).expect(401);
    await ctx.http().get('/api/v1/favorites').expect(401);
  });

  it('rejects forged / malformed tokens', async () => {
    await ctx.http().get('/api/v1/users/me').set(auth('not-a-jwt')).expect(401);
    const forged = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4Iiwic2lkIjoieSJ9.c2lnbmF0dXJl';
    await ctx.http().get('/api/v1/users/me').set(auth(forged)).expect(401);
  });

  it('issues bearer tokens for native clients and returns the profile', async () => {
    const { token } = await login(ctx, 'android@mam.test');
    const me = await ctx.http().get('/api/v1/auth/me').set(auth(token)).expect(200);
    expect(me.body.email).toBe('android@mam.test');
    expect(me.body.role).toBe('USER');
    expect(me.body.preferences.defaultRadiusMeters).toBe(5000);
  });

  it('rotates refresh tokens and detects reuse (revokes the session family)', async () => {
    const { refreshToken } = await login(ctx, 'rotate@mam.test');
    const r1 = await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken }).expect(200);
    expect(r1.body.refreshToken).not.toBe(refreshToken);
    // Replay the old token → reuse detected → whole family revoked
    await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
    await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(401);
    await ctx.http().get('/api/v1/users/me').set(auth(r1.body.accessToken)).expect(401);
  });

  it('logout revokes the session', async () => {
    const { token } = await login(ctx, 'logout@mam.test');
    await ctx.http().post('/api/v1/auth/logout').set(auth(token)).send({}).expect(204);
    await ctx.http().get('/api/v1/users/me').set(auth(token)).expect(401);
  });

  it('cookie sessions require the CSRF double-submit header for writes', async () => {
    const agent = require('supertest').agent(ctx.app.getHttpServer());
    const res = await agent.post('/api/v1/auth/dev-login').send({ email: 'cookie@mam.test' }).expect(200);
    const cookies: string[] = res.headers['set-cookie'];
    expect(cookies.some((c) => c.startsWith('mam_at=') && /HttpOnly/i.test(c))).toBe(true);
    expect(cookies.some((c) => c.startsWith('mam_rt=') && /HttpOnly/i.test(c))).toBe(true);
    const csrf = cookies.find((c) => c.startsWith('mam_csrf='))!.split(';')[0].split('=')[1];
    await agent.get('/api/v1/users/me').expect(200);
    await agent.patch('/api/v1/users/me').send({ bio: 'hai' }).expect(403);
    await agent.patch('/api/v1/users/me').set('X-CSRF-Token', csrf).send({ bio: 'hai' }).expect(200);
  });

  it('suspended users are locked out immediately', async () => {
    const { token, userId } = await login(ctx, 'suspend@mam.test');
    const admin = await login(ctx, 'sa@mam.test', 'SUPER_ADMIN');
    await ctx.http().patch(`/api/v1/admin/users/${userId}`).set(auth(admin.token)).send({ status: 'SUSPENDED', reason: 'Spam berulang' }).expect(200);
    await ctx.http().get('/api/v1/users/me').set(auth(token)).expect(401);
  });

  it('native Google sign-in requires a server nonce and a configured client', async () => {
    await ctx.http().post('/api/v1/auth/google').send({ idToken: 'x'.repeat(40), nonce: 'n'.repeat(32) }).expect(401);
    const { body } = await ctx.http().get('/api/v1/auth/nonce').expect(200);
    // Google OAuth is not configured in the test environment → clear 503 instead of a fake success.
    await ctx.http().post('/api/v1/auth/google').send({ idToken: 'x'.repeat(40), nonce: body.nonce }).expect(503);
    // Nonce is single-use.
    await ctx.http().post('/api/v1/auth/google').send({ idToken: 'x'.repeat(40), nonce: body.nonce }).expect(401);
  });

  it('web OAuth start rejects open redirects', async () => {
    await ctx.http().get('/api/v1/auth/google/start?returnTo=//evil.example').expect(400);
    await ctx.http().get('/api/v1/auth/google/start?returnTo=https://evil.example').expect(400);
  });

  it('OAuth callback without valid state is refused', async () => {
    const res = await ctx.http().get('/api/v1/auth/google/callback?code=abc&state=forged').expect(302);
    expect(res.headers.location).toContain('error=invalid_state');
  });

  it('account deletion anonymizes the user and revokes access', async () => {
    const { token, userId } = await login(ctx, 'delete@mam.test');
    await ctx.http().delete('/api/v1/users/me').set(auth(token)).send({ confirm: 'salah' }).expect(400);
    await ctx.http().delete('/api/v1/users/me').set(auth(token)).send({ confirm: 'HAPUS AKUN SAYA' }).expect(204);
    const u = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
    expect(u.status).toBe('DELETED');
    expect(u.email).not.toContain('delete@mam.test');
    expect(u.profile!.displayName).toBe('Pengguna terhapus');
    await ctx.http().get('/api/v1/users/me').set(auth(token)).expect(401);
  });
});
