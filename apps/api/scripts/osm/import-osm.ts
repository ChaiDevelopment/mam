/**
 * Loads NDJSON produced by extract_osm.py into PostgreSQL (restaurants + external_place_refs + categories, localities).
 * Idempotent: re-running updates OSM facts in place and never duplicates places (unique (provider, external_place_id)).
 * Admin/community-edited names (name_source <> 'OSM') are never overwritten.
 *
 *   npx ts-node --transpile-only scripts/osm/import-osm.ts <file.ndjson> [more.ndjson ...]
 *
 * Data © OpenStreetMap contributors, Open Database License (ODbL) 1.0 — see docs/integrations/OPENSTREETMAP.md.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { PrismaClient } from '@prisma/client';
import { addressFromOsm, categoriesFromOsm, normalizeWebsite, splitCuisine } from '../../src/modules/categories/osm-mapping';

interface Line {
  t: 'p' | 'l';
  id: string;
  kind: string;
  lat: number;
  lng: number;
  tags: Record<string, string>;
}

const BATCH = 1000;
const prisma = new PrismaClient();
const clip = (v: string | null | undefined, n: number) => (v ? v.trim().slice(0, n) || null : null);

type PlaceRow = [string, string, string, number, number, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string, string | null, string | null];
type LocRow = [string, string, string, number, number, number | null, string | null];

function toPlace(l: Line): PlaceRow | null {
  const t = l.tags;
  const name = clip(t['name:id'] ?? t.name, 120);
  if (!name || !Number.isFinite(l.lat) || !Number.isFinite(l.lng)) return null;
  const cats = categoriesFromOsm({ ...t, name });
  return [
    l.id,
    name,
    l.kind,
    l.lat,
    l.lng,
    clip(addressFromOsm(t), 300),
    clip(t.phone ?? t['contact:phone'], 60),
    clip(normalizeWebsite(t.website ?? t['contact:website']), 300),
    clip(t.opening_hours, 500),
    clip(splitCuisine(t.cuisine).join(';'), 200),
    clip(t['addr:city'] ?? t['is_in:city'], 120),
    clip(t['addr:province'] ?? t['addr:state'] ?? t['is_in:province'], 120),
    `{${cats.join(',')}}`,
    clip(t.brand ?? null, 120),
    /^Q\d+$/.test(t['brand:wikidata'] ?? '') ? t['brand:wikidata'] : null,
  ];
}

function toLocality(l: Line): LocRow | null {
  const name = clip(l.tags['name:id'] ?? l.tags.name, 160);
  if (!name) return null;
  const pop = Number.parseInt((l.tags.population ?? '').replace(/[^0-9]/g, ''), 10);
  const context = clip([l.tags['is_in:city'], l.tags['is_in:province'] ?? l.tags['addr:province']].filter(Boolean).join(', '), 200);
  return [l.id, name, l.kind, l.lat, l.lng, Number.isFinite(pop) && pop > 0 && pop < 50_000_000 ? pop : null, context];
}

async function flushPlaces(rows: PlaceRow[]) {
  if (!rows.length) return;
  const values: unknown[] = [];
  const tuples = rows.map((r, i) => {
    values.push(...r);
    const b = i * 15;
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4}::float8,$${b + 5}::float8,$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13}::text[],$${b + 14},$${b + 15})`;
  });
  await prisma.$executeRawUnsafe(
    `INSERT INTO osm_stage (osm_id, name, kind, lat, lng, address, phone, website, opening_hours, cuisine, city, province, cats, brand, brand_wikidata)
     VALUES ${tuples.join(',')} ON CONFLICT (osm_id) DO NOTHING`,
    ...values,
  );
}

async function flushLocalities(rows: LocRow[]) {
  if (!rows.length) return;
  const values: unknown[] = [];
  const tuples = rows.map((r, i) => {
    values.push(...r);
    const b = i * 7;
    return `(gen_random_uuid(),$${b + 1},$${b + 2},$${b + 3},ST_SetSRID(ST_MakePoint($${b + 5}::float8,$${b + 4}::float8),4326)::geography,$${b + 6}::int,$${b + 7},now())`;
  });
  await prisma.$executeRawUnsafe(
    `INSERT INTO localities (id, osm_id, name, kind, location, population, context, updated_at)
     VALUES ${tuples.join(',')}
     ON CONFLICT (osm_id) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, location = EXCLUDED.location,
       population = EXCLUDED.population, context = COALESCE(EXCLUDED.context, localities.context), updated_at = now()`,
    ...values,
  );
}

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('usage: import-osm.ts <file.ndjson> [...]');
    process.exit(64);
  }
  const imp = await prisma.dataImport.create({ data: { provider: 'OSM', note: files.map((f) => f.split(/[\\/]/).pop()).join(', ').slice(0, 500) } });

  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS osm_stage`);
  await prisma.$executeRawUnsafe(`CREATE UNLOGGED TABLE osm_stage (
    osm_id text PRIMARY KEY, name text NOT NULL, kind text, lat float8 NOT NULL, lng float8 NOT NULL, address text, phone text,
    website text, opening_hours text, cuisine text, city text, province text, cats text[], brand text, brand_wikidata text, new_id uuid DEFAULT gen_random_uuid())`);

  let places = 0;
  let locs = 0;
  for (const file of files) {
    const rl = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
    let pBuf: PlaceRow[] = [];
    let lBuf: LocRow[] = [];
    for await (const raw of rl) {
      if (!raw.trim()) continue;
      const line = JSON.parse(raw) as Line;
      if (line.t === 'p') {
        const r = toPlace(line);
        if (r) pBuf.push(r);
      } else {
        const r = toLocality(line);
        if (r) lBuf.push(r);
      }
      if (pBuf.length >= BATCH) {
        await flushPlaces(pBuf);
        places += pBuf.length;
        pBuf = [];
      }
      if (lBuf.length >= BATCH) {
        await flushLocalities(lBuf);
        locs += lBuf.length;
        lBuf = [];
      }
    }
    await flushPlaces(pBuf);
    await flushLocalities(lBuf);
    places += pBuf.length;
    locs += lBuf.length;
    console.log(`${file}: staged (running totals: ${places} places, ${locs} localities)`);
  }

  // Update existing OSM-sourced restaurants in place.
  const updated = await prisma.$executeRawUnsafe(`
    UPDATE restaurants r SET
      name = CASE WHEN r.name_source = 'OSM' THEN s.name ELSE r.name END,
      location = ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326)::geography,
      address = s.address, phone = s.phone, website = s.website, opening_hours = s.opening_hours,
      cuisine = s.cuisine, place_kind = s.kind, city = COALESCE(s.city, r.city), province = COALESCE(s.province, r.province),
      brand = COALESCE(s.brand, r.brand), brand_wikidata = COALESCE(s.brand_wikidata, r.brand_wikidata),
      source_updated_at = now(), updated_at = now()
    FROM osm_stage s JOIN external_place_refs e ON e.provider = 'OSM' AND e.external_place_id = s.osm_id
    WHERE r.id = e.restaurant_id AND r.source = 'OSM'`);
  await prisma.$executeRawUnsafe(`
    UPDATE osm_stage s SET new_id = NULL FROM external_place_refs e WHERE e.provider = 'OSM' AND e.external_place_id = s.osm_id`);

  const inserted = await prisma.$executeRawUnsafe(`
    INSERT INTO restaurants (id, status, name, name_source, source, location, address, phone, website, opening_hours,
                             cuisine, place_kind, city, province, brand, brand_wikidata, source_updated_at, created_at, updated_at)
    SELECT new_id, 'ACTIVE', name, 'OSM', 'OSM', ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, address, phone, website,
           opening_hours, cuisine, kind, city, province, brand, brand_wikidata, now(), now(), now()
      FROM osm_stage WHERE new_id IS NOT NULL`);
  await prisma.$executeRawUnsafe(`
    INSERT INTO external_place_refs (id, restaurant_id, provider, external_place_id, created_at, updated_at)
    SELECT gen_random_uuid(), new_id, 'OSM', osm_id, now(), now() FROM osm_stage WHERE new_id IS NOT NULL`);

  // Categories derived from OSM tags (replaced on every import; community/admin categories are kept).
  await prisma.$executeRawUnsafe(`
    DELETE FROM restaurant_categories rc USING external_place_refs e, osm_stage s
     WHERE rc.source = 'OSM_TAG' AND rc.restaurant_id = e.restaurant_id AND e.provider = 'OSM' AND e.external_place_id = s.osm_id`);
  await prisma.$executeRawUnsafe(`
    INSERT INTO restaurant_categories (restaurant_id, category_id, source, created_at)
    SELECT e.restaurant_id, c.id, 'OSM_TAG', now()
      FROM osm_stage s
      JOIN external_place_refs e ON e.provider = 'OSM' AND e.external_place_id = s.osm_id
      JOIN categories c ON c.slug = ANY(s.cats)
    ON CONFLICT DO NOTHING`);

  // Fill missing city labels from the nearest city/town (≤25 km) and give villages/suburbs a context label.
  await prisma.$executeRawUnsafe(`
    UPDATE restaurants r SET city = (
        SELECT l.name FROM localities l WHERE l.kind IN ('city','town') AND ST_DWithin(l.location, r.location, 25000)
         ORDER BY l.location <-> r.location LIMIT 1)
      FROM external_place_refs e, osm_stage s
     WHERE r.city IS NULL AND e.restaurant_id = r.id AND e.provider = 'OSM' AND e.external_place_id = s.osm_id`);
  await prisma.$executeRawUnsafe(`
    UPDATE localities v SET context = (
        SELECT l.name FROM localities l WHERE l.kind IN ('city','town') AND l.id <> v.id AND ST_DWithin(l.location, v.location, 30000)
         ORDER BY l.location <-> v.location LIMIT 1)
     WHERE v.context IS NULL AND v.kind IN ('suburb','village')`);

  await prisma.$executeRawUnsafe(`DROP TABLE osm_stage`);
  await prisma.dataImport.update({ where: { id: imp.id }, data: { finishedAt: new Date(), inserted, updated, skipped: 0 } });
  console.log(JSON.stringify({ staged: places, inserted, updated, localities: locs }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
