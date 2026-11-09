import { loadEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/mam',
  JWT_ACCESS_SECRET: 'k'.repeat(48),
  COOKIE_SECRET: 'c'.repeat(48),
};

describe('loadEnv', () => {
  it('applies defaults (5 km radius, local storage)', () => {
    const e = loadEnv({ ...base });
    expect(e.DEFAULT_RADIUS_METERS).toBe(5000);
    expect(e.STORAGE_DRIVER).toBe('local');
    expect(e.DEV_LOGIN_ENABLED).toBe(false);
  });

  it('rejects short secrets', () => {
    expect(() => loadEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('refuses to start in production with dev login or placeholder secrets', () => {
    const prod = { ...base, NODE_ENV: 'production', SMTP_USER: 'mam@contoh.id', SMTP_PASS: 'app-password-16ch' };
    expect(() => loadEnv({ ...prod, DEV_LOGIN_ENABLED: 'true' })).toThrow(/DEV_LOGIN_ENABLED/);
    expect(() => loadEnv({ ...prod, JWT_ACCESS_SECRET: 'change-me-change-me-change-me-change-me' })).toThrow(/placeholder/);
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow(/SMTP_USER/);
    // Google login is optional in production (email + password works without it).
    expect(loadEnv(prod).GOOGLE_OAUTH_CLIENT_ID).toBeUndefined();
    expect(loadEnv(prod).STAFF_MFA_REQUIRED).toBe(true);
    expect(loadEnv(prod).NODE_ENV).toBe('production');
  });
});
