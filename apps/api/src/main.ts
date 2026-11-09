import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './bootstrap';
import { env, loadEnv } from './config/env';

async function main() {
  // Load apps/api/.env for local development (real environment variables take precedence).
  try {
    process.loadEnvFile?.('.env');
  } catch {
    /* no .env file — rely on the process environment */
  }
  loadEnv(); // fail fast with a readable message on misconfiguration
  const app = await createApp();
  await app.listen(env().PORT, '0.0.0.0');
  new Logger('Bootstrap').log(`MAM! API listening on :${env().PORT} (${env().NODE_ENV})`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
