import type { CategorySlug } from '@mam/shared-types';

/**
 * Default mapping of MAM! categories to Google Places (New) Table A types.
 * Seeded into categories.google_types; admins can adjust it without a deploy.
 * Categories without Google types fall back to a text query (see TEXT_QUERY_FALLBACK).
 */
export const DEFAULT_CATEGORY_DEFS: { slug: CategorySlug; nameId: string; nameEn: string; emoji: string; googleTypes: string[] }[] = [
  { slug: 'indonesian', nameId: 'Indonesia', nameEn: 'Indonesian', emoji: '🍛', googleTypes: ['indonesian_restaurant'] },
  { slug: 'japanese', nameId: 'Jepang', nameEn: 'Japanese', emoji: '🍣', googleTypes: ['japanese_restaurant', 'ramen_restaurant', 'sushi_restaurant'] },
  { slug: 'korean', nameId: 'Korea', nameEn: 'Korean', emoji: '🥘', googleTypes: ['korean_restaurant'] },
  { slug: 'chinese', nameId: 'Tionghoa', nameEn: 'Chinese', emoji: '🥟', googleTypes: ['chinese_restaurant'] },
  {
    slug: 'western',
    nameId: 'Western',
    nameEn: 'Western',
    emoji: '🍝',
    googleTypes: ['american_restaurant', 'italian_restaurant', 'pizza_restaurant', 'steak_house', 'french_restaurant', 'hamburger_restaurant', 'sandwich_shop', 'brunch_restaurant'],
  },
  { slug: 'fast-food', nameId: 'Cepat Saji', nameEn: 'Fast food', emoji: '🍔', googleTypes: ['fast_food_restaurant'] },
  { slug: 'street-food', nameId: 'Kaki Lima', nameEn: 'Street food', emoji: '🍢', googleTypes: [] },
  { slug: 'seafood', nameId: 'Seafood', nameEn: 'Seafood', emoji: '🦐', googleTypes: ['seafood_restaurant'] },
  { slug: 'bakery', nameId: 'Roti & Kue', nameEn: 'Bakery', emoji: '🥐', googleTypes: ['bakery'] },
  { slug: 'dessert', nameId: 'Dessert', nameEn: 'Dessert', emoji: '🍨', googleTypes: ['dessert_shop', 'ice_cream_shop'] },
  { slug: 'coffee', nameId: 'Kopi', nameEn: 'Coffee', emoji: '☕', googleTypes: ['coffee_shop', 'cafe'] },
  { slug: 'beverages', nameId: 'Minuman', nameEn: 'Beverages', emoji: '🧋', googleTypes: ['tea_house'] },
  { slug: 'vegetarian', nameId: 'Vegetarian', nameEn: 'Vegetarian', emoji: '🥗', googleTypes: ['vegetarian_restaurant', 'vegan_restaurant'] },
  { slug: 'other', nameId: 'Lainnya', nameEn: 'Other', emoji: '🍽️', googleTypes: [] },
];

/** Base "food place" types used when no category filter is selected. */
export const BASE_FOOD_TYPES = ['restaurant', 'cafe', 'bakery', 'coffee_shop', 'meal_takeaway', 'fast_food_restaurant', 'food_court', 'dessert_shop', 'ice_cream_shop'];

/** Categories that Google types cannot express are searched with Text Search near the user. */
export const TEXT_QUERY_FALLBACK: Partial<Record<CategorySlug, string>> = {
  'street-food': 'jajanan kaki lima street food',
  beverages: 'minuman boba jus es teh',
};

export function categoriesFromTypes(types: string[] | undefined, defs: { slug: string; googleTypes: string[] }[]): CategorySlug[] {
  if (!types?.length) return [];
  const set = new Set(types);
  return defs.filter((d) => d.googleTypes.some((t) => set.has(t))).map((d) => d.slug as CategorySlug);
}
