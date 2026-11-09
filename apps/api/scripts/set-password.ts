/**
 * Creates or updates an account with an email + password (and optionally a role). Use it to create the first
 * admin in production without Google:
 *
 *   npm run user:set-password -w @mam/api -- admin@contoh.id "kata-sandi-kuat" SUPER_ADMIN
 *
 * The role change is written to the admin audit log.
 */
import { PrismaClient, type Role } from '@prisma/client';
import { hashPassword } from '../src/modules/auth/password';

const ROLES = ['USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN'] as const;

async function main() {
  const [emailArg, password, roleArg] = process.argv.slice(2);
  const email = emailArg?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !password) {
    console.error('usage: set-password.ts <email> <password> [USER|MODERATOR|ADMIN|SUPER_ADMIN]');
    process.exit(64);
  }
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');
  if (roleArg && !ROLES.includes(roleArg as Role)) throw new Error(`Unknown role ${roleArg}`);
  const prisma = new PrismaClient();
  try {
    const passwordHash = await hashPassword(password);
    const existing = await prisma.user.findUnique({ where: { email } });
    const user = existing
      ? await prisma.user.update({ where: { email }, data: { passwordHash, passwordUpdatedAt: new Date(), ...(roleArg ? { role: roleArg as Role } : {}) } })
      : await prisma.user.create({
          data: {
            email,
            emailVerified: false,
            role: (roleArg as Role) ?? 'USER',
            passwordHash,
            passwordUpdatedAt: new Date(),
            profile: { create: { username: `${email.split('@')[0].replace(/[^a-z0-9_.]/g, '').slice(0, 20).padEnd(3, '0')}_${Date.now().toString(36).slice(-4)}`, displayName: email.split('@')[0].slice(0, 60) } },
            preferences: { create: {} },
          },
        });
    if (roleArg && existing?.role !== roleArg) {
      await prisma.adminAuditLog.create({ data: { actorId: null, action: 'USER_ROLE_SET_CLI', targetType: 'user', targetId: user.id, metadata: { from: existing?.role ?? null, to: roleArg } } });
    }
    console.log(`${existing ? 'Updated' : 'Created'} ${email} (role ${user.role}).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
