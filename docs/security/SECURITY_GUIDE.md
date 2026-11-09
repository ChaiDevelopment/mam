# Security Guide

## Authentication

| Client | Flow | Token storage |
|---|---|---|
| Web / admin | OAuth 2.0 authorization code **with PKCE (S256)**, `state` (CSRF) and OIDC `nonce`, server-side code exchange. State/nonce/verifier live in a **signed, httpOnly, 10-minute** cookie scoped to `/api/v1/auth/google`. | httpOnly `mam_at` (JWT, 15 min) + httpOnly `mam_rt` (path `/api/v1/auth`, 30 days). Nothing in localStorage. |
| Android | Credential Manager "Sign in with Google" with a **server-issued, single-use nonce**; API verifies signature, issuer, audience, expiry, nonce and `email_verified`. | Android Keystore-backed EncryptedSharedPreferences; excluded from backup/device transfer. |

* Refresh tokens are 256-bit random values stored as **SHA-256 hashes**; every refresh **rotates** the token.
  Replaying a rotated token revokes the entire session family (theft detection).
* Access tokens carry only `sub` + `sid`. **Role and status are read from the database** on each request (30 s cache)
  — suspension, demotion, logout and account deletion take effect immediately.
* Account linking: a verified Google email matching an existing account links the Google identity to it.
* `returnTo` after login must be a relative path (open-redirect protection).
* Google login authenticates a MAM! account only. MAM! never posts to Google Maps; "Tulis ulasan di Google Maps"
  is an outbound link the user follows themselves.
* `DEV_LOGIN_ENABLED` exists for local development/E2E only; the API **refuses to start** in production if it is
  enabled, if secrets look like placeholders, or if Google OAuth credentials are missing.

## Authorization

Global guard order: **AuthGuard → RolesGuard → CsrfGuard → ThrottlerGuard**. All routes are authenticated unless
marked `@Public()`. Admin routes require `@MinRole(...)` (hierarchy USER < MODERATOR < ADMIN < SUPER_ADMIN).
User-management rules (`canManageUser`): nobody can change themselves; only ADMIN+ manage users; non-super admins can
only act on and assign roles strictly below their own. Ownership checks protect reviews, photos and collections.
Frontend role checks in the admin UI are cosmetic; tests verify the API returns 401/403 regardless of the UI.

## CSRF, XSS, injection

* **CSRF**: cookie-authenticated non-GET requests must send `X-CSRF-Token` equal to the `mam_csrf` cookie
  (constant-time compare). Cookies are `SameSite=Lax`, `Secure` in production. Bearer clients are exempt (no ambient credentials).
* **XSS**: React escapes all output; no `dangerouslySetInnerHTML` except JSON-LD which is serialized with `<` escaped.
  Strict security headers (CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`) on web/admin;
  Helmet on the API; uploaded files served with `Content-Security-Policy: default-src 'none'` and `nosniff`.
* **SQL injection**: Prisma parameterized queries; raw SQL uses tagged templates (`$queryRaw\`…${value}\``), never string concatenation of input.
* **Input validation**: every body/query/param passes a Zod schema (`ZodPipe`); IDs are UUID-validated; Google Place IDs
  and photo names are regex-validated (prevents SSRF/path tricks in proxied Google calls).

## File uploads

Declared MIME must be JPEG/PNG/WebP **and** the content is decoded by `sharp` (magic-byte validation, ≤ 40 MP, no
animations, ≥ 200 px). Images are **re-encoded to WebP**, which drops all metadata including **EXIF GPS**. Max 8 MB,
one file per request, per-user hourly cap, pending-upload cap, server-generated storage keys only (path traversal
impossible), orphan cleanup after 24 h. Executables are rejected (tested).

## Rate limiting & abuse

Redis-backed throttling per user (or IP when anonymous), stricter for auth, reviews, uploads and reports. Reviews also
have a configurable daily cap. Spam heuristics (links, phone numbers, repeated characters, duplicate text, bursts of
new accounts on one restaurant) hold reviews as PENDING. Five distinct reports auto-hide a review pending moderation.
Badges/leaderboards are quality-weighted so posting volume alone earns nothing.

## Secrets management

* `.env` files are git-ignored; `.env.example` contains placeholders only. CI runs gitleaks and a Google-key pattern check.
* Separate Google keys: **server** (Places API only, IP-restricted), **browser** (Maps JS, HTTP-referrer restricted),
  **Android** (Maps SDK, package + SHA-1 restricted). The server key never reaches clients — photos are proxied.
