/**
 * Seed script.
 *  - Always (idempotent): food categories with their Google Places type mapping.
 *  - Development only (NODE_ENV !== 'production'): demo accounts. They can log in with email + password
 *    (password: DEMO_PASSWORD, default "mam12345") or via DEV_LOGIN.
 * No fake restaurants or reviews are created: restaurant references must come from real Google Place IDs.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/modules/auth/password';
import { DEFAULT_CATEGORY_DEFS } from '../src/modules/categories/category-mapping';

const prisma = new PrismaClient();

async function main() {
  for (const [i, c] of DEFAULT_CATEGORY_DEFS.entries()) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      create: { slug: c.slug, nameId: c.nameId, nameEn: c.nameEn, emoji: c.emoji, googleTypes: c.googleTypes, sortOrder: i * 10 },
      // Do not overwrite admin edits to names/order; keep type mapping in sync only if still empty.
      update: {},
    });
  }
  console.log(`✔ ${DEFAULT_CATEGORY_DEFS.length} categories`);

  if (process.env.NODE_ENV === 'production') {
    console.log('Production: skipping demo accounts.');
    return;
  }
  const demo = [
    { email: 'superadmin@mam.local', username: 'superadmin', displayName: 'Super Admin (demo)', role: 'SUPER_ADMIN' as const },
    { email: 'admin@mam.local', username: 'admin', displayName: 'Admin (demo)', role: 'ADMIN' as const },
    { email: 'moderator@mam.local', username: 'moderator', displayName: 'Moderator (demo)', role: 'MODERATOR' as const },
    { email: 'budi@mam.local', username: 'budi', displayName: 'Budi Santoso (demo)', role: 'USER' as const },
    { email: 'sari@mam.local', username: 'sari', displayName: 'Sari Wulandari (demo)', role: 'USER' as const },
  ];
  for (const d of demo) {
    await prisma.user.upsert({
      where: { email: d.email },
      create: {
        email: d.email,
        emailVerified: true,
        role: d.role,
        createdAt: new Date(Date.now() - 30 * 86400_000),
        profile: { create: { username: d.username, displayName: d.displayName } },
        preferences: { create: {} },
      },
      update: { role: d.role },
    });
  }
  // Demo password only where none is set yet (never overwrites a password the user changed).
  const demoPassword = process.env.DEMO_PASSWORD || 'mam12345';
  await prisma.user.updateMany({
    where: { email: { in: demo.map((d) => d.email) }, passwordHash: null },
    data: { passwordHash: await hashPassword(demoPassword), passwordUpdatedAt: new Date() },
  });
  console.log(`✔ ${demo.length} demo accounts (email + password "${demoPassword}", e.g. budi@mam.local / admin@mam.local)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
