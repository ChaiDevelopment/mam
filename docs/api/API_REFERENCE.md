# API Reference (v1)

Base URL: `/api/v1`. Machine-readable spec: [`openapi.json`](openapi.json) (71 paths; regenerate with
`npm run openapi:export -w @mam/api`). Interactive docs in development: `http://localhost:4000/api/docs`.

## Conventions

* **Auth** — Web/admin: httpOnly cookies `mam_at` (15 min JWT) + `mam_rt` (30-day rotating refresh) and a readable
  `mam_csrf` cookie; every non-GET request must echo it in `X-CSRF-Token`. Android: `Authorization: Bearer <access>`.
* **Errors** — always `{ "statusCode", "error", "message", "details"?, "requestId" }`. Messages are Indonesian and safe to show.
  Validation errors return 400 with `details: [{ path, message }]`. Stack traces are never returned.
* **Pagination** — `?page=1&pageSize=20` (max 50) → `{ items, page, pageSize, total, hasMore }`.
* **Rate limits** — 120 req/min per user (or IP) by default; tighter on auth (10–30/min), reviews (10/min, plus a
  configurable daily cap), uploads (20/min, 40/h). Exceeding returns 429.
* **Provider status** — endpoints that depend on Google include `providers: [{ provider, ok, reason?, message? }]`
  and still return 200 with community data when Google fails.

## Endpoints

