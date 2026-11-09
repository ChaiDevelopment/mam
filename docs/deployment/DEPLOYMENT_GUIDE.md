# Deployment Guide

## Topology

```
Internet ─▶ nginx (TLS, rate limits)
             ├─ mam.id        ─▶ web   :3000  ─┐  (Next.js proxies /api/v1 → API_INTERNAL_URL)
             ├─ admin.mam.id  ─▶ admin :3001  ─┤
             └─ api.mam.id    ─▶ api   :4000 ◀─┘  (Android clients)
                                    ├─ PostgreSQL 17 + PostGIS (managed or VM, daily backups)
                                    ├─ Redis 7 (rate limits, short-lived MAM!-only cache)
                                    └─ S3-compatible bucket (+ CDN) for review photos
```

## 1. Prerequisites

* PostgreSQL ≥ 16 with **PostGIS ≥ 3.4**, `citext`, `pgcrypto` available (the init migration runs `CREATE EXTENSION`).
* Redis 7. S3-compatible storage (AWS S3, Cloudflare R2, MinIO…). Node.js 22 (or Docker).
* Google Cloud project with Places API (New), Maps JavaScript API, Maps SDK for Android, OAuth clients (see
  [GOOGLE_MAPS.md](../integrations/GOOGLE_MAPS.md)). Billing alerts and per-API quotas configured.

## 2. Configuration

Copy `.env.example` → `.env` and set **real** values. The API refuses to start in production when:
`DEV_LOGIN_ENABLED=true`, secrets look like placeholders, or Google OAuth credentials are missing.

Production essentials:

```
NODE_ENV=production
API_PUBLIC_URL=https://api.mam.id
WEB_PUBLIC_URL=https://mam.id
ADMIN_PUBLIC_URL=https://admin.mam.id
CORS_ORIGINS=https://mam.id,https://admin.mam.id
TRUST_PROXY=2                       # nginx + Next proxy
COOKIE_SECURE=true
GOOGLE_OAUTH_REDIRECT_URI_WEB=https://mam.id/api/v1/auth/google/callback
GOOGLE_OAUTH_REDIRECT_URI_ADMIN=https://admin.mam.id/api/v1/auth/google/callback
STORAGE_DRIVER=s3  S3_BUCKET=…  S3_PUBLIC_BASE_URL=https://cdn.mam.id
REDIS_URL=redis://…
DATABASE_URL=postgresql://…?schema=public&connection_limit=10
BOOTSTRAP_SUPER_ADMIN_EMAILS=founder@mam.id      # remove after first login
```

Web/admin need `API_INTERNAL_URL` at **runtime**. `NEXT_PUBLIC_*` values are inlined at **build** time (Docker build args).

## 3. Docker Compose (single host)

```bash
docker compose build
docker compose up -d                 # migrate job runs `prisma migrate deploy` + seed, then api/web/admin start
docker compose ps                    # api health uses /api/v1/health/ready
```

Put `infrastructure/nginx/mam.conf` (+ `snippets/mam-proxy.conf`) in front, issue certificates (certbot), and keep
ports bound to 127.0.0.1 as in the compose file.

## 4. Without Docker

```bash
npm ci && npm run build
cd apps/api && npx prisma migrate deploy && npm run prisma:seed && NODE_ENV=production node dist/main.js
cd apps/web && API_INTERNAL_URL=http://127.0.0.1:4000 node .next/standalone/apps/web/server.js   # copy .next/static + public next to it
```

Run each under a supervisor (systemd / PM2 / NSSM on Windows Server). Scale the API horizontally; Redis is then required.

## 5. Database migrations

* Always `prisma migrate deploy` (never `migrate dev`) in production, before starting the new API version.
* Migrations are additive-first; for breaking changes use expand → migrate data → contract across releases.
* CI checks migration drift (`prisma migrate diff --exit-code`).

## 6. Backups & restore

```bash
DATABASE_URL=… BACKUP_DIR=/var/backups/mam RETENTION_DAYS=14 infrastructure/scripts/backup.sh   # daily via cron
DATABASE_URL=postgresql://…/mam_restore infrastructure/scripts/restore.sh /var/backups/mam/mam-YYYYMMDDTHHMMSSZ.dump
```

Windows hosts: `infrastructure\scripts\backup.ps1 -DatabaseUrl … -BackupDir D:\backups\mam`.
Back up the S3 bucket with versioning. Test a full restore into a scratch database monthly
(`prisma migrate status` should report the expected version).

## 7. Monitoring

* Prometheus scrapes `/api/v1/health/metrics` (internal only) — config + alert rules in `infrastructure/monitoring/`
  (5xx rate, p95 latency, Google failure ratio, upload storage failures).
* Readiness: `/api/v1/health/ready`; liveness: `/api/v1/health`.
* Admin → Sistem shows per-provider success/error counts, average latency, last error, storage usage.
* Structured access logs (one JSON line per request with `requestId`; coordinates and query strings are excluded).

## 8. Android release

1. Create an upload keystore (keep it out of git): `keytool -genkeypair -v -keystore mam-upload.jks -alias mam -keyalg RSA -keysize 4096 -validity 10000`.
2. Add a `signingConfigs { release { … } }` block reading from environment variables / `secrets.properties`.
3. Set production `MAM_API_BASE_URL=https://api.mam.id/api/v1/`, `GOOGLE_WEB_CLIENT_ID` (maps use OpenStreetMap/osmdroid — no Maps key; switch the tile source for production traffic)
   (key restricted to the **release** SHA-1 and Play App Signing SHA-1).
4. `gradlew.bat bundleRelease` → upload the `.aab` to Play Console. Host `https://mam.id/.well-known/assetlinks.json`
   for verified deep links.

## 9. Go-live checklist

See [SECURITY_GUIDE.md](../security/SECURITY_GUIDE.md#production-checklist). Do not deploy with placeholder secrets.

## E-mail (required in production)

Set `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (Gmail: `smtp.gmail.com:465` + App Password from
https://myaccount.google.com/apppasswords). Used for staff MFA codes and place approval/rejection notices.
Create the first admin without Google: `npm run user:set-password -w @mam/api -- admin@domain "strong-password" SUPER_ADMIN`.
