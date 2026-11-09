import { addressFromOsm, categoriesFromOsm, normalizeWebsite, osmUrl, splitCuisine } from './osm-mapping';

describe('OpenStreetMap → MAM! category mapping', () => {
  it('maps Indonesian regional cuisines to Indonesian', () => {
    for (const cuisine of ['padang', 'sundanese', 'manadonese', 'javanese;indonesian', 'betawi', 'acehnese', 'batak', 'banjar', 'bugis']) {
      expect(categoriesFromOsm({ amenity: 'restaurant', cuisine })).toEqual(['indonesian']);
    }
  });

  it('maps multiple cuisines (max 3) and ignores unknown values', () => {
    expect(categoriesFromOsm({ amenity: 'restaurant', cuisine: 'japanese;sushi;korean;klingon' })).toEqual(['japanese', 'korean']);
    expect(categoriesFromOsm({ amenity: 'restaurant', cuisine: 'chinese;seafood;pizza;coffee_shop' })).toHaveLength(3);
  });

  it('uses amenity/shop defaults', () => {
    expect(categoriesFromOsm({ amenity: 'cafe' })).toEqual(['coffee']);
    expect(categoriesFromOsm({ amenity: 'ice_cream' })).toEqual(['dessert']);
    expect(categoriesFromOsm({ shop: 'bakery' })).toEqual(['bakery']);
    expect(categoriesFromOsm({ amenity: 'fast_food', name: 'McD' })).toEqual(['fast-food']);
  });

  it('prefers Indonesian name hints over amenity=fast_food (warung tagged as fast food)', () => {
    expect(categoriesFromOsm({ amenity: 'fast_food', name: 'Bakso Solo Pak Min' })).toEqual(['indonesian']);
    expect(categoriesFromOsm({ amenity: 'restaurant', name: 'Angkringan Lik Man' })).toEqual(['street-food']);
    expect(categoriesFromOsm({ amenity: 'restaurant', name: 'Warung Bu Tini' })).toEqual(['indonesian']);
    expect(categoriesFromOsm({ amenity: 'restaurant', name: 'Kopi Kenangan' })).toEqual(['coffee']);
  });

  it('does not let name hints override explicit cuisine tags', () => {
    expect(categoriesFromOsm({ amenity: 'restaurant', cuisine: 'japanese', name: 'Warung Jepang' })).toEqual(['japanese']);
  });

  it('marks vegetarian-only places and falls back to "other"', () => {
    expect(categoriesFromOsm({ amenity: 'restaurant', 'diet:vegetarian': 'only', cuisine: 'indonesian' })).toEqual(['indonesian', 'vegetarian']);
    expect(categoriesFromOsm({ amenity: 'restaurant', name: 'Citra Rasa' })).toEqual(['other']);
  });

  it('splits and normalizes cuisine lists', () => {
    expect(splitCuisine('Padang; Indonesian ,coffee shop')).toEqual(['padang', 'indonesian', 'coffee_shop']);
    expect(splitCuisine(undefined)).toEqual([]);
  });

  it('builds Indonesian-style addresses', () => {
    expect(addressFromOsm({ 'addr:street': 'Jalan Malioboro', 'addr:housenumber': '12', 'addr:city': 'Yogyakarta' })).toBe('Jalan Malioboro No. 12, Yogyakarta');
    expect(addressFromOsm({ 'addr:full': 'Jl. Braga No. 5, Bandung' })).toBe('Jl. Braga No. 5, Bandung');
    expect(addressFromOsm({})).toBeNull();
  });

  it('normalizes websites and rejects non-http schemes', () => {
    expect(normalizeWebsite('example.co.id')).toBe('https://example.co.id/');
    expect(normalizeWebsite('http://a.id;http://b.id')).toBe('http://a.id/');
    expect(normalizeWebsite('javascript:alert(1)')).toBeNull();
    expect(normalizeWebsite(undefined)).toBeNull();
  });

  it('links only well-formed OSM ids', () => {
    expect(osmUrl('node/123')).toBe('https://www.openstreetmap.org/node/123');
    expect(osmUrl('way/9')).toBe('https://www.openstreetmap.org/way/9');
    expect(osmUrl('node/abc')).toBeNull();
  });
});
