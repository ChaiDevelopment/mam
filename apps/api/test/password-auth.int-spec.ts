import { TestCtx, createTestApp, resetDb } from './helpers';
import { CacheService } from '../src/common/cache.service';

describe('Email + password login (integration)', () => {
  let ctx: TestCtx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx.app.close());
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    // Fresh rate-limit counters and login-failure locks per test (in-memory cache in tests; Redis in production).
    (ctx.app.get(CacheService) as unknown as { memory: Map<string, unknown> }).memory.clear();
  });

  const register = (body: Record<string, unknown>) => ctx.http().post('/api/v1/auth/register').send(body);
  const login = (body: Record<string, unknown>) => ctx.http().post('/api/v1/auth/login').send(body);

  it('advertises password login and registers a web user with session cookies', async () => {
    const p = await ctx.http().get('/api/v1/auth/providers').expect(200);
    expect(p.body.password).toBe(true);

    const res = await register({ email: ' Ani@Contoh.ID ', password: 'gudeg-enak-1', displayName: 'Ani' }).expect(201);
    expect(res.body.user).toMatchObject({ email: 'ani@contoh.id', displayName: 'Ani', role: 'USER', hasPassword: true, emailVerified: false });
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(cookies.some((c) => c.startsWith('mam_at=') && /HttpOnly/i.test(c))).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/scrypt|passwordHash/);

    const me = await ctx.http().get('/api/v1/auth/me').set('Cookie', cookies.map((c) => c.split(';')[0]).join('; ')).expect(200);
    expect(me.body.email).toBe('ani@contoh.id');

    const row = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'ani@contoh.id' } });
    expect(row.passwordHash).toMatch(/^scrypt\$/);
    expect(row.passwordHash).not.toContain('gudeg-enak-1');
  });

  it('rejects duplicate emails, weak passwords and admin self-registration', async () => {
    await register({ email: 'ani@contoh.id', password: 'gudeg-enak-1', displayName: 'Ani' }).expect(201);
    const dup = await register({ email: 'ANI@contoh.id', password: 'lainnya-123', displayName: 'Ani 2' }).expect(409);
    expect(dup.body.message).toMatch(/sudah terdaftar/);
    await register({ email: 'b@contoh.id', password: 'pendek', displayName: 'B' }).expect(400);
    await register({ email: 'c@contoh.id', password: 'cukup-panjang', displayName: 'Ci', client: 'ADMIN' }).expect(403);
  });

  it('logs in with the right password only, with a generic error and Android tokens', async () => {
    await register({ email: 'ani@contoh.id', password: 'gudeg-enak-1', displayName: 'Ani' }).expect(201);
    const wrong = await login({ email: 'ani@contoh.id', password: 'salah-sekali' }).expect(401);
    const unknown = await login({ email: 'nobody@contoh.id', password: 'salah-sekali' }).expect(401);
    expect(wrong.body.message).toBe('Email atau kata sandi salah.');
    expect(unknown.body.message).toBe(wrong.body.message);

    const ok = await login({ email: 'ANI@contoh.id', password: 'gudeg-enak-1', client: 'ANDROID' }).expect(200);
    expect(ok.body.accessToken).toEqual(expect.any(String));
    expect(ok.body.refreshToken).toEqual(expect.any(String));
    await ctx.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${ok.body.accessToken}`).expect(200);
  });

  it('temporarily locks an email after repeated failures', async () => {
    await register({ email: 'kunci@contoh.id', password: 'gudeg-enak-1', displayName: 'Kunci' }).expect(201);
    for (let i = 0; i < 8; i++) await login({ email: 'kunci@contoh.id', password: `salah-${i}-xxxx` }).expect(401);
    const locked = await login({ email: 'kunci@contoh.id', password: 'gudeg-enak-1' }).expect(429);
    expect(locked.body.message).toMatch(/Terlalu banyak percobaan/);
  });

  it('admin dashboard login requires a staff role; suspended accounts cannot log in', async () => {
    await register({ email: 'staf@contoh.id', password: 'gudeg-enak-1', displayName: 'Staf' }).expect(201);
    await login({ email: 'staf@contoh.id', password: 'gudeg-enak-1', client: 'ADMIN' }).expect(403);
    await ctx.prisma.user.update({ where: { email: 'staf@contoh.id' }, data: { role: 'MODERATOR' } });
    // Staff: a second factor (code by e-mail) is required before a session is issued.
    const step1 = await login({ email: 'staf@contoh.id', password: 'gudeg-enak-1', client: 'ADMIN' }).expect(200);
    expect(step1.body).toMatchObject({ mfaRequired: true, emailHint: 'st***@contoh.id' });
    expect(step1.headers['set-cookie']).toBeUndefined();
    const ok = await ctx.http().post('/api/v1/auth/mfa/verify').send({ challengeId: step1.body.challengeId, code: step1.body.devCode }).expect(200);
    expect(ok.body.user.role).toBe('MODERATOR');

    await ctx.prisma.user.update({ where: { email: 'staf@contoh.id' }, data: { status: 'SUSPENDED' } });
    const s = await login({ email: 'staf@contoh.id', password: 'gudeg-enak-1' }).expect(403);
    expect(s.body.message).toMatch(/ditangguhkan/);
  });

  it('changes the password (current password required) and the old one stops working', async () => {
    const reg = await register({ email: 'ani@contoh.id', password: 'gudeg-enak-1', displayName: 'Ani', client: 'ANDROID' }).expect(201);
    const auth = { Authorization: `Bearer ${reg.body.accessToken}` };
    await ctx.http().post('/api/v1/auth/password').set(auth).send({ newPassword: 'baru-sekali-2' }).expect(400);
    await ctx.http().post('/api/v1/auth/password').set(auth).send({ currentPassword: 'keliru-123', newPassword: 'baru-sekali-2' }).expect(401);
    await ctx.http().post('/api/v1/auth/password').set(auth).send({ currentPassword: 'gudeg-enak-1', newPassword: 'baru-sekali-2' }).expect(204);
    await login({ email: 'ani@contoh.id', password: 'gudeg-enak-1' }).expect(401);
    await login({ email: 'ani@contoh.id', password: 'baru-sekali-2' }).expect(200);
    await ctx.http().post('/api/v1/auth/password').send({ newPassword: 'baru-sekali-3' }).expect(401);
  });

  it('a self-registered bootstrap email does not become super admin', async () => {
    process.env.BOOTSTRAP_SUPER_ADMIN_EMAILS = 'boss@contoh.id';
    const { resetEnvCache } = await import('../src/config/env');
    resetEnvCache();
    try {
      const res = await register({ email: 'boss@contoh.id', password: 'gudeg-enak-1', displayName: 'Boss' }).expect(201);
      expect(res.body.user.role).toBe('USER');
    } finally {
      delete process.env.BOOTSTRAP_SUPER_ADMIN_EMAILS;
      resetEnvCache();
    }
  });
});
