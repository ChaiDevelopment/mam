# System Architecture

## Overview

```mermaid
flowchart LR
  subgraph Clients
    W[Web · Next.js 15]
    A[Admin · Next.js 15]
    M[Android · Compose]
  end
  subgraph Edge
    N[nginx · TLS, rate limits]
  end
  subgraph Backend
    API[NestJS API /api/v1]
    PG[(PostgreSQL 17 + PostGIS)]
    R[(Redis)]
    S[(S3-compatible storage)]
  end
  G[Google Places API New]
  GO[Google OAuth / OIDC]

  W -- same-origin /api/v1 proxy --> API
  A -- same-origin /api/v1 proxy --> API
  M -- Bearer tokens --> N --> API
  W & A --> N
  API --> PG
  API --> R
  API --> S
  API -- server key, field masks --> G
  API -- ID token verification --> GO
  W -- browser key --> G2[Maps JavaScript API]
  M -- Android key --> G3[Maps SDK for Android]
```

* **Web and admin never call the API cross-origin.** A runtime proxy route (`src/app/api/v1/[...path]/route.ts`)
  forwards requests to `API_INTERNAL_URL`, so session cookies are first-party and the CSRF double-submit
  cookie is readable by the page. The upstream URL is read per request, so one Docker image works in every environment.
* **Android** uses short-lived Bearer access tokens + rotating refresh tokens stored with Android Keystore encryption.
* **Google content is fetched live** by the API (server key) and never persisted (see [GOOGLE_MAPS.md](../integrations/GOOGLE_MAPS.md)).

## Backend modules (`apps/api/src/modules`)

| Module | Responsibility |
|---|---|
| `auth` | Google OAuth (web: auth-code + PKCE + state + nonce; Android: native ID token + server nonce), refresh rotation with reuse detection, logout, dev login (dev only) |
| `users` | Profile, preferences, search history, account deletion (anonymization) |
| `places` | Google Places (New) client with explicit field masks; nearby/text search/autocomplete/details/photos/external reviews; discovery filters, sorting, Surprise Me |
| `restaurants` | Internal restaurant references (UUID ↔ Google Place ID), community statistics, ≤30-day coordinate cache, platform links |
| `categories` | Category ↔ Google type mapping (admin-editable) |
| `reviews` | Review engine: one review per user/restaurant, revisions, spam heuristics, reactions, reports, auto-hide |
| `uploads` | Content-validated image upload, EXIF/GPS stripping, WebP variants, local/S3 storage |
| `collections`, `favorites` | Personal lists |
| `community` | Badges (verifiable, quality-gated), leaderboard, home sections |
| `notifications` | In-app notifications (moderation notices cannot be muted) |
| `admin` | Overview analytics, user management, moderation, reports, restaurant merge/duplicates, platform-link verification, categories, audit logs, config, integration health, storage |
| `integrations` | Delivery-platform adapter registry, integration health tracking |
| `retention` | Scheduled purges (Google coordinate cache, orphan uploads, search history, sessions, deleted-account text) |
| `health` | Liveness, readiness (DB + PostGIS + Redis), Prometheus metrics |

Cross-cutting (`src/common`): global guards (Auth → Roles → CSRF → Throttler), zod validation pipe, consistent error
envelope, request ID + structured access logs (coordinates never logged), metrics, audit service, runtime config.

## Request lifecycle

```mermaid
sequenceDiagram
  participant B as Browser
  participant P as Next proxy
  participant G as Guards
  participant C as Controller/Service
  participant DB as PostgreSQL
  B->>P: PATCH /api/v1/reviews/:id (cookies + X-CSRF-Token)
  P->>G: forward (cookies, CSRF header, X-Forwarded-For)
  G->>G: AuthGuard: verify JWT, load role/status from DB (30 s cache)
  G->>G: RolesGuard (if @MinRole) · CsrfGuard (cookie auth) · Throttler (per user/IP)
  G->>C: ZodPipe validates body
  C->>DB: transaction: revision snapshot + update same row
  C-->>B: 200 ReviewView | {statusCode,error,message,requestId}
```

## Discovery flow

1. Client gets a one-shot location (or manual area / map centre) — never background tracking.
2. `GET /places/nearby?lat&lng&radius=5000&categories&budget&sort` (radius ∈ 1/2/3/5/10 km).
3. API calls `places:searchNearby` with a **circle `locationRestriction`** and an explicit field mask
   (categories without Google types use `places:searchText` with a location bias).
4. Results are normalized, distance computed (haversine), **re-filtered to the radius**, joined with MAM! community stats,
   filtered (budget/rating/open-now only when data exists — missing data is counted, never guessed) and sorted.
5. If Google is unavailable, the API returns community restaurants within the radius via **PostGIS `ST_DWithin`**,
   with an explicit provider status so the UI shows a notice.

## Design system

`packages/design-tokens/src/index.ts` is the single source of truth. `npm run build -w @mam/design-tokens` emits
CSS custom properties (light + dark), a Tailwind preset used by web and admin, and
`apps/android/.../ui/theme/MamTokens.kt` for Compose. Chart colours were validated with a CVD/contrast checker.

## Key decisions

| Decision | Rationale |
|---|---|
| Zod schemas shared by API and web | One validation source; Swagger generated from the same schemas |
| Same-origin proxy instead of CORS cookies | First-party cookies, simpler CSRF, works behind any domain |
| Role & status read from DB on every request (cached 30 s) | Suspension and demotion take effect immediately; tokens can't carry stale privileges |
| Google names fetched live, not stored | Google Maps Platform terms permit storing Place IDs (indefinitely) and lat/lng (≤ 30 days) only |
| Manual DI on Android | Fewer build-time dependencies (no kapt/KSP), explicit wiring, easy fakes in tests |
| In-memory fallbacks for Redis | Local development without Docker; production should run Redis for multi-instance rate limits |
