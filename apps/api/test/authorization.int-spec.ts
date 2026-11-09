import { TestCtx, auth, createTestApp, login, resetDb } from './helpers';

describe('Authorization / RBAC (integration)', () => {
  let ctx: TestCtx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx.app.close());
  beforeEach(async () => resetDb(ctx.prisma));

  const adminGets = ['/api/v1/admin/overview', '/api/v1/admin/users', '/api/v1/admin/reports', '/api/v1/admin/reviews', '/api/v1/admin/restaurants', '/api/v1/admin/categories'];

  it('anonymous users cannot access any admin endpoint', async () => {
    for (const p of [...adminGets, '/api/v1/admin/audit-logs', '/api/v1/admin/config']) await ctx.http().get(p).expect(401);
  });

  it('regular users get 403 on every admin endpoint', async () => {
    const { token } = await login(ctx, 'user@mam.test');
    for (const p of [...adminGets, '/api/v1/admin/audit-logs', '/api/v1/admin/config', '/api/v1/admin/integrations', '/api/v1/admin/storage']) {
      await ctx.http().get(p).set(auth(token)).expect(403);
    }
  });

  it('moderators can moderate but not manage users, config or audit logs', async () => {
    const { token } = await login(ctx, 'mod@mam.test', 'MODERATOR');
    const target = await login(ctx, 'victim@mam.test');
    for (const p of adminGets) await ctx.http().get(p).set(auth(token)).expect(200);
    await ctx.http().get('/api/v1/admin/audit-logs').set(auth(token)).expect(403);
    await ctx.http().patch(`/api/v1/admin/users/${target.userId}`).set(auth(token)).send({ status: 'SUSPENDED', reason: 'tes moderator' }).expect(403);
    await ctx.http().patch('/api/v1/admin/config').set(auth(token)).send({ reviewMinTextLength: 5, reason: 'tes moderator' }).expect(403);
  });

  it('admins cannot escalate to ADMIN or manage peers; super admins can', async () => {
    const admin = await login(ctx, 'admin@mam.test', 'ADMIN');
    const peer = await login(ctx, 'peer@mam.test', 'ADMIN');
    const user = await login(ctx, 'u2@mam.test');
    await ctx.http().patch(`/api/v1/admin/users/${user.userId}`).set(auth(admin.token)).send({ role: 'ADMIN', reason: 'promosi' }).expect(403);
    await ctx.http().patch(`/api/v1/admin/users/${peer.userId}`).set(auth(admin.token)).send({ status: 'SUSPENDED', reason: 'tes rekan' }).expect(403);
    await ctx.http().patch(`/api/v1/admin/users/${admin.userId}`).set(auth(admin.token)).send({ role: 'SUPER_ADMIN', reason: 'diri sendiri' }).expect(403);
    const ok = await ctx.http().patch(`/api/v1/admin/users/${user.userId}`).set(auth(admin.token)).send({ role: 'MODERATOR', reason: 'moderator baru' }).expect(200);
    expect(ok.body.role).toBe('MODERATOR');

    const sa = await login(ctx, 'sa@mam.test', 'SUPER_ADMIN');
    await ctx.http().patch(`/api/v1/admin/users/${user.userId}`).set(auth(sa.token)).send({ role: 'ADMIN', reason: 'promosi resmi' }).expect(200);
    await ctx.http().patch('/api/v1/admin/config').set(auth(sa.token)).send({ reviewMinTextLength: 30, reason: 'standar kualitas' }).expect(200);
  });

  it('role changes take effect on the next request (DB is the source of truth, not the token)', async () => {
    const mod = await login(ctx, 'tobedemoted@mam.test', 'MODERATOR');
    await ctx.http().get('/api/v1/admin/reports').set(auth(mod.token)).expect(200);
    const sa = await login(ctx, 'sa2@mam.test', 'SUPER_ADMIN');
    await ctx.http().patch(`/api/v1/admin/users/${mod.userId}`).set(auth(sa.token)).send({ role: 'USER', reason: 'tidak aktif lagi' }).expect(200);
    await ctx.http().get('/api/v1/admin/reports').set(auth(mod.token)).expect(403);
  });

  it('every admin mutation is written to the audit log', async () => {
    const sa = await login(ctx, 'sa3@mam.test', 'SUPER_ADMIN');
    const u = await login(ctx, 'audited@mam.test');
    await ctx.http().patch(`/api/v1/admin/users/${u.userId}`).set(auth(sa.token)).send({ status: 'SUSPENDED', reason: 'pelanggaran' }).expect(200);
    await ctx.http().patch(`/api/v1/admin/users/${u.userId}`).set(auth(sa.token)).send({ status: 'ACTIVE', reason: 'banding diterima' }).expect(200);
    const logs = await ctx.http().get('/api/v1/admin/audit-logs').set(auth(sa.token)).expect(200);
    const actions = logs.body.items.map((l: { action: string }) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['USER_SUSPENDED', 'USER_RESTORED']));
    expect(logs.body.items[0].actor.userId).toBe(sa.userId);
  });
});
