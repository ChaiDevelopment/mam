# Test Strategy & Results

## Layers

| Layer | Tooling | Location | Runs against |
|---|---|---|---|
| API unit | Jest + ts-jest | `apps/api/src/**/*.spec.ts` | pure logic, mocked `fetch` |
| API integration | Jest + Supertest | `apps/api/test/*.int-spec.ts` | full Nest app + **real PostgreSQL/PostGIS** (`mam_itest`) |
| Web component | Vitest + Testing Library (jsdom) | `apps/web/src/**/*.test.tsx` | real providers, mocked `fetch` |
| Admin component | Vitest | `apps/admin/src/**/*.test.tsx` | |
| E2E | Playwright (desktop + Pixel 7 viewport) | `apps/web/e2e` | built API + web, real DB (`mam_e2e`), Google intentionally unconfigured |
| Android unit / ViewModel / repository | JUnit4 + coroutines-test + MockWebServer | `apps/android/app/src/test` | JVM |
| Android UI / navigation | Compose UI test | `apps/android/app/src/androidTest` | emulator/device |

## Results (local run, Windows 10, 2026-11-07)

| Suite | Result |
|---|---|
| API unit | **60 / 60 passed** (9 suites) |
| API integration (PostgreSQL 17.10 + PostGIS 3.6.2) | **47 / 47 passed** (5 suites) |
| Web component | **15 / 15 passed** |
| Admin component | **4 / 4 passed** |
| Playwright E2E | **20 / 20 passed** (10 scenarios × desktop + mobile) |
| Android unit | **21 / 21 passed** |
| Android instrumented UI tests | **compiled** (`assembleDebugAndroidTest`); **not executed** — no emulator available in this environment |
| Builds | API `nest build` ✓ · web `next build` ✓ · admin `next build` ✓ · `gradlew.bat assembleDebug` ✓ |
| Docker images / compose | **not built** — Docker is not installed in this environment (CI builds them) |
| Live Google APIs / Google OAuth | **not tested with real credentials** — covered with mocked HTTP and degraded-mode E2E |

## Critical acceptance criteria → evidence

| # | Criterion | Evidence |
|---|---|---|
| 1 | Log in with Google | Flow implemented (PKCE/state/nonce; native nonce). Tested: nonce single-use, invalid state refused, open-redirect blocked, 503 when unconfigured. **Real Google login requires credentials (not run).** |
| 2 | Discover nearby restaurants | `geo-and-places.int-spec` (mocked Google), E2E Discovery |
| 3 | Default radius exactly 5 km | `discovery.spec`, `location-picker.test`, `HomeViewModelTest`, E2E |
| 4 | Change radius | E2E (10 km reveals far place), `HomeViewModelTest`, `location-picker.test` |
| 5 | Switch map/list | E2E (web), Home screen segmented control (Android) |
| 6 | Restaurant details | E2E detail test, `PlaceViewModel` |
| 7 | Create review | `reviews.int-spec`, E2E, `ReviewFormViewModelTest` |
| 8 | No duplicate review | DB unique-constraint test, API 409 test, E2E edit-mode, Android test |
| 9 | Edit existing review | same-ID test + revision, E2E |
| 10 | Delete review | soft-delete + revive test, E2E |
| 11 | Upload photos | `community.int-spec` (EXIF GPS stripped, exe rejected), `image-processor.spec` |
| 12 | See community reviews | integration + E2E |
| 13 | Google info shown separately | `place-card.test`, E2E headings, PlaceScreen sections |
| 14 | Google Maps source links | E2E (`query_place_id`), external-reviews test |
| 15 | Save favorites | integration + E2E |
| 16 | Create collections | integration + E2E |
| 17 | Admin moderates reports | `community.int-spec` (resolve → HIDE → audit + notifications) |
| 18 | Unauthorized users blocked from admin | `authorization.int-spec`, E2E |
| 19 | Usable when external APIs fail | Google 500/timeout fallback tests, E2E degraded mode |
| 20 | No fabricated delivery data | `food-platforms.spec`, platform-links integration test, E2E |

## Defects found by tests and fixed

* Spam heuristic held every new account's first review as PENDING (found by E2E) → account age removed as a standalone signal.
* Auth-state race on mobile let a tap on "Simpan" trigger the login redirect (found by mobile E2E) → actions disabled until session known.
* Next.js rewrites baked `API_INTERNAL_URL` at build time → replaced with a runtime proxy route.
* Incremental TypeScript build left `dist` incomplete after Nest's `deleteOutDir` → `incremental` disabled.
* `FoodPlatformProvider` base class signatures didn't match the interface (found by typecheck of specs) → fixed.
* Kotlin model named `Collection` shadowed by `kotlin.collections.Collection` → renamed `FoodCollection`.

## Running

See the command table in the [README](../../README.md#manual-commands) or `scripts\test-windows.ps1 [-E2E]`.
