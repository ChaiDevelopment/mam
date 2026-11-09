import { CacheService } from '../src/common/cache.service';
import { MailService } from '../src/common/mail.service';
import { TestCtx, createTestApp, resetDb } from './helpers';

/** E-mail verification and password reset (links are read from the test mail outbox). */
describe('Email verification & password reset (integration)', () => {
  let ctx: TestCtx;
  let mail: MailService;
  beforeAll(async () => {
    ctx = await createTestApp();
    mail = ctx.app.get(MailService);
  });
  afterAll(async () => ctx.app.close());
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    (ctx.app.get(CacheService) as unknown as { memory: Map<string, unknown> }).memory.clear();
    mail.recent.length = 0;
  });

  const tokenFrom = (to: string, path: string) => {
    const m = [...mail.recent].reverse().find((x) => x.to === to && x.text.includes(path));
    const t = m && new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`).exec(m.text)?.[1];
    if (!t) throw new Error(`no ${path} mail for ${to}`);
    return t;
  };
  const register = async (email: string) => {
    const r = await ctx.http().post('/api/v1/auth/register').send({ email, password: 'gudeg-enak-1', displayName: 'Uji', client: 'ANDROID' }).expect(201);
    return r.body.accessToken as string;
  };

  it('registration sends a verification link; unverified users cannot review or add places until they verify', async () => {
    const token = await register('baru@contoh.id');
    const auth = { Authorization: `Bearer ${token}` };
    expect(mail.recent[0]).toMatchObject({ to: 'baru@contoh.id', subject: 'Verifikasi email MAM! kamu' });

    const place = { name: 'Warung Uji Verifikasi', lat: -7.78, lng: 110.37, categories: ['indonesian'] };
    const blocked = await ctx.http().post('/api/v1/places').set(auth).send(place).expect(403);
    expect(blocked.body.details).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });

    const verify = await ctx.http().post('/api/v1/auth/verify-email').send({ token: tokenFrom('baru@contoh.id', '/verifikasi-email') }).expect(200);
    expect(verify.body).toEqual({ ok: true, email: 'baru@contoh.id' });
    // single use
    await ctx.http().post('/api/v1/auth/verify-email').send({ token: tokenFrom('baru@contoh.id', '/verifikasi-email') }).expect(400);

    const me = await ctx.http().get('/api/v1/auth/me').set(auth).expect(200);
    expect(me.body.emailVerified).toBe(true);
    await ctx.http().post('/api/v1/places').set(auth).send(place).expect(201);
  });

  it('resend works once per minute and reports already-verified accounts', async () => {
    const token = await register('ulang@contoh.id');
    const auth = { Authorization: `Bearer ${token}` };
    await ctx.http().post('/api/v1/auth/resend-verification').set(auth).expect(200);
    const again = await ctx.http().post('/api/v1/auth/resend-verification').set(auth).expect(429);
    expect(again.body.message).toMatch(/Tunggu/);
    // only the newest link works
    const newest = tokenFrom('ulang@contoh.id', '/verifikasi-email');
    const oldest = /token=([A-Za-z0-9_-]+)/.exec(mail.recent.find((m) => m.to === 'ulang@contoh.id')!.text)![1];
    expect(oldest).not.toBe(newest);
    await ctx.http().post('/api/v1/auth/verify-email').send({ token: oldest }).expect(400);
    await ctx.http().post('/api/v1/auth/verify-email').send({ token: newest }).expect(200);
    (ctx.app.get(CacheService) as unknown as { memory: Map<string, unknown> }).memory.clear();
    const done = await ctx.http().post('/api/v1/auth/resend-verification').set(auth).expect(200);
    expect(done.body.alreadyVerified).toBe(true);
  });

  it('forgot password answers the same for unknown emails and resets the password with a single-use link', async () => {
    const token = await register('lupa@contoh.id');
    const unknown = await ctx.http().post('/api/v1/auth/forgot-password').send({ email: 'tidakada@contoh.id' }).expect(200);
    const known = await ctx.http().post('/api/v1/auth/forgot-password').send({ email: 'LUPA@contoh.id' }).expect(200);
    expect(unknown.body).toEqual(known.body);
    expect(mail.recent.some((m) => m.to === 'tidakada@contoh.id')).toBe(false);

    const reset = tokenFrom('lupa@contoh.id', '/atur-ulang-sandi');
    await ctx.http().post('/api/v1/auth/reset-password').send({ token: reset, newPassword: 'pendek' }).expect(400);
    await ctx.http().post('/api/v1/auth/reset-password').send({ token: reset, newPassword: 'sandi-baru-123' }).expect(200);
    await ctx.http().post('/api/v1/auth/reset-password').send({ token: reset, newPassword: 'sandi-lain-456' }).expect(400);

    // old sessions are revoked, old password no longer works, new one does, e-mail counts as verified
    await ctx.http().get('/api/v1/auth/me').set({ Authorization: `Bearer ${token}` }).expect(401);
    await ctx.http().post('/api/v1/auth/login').send({ email: 'lupa@contoh.id', password: 'gudeg-enak-1' }).expect(401);
    const ok = await ctx.http().post('/api/v1/auth/login').send({ email: 'lupa@contoh.id', password: 'sandi-baru-123', client: 'ANDROID' }).expect(200);
    const me = await ctx.http().get('/api/v1/auth/me').set({ Authorization: `Bearer ${ok.body.accessToken}` }).expect(200);
    expect(me.body.emailVerified).toBe(true);
  });

  it('expired links are rejected', async () => {
    await register('kedaluwarsa@contoh.id');
    await ctx.http().post('/api/v1/auth/forgot-password').send({ email: 'kedaluwarsa@contoh.id' }).expect(200);
    const t = tokenFrom('kedaluwarsa@contoh.id', '/atur-ulang-sandi');
    await ctx.prisma.emailToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await ctx.http().post('/api/v1/auth/reset-password').send({ token: t, newPassword: 'sandi-baru-123' }).expect(400);
    expect(r.body.message).toMatch(/kedaluwarsa/);
  });
});
