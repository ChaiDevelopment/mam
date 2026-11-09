/* Prepares the E2E database: migrations, categories, and two community restaurant references near Monas (Jakarta). */
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

export const E2E_PLACES = {
  near: { placeId: 'ChIJe2eNearMonas0001', name: 'Soto Betawi E2E', lat: -6.1760, lng: 106.8280 },
  far: { placeId: 'ChIJe2eFarAway000002', name: 'Bakmi E2E Jauh', lat: -6.2300, lng: 106.8272 }, // ≈ 6 km south
};
/** An OpenStreetMap-sourced place (as imported by scripts/import-osm.ps1); its placeId is set during setup. */
export const E2E_OSM_PLACE = { name: 'Gado-Gado OSM E2E', lat: -6.1770, lng: 106.8265, osmId: 'node/424242' };
export const E2E_OSM_PLACE_ID_FILE = resolve(__dirname, '../test-results/e2e-osm-place.txt');

export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL || 'postgresql://postgres@localhost:5433/mam_e2e?schema=public';
  const api = resolve(__dirname, '../../api');
  const env = { ...process.env, DATABASE_URL: url, NODE_ENV: 'development' };
  execSync('npx prisma migrate deploy', { cwd: api, env, stdio: 'pipe' });
  execSync('npx ts-node --transpile-only prisma/seed.ts', { cwd: api, env, stdio: 'pipe' });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient } = require(require.resolve('@prisma/client', { paths: [api] }));
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$executeRawUnsafe(`TRUNCATE review_revisions, moderation_actions, review_reports, review_reactions, review_photos, reviews, collection_items, collections, favorites,
      restaurant_platform_links, restaurant_categories, external_place_refs, restaurants, notifications, user_badges, search_history, admin_audit_logs, sessions,
      oauth_accounts, localities CASCADE`);
    for (const p of Object.values(E2E_PLACES)) {
      const r = await prisma.restaurant.create({ data: { name: p.name, nameSource: 'ADMIN', externalRefs: { create: { provider: 'GOOGLE', externalPlaceId: p.placeId } } } });
      await prisma.$executeRawUnsafe(`UPDATE restaurants SET location = ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography, location_cached_at = now() WHERE id = '${r.id}'`);
    }
    const o = E2E_OSM_PLACE;
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO restaurants (id, status, name, name_source, source, city, cuisine, place_kind, location, created_at, updated_at)
       VALUES (gen_random_uuid(), 'ACTIVE', $1, 'OSM', 'OSM', 'Jakarta Pusat', 'indonesian', 'restaurant',
               ST_SetSRID(ST_MakePoint($2::float8, $3::float8), 4326)::geography, now(), now()) RETURNING id`,
      o.name, o.lng, o.lat,
    );
    const id = (rows as { id: string }[])[0].id;
    await prisma.externalPlaceRef.create({ data: { restaurantId: id, provider: 'OSM', externalPlaceId: o.osmId } });
    await prisma.$executeRawUnsafe(`INSERT INTO restaurant_categories (restaurant_id, category_id, source) SELECT '${id}', id, 'OSM_TAG' FROM categories WHERE slug = 'indonesian'`);
    mkdirSync(dirname(E2E_OSM_PLACE_ID_FILE), { recursive: true });
    writeFileSync(E2E_OSM_PLACE_ID_FILE, `mam-${id}`);
  } finally {
    await prisma.$disconnect();
  }
}
