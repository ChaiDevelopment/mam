# Deploy: Railway (API + database) + Vercel (web + admin)

```
Browser ──► Vercel: web  (mam.id)          ─┐  /api/v1/* is proxied server-side by Next.js
Browser ──► Vercel: admin (admin.mam.id)   ─┤  (cookies stay first-party on the Vercel domain)
                                            ▼
                         Railway: API (NestJS, Dockerfile) ──► Railway: PostGIS + Redis
                                            └──► S3-compatible storage (Cloudflare R2) · SMTP (Gmail)
```

| Where | What | Repo path |
|---|---|---|
| **Railway** | API service | repo root (uses `railway.json` → `infrastructure/docker/api.Dockerfile`) |
| **Railway** | PostgreSQL **with PostGIS** (use the *PostGIS* template, not plain Postgres) | — |
| **Railway** | Redis | — |
| **Vercel** | Web (public site) | Root Directory `apps/web` (uses `apps/web/vercel.json`) |
| **Vercel** | Admin dashboard | Root Directory `apps/admin` (uses `apps/admin/vercel.json`) |
| External | Object storage for photos/logos: Cloudflare R2 (or any S3) | — |
| External | SMTP (Gmail App Password or Brevo/Mailgun/SES) | — |
| External | Map tiles provider (MapTiler/Stadia/Protomaps) | — |

## 1. Railway

1. New Project → **Deploy from GitHub repo** → this repo. Railway reads `railway.json`: Dockerfile build, pre-deploy
   `prisma migrate deploy` + seed (categories only; no demo accounts in production), health check `/api/v1/health`.
2. Add **PostGIS** (template "PostGIS") and **Redis** to the same project.
3. API service → Settings → Networking → **Generate Domain** (e.g. `mam-api.up.railway.app`).
4. API service → **Variables**:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{PostGIS.DATABASE_URL}}` (reference to the PostGIS service) |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `JWT_ACCESS_SECRET` | random, ≥ 48 chars (`openssl rand -hex 32`) |
| `COOKIE_SECRET` | random, ≥ 48 chars (different from the JWT secret) |
| `API_PUBLIC_URL` | `https://mam-api.up.railway.app` |
| `WEB_PUBLIC_URL` | `https://mam.id` (your web domain; used in e-mail links) |
| `ADMIN_PUBLIC_URL` | `https://admin.mam.id` |
| `CORS_ORIGINS` | `https://mam.id,https://admin.mam.id` |
| `TRUST_PROXY` | `1` |
| `COOKIE_SECURE` | `true` |
| `DEV_LOGIN_ENABLED` | `false` (the API refuses to start in production otherwise) |
| `STAFF_MFA_REQUIRED` | `true` |
| `SMTP_HOST` / `SMTP_PORT` | `smtp.gmail.com` / `465` |
| `SMTP_USER` | `email-pengirim@gmail.com` |
| `SMTP_PASS` | Gmail **App Password** (16 chars) — never the account password |
| `MAIL_FROM` | `MAM! <email-pengirim@gmail.com>` |
| `STORAGE_DRIVER` | `s3` |
| `S3_ENDPOINT` | R2: `https://<account-id>.r2.cloudflarestorage.com` |
| `S3_REGION` | `auto` |
| `S3_BUCKET` | e.g. `mam-media` |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | R2 API token |
| `S3_PUBLIC_BASE_URL` | public bucket URL / custom domain, e.g. `https://media.mam.id` |
| `DEFAULT_RADIUS_METERS` | `5000` |
| *(optional)* `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI_WEB`, `GOOGLE_OAUTH_REDIRECT_URI_ADMIN`, `GOOGLE_MAPS_SERVER_API_KEY` | only if Google login / Places is wanted |

`PORT` is provided by Railway automatically — do not set it.

The API **refuses to start** in production when `DEV_LOGIN_ENABLED=true`, secrets look like placeholders, or SMTP is
missing (see `apps/api/src/config/env.ts`).

## 2. Vercel — web

New Project → import the repo → **Root Directory: `apps/web`** → Framework Next.js (install/build commands come from
`apps/web/vercel.json`; they build the shared `packages/*` first). Enable *"Include files outside the root directory in
the Build Step"* (default for monorepos).

