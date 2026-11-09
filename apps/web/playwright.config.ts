import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run the real API + web app against a dedicated database (E2E_DATABASE_URL).
 * Google credentials are intentionally absent: tests cover the documented degraded mode
 * (community fallback + clear provider notices) and use DEV_LOGIN instead of Google OAuth.
 */
const DB = process.env.E2E_DATABASE_URL || 'postgresql://postgres@localhost:5433/mam_e2e?schema=public';
const apiEnv = {
  NODE_ENV: 'development',
  PORT: '4100',
  DATABASE_URL: DB,
  JWT_ACCESS_SECRET: 'e2e-access-secret-0123456789abcdef0123456789',
  COOKIE_SECRET: 'e2e-cookie-secret-0123456789abcdef0123456789',
  DEV_LOGIN_ENABLED: 'true',
  WEB_PUBLIC_URL: 'http://localhost:3100',
  CORS_ORIGINS: 'http://localhost:3100',
  STORAGE_LOCAL_DIR: '../../.devtools/e2e-storage',
  GOOGLE_MAPS_SERVER_API_KEY: '',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3100',
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    geolocation: { latitude: -6.1754, longitude: 106.8272 },
    permissions: ['geolocation'],
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    { command: 'node dist/main.js', cwd: '../api', port: 4100, env: apiEnv, reuseExistingServer: false, timeout: 60_000 },
    { command: 'npx next start -p 3100', port: 3100, env: { API_INTERNAL_URL: 'http://localhost:4100' }, reuseExistingServer: false, timeout: 120_000 },
  ],
});
