import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/bootstrap';
import { PrismaService } from '../src/common/prisma.service';
import { resetEnvCache } from '../src/config/env';

export interface TestCtx {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
}

export async function createTestApp(): Promise<TestCtx> {
  resetEnvCache();
  const app = await createApp();
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma, http: () => request(app.getHttpServer()) };
}

/** Wipes all data except reference tables (categories) and migration history. */
export async function resetDb(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE review_revisions, moderation_actions, review_reports, review_reactions, review_photos, reviews,
      collection_items, collections, favorites, restaurant_platform_links, restaurant_categories, external_place_refs,
      restaurants, notifications, user_badges, search_history, admin_audit_logs, sessions, oauth_accounts,
      user_preferences, user_profiles, app_config, integration_status, localities, data_imports, brands, users CASCADE`);
}

export type Role = 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN';

/** Logs in via the development endpoint as an Android-style bearer client. */
export async function login(ctx: TestCtx, email: string, role: Role = 'USER') {
  const res = await ctx.http().post('/api/v1/auth/dev-login').send({ email, role, client: 'ANDROID' }).expect(200);
  return { token: res.body.accessToken as string, refreshToken: res.body.refreshToken as string, userId: res.body.user.userId as string };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let seq = 0;
/** Creates a restaurant with a Google ref and a (≤30-day cached) location, as the resolve flow would. */
export async function makeRestaurant(prisma: PrismaService, lat = -6.1754, lng = 106.8272, name: string | null = null) {
  seq++;
  const r = await prisma.restaurant.create({
    data: { name, nameSource: name ? 'ADMIN' : 'NONE', externalRefs: { create: { provider: 'GOOGLE', externalPlaceId: `ChIJtestPlace${Date.now()}${seq}` } } },
    include: { externalRefs: true },
  });
  await prisma.$executeRaw`UPDATE restaurants SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, location_cached_at = now() WHERE id = ${r.id}::uuid`;
  return { id: r.id, placeId: r.externalRefs[0].externalPlaceId };
}

export const reviewBody = (restaurantId: string, extra: Record<string, unknown> = {}) => ({
  restaurantId,
  ratings: { taste: 5, price: 4, portion: 4, cleanliness: 3, service: 4 },
  text: 'Kuahnya gurih, baksonya kenyal, dan pelayanannya cepat sekali.',
  pricePaid: 25000,
  visitType: 'DINE_IN',
  visitedAt: '2026-11-01',
  ...extra,
});

/** Makes users look older than 1 hour so the "brand new account" spam signal doesn't hold reviews. */
export async function ageUsers(prisma: PrismaService) {
  await prisma.user.updateMany({ data: { createdAt: new Date(Date.now() - 30 * 86400_000) } });
}

/** Creates an OpenStreetMap-sourced place (permanent coordinates, stored facts) as the OSM importer would. */
export async function makeOsmPlace(prisma: PrismaService, lat: number, lng: number, name: string, opts: { categories?: string[]; city?: string } = {}) {
  seq++;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO restaurants (id, status, name, name_source, source, city, place_kind, location, created_at, updated_at)
    VALUES (gen_random_uuid(), 'ACTIVE', ${name}, 'OSM', 'OSM', ${opts.city ?? null}, 'restaurant',
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, now(), now())
    RETURNING id`;
  const r = rows[0];
  await prisma.externalPlaceRef.create({ data: { restaurantId: r.id, provider: 'OSM', externalPlaceId: `node/${900000 + seq}` } });
  if (opts.categories?.length) {
    await prisma.$executeRaw`INSERT INTO restaurant_categories (restaurant_id, category_id, source)
      SELECT ${r.id}::uuid, id, 'OSM_TAG' FROM categories WHERE slug = ANY(${opts.categories}::text[])`;
  }
  return { id: r.id, placeId: `mam-${r.id}` };
}
