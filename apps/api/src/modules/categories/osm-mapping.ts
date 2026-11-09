import type { CategorySlug } from '@mam/shared-types';

/**
 * Maps OpenStreetMap tags (amenity/shop/cuisine/diet:*) — and, as a last resort, common Indonesian words in the
 * place name — to MAM! categories. Pure and unit-tested (osm-mapping.spec.ts).
 */

/** OSM `cuisine` values → MAM! category. Covers Indonesia's regional cuisines (Padang, Sunda, Manado, …). */
const CUISINE: Record<string, CategorySlug> = {
  // Indonesian & regional
  indonesian: 'indonesian', regional: 'indonesian', local: 'indonesian',
  padang: 'indonesian', minangkabau: 'indonesian', minang: 'indonesian', sundanese: 'indonesian', sunda: 'indonesian',
  javanese: 'indonesian', jawa: 'indonesian', betawi: 'indonesian', balinese: 'indonesian', bali: 'indonesian',
  manadonese: 'indonesian', manado: 'indonesian', minahasa: 'indonesian', acehnese: 'indonesian', aceh: 'indonesian',
  batak: 'indonesian', palembang: 'indonesian', banjar: 'indonesian', banjarese: 'indonesian', bugis: 'indonesian',
  makassar: 'indonesian', makassarese: 'indonesian', madurese: 'indonesian', madura: 'indonesian', lombok: 'indonesian',
  sasak: 'indonesian', papuan: 'indonesian', ambon: 'indonesian', moluccan: 'indonesian', dayak: 'indonesian',
  malay: 'indonesian', melayu: 'indonesian', peranakan: 'indonesian', satay: 'indonesian', sate: 'indonesian',
  soto: 'indonesian', bakso: 'indonesian', meatball: 'indonesian', nasi_goreng: 'indonesian', rice: 'indonesian',
  gudeg: 'indonesian', pecel: 'indonesian', rawon: 'indonesian', padangnese: 'indonesian',
  fried_chicken: 'fast-food', noodle: 'indonesian', noodles: 'indonesian', mie: 'indonesian', porridge: 'indonesian',
  // East Asian
  japanese: 'japanese', sushi: 'japanese', ramen: 'japanese', udon: 'japanese', yakiniku: 'japanese', teppanyaki: 'japanese',
  korean: 'korean', chinese: 'chinese', cantonese: 'chinese', dim_sum: 'chinese', hokkien: 'chinese', taiwanese: 'chinese',
  hakka: 'chinese', szechuan: 'chinese',
  // Western
  western: 'western', american: 'western', italian: 'western', pizza: 'western', burger: 'western', steak_house: 'western',
  steak: 'western', french: 'western', european: 'western', mexican: 'western', sandwich: 'western', pasta: 'western',
  international: 'western', grill: 'western', barbecue: 'western', bbq: 'western', brunch: 'western', breakfast: 'western',
  // Others
  seafood: 'seafood', fish: 'seafood', fish_and_chips: 'seafood',
  coffee_shop: 'coffee', coffee: 'coffee',
  bubble_tea: 'beverages', tea: 'beverages', juice: 'beverages', drinks: 'beverages', beverages: 'beverages', milk_tea: 'beverages',
  ice_cream: 'dessert', dessert: 'dessert', cake: 'dessert', donut: 'dessert', frozen_yogurt: 'dessert', waffle: 'dessert',
  pastry: 'bakery', bakery: 'bakery', bread: 'bakery',
  vegetarian: 'vegetarian', vegan: 'vegetarian',
  street_food: 'street-food',
  fast_food: 'fast-food', kebab: 'fast-food', hot_dog: 'fast-food',
};

