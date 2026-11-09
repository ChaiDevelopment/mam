import { FoodPlatformRegistry, ProviderNotIntegratedError } from './food-platforms';

describe('FoodPlatformRegistry', () => {
  const reg = new FoodPlatformRegistry();

  it('exposes GoFood, GrabFood and ShopeeFood adapters implementing the provider contract', () => {
    expect(reg.all().map((p) => p.getProviderName())).toEqual(['GoFood', 'GrabFood', 'ShopeeFood']);
    for (const p of reg.all()) {
      expect(typeof p.searchRestaurant).toBe('function');
      expect(typeof p.getRestaurantUrl).toBe('function');
      expect(typeof p.getLastVerifiedAt).toBe('function');
    }
  });

  it('reports NOT_INTEGRATED and never fabricates data without authorized access', async () => {
    for (const p of reg.all()) {
      expect(p.isIntegrated()).toBe(false);
      expect(p.getAvailabilityStatus()).toBe('NOT_INTEGRATED');
      expect(p.getRestaurantUrl('anything')).toBeNull();
      expect(p.getLastVerifiedAt()).toBeNull();
      await expect(p.searchRestaurant({ name: 'x', lat: 0, lng: 0 })).rejects.toBeInstanceOf(ProviderNotIntegratedError);
    }
  });

  it('accepts only HTTPS links on official provider domains', () => {
    expect(reg.isOfficialUrl('GOFOOD', 'https://gofood.co.id/jakarta/restaurant/bakso-123')).toBe(true);
    expect(reg.isOfficialUrl('GRABFOOD', 'https://food.grab.com/id/id/restaurant/abc')).toBe(true);
    expect(reg.isOfficialUrl('SHOPEEFOOD', 'https://shopee.co.id/now-food/abc')).toBe(true);
    expect(reg.isOfficialUrl('GOFOOD', 'http://gofood.co.id/x')).toBe(false);
    expect(reg.isOfficialUrl('GOFOOD', 'https://gofood.co.id.evil.example/x')).toBe(false);
    expect(reg.isOfficialUrl('GRABFOOD', 'https://gofood.co.id/x')).toBe(false);
    expect(reg.isOfficialUrl('GOFOOD', 'not a url')).toBe(false);
  });
});
