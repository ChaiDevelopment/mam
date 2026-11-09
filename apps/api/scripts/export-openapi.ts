/* Writes docs/api/openapi.json without starting the HTTP server or touching the database. */
import 'reflect-metadata';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { PrismaService } from '../src/common/prisma.service';

async function main() {
  process.env.DATABASE_URL ??= 'postgresql://unused:unused@localhost:5432/unused';
  process.env.JWT_ACCESS_SECRET ??= 'openapi-export-only-secret-0123456789abcdef';
  process.env.COOKIE_SECRET ??= 'openapi-export-only-secret-0123456789abcdef';
  process.env.NODE_ENV = 'test';
  // Do not connect to a database just to render the spec.
  PrismaService.prototype.onModuleInit = async () => undefined;
  const { createApp, buildOpenApi } = await import('../src/bootstrap');
  const app = await createApp();
  await app.init();
  const doc = buildOpenApi(app);
  const out = resolve(__dirname, '../../../docs/api/openapi.json');
  writeFileSync(out, JSON.stringify(doc, null, 2));
  console.log(`OpenAPI written to ${out} (${Object.keys(doc.paths).length} paths)`);
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