/** Words in Indonesian place names that reliably indicate a category (applied only when tags say nothing). */
const NAME_HINTS: [RegExp, CategorySlug][] = [
  [/\b(angkringan|kaki lima|gerobak|pkl|jajanan|gorengan|cilok|seblak|martabak|terang bulan)\b/i, 'street-food'],
  [/\b(warteg|warung makan|rumah makan|rm\.?|nasi|soto|sate|bakso|mie ayam|mi ayam|gudeg|pecel|rawon|padang|ayam penyet|lalapan|pempek|coto|konro|papeda|gado[- ]gado|ketoprak|lontong|ikan bakar|bebek)\b/i, 'indonesian'],
  [/\b(seafood|kepiting|udang|ikan|cumi)\b/i, 'seafood'],
  [/\b(kopi|coffee|kafe|cafe|espresso)\b/i, 'coffee'],
  [/\b(boba|bubble tea|thai tea|es teh|jus|juice|teh)\b/i, 'beverages'],
  [/\b(roti|bakery|bakeri|toko kue|kue|donat|pastry)\b/i, 'bakery'],
  [/\b(es krim|ice cream|gelato|dessert)\b/i, 'dessert'],
  [/\b(ramen|sushi|bento|yakiniku|japanese)\b/i, 'japanese'],
  [/\b(korean|k-food|bibimbap|tteokbokki)\b/i, 'korean'],
  [/\b(dimsum|dim sum|bakmi|bakmie|chinese|kwetiau)\b/i, 'chinese'],
  [/\b(pizza|burger|steak|pasta|grill)\b/i, 'western'],
  [/\b(vegetarian|vegan)\b/i, 'vegetarian'],
  [/\b(warung|warmindo|kedai|depot|lesehan|kantin)\b/i, 'indonesian'],
];

export interface OsmFoodTags {
  amenity?: string;
  shop?: string;
  cuisine?: string;
  name?: string;
  'diet:vegetarian'?: string;
  'diet:vegan'?: string;
}

export function splitCuisine(cuisine: string | undefined): string[] {
  if (!cuisine) return [];
  return cuisine
    .split(/[;,]/)
    .map((c) => c.trim().toLowerCase().replace(/\s+/g, '_'))
    .filter(Boolean)
    .slice(0, 8);
}

export function categoriesFromOsm(tags: OsmFoodTags): CategorySlug[] {
  const out = new Set<CategorySlug>();
  for (const c of splitCuisine(tags.cuisine)) {
    const slug = CUISINE[c];
    if (slug) out.add(slug);
  }
  if (tags.shop === 'bakery' || tags.shop === 'pastry') out.add('bakery');
  if (tags.shop === 'confectionery' || tags.amenity === 'ice_cream') out.add('dessert');
  if (tags['diet:vegetarian'] === 'only' || tags['diet:vegan'] === 'only' || tags['diet:vegan'] === 'yes') out.add('vegetarian');

  // Name hints come before amenity defaults: in Indonesia `amenity=fast_food` is often used for warung.
  if (!out.size && tags.name) {
    for (const [re, slug] of NAME_HINTS) {
      if (re.test(tags.name)) {
        out.add(slug);
        break;
      }
    }
  }
  if (!out.size && tags.amenity === 'fast_food') out.add('fast-food');
  if (!out.size && tags.amenity === 'cafe') out.add('coffee');
  if (!out.size) out.add('other');
  return [...out].slice(0, 3);
}

/** Human-readable address from OSM addr:* tags (Indonesian order: street no, district, city). */
export function addressFromOsm(t: Record<string, string | undefined>): string | null {
  if (t['addr:full']) return t['addr:full'].slice(0, 300);
  const street = [t['addr:street'], t['addr:housenumber'] && `No. ${t['addr:housenumber']}`].filter(Boolean).join(' ');
  const parts = [street, t['addr:subdistrict'], t['addr:district'], t['addr:city'], t['addr:postcode']].filter((p) => p && p.trim());
  return parts.length ? parts.join(', ').slice(0, 300) : null;
}

export function normalizeWebsite(url: string | undefined): string | null {
  if (!url) return null;
  const u = url.trim().split(/[;\s]/)[0];
  if (!u) return null;
  const withScheme = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString().slice(0, 300) : null;
  } catch {
    return null;
  }
}

export function osmUrl(osmId: string): string | null {
  return /^(node|way|relation)\/\d+$/.test(osmId) ? `https://www.openstreetmap.org/${osmId}` : null;
}
