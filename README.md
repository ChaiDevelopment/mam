# MAM! — Discover. Review. Eat.

MAM! is a location-based food discovery and review community for Indonesia. Users find places to eat
within a selectable radius (default **5 km**) on an OpenStreetMap map — 40k+ places across Indonesia imported from
OpenStreetMap, plus places added by the community (optional Google Maps data side-by-side) — with honest
**MAM! community** reviews, upload original food photos, save favorites and collections, and share finds.

> **MAM! is not a delivery marketplace.** No checkout, carts, payments, ordering or driver management.
> Delivery platforms (GoFood, GrabFood, ShopeeFood) appear only as verified outbound links.

| App | Stack | Path | Dev URL |
|---|---|---|---|
| REST API | NestJS 11 · Prisma 6 · PostgreSQL 17 + PostGIS · Redis | `apps/api` | http://localhost:4000/api/docs |
| Web | Next.js 15 (App Router) · Tailwind · TanStack Query · RHF + Zod · Leaflet + OpenStreetMap (Google Maps JS optional) | `apps/web` | http://localhost:3000 |
| Admin | Next.js 15 | `apps/admin` | http://localhost:3001 |
| Android | Kotlin · Jetpack Compose · Material 3 · Retrofit · DataStore · osmdroid (OpenStreetMap) · Credential Manager | `apps/android` | — |

Shared packages: `packages/shared-types`, `packages/validation` (Zod, used by API **and** web forms),
`packages/api-client`, `packages/design-tokens` (generates CSS variables, Tailwind preset and Kotlin tokens), `packages/config`.

## Quick start (Windows 10/11)

```powershell
# 1. One-time setup (checks tools, creates env files with random secrets, installs, migrates, seeds)
powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1              # with Docker Desktop
powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1 -PortablePostgres   # without Docker

# 2. Run API + web + admin (each in its own window)
#    Low-memory PC (8 GB): use production mode instead of dev mode:
#    powershell -ExecutionPolicy Bypass -File scripts\start-windows.ps1 -Build
powershell -ExecutionPolicy Bypass -File scripts\dev-windows.ps1

# 3. Tests
powershell -ExecutionPolicy Bypass -File scripts\test-windows.ps1          # unit + integration + component + Android
powershell -ExecutionPolicy Bypass -File scripts\test-windows.ps1 -E2E     # + Playwright end-to-end

# 4. Android debug APK
cd apps\android
gradlew.bat assembleDebug          # → app\build\outputs\apk\debug\app-debug.apk
# or: powershell -ExecutionPolicy Bypass -File scripts\build-android.ps1 -Test

# 5. Production builds
powershell -ExecutionPolicy Bypass -File scripts\build-web.ps1
```

No Google key is needed: discovery runs on OpenStreetMap + community places. Load the OSM data once with
`powershell -ExecutionPolicy Bypass -File scripts\import-osm.ps1` (≈1.7 GB download, ~10 min). Without Google credentials
you sign up / log in with **email + password** (Google login is optional). Demo accounts (development only):
`budi@mam.local`, `sari@mam.local`, `moderator@mam.local`, `admin@mam.local`, `superadmin@mam.local` — password `mam12345`.
Create a real admin with `npm run user:set-password -w @mam/api -- you@example.com "strong-password" SUPER_ADMIN`.
Discovery shows OSM/community data with a
clear notice, and `DEV_LOGIN_ENABLED=true` (development only) lets you sign in as the seeded demo
accounts `superadmin@mam.local`, `admin@mam.local`, `moderator@mam.local`, `budi@mam.local`.

## Quick start (Docker, any OS)

```bash
cp .env.example .env        # set POSTGRES_PASSWORD, JWT_ACCESS_SECRET, COOKIE_SECRET (+ Google keys)
docker compose up -d --build
```

## Manual commands

```bash
npm ci
npm run build:packages
cd apps/api && npx prisma migrate deploy && npm run prisma:seed && npm run start:dev
npm run dev -w @mam/web        # API_INTERNAL_URL=http://localhost:4000
npm run dev -w @mam/admin
```

| Task | Command |
|---|---|
| API unit tests | `cd apps/api && npx jest --config jest.config.js --selectProjects unit` |
| API integration tests (PostGIS) | `cd apps/api && TEST_DATABASE_URL=... npx jest --config jest.config.js --selectProjects integration --runInBand` |
| Web / admin component tests | `npx vitest run` in `apps/web` / `apps/admin` |
| E2E | `cd apps/web && E2E_DATABASE_URL=... npx playwright test` (after building API + web) |
| Android unit tests | `cd apps/android && gradlew.bat testDebugUnitTest` |
| Android UI tests (emulator) | `gradlew.bat connectedDebugAndroidTest` |
| Production build | `npm run build` |
| OpenAPI export | `npm run openapi:export -w @mam/api` → `docs/api/openapi.json` |

## Documentation

| Topic | File |
|---|---|
| Architecture & diagrams | [docs/architecture/SYSTEM_ARCHITECTURE.md](docs/architecture/SYSTEM_ARCHITECTURE.md) |
| Database & ERD | [docs/database/DATABASE_DESIGN.md](docs/database/DATABASE_DESIGN.md) |
| API reference | [docs/api/API_REFERENCE.md](docs/api/API_REFERENCE.md) · [openapi.json](docs/api/openapi.json) |
| Security | [docs/security/SECURITY_GUIDE.md](docs/security/SECURITY_GUIDE.md) |
| Deployment | [docs/deployment/DEPLOYMENT_GUIDE.md](docs/deployment/DEPLOYMENT_GUIDE.md) |
| Windows setup & troubleshooting | [docs/deployment/WINDOWS_SETUP.md](docs/deployment/WINDOWS_SETUP.md) |
| OpenStreetMap data, import & ODbL attribution | [docs/integrations/OPENSTREETMAP.md](docs/integrations/OPENSTREETMAP.md) |
| Google Maps integration (optional) & policies | [docs/integrations/GOOGLE_MAPS.md](docs/integrations/GOOGLE_MAPS.md) |
| Delivery platforms | [docs/integrations/EXTERNAL_PROVIDERS.md](docs/integrations/EXTERNAL_PROVIDERS.md) |
| Test strategy & results | [docs/testing/TEST_STRATEGY.md](docs/testing/TEST_STRATEGY.md) |
| User guide (ID) | [docs/user-guide/USER_GUIDE.md](docs/user-guide/USER_GUIDE.md) |
| Admin guide (ID) | [docs/admin/ADMIN_GUIDE.md](docs/admin/ADMIN_GUIDE.md) |
| Roadmap & known limitations | [docs/roadmap/ROADMAP.md](docs/roadmap/ROADMAP.md) |
