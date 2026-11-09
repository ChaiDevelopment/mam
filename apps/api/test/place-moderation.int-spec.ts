import { MailService } from '../src/common/mail.service';
import { CacheService } from '../src/common/cache.service';
import { hashPassword } from '../src/modules/auth/password';
import { TestCtx, auth, createTestApp, login, resetDb } from './helpers';

/** Place submissions → moderator approval/rejection (e-mailed), and e-mail MFA for staff password logins. */
describe('Place moderation & staff MFA (integration)', () => {
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

  const center = { lat: -7.7829, lng: 110.367 };
  const place = (name: string, dLng = 0.001) => ({ name, lat: center.lat, lng: center.lng + dLng, categories: ['indonesian'], address: 'Jl. Malioboro' });

  async function moderator() {
    await ctx.prisma.user.create({
      data: {
        email: 'mod@contoh.id',
        emailVerified: true,
        role: 'MODERATOR',
        passwordHash: await hashPassword('moderator-kuat-1'),
        profile: { create: { username: 'mod_test', displayName: 'Moderator Uji' } },
        preferences: { create: {} },
      },
    });
    const step1 = await ctx.http().post('/api/v1/auth/login').send({ email: 'mod@contoh.id', password: 'moderator-kuat-1', client: 'ANDROID' }).expect(200);
    expect(step1.body.mfaRequired).toBe(true);
    // The code was e-mailed (outbox in tests): read it from the message, not from devCode.
    const msg = mail.recent.find((m) => m.to === 'mod@contoh.id')!;
    const code = /(\d{6})/.exec(msg.subject)![1];
    expect(msg.text).toContain(code);
    const ok = await ctx.http().post('/api/v1/auth/mfa/verify').send({ challengeId: step1.body.challengeId, code }).expect(200);
    return ok.body.accessToken as string;
  }

  it('staff MFA: wrong codes are counted, 5 failures end the challenge, resend is rate-limited', async () => {
    await ctx.prisma.user.create({
      data: { email: 'adm@contoh.id', role: 'ADMIN', passwordHash: await hashPassword('admin-kuat-123'), profile: { create: { username: 'adm_t', displayName: 'Adm' } }, preferences: { create: {} } },
    });
    const s1 = await ctx.http().post('/api/v1/auth/login').send({ email: 'adm@contoh.id', password: 'admin-kuat-123', client: 'ADMIN' }).expect(200);
    expect(s1.body).toMatchObject({ mfaRequired: true, emailHint: 'ad***@contoh.id', expiresIn: 600 });
    expect(mail.recent.at(-1)).toMatchObject({ to: 'adm@contoh.id', via: 'outbox' });
    const wrong = s1.body.devCode === '000000' ? '111111' : '000000';
    const r1 = await ctx.http().post('/api/v1/auth/mfa/verify').send({ challengeId: s1.body.challengeId, code: wrong }).expect(401);
    expect(r1.body.message).toMatch(/Sisa percobaan: 4/);
    await ctx.http().post('/api/v1/auth/mfa/verify').send({ challengeId: s1.body.challengeId, code: 'abc' }).expect(400);
    const resend = await ctx.http().post('/api/v1/auth/mfa/resend').send({ challengeId: s1.body.challengeId }).expect(429);
    expect(resend.body.message).toMatch(/Tunggu \d+ detik/);
    for (let i = 0; i < 4; i++) await ctx.http().post('/api/v1/auth/mfa/verify').send({ challengeId: s1.body.challengeId, code: wrong }).expect(401);
    await ctx.http().post('/api/v1/auth/mfa/verify').send({ challengeId: s1.body.challengeId, code: s1.body.devCode }).expect(429);
    // The right code no longer works after the challenge was burned.
    await ctx.http().post('/api/v1/auth/mfa/verify').send({ challengeId: s1.body.challengeId, code: s1.body.devCode }).expect(401);

    // Regular users are not asked for a code.
    await ctx.http().post('/api/v1/auth/register').send({ email: 'biasa@contoh.id', password: 'biasa-saja-1', displayName: 'Biasa' }).expect(201);
    const u = await ctx.http().post('/api/v1/auth/login').send({ email: 'biasa@contoh.id', password: 'biasa-saja-1', client: 'ANDROID' }).expect(200);
    expect(u.body.accessToken).toEqual(expect.any(String));
    expect(u.body.mfaRequired).toBeUndefined();
  });

  it('a submission waits for a moderator; rejection needs a reason and is e-mailed to the submitter', async () => {
    const user = await login(ctx, 'pengaju@contoh.id');
    const sub = await ctx.http().post('/api/v1/places').set(auth(user.token)).send(place('Gudeg Bu Uji')).expect(201);
    expect(sub.body.status).toBe('PENDING');

    // Regular users cannot moderate.
    await ctx.http().get('/api/v1/admin/place-submissions').set(auth(user.token)).expect(403);

    const mod = await moderator();
    const list = await ctx.http().get('/api/v1/admin/place-submissions').set(auth(mod)).expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0]).toMatchObject({ id: sub.body.id, status: 'PENDING', submittedBy: { email: 'pengaju@contoh.id' } });
    const overview = await ctx.http().get('/api/v1/admin/overview').set(auth(mod)).expect(200);
    expect(overview.body.totals.pendingPlaces).toBe(1);

    await ctx.http().patch(`/api/v1/admin/place-submissions/${sub.body.id}`).set(auth(mod)).send({ action: 'REJECT' }).expect(400);
    const rej = await ctx.http().patch(`/api/v1/admin/place-submissions/${sub.body.id}`).set(auth(mod)).send({ action: 'REJECT', reason: 'Titik lokasi berada di tengah sungai.' }).expect(200);
    expect(rej.body).toMatchObject({ status: 'REJECTED', moderationNote: 'Titik lokasi berada di tengah sungai.', emailed: 'outbox' });

    const email = mail.recent.find((m) => m.to === 'pengaju@contoh.id')!;
    expect(email.subject).toBe('Pengajuan ditolak: Gudeg Bu Uji');
    expect(email.text).toContain('Titik lokasi berada di tengah sungai.');
    expect(email.html).not.toContain('<script');

    const mine = await ctx.http().get('/api/v1/places/submissions/mine').set(auth(user.token)).expect(200);
    expect(mine.body[0]).toMatchObject({ status: 'REJECTED', moderationNote: 'Titik lokasi berada di tengah sungai.' });
    const notes = await ctx.http().get('/api/v1/notifications').set(auth(user.token)).expect(200);
    expect(notes.body.items[0]).toMatchObject({ type: 'PLACE_REJECTED' });

    // Already decided → 409; the audit log records the decision.
    await ctx.http().patch(`/api/v1/admin/place-submissions/${sub.body.id}`).set(auth(mod)).send({ action: 'APPROVE' }).expect(409);
    const audit = await ctx.prisma.adminAuditLog.findFirst({ where: { action: 'PLACE_REJECTED', targetId: sub.body.id } });
    expect(audit).not.toBeNull();

    // A rejected place does not block a corrected resubmission.
    await ctx.http().post('/api/v1/places').set(auth(user.token)).send(place('Gudeg Bu Uji', 0.0012)).expect(201);
  });

  it('approval publishes the place, notifies and e-mails the submitter; staff submissions skip the queue', async () => {
    const user = await login(ctx, 'pengaju2@contoh.id');
    const sub = await ctx.http().post('/api/v1/places').set(auth(user.token)).send(place('Bakmi Uji Setuju')).expect(201);
    const before = await ctx.http().get(`/api/v1/places/nearby?lat=${center.lat}&lng=${center.lng}&radius=1000`).expect(200);
    expect(before.body.items).toHaveLength(0);

    const mod = await moderator();
    const ok = await ctx.http().patch(`/api/v1/admin/place-submissions/${sub.body.id}`).set(auth(mod)).send({ action: 'APPROVE' }).expect(200);
    expect(ok.body.status).toBe('ACTIVE');
    const after = await ctx.http().get(`/api/v1/places/nearby?lat=${center.lat}&lng=${center.lng}&radius=1000`).expect(200);
    expect(after.body.items.map((i: { name: string }) => i.name)).toEqual(['Bakmi Uji Setuju']);
    expect(mail.recent.find((m) => m.to === 'pengaju2@contoh.id')?.subject).toBe('Disetujui: Bakmi Uji Setuju');
    const notes = await ctx.http().get('/api/v1/notifications').set(auth(user.token)).expect(200);
    expect(notes.body.items[0]).toMatchObject({ type: 'PLACE_APPROVED', link: `/tempat/${sub.body.placeId}` });

    const staffPlace = await ctx.http().post('/api/v1/places').set(auth(mod)).send(place('Kopi Moderator', 0.004)).expect(201);
    expect(staffPlace.body.status).toBe('ACTIVE');
  });
});