* Rotate `JWT_ACCESS_SECRET` / `COOKIE_SECRET` to invalidate all sessions.

## Privacy

* Location is requested only on explicit user action, one-shot, no background permission on Android.
* Coordinates are never written to logs (query strings are stripped from access logs) and never stored per user.
* Search history stores text only, is optional, and expires after 90 days.
* Account deletion anonymizes the user immediately, removes personal data and photos, hides reviews, and scrubs their
  text after a 30-day abuse-investigation window.

## Error handling & logging

Production responses never include stack traces or internal messages (`AllExceptionsFilter`). Every response has an
`X-Request-Id`; 5xx errors are logged with the request ID. Audit logs record actor, action, target, reason, IP and UA
for every administrative action.

## Backups

`infrastructure/scripts/backup.sh` / `backup.ps1` produce verified, checksummed `pg_dump` archives with retention;
`restore.sh` restores with an explicit confirmation. Store backups off-host with object lock; test restores monthly.

## Production checklist

- [ ] Strong unique `JWT_ACCESS_SECRET`, `COOKIE_SECRET`, DB password; `DEV_LOGIN_ENABLED=false`
- [ ] HTTPS everywhere, HSTS, `COOKIE_SECURE=true`, correct `TRUST_PROXY`
- [ ] API keys restricted as above; OAuth consent screen verified; redirect URIs exact
- [ ] `/api/v1/health/metrics` and `/api/docs` not public (nginx config provided)
- [ ] Admin domain IP-restricted or behind VPN/SSO; `BOOTSTRAP_SUPER_ADMIN_EMAILS` emptied after first login
- [ ] Redis enabled (shared rate limits), S3 bucket private with CDN for public reads
- [ ] Daily backups + restore test; dependency and secret scanning in CI green
- [ ] Privacy policy and terms reviewed by legal counsel (templates are in the web app)

## Email + password login

* `POST /auth/register`, `POST /auth/login`, `POST /auth/password` (change/set). Works without Google.
* Hashing: Node `crypto.scrypt` (N=16384, r=8, p=1, 16-byte random salt, 64-byte key), stored as
  `scrypt$N$r$p$salt$hash` in `users.password_hash`; constant-time comparison; NFKC-normalized input.
* Enumeration resistance: identical error ("Email atau kata sandi salah.") and a dummy hash comparison when the email
  does not exist. Registration of an existing email returns 409 (needed for usability; rate-limited 5/min/IP).
* Brute force: 10 login requests/min per IP (throttler) and an 8-failure / 15-minute lock per email (cache/Redis).
* Admin dashboard login (`client: 'ADMIN'`) requires MODERATOR+; admin accounts cannot self-register.
  `BOOTSTRAP_SUPER_ADMIN_EMAILS` applies only to *verified* emails (Google), never to self-registered passwords.
* Password hashes are never returned by the API; account deletion clears them. Email verification by mail is not
  implemented yet (no SMTP) — password accounts have `emailVerified=false`.
* First production admin: `npm run user:set-password -w @mam/api -- <email> <password> SUPER_ADMIN` (audit-logged).

## Staff MFA (e-mail one-time code)

* Password logins of MODERATOR+ return `{ mfaRequired, challengeId, emailHint }` instead of a session; the session is
  issued only by `POST /auth/mfa/verify` with the 6-digit code. Codes: `crypto.randomInt`, stored only as
  SHA-256(challengeId:code:secret) in cache/Redis, TTL 10 min, single use, max 5 attempts (then the challenge is
  destroyed), resend at most every 30 s, endpoints rate-limited. Disable only for emergencies: `STAFF_MFA_REQUIRED=false`.
* `devCode` is returned **only** when no SMTP is configured, `DEV_LOGIN_ENABLED=true` and `NODE_ENV!=production`.
* Production refuses to start without `SMTP_USER`/`SMTP_PASS` (codes and moderation e-mails must be deliverable).

## E-mail

* SMTP via nodemailer (`SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM`). Gmail requires 2-Step Verification and an
  **App Password** — never the account password. Keep it only in `apps/api/.env` / the secret store.
* Without SMTP credentials e-mails are written to `MAIL_OUTBOX_DIR` (development; contains MFA codes — git-ignored).
* All user-provided values in e-mail HTML are escaped. Moderation e-mails are sent after the DB commit; failures are
  audit-logged (`EMAIL_FAILED`) and never undo a decision.