### Auth
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/auth/providers` | – | `{ google, devLogin }` |
| GET | `/auth/google/start?app=web\|admin&returnTo=/path` | – | 302 to Google (state + nonce + PKCE S256); `returnTo` must be a relative path |
| GET | `/auth/google/callback` | – | Verifies state/PKCE/nonce/ID token, sets cookies, 302 to app |
| GET | `/auth/nonce` | – | Single-use nonce (5 min) for native sign-in |
| POST | `/auth/google` | – | `{ idToken, nonce }` → `{ accessToken, refreshToken, expiresIn, user }` (Android) |
| POST | `/auth/refresh` | cookie or `{ refreshToken }` | Rotates; replaying an old token revokes the whole session family |
| POST | `/auth/logout` · `/auth/logout-all` | user | Revokes current / all sessions |
| GET | `/auth/me` | user | Current user (`Me`) |
| POST | `/auth/dev-login` | – | **Development only** (`DEV_LOGIN_ENABLED=true`, refused in production) |

### Users
| Method | Path | Notes |
|---|---|---|
| GET/PATCH | `/users/me` | Profile + preferences (`defaultRadiusMeters` ∈ 1000/2000/3000/5000/10000) |
| DELETE | `/users/me` | Body `{ "confirm": "HAPUS AKUN SAYA" }` — anonymizes the account |
| GET/DELETE | `/users/me/search-history` | Text-only history |
| GET | `/users/:idOrUsername` · `/users/:id/reviews` | Public profile / reviews (owner also sees own pending/hidden) |

### Discovery (Google, transient)
| Method | Path | Notes |
|---|---|---|
| GET | `/places/nearby?lat&lng&radius=5000&categories=a,b&budget&minRating&openNow&sort` | `sort`: NEAREST, COMMUNITY_RATING, MOST_REVIEWED, RECENTLY_REVIEWED |
| GET | `/places/search?q&lat&lng&radius` | OSM/community name search (pg_trgm) + Google Text Search when configured |
| GET | `/places/autocomplete?input&kind=food\|geocode&sessionToken` | `geocode` → OSM localities (`loc-<uuid>`), `food` → place names (`mam-<uuid>`); Google suggestions added when configured |
| POST | `/places` | Add a missing place (auth, 10/h). Body: `name, lat, lng, categories[1-3], address?, city?, phone?, website?, openingHours?`. `409` + `details.placeId` when a similar place exists ≤ 75 m |
| GET | `/places/:placeId` · `/places/:placeId/location` | `placeId` = Google Place ID (content fetched live) or `mam-<uuid>` (OSM/community, from DB) |
| GET | `/places/:placeId/external-reviews` | ≤ 5 Google reviews with author attribution + Google Maps links |
| GET | `/places/photo?name=places/…/photos/…&maxWidth=800` | 302 to a short-lived Google photo URL |
| GET | `/places/surprise?lat&lng&radius&categories&budget&minCommunityRating&openNow&excludePlaceIds` | Pick + transparent reasons |
| GET | `/home?lat&lng&radius` | Community sections (trending, top rated, budget, hidden gems, …) |
| GET | `/categories` | Active categories |

### Restaurants & reviews (MAM! community)
| Method | Path | Notes |
|---|---|---|
| POST | `/restaurants/resolve` | `{ googlePlaceId }` → internal restaurant (verified against Google) |
| GET | `/restaurants/:id` · `/statistics` · `/reviews?sort&page` · `/platform-links` · `/my-review` | Merged IDs resolve to the surviving record |
| POST | `/restaurants/:id/platform-links` | User-submitted official link (UNVERIFIED until admin verifies) |
| POST | `/reviews` | Create; **409** with `details.existingReviewId` if the user already reviewed the restaurant |
| GET/PATCH/DELETE | `/reviews/:id` | Edit updates the same record; delete is soft |
| GET | `/reviews/feed?scope=latest\|nearby&lat&lng&radius` | |
| POST/DELETE | `/reviews/:id/reactions` (`{ type }`) · `/reviews/:id/reactions/:type` | HELPFUL/YUMMY/FUNNY; no self-reactions |
| POST | `/reviews/:id/report` | `{ reason, details? }`; one report per user per review |
| POST | `/uploads/review-photo` | multipart `file` (JPEG/PNG/WebP ≤ 8 MB) → `{ id, url, thumbUrl }` |
| DELETE | `/uploads/:id` | Owner only |

### Personal
`GET/POST /collections`, `GET/PATCH/DELETE /collections/:id`, `POST /collections/:id/items`, `DELETE /collections/:id/items/:itemId`,
`GET /favorites`, `GET/POST/DELETE /favorites/:restaurantId`, `GET /notifications`, `PATCH /notifications/:id/read`,
`POST /notifications/read-all`, `GET /community/leaderboard`.

### Admin (role verified server-side on every request)
| Method | Path | Minimum role |
|---|---|---|
| GET | `/admin/overview`, `/admin/users`, `/admin/users/:id`, `/admin/reports`, `/admin/reviews`, `/admin/restaurants`, `/admin/restaurants/duplicates`, `/admin/categories` | MODERATOR |
| PATCH | `/admin/reports/:id` · POST `/admin/reviews/:id/moderate` | MODERATOR |
| PATCH | `/admin/users/:id` (status/role, hierarchy rules) | ADMIN |
| PATCH | `/admin/restaurants/:id` · POST `/:id/merge` · PUT `/:id/platform-links` · PATCH `/admin/categories/:id` | ADMIN |
| GET | `/admin/audit-logs`, `/admin/config`, `/admin/integrations`, `/admin/storage` · POST `/admin/integrations/check` | ADMIN |
| PATCH | `/admin/config` | SUPER_ADMIN |

Every admin mutation requires a `reason`/`note` and writes `admin_audit_logs` in the same transaction.

### Health
`GET /health` (liveness), `GET /health/ready` (DB + PostGIS + Redis), `GET /health/metrics` (Prometheus; block publicly).

## Examples

```bash
# Nearby (default 5 km)
curl "http://localhost:4000/api/v1/places/nearby?lat=-6.1754&lng=106.8272"

# Android-style login in development, then create a review
TOKEN=$(curl -s -X POST localhost:4000/api/v1/auth/dev-login -H 'Content-Type: application/json' \
  -d '{"email":"budi@mam.local","client":"ANDROID"}' | jq -r .accessToken)
curl -X POST localhost:4000/api/v1/reviews -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{
  "googlePlaceId":"ChIJ...","ratings":{"taste":5,"price":4,"portion":4,"cleanliness":3,"service":4},
  "text":"Kuahnya gurih, baksonya kenyal, pelayanannya cepat.","pricePaid":25000,"visitType":"DINE_IN","visitedAt":"2026-11-01"}'
```

Duplicate attempt response:

```json
{ "statusCode": 409, "error": "Conflict",
  "message": "Kamu sudah pernah mengulas tempat ini. Silakan edit ulasanmu yang ada.",
  "details": { "existingReviewId": "ea412159-…" }, "requestId": "…" }
```
