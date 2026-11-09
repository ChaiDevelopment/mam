# External Food Platforms (GoFood, GrabFood, ShopeeFood)

## Position

MAM! is **not** a delivery marketplace. Delivery platforms are information sources and outbound destinations only.

As of this implementation, **none of these platforms offers a public restaurant-search or menu API**. Their partner /
merchant APIs require signed agreements and their endpoints are not publicly documented. Therefore MAM!:

* does **not** call undocumented endpoints, scrape apps or websites, or bypass authentication, CAPTCHA or rate limits;
* does **not** display menus, prices, ratings or availability from these platforms;
* does **not** simulate a successful integration.

## Adapter contract

`apps/api/src/modules/integrations/food-platforms.ts`:

```ts
interface FoodPlatformProvider {
  getProviderName(): string;
  isIntegrated(): boolean;                 // false until an authorized implementation exists
  officialHosts(): string[];               // used to validate submitted links
  searchRestaurant(q): Promise<...>;       // throws ProviderNotIntegratedError today
  getRestaurantUrl(externalId): string | null;
  getAvailabilityStatus(): PlatformAvailability;   // 'NOT_INTEGRATED'
  getLastVerifiedAt(): Date | null;
}
```

`GoFoodProvider`, `GrabFoodProvider`, `ShopeeFoodProvider` implement it. A configured `*_PARTNER_API_KEY` alone does
not flip `isIntegrated()` — an implementation against the provider's official documentation must be added first.
Unit tests assert that adapters never return fabricated data.

## Working fallback (implemented)

| Source | Availability shown | How it gets there |
|---|---|---|
| Admin-verified link | `VERIFIED` + last-verified date | Admin opens the platform, confirms it's the same restaurant, saves the official URL (`PUT /admin/restaurants/:id/platform-links`, audited) |
| Admin-verified absence | `UNAVAILABLE` | Admin confirms the restaurant isn't on that platform |
| User-submitted link | `UNVERIFIED` ("belum diverifikasi") | Signed-in user submits an HTTPS link on the provider's official domain |
| Nothing | `NOT_INTEGRATED` ("Data tidak tersedia") | Default — explicit statement that MAM! has no authorized data |

Official domains enforced: GoFood `gofood.co.id`, `gojek.com`, `gojek.link`; GrabFood `food.grab.com`, `grab.com`,
`r.grab.com`; ShopeeFood `shopee.co.id`, `shopeefood.co.id`, `shp.ee` (HTTPS only, subdomain-safe matching).

## Adding an authorized integration later

1. Obtain a partner agreement and official API documentation.
2. Implement `searchRestaurant`/`getRestaurantUrl` in the provider class using only documented endpoints; return `true` from `isIntegrated()`.
3. Store results as `restaurant_platform_links` with `source = PROVIDER_API` and `last_verified_at`.
4. Respect the provider's caching/attribution terms; record calls with `IntegrationHealthService.record(...)`.
5. Add contract tests with recorded fixtures; never ship mocks as production behaviour.
