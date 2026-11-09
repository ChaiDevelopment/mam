# OpenStreetMap Integration (default data & map provider)

MAM! runs **without any Google key**. Food places come from OpenStreetMap (OSM) plus places added by the MAM!
community; maps use OSM tiles (Leaflet on web, osmdroid on Android). Google Maps remains an *optional* extra
(see [GOOGLE_MAPS.md](GOOGLE_MAPS.md)): when a server key is set, live Google results are merged in.

## What is imported

| Data | OSM tags | Stored in |
|---|---|---|
| Food places (named only) | `amenity=restaurant\|fast_food\|cafe\|food_court\|ice_cream`, `shop=bakery\|pastry\|confectionery` | `restaurants` (`source='OSM'`, `name_source='OSM'`) + `external_place_refs` (`provider='OSM'`, `node/123` / `way/456`) |
| Facts | `name`/`name:id`, `addr:*`, `phone`, `website`, `opening_hours`, `cuisine` | `restaurants.address/phone/website/opening_hours/cuisine/place_kind/city/province` |
| Categories | `cuisine` (incl. regional: padang, sundanese, javanese, manadonese, betawi, acehnese, batak, banjar, bugis, …), `amenity`, `diet:*`, Indonesian name hints (warung, angkringan, bakso, soto, kopi, …) | `restaurant_categories` (`source='OSM_TAG'`) — mapping in `apps/api/src/modules/categories/osm-mapping.ts` |
| Localities for location search | `place=city\|town\|suburb\|village` | `localities` (+ nearest city/town as context) |

Places tagged with lifecycle prefixes (`disused:`, `abandoned:`, `was:` …) and unnamed objects are skipped.
Ways (buildings) are imported at the centroid of their nodes; multipolygon relations are not imported.

**Import of 2026-11-07 (Geofabrik extracts):** 40,423 food places and 79,357 localities across Sumatra, Jawa,
Kalimantan, Sulawesi, Nusa Tenggara, Maluku and Papua. Coverage is much denser in Java/Bali than in eastern
Indonesia (e.g. Maluku: 165 places) — community additions fill the gaps.

## Running / refreshing the import

```powershell
powershell -ExecutionPolicy Bypass -File scripts\import-osm.ps1            # all regions (≈1.7 GB download, cached)
powershell -ExecutionPolicy Bypass -File scripts\import-osm.ps1 -Refresh   # re-download (Geofabrik updates daily)
powershell -ExecutionPolicy Bypass -File scripts\import-osm.ps1 -Regions maluku,papua
```

Pipeline: Geofabrik `.osm.pbf` → `apps/api/scripts/osm/extract_osm.py` (pyosmium, two-pass, low memory) → NDJSON →
`apps/api/scripts/osm/import-osm.ts` (staging table, set-based SQL). The import is **idempotent**: OSM ids are unique
per `(provider, external_place_id)`, existing places are updated in place, and names edited by admins/the community
(`name_source <> 'OSM'`) are never overwritten. Each run is recorded in `data_imports` and shown on the admin
*Integrasi* page. Recommended schedule: weekly.

Requirements: Python 3 (pyosmium is installed into `.devtools\pylib` automatically), ~2 GB free disk on the repo
drive, PostgreSQL with PostGIS and `pg_trgm`.

## How discovery uses it

* `GET /places/nearby` — PostGIS `ST_DWithin` + KNN (`<->`) on `restaurants.location` (GiST), category filter in SQL,
  up to 300 nearest places; budget/rating/radius filters as before. Provider status `{provider:'OSM', ok:true}`.
* `GET /places/search` — case-insensitive substring match backed by a `pg_trgm` GIN index (`restaurants_name_trgm`).
* `GET /places/autocomplete?kind=geocode` — `localities` (cities first, then towns/suburbs/villages);
  `kind=food` — place names. Suggestion ids: `loc-<uuid>` (resolved by `GET /places/:id/location`) / `mam-<uuid>`.
* `GET /places/mam-<uuid>` — detail from the database; `external-reviews` returns an empty list (no Google content).
* With a Google key, Google results are merged and local duplicates (same normalized name ≤ 60 m) are dropped.
* "Open now" is **not** derived from OSM `opening_hours` (not evaluated, so never guessed); the filter is hidden
  unless Google data is active.

Place keys: OSM/community places use `mam-<restaurant uuid>` wherever a Google Place ID was used before
(`/tempat/:placeId`, deep links, `googlePlaceId` fields in collection/review requests resolve it too).

## Community additions

