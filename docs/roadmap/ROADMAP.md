# Roadmap & Known Limitations

## Status legend
**Implemented** = code complete · **Tested locally** = automated tests pass here · **Tested with real credentials** ·
**Production deployed**. Nothing is production-deployed yet.

| Area | Implemented | Tested locally | Real credentials | Deployed |
|---|---|---|---|---|
| API, DB schema, migrations | ✓ | ✓ (139 tests: 79 unit + 60 integration, real PostGIS) | n/a | ✗ |
| Email + password login (web, admin, Android) | ✓ | ✓ (integration + E2E + Android unit) | n/a | ✗ |
| Place submissions → moderator approval/rejection e-mail; staff e-mail MFA | ✓ (web, admin, Android MFA) | ✓ (integration + E2E + dev-server flow; e-mail via outbox) | ✗ (needs Gmail App Password) | ✗ |
| OpenStreetMap places + map (default provider) | ✓ | ✓ (real import: 40,423 places, 79,357 localities; integration + E2E) | n/a (no key) | ✗ |
| Community "Tambah tempat" | ✓ (web + API) | ✓ (integration + E2E) | n/a | ✗ |
| Google OAuth (web + Android) | ✓ | partial (security paths, mocked) | ✗ | ✗ |
| Google Places discovery/details/reviews/photos (optional) | ✓ | ✓ (mocked HTTP + degraded mode) | ✗ | ✗ |
| Web app | ✓ | ✓ (16 component + 32 E2E) | ✗ (Google login optional) | ✗ |
| Admin dashboard | ✓ | ✓ (build, 4 component, API RBAC tests) | ✗ | ✗ |
| Android app (osmdroid map, password login, runtime server address in debug) | ✓ | ✓ (26 unit, debug APK builds; UI tests compiled, not run) | ✗ | ✗ |
| Delivery platforms | adapters + verified-link fallback | ✓ | no authorized APIs exist | ✗ |
| Docker / CI | ✓ files | ✗ (Docker unavailable here; CI not yet run) | — | ✗ |

## Known limitations

* **OpenStreetMap coverage** is uneven: dense in Java/Bali, sparse in eastern Indonesia; only ~20 % of places have an
  address and few have province tags. No OSM ratings, photos or prices exist — MAM! never fills them in from Google.
* OSM `opening_hours` is shown as text but not evaluated ("open now" needs Google data).
* Nearby returns at most the 300 nearest OSM/community places per request.
* The public OSM tile server is for development/light use; production needs its own tile provider.
* Android has no "Tambah tempat" screen yet (web only); OSM data is refreshed manually (`scripts\import-osm.ps1`).

* **Google Nearby Search returns at most 20 places** per request (no pagination in Places API New). Larger radii show
  the 20 most relevant/nearest; text-query categories add up to 20 more.
* **Live Google names** in feeds/favorites cost one Place Details call per restaurant per view (Google content may not be cached). Admin-provided names avoid the call.
* Google reviews: maximum 5 per place (Google limitation).
* No authorized GoFood/GrabFood/ShopeeFood APIs — links only, verified manually.
* Android: Plus Jakarta Sans not bundled yet (system sans-serif with the same type scale); offline mode shows clear errors
  and retry but does not cache content offline (Google content cannot be cached; community caching is a roadmap item).
* Web E2E covers degraded mode (no Google key). Map rendering and real OAuth need manual verification with keys.
* Leaderboard/badge thresholds are initial values — tune with real data.
* Privacy policy & terms are templates pending legal review.

## Next
0a. Email verification + "lupa kata sandi" (needs an SMTP/email provider).
0. Schedule weekly OSM refresh; add an Android "Tambah tempat" screen; admin review queue for community places.
1. Configure Google credentials; run the manual verification checklist in GOOGLE_MAPS.md; confirm billing SKUs.
2. Run CI on GitHub (Docker image builds, Android on Linux) and fix any environment-specific issues.
3. Android: bundle Plus Jakarta Sans, add photo-upload progress, run instrumented tests on emulator matrix, Play internal track.
4. Follow users & following feed; push notifications (FCM) with opt-in.
5. Offline cache for MAM!-owned data (own reviews, favorites) on Android.
6. Moderation queue SLAs, appeal workflow, reviewer reputation weighting.
7. Partner integrations if/when authorized APIs become available.