| Variable | Value | Notes |
|---|---|---|
| `API_INTERNAL_URL` | `https://mam-api.up.railway.app` | server-side proxy target for `/api/v1/*` |
| `NEXT_PUBLIC_SITE_URL` | `https://mam.id` | canonical URLs, sitemap |
| `NEXT_PUBLIC_MAP_TILE_URL` | e.g. `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=YOUR_KEY` | **required for production** — the public OSM tile server is not for production traffic |
| `NEXT_PUBLIC_MAP_TILE_ATTRIBUTION` | provider's attribution HTML incl. `© OpenStreetMap contributors` | |
| `NEXT_TELEMETRY_DISABLED` | `1` | |
| *(optional)* `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | | only with a Google key |

`NEXT_PUBLIC_*` values are baked in at build time — redeploy after changing them. The CSP automatically allows the
tile host from `NEXT_PUBLIC_MAP_TILE_URL`. If photos are served from `S3_PUBLIC_BASE_URL` on another domain, add that
host to `img-src` in `apps/web/next.config.mjs`.

## 3. Vercel — admin

Second Vercel project from the same repo → **Root Directory: `apps/admin`**. Variables: `API_INTERNAL_URL` (same as
web), `NEXT_TELEMETRY_DISABLED=1`. Add the domain `admin.mam.id`.

## 4. Data (one time)

The production database starts with migrations + categories only. Copy the place data from a machine that has it:

```bash
# after the first Railway deploy (migrations applied), from the PC with the local data
pg_dump -h localhost -p 5433 -U postgres -d mam_dev --data-only --no-owner \
  -t brands -t restaurants -t external_place_refs -t restaurant_categories -t localities -t data_imports \
  -f mam-places.sql
psql "<Railway PostGIS public connection URL>" -f mam-places.sql
```

Brand logos/photos stored locally (`apps/api/storage/brands/*`) must be uploaded to the bucket under the same keys
(`brands/...`), e.g. `aws s3 cp apps/api/storage/brands s3://mam-media/brands --recursive --endpoint-url <R2 endpoint>`.
Afterwards create the first admin from your PC against the Railway database:
`DATABASE_URL="<Railway URL>" npm run user:set-password -w @mam/api -- you@example.com "strong-password" SUPER_ADMIN`.

## 5. Known limits on this setup

* **Upload size via Vercel:** requests proxied through Vercel functions are limited to ~4.5 MB. The API accepts review
  photos up to 8 MB, so very large photos fail when uploaded through the web proxy — compress client-side or lower
  `MAX_UPLOAD_BYTES` before launch.
* Vercel function timeouts apply to the proxy (slow API calls > the plan limit fail).
* Railway Redis/PostGIS are single instances — enable Railway backups or run `infrastructure/scripts/backup.sh` on a schedule.

---

# Option B: everything on Railway (no Vercel)

One Railway project (region **Singapore** for Indonesian users) with 5 services:

| Service | Source | Railway settings |
|---|---|---|
| `api` | GitHub repo | Config file: `railway.json` (default) |
| `web` | same repo | Settings → Config-as-code path: `infrastructure/railway/web.railway.json`; variable `APP=web` |
| `admin` | same repo | Config-as-code path: `infrastructure/railway/admin.railway.json`; variable `APP=admin` |
| `PostGIS` | template "PostGIS" | — |
| `Redis` | template "Redis" | — |

Railway passes service variables to the Dockerfile as build args, so `APP` selects web or admin and the
`NEXT_PUBLIC_*` values are baked in at build time.

**api**: the variables in section 1, except storage: instead of S3 attach a **Volume** mounted at `/data/storage`
and set `STORAGE_DRIVER=local`, `STORAGE_LOCAL_DIR=/data/storage` (photos and brand logos). Copy
`apps/api/storage/brands` into the volume once (e.g. `railway ssh` + upload, or temporarily expose and use `railway run`).

**web** variables:

| Variable | Value |
|---|---|
| `APP` | `web` |
| `API_INTERNAL_URL` | `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}` (private network, no public hop) |
| `NEXT_PUBLIC_SITE_URL` | public web URL, e.g. `https://mam.id` |
| `NEXT_PUBLIC_MAP_TILE_URL` / `NEXT_PUBLIC_MAP_TILE_ATTRIBUTION` | tile provider (required for production traffic) |

**admin** variables: `APP=admin`, `API_INTERNAL_URL` as above.

Generate public domains for `web` and `admin` (and attach custom domains). The `api` service does not need a public
domain in this setup unless Android or external clients call it directly — if it does, set `API_PUBLIC_URL`.
`WEB_PUBLIC_URL`, `ADMIN_PUBLIC_URL` and `CORS_ORIGINS` on the API point at the web/admin domains.

Advantages over Vercel: no ~4.5 MB request-body limit for photo uploads, private networking to the API, one bill.
Trade-off: no global edge CDN (single region).
