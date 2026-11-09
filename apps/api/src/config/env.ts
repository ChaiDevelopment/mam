import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const PLACEHOLDER = /^(change[-_ ]?me|replace[-_ ]?me|your[-_].*|xxx+|todo)$/i;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  WEB_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  ADMIN_PUBLIC_URL: z.string().url().default('http://localhost:3001'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().default(900),
  REFRESH_TTL_DAYS: z.coerce.number().int().default(30),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters'),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: bool.optional(),

  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  /** Comma-separated list of extra audiences accepted for ID tokens (e.g. the Android client ID). */
  GOOGLE_OAUTH_ALLOWED_AUDIENCES: z.string().optional(),
  /** Redirect URIs registered in Google Cloud. They must route to /api/v1/auth/google/callback. */
  GOOGLE_OAUTH_REDIRECT_URI_WEB: z.string().url().optional(),
  GOOGLE_OAUTH_REDIRECT_URI_ADMIN: z.string().url().optional(),

  GOOGLE_MAPS_SERVER_API_KEY: z.string().optional(),
  GOOGLE_PLACES_TIMEOUT_MS: z.coerce.number().int().default(6000),
  GOOGLE_PLACES_LANGUAGE: z.string().default('id'),
  GOOGLE_PLACES_REGION: z.string().default('ID'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool.optional(),

  DEFAULT_RADIUS_METERS: z.coerce.number().int().default(5000),
  REVIEW_MIN_TEXT_LENGTH: z.coerce.number().int().min(1).default(20),
  REVIEWS_REQUIRE_APPROVAL: bool.default('false'),
  MAX_REVIEWS_PER_DAY: z.coerce.number().int().default(10),

  /** Bootstrap: email(s) granted SUPER_ADMIN on first login. Comma-separated. */
  BOOTSTRAP_SUPER_ADMIN_EMAILS: z.string().optional(),
  /** Development-only login bypass for local testing without Google credentials. Refused in production. */
  DEV_LOGIN_ENABLED: bool.default('false'),

  /** Outgoing e-mail (MFA codes, moderation results). Gmail: smtp.gmail.com:465 + an App Password (not the account password). */
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  /** Sender shown to users, e.g. "MAM! <pengirim@gmail.com>". Defaults to SMTP_USER. */
  MAIL_FROM: z.string().optional(),
  /** Without SMTP credentials e-mails are written here instead of being sent (development). */
  MAIL_OUTBOX_DIR: z.string().default('./storage/outbox'),
  /** Require an e-mailed one-time code when MODERATOR/ADMIN/SUPER_ADMIN log in with a password. */
  STAFF_MFA_REQUIRED: bool.default('true'),

  GOFOOD_PARTNER_API_KEY: z.string().optional(),
  GRABFOOD_PARTNER_API_KEY: z.string().optional(),
  SHOPEEFOOD_PARTNER_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    const problems: string[] = [];
    if (env.DEV_LOGIN_ENABLED) problems.push('DEV_LOGIN_ENABLED must be false in production');
    for (const k of ['JWT_ACCESS_SECRET', 'COOKIE_SECRET'] as const) {
      if (PLACEHOLDER.test(env[k]) || /change/i.test(env[k])) problems.push(`${k} looks like a placeholder`);
    }
    // E-mail is how staff receive MFA codes and submitters learn about rejections — it must really be delivered.
    if (!env.SMTP_USER || !env.SMTP_PASS) problems.push('SMTP_USER and SMTP_PASS are required in production (MFA codes, moderation e-mails)');
    if (problems.length) throw new Error(`Refusing to start in production:\n  - ${problems.join('\n  - ')}`);
  }
  return env;
}

export function env(): Env {
  cached ??= loadEnv();
  return cached;
}

/** For tests only. */
export function resetEnvCache() {
  cached = null;
}