`POST /places` (logged in, 10/hour) — regular users' submissions are **PENDING until a moderator approves them**
(see ADMIN_GUIDE; rejections are e-mailed with the reason); staff submissions are published directly — with `createPlaceSchema` (`packages/validation`): name, point inside Indonesia's
bounding box, 1–3 categories, optional address/city/phone/website/hours. A place with a similar name
(`pg_trgm` similarity > 0.55 or equal) within **75 m** is rejected with `409` and `details.placeId` of the existing
place. City is filled from the nearest locality when omitted. Web: `/tambah-tempat` (map pin picker).
Stored with `source='COMMUNITY'`, editable/hideable by admins (audit-logged).

## Storage rules & constraints

| Source | Coordinates | Facts (address, phone, …) |
|---|---|---|
| GOOGLE | cached ≤ 30 days (`location_cached_at`), purged by `RetentionService` | **never stored** (`restaurants_google_facts_not_stored` CHECK) |
| OSM / COMMUNITY | permanent (`location_cached_at IS NULL`) | stored |

Further CHECKs: OSM/community rows must have a name and a location; Google cache refreshes never touch non-Google rows.

## Licensing & attribution (ODbL 1.0)

* OSM data is © OpenStreetMap contributors under the [Open Database License](https://opendatacommons.org/licenses/odbl/).
  MAM! shows "© OpenStreetMap contributors" (linked to <https://www.openstreetmap.org/copyright>) on every map, on
  lists containing OSM places, on OSM place pages, and on `/tentang-data`.
* The imported OSM tables are a *derivative database*: if MAM! publicly offers that database (or a substantial
  extract), it must be offered under ODbL. Community-added places are kept as separate records (`source='COMMUNITY'`)
  so they form a *collective database* with the OSM data. **Have counsel review before launch.**
* Map tiles: the public `tile.openstreetmap.org` server is for light use only and requires a valid User-Agent/Referer
  (web sends the referrer; Android sets `userAgentValue`). For production set `NEXT_PUBLIC_MAP_TILE_URL` (web) to a
  commercial OSM tile provider or a self-hosted tile server, and update the CSP origin automatically derived in
  `apps/web/next.config.mjs`. Android uses osmdroid's MAPNIK source — switch the tile source for production traffic.
* Data from Google Maps is **never** copied into OSM or MAM! tables (Google Maps Platform Terms prohibit scraping and
  caching content). Users who know a missing place add it themselves.

## Food brands (chains) — Wikidata + Wikimedia Commons

* `apps/api/prisma/data/brands.json` (curated list, report in `BRANDS_REPORT.md`): 79 Indonesian food & drink brands
  chosen from the brands present in our OSM data; 64 with a Wikidata QID (CC0). Indonesian descriptions, aliases and
  categories were written by the culinary curator; QIDs, websites and file licenses come only from Wikidata/Commons APIs.
* Logos/photos: only Wikimedia Commons files under Public domain / CC0 / CC BY / CC BY-SA (30 logos, 34 photos).
  They are hot-linked from `upload.wikimedia.org` / `thumb.wikimedia.org` (allowed in the web CSP) and always shown
  with author + license + Commons link. Logos remain trademarks of their owners and are shown only to identify a brand.
* Linking (`scripts/import-brands.ts`, run by `scripts\import-osm.ps1`): OSM `brand:wikidata` first, then exact name or
  "Brand <branch>" prefix. Generic names (e.g. "Sederhana") are never linked by name. Current result: 3,263 outlets.
* **Not used:** Google Maps data or photos (Google Maps Platform Terms forbid scraping/caching content).

### Official brand logos (brand owner permission)

The project owner confirmed written permission from the brand owners (2026-11-07; proof kept by the project owner).
`scripts/fetch-brand-logos.ts <official-sites.json> "<permission note>"` fetches logos/photos **only from each brand's
official website** (verified list: 59 of 79 brands), re-encodes them with sharp (logo PNG ≤ 512 px — light logos get a
dark plate; photo WebP ≤ 960 px), stores them in MAM! storage (`brands/<key>-logo.png`) and records
`media_source = OWNER`, license "Izin pemilik merek", the source URL and the permission note (DB CHECK enforces a note).
Free Commons files are never replaced. Media rejected in manual review are listed in
`apps/api/prisma/data/brand-media-overrides.json` (and removed on the next run). Result: 33 owner logos + 10 photos,
on top of 30 Commons logos / 34 Commons photos. Google Maps content is still not used — brand permission does not cover
Google's or third-party users' content.
