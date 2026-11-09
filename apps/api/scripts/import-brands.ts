/**
 * Loads curated food & drink brands (Wikidata CC0 facts + freely licensed Wikimedia Commons logos/photos) and links
 * restaurants to them.
 *
 *   npx ts-node --transpile-only scripts/import-brands.ts <brands.json>
 *
 * Linking: OSM `brand:wikidata` (already on the restaurant) wins; otherwise a restaurant whose name equals a brand
 * name/alias, or starts with it followed by a space (e.g. "Holland Bakery Cikini"), is linked. Aliases shorter than
 * 3 characters are ignored for prefix matches. Only files whose license is PD / CC0 / CC BY / CC BY-SA are stored.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

interface MediaRef {
  file?: string;
  thumbUrl?: string;
  url?: string;
  license?: string;
  licenseUrl?: string;
  author?: string;
  sourceUrl?: string;
}
interface BrandIn {
  name: string;
  aliases?: string[];
  wikidata: string | null;
  description?: string;
  descriptionId?: string;
  website?: string;
  category?: string;
  logo?: MediaRef | null;
  image?: MediaRef | null;
}

const FREE = /^(public domain|pd([- ].*)?|cc0.*|cc[- ]by([- ]sa)?[- ]?\d(\.\d)?.*)$/i;
const CATEGORIES = new Set(['bakery', 'coffee', 'fast-food', 'indonesian', 'japanese', 'korean', 'chinese', 'western', 'dessert', 'beverages', 'seafood', 'street-food', 'vegetarian', 'other']);
const httpsUrl = (u?: string | null) => (u && /^https:\/\/[^\s]+$/i.test(u) ? u.slice(0, 600) : null);
/** Wikimedia file URLs without tracking parameters. */
const wikimediaUrl = (u?: string | null) => {
  const v = httpsUrl(u)?.replace(/\?utm_[^#]*$/, '');
  return v && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(v) ? v : null;
};
/**
 * Names too generic to link restaurants by name alone (many unrelated warung are called "Sederhana").
 * Such brands are linked only through OSM `brand:wikidata` tags.
 */
const GENERIC_ALIASES = new Set(['sederhana', 'padang sederhana', 'rumah makan sederhana', 'rm sederhana', 'mako', 'quickly', 'harvest', 'the harvest']);
const clip = (v: string | null | undefined, n: number) => (v ? v.replace(/<[^>]*>/g, '').trim().slice(0, n) || null : null);

/** Commons may repeat the author ("Unknown authorUnknown author"). Keep it once; unknown → Indonesian label. */
export function cleanAuthor(a: string | null): string {
  const t = (a ?? '').replace(/\s+/g, ' ').trim();
  const half = t.length / 2;
  const once = (t.length % 2 === 0 && t.slice(0, half) === t.slice(half) ? t.slice(0, half) : t).trim();
  return !once || /^unknown author$/i.test(once) ? 'pembuat tidak diketahui' : once;
}

/** Stable key for brands without a Wikidata item: "MAM-kopi-tuku" (max 20 chars, matches the DB CHECK). */
export function brandKey(name: string): string {
  const slug = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `MAM-${slug}`.slice(0, 20).replace(/-+$/, '');
}

/** Accepts a media reference only when it is a Wikimedia Commons file with a free license and an author. */
export function freeMedia(m: MediaRef | null | undefined) {
  if (!m || !m.license || !FREE.test(m.license.trim())) return null;
  const url = wikimediaUrl(m.url);
  const thumb = wikimediaUrl(m.thumbUrl) ?? url;
  if (!url || !thumb) return null;
  return {
    url,
    thumb,
    license: clip(m.license, 80)!,
    licenseUrl: httpsUrl(m.licenseUrl)?.slice(0, 300) ?? null,
    author: cleanAuthor(clip(m.author, 300)),
    source: httpsUrl(m.sourceUrl) ?? (m.file ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(m.file.replace(/ /g, '_'))}` : null),
  };
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('usage: import-brands.ts <brands.json>');
  const data = JSON.parse(readFileSync(file, 'utf8')) as { brands: BrandIn[] };
  const prisma = new PrismaClient();
  let stored = 0;
  let logos = 0;
  let images = 0;
  try {
    for (const b of data.brands) {
      if (!b.name?.trim()) continue;
      // Key: Wikidata QID, or MAM-<slug> for real chains without a Wikidata item (e.g. Kopi Tuku).
      const key = b.wikidata && /^Q\d+$/.test(b.wikidata) ? b.wikidata : brandKey(b.name);
      const logo = freeMedia(b.logo);
      const image = freeMedia(b.image);
      const row = {
        name: b.name.trim().slice(0, 120),
        aliases: [...new Set((b.aliases ?? []).map((a) => a.trim()).filter((a) => a && a.length <= 120 && !GENERIC_ALIASES.has(a.toLowerCase())))].slice(0, 12),
        description: clip(b.descriptionId ?? b.description, 300),
        website: httpsUrl(b.website?.replace(/^http:\/\//i, 'https://'))?.slice(0, 300) ?? null,
        category: b.category && CATEGORIES.has(b.category) ? b.category : null,
        logoUrl: logo?.url ?? null,
        logoThumbUrl: logo?.thumb ?? null,
        logoLicense: logo?.license ?? null,
        logoLicenseUrl: logo?.licenseUrl ?? null,
        logoAuthor: logo?.author ?? null,
        logoSourceUrl: logo?.source ?? null,
        imageUrl: image?.url ?? null,
        imageThumbUrl: image?.thumb ?? null,
        imageLicense: image?.license ?? null,
        imageLicenseUrl: image?.licenseUrl ?? null,
        imageAuthor: image?.author ?? null,
        imageSourceUrl: image?.source ?? null,
        mediaSource: logo || image ? 'COMMONS' : null,
        permissionNote: null,
      };
      const existing = await prisma.brand.findUnique({ where: { wikidata: key }, select: { mediaSource: true } });
      // Never replace logos/photos supplied with the brand owner's permission (scripts/fetch-brand-logos.ts).
      const update =
        existing?.mediaSource === 'OWNER' && !logo && !image
          ? { name: row.name, aliases: row.aliases, description: row.description, website: row.website, category: row.category }
          : row;
      await prisma.brand.upsert({ where: { wikidata: key }, create: { wikidata: key, ...row }, update });
      stored++;
      if (logo) logos++;
      if (image) images++;
    }

    // Link restaurants by exact name / "Brand <branch>" prefix where OSM gave no brand:wikidata.
    const linked = await prisma.$executeRawUnsafe(`
      WITH names AS (
        SELECT b.wikidata, b.name AS brand_name, lower(n) AS n
          FROM brands b, LATERAL unnest(array_append(b.aliases, b.name)) AS n
         WHERE length(n) >= 3 AND lower(n) <> ALL($1::text[])
      )
      UPDATE restaurants r SET brand_wikidata = m.wikidata, brand = COALESCE(r.brand, m.brand_name), updated_at = now()
        FROM (
          SELECT DISTINCT ON (r2.id) r2.id, n.wikidata, n.brand_name
            FROM restaurants r2 JOIN names n
              ON lower(r2.name) = n.n OR (length(n.n) >= 4 AND lower(r2.name) LIKE n.n || ' %')
           WHERE r2.brand_wikidata IS NULL AND r2.source IN ('OSM', 'COMMUNITY') AND r2.name IS NOT NULL
           ORDER BY r2.id, length(n.n) DESC
        ) m
       WHERE r.id = m.id`, [...GENERIC_ALIASES]);
    // Restaurants tagged with a brand:wikidata we know nothing about keep the QID (no logo shown).
    const counts = await prisma.$queryRaw<{ linked: bigint; brands: bigint }[]>`
      SELECT count(*) FILTER (WHERE r.brand_wikidata IN (SELECT wikidata FROM brands)) AS linked,
             (SELECT count(*) FROM brands) AS brands
        FROM restaurants r WHERE r.brand_wikidata IS NOT NULL`;
    console.log(JSON.stringify({ brandsInFile: data.brands.length, stored, freeLogos: logos, freeImages: images, newlyLinkedByName: linked, restaurantsWithKnownBrand: Number(counts[0].linked), brandsInDb: Number(counts[0].brands) }));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
