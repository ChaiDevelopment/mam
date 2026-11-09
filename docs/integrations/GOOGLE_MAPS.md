# Google Maps Platform Integration (optional)

> MAM! works without Google: the default data and map provider is OpenStreetMap — see [OPENSTREETMAP.md](OPENSTREETMAP.md).
> When `GOOGLE_MAPS_SERVER_API_KEY` is set, live Google results are merged with OSM/community places.

## APIs used

| API | Where | Purpose |
|---|---|---|
| Places API (New) — Nearby Search | API server | Discovery within a circle (`locationRestriction`, max 20 results) |
| Places API (New) — Text Search | API server | Search box; categories with no Google type (e.g. *kaki lima*) |
| Places API (New) — Autocomplete | API server | Manual location search |
| Places API (New) — Place Details | API server | Detail page, live restaurant names, coordinate refresh |
| Places API (New) — Place Photos | API server (proxy) | 302 to a short-lived photo URL; images never stored |
| Maps JavaScript API | Web | Map view, markers, radius circle (`@vis.gl/react-google-maps`) |
| Maps SDK for Android | Android | Map view (`maps-compose`) |
| Google Identity (OAuth 2.0 / OIDC) | API + Android | MAM! account login |

## Field masks (no wildcards)

Defined in `apps/api/src/modules/places/google-places.client.ts` (`FIELD_MASKS`) and unit-tested to contain no `*`:

* **nearby / text search**: `places.id, displayName, shortFormattedAddress, location, primaryType, types, rating,
  userRatingCount, priceLevel, priceRange, currentOpeningHours.openNow, photos, googleMapsUri`
* **details**: the above + `formattedAddress, currentOpeningHours.weekdayDescriptions, nationalPhoneNumber, websiteUri, businessStatus`
* **reviews**: `id, rating, userRatingCount, reviews, googleMapsUri, googleMapsLinks`
* **name only** (feeds, favorites): `id, displayName` · **location only**: `id, location, displayName, formattedAddress`

The billing SKU is determined by the most expensive field. `rating`, `priceLevel`, `openNow` and `reviews` are
Enterprise-tier fields — review pricing at https://developers.google.com/maps/billing-and-pricing/pricing and set
budgets/quotas in Google Cloud Console.

## Storage & caching policy (as implemented)

| Data | Stored? |
|---|---|
| Place ID | **Yes, indefinitely** (`external_place_refs`) — permitted by Google's Place ID policy |
| Latitude/longitude | **Up to 30 days** (`restaurants.location` + `location_cached_at`), purged by `RetentionService`, refreshed when the place appears in live results |
| Names, addresses, ratings, reviews, photos, hours, phone, website | **Never stored** — fetched live per request. Redis is not used for Google content; Next.js fetches use `cache: 'no-store'` |
| Restaurant names in MAM! | Only community/admin-provided names (`name_source`) |

Consequence: community feeds and favorites call Place Details (`id,displayName`) live for display names
(max 5 concurrent per request). This costs money at scale; set quotas, and admins can store an ADMIN name for
frequently shown places. **Have counsel confirm your use against the current Google Maps Platform Terms and Service
Specific Terms before launch** — this design follows them as documented but is not legal advice.

## Attribution & display rules (as implemented)

* Google-sourced data is visually and textually labeled ("Data Google Maps", grey Google tag) and is **never combined**
  with MAM! community ratings into one number.
* Text attribution "Google Maps" is shown wherever Places content appears outside a Google map; maps render Google's own logo.
* Review and photo **author attributions** (name, profile link, photo) are displayed as provided, unmodified.
* Each place links to Google Maps (`googleMapsUri`, or `https://www.google.com/maps/search/?api=1&query_place_id=…`).
* Google returns **at most 5 reviews** per place; the UI says so and links to all reviews on Google Maps. MAM! does
  not claim to retrieve all Google reviews.
* "Tulis ulasan di Google Maps" opens `googleMapsLinks.writeAReviewUri` — a separate action by the user. MAM! never
  posts reviews to Google and does not use undocumented interfaces.
* Privacy policy links to Google's Privacy Policy and Maps Terms of Service.
* JSON-LD structured data on public pages contains **only MAM! ratings**.

## Keys & restrictions

| Key | Env var | Restrict to |
|---|---|---|
| Server | `GOOGLE_MAPS_SERVER_API_KEY` | Places API (New) only; server egress IPs |
| Browser | `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | Maps JavaScript API only; HTTP referrers `https://mam.id/*`, `http://localhost:3000/*` |
| Android | `MAPS_API_KEY_ANDROID` (secrets.properties) | Maps SDK for Android; package `id.mam.app` / `id.mam.app.debug` + SHA-1 |
| Map ID | `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | Required for Advanced Markers (`DEMO_MAP_ID` for dev) |

## OAuth setup

1. Google Cloud Console → APIs & Services → OAuth consent screen (External, scopes `openid email profile`).
2. Credentials → **Web application** client → redirect URIs: `http://localhost:3000/api/v1/auth/google/callback`,
   `http://localhost:3001/api/v1/auth/google/callback` (+ production equivalents). Put ID/secret in `apps/api/.env`.
3. Credentials → **Android** client: package `id.mam.app.debug`, SHA-1 of the debug keystore
   (`keytool -list -v -keystore %USERPROFILE%\.android\debug.keystore -alias androiddebugkey -storepass android`).
4. Android `secrets.properties`: `GOOGLE_WEB_CLIENT_ID=<web client id>` (used as `serverClientId`).

## Failure behaviour

| Situation | Behaviour |
|---|---|
| Key missing | `providers[0].reason = NOT_CONFIGURED`; community results within radius via PostGIS; notice shown |
| Timeout (6 s) / 5xx / 429 | Same fallback with reason `TIMEOUT` / `UPSTREAM_ERROR` / `QUOTA_EXCEEDED`; errors counted in `integration_status` and Prometheus |
| Place not found | 404 to client |
| External reviews unavailable | Empty list + explanation + Google Maps link; rest of the page unaffected |

## Verification status

All Google calls are implemented against the documented Places API (New) and verified with **mocked HTTP responses**
in unit and integration tests. They have **not been exercised against live Google endpoints** in this environment
because no credentials were provided. Before launch: configure keys, open a place page, confirm photos, reviews,
attribution and billing SKUs in the Cloud Console.
