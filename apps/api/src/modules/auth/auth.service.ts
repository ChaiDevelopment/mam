import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { randomBytes } from 'crypto';
import { env } from '../../config/env';
import { CacheService } from '../../common/cache.service';
import { PrismaService, isUniqueViolation } from '../../common/prisma.service';
import { dummyHash, hashPassword, verifyPassword } from './password';
import type { GoogleIdentity } from './google-identity.service';

/** Account resolution and linking for identities verified by GoogleIdentityService. */
@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  // ───────────── Email + password ─────────────
  /** Max failed password attempts per email within the window before login is temporarily blocked. */
  static readonly MAX_FAILED_LOGINS = 8;
  static readonly LOCK_WINDOW_SECONDS = 15 * 60;

  /**
   * Creates an account with email + password. An email that already belongs to an account is rejected
   * (also Google-only accounts: a password can be added from the profile after logging in with Google).
   */
  async registerWithPassword(input: { email: string; password: string; displayName: string }): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('Email ini sudah terdaftar. Silakan masuk.');
    const passwordHash = await hashPassword(input.password);
    const user = await this.createUser({ email: input.email, emailVerified: false, displayName: input.displayName, avatarUrl: null, passwordHash });
    if (!user.passwordHash) throw new ConflictException('Email ini sudah terdaftar. Silakan masuk.'); // lost a race with another sign-up
    return user;
  }

  /** Verifies email + password. Same error and similar timing whether the email exists or not. */
  async loginWithPassword(email: string, password: string): Promise<User> {
    const lockKey = `loginfail:${email}`;
    const failures = Number((await this.cache.get<number>(lockKey)) ?? 0);
    if (failures >= AuthService.MAX_FAILED_LOGINS) {
      throw new HttpException('Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const user = await this.prisma.user.findUnique({ where: { email } });
    const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
    if (!user || !user.passwordHash || !ok) {
      await this.cache.set(lockKey, failures + 1, AuthService.LOCK_WINDOW_SECONDS);
      throw new UnauthorizedException('Email atau kata sandi salah.');
    }
    await this.cache.del(lockKey);
    return this.ensureUsable(user);
  }

  async changePassword(userId: string, currentPassword: string | undefined, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.passwordHash) {
      if (!currentPassword) throw new BadRequestException('Masukkan kata sandi saat ini.');
      if (!(await verifyPassword(currentPassword, user.passwordHash))) throw new UnauthorizedException('Kata sandi saat ini salah.');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword), passwordUpdatedAt: new Date() } });
  }

  /**
   * 1) Known Google subject → that user.
   * 2) Verified email matches an existing account → link Google to it (account linking).
   * 3) Otherwise create a new user + profile + preferences.
   */
  async findOrCreateFromGoogle(id: GoogleIdentity): Promise<User> {
    const linked = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider: 'google', providerAccountId: id.sub } },
      include: { user: true },
    });
    if (linked) return this.ensureUsable(linked.user);

    const byEmail = await this.prisma.user.findUnique({ where: { email: id.email } });
    if (byEmail) {
      this.ensureUsable(byEmail);
      if (!id.emailVerified) throw new ForbiddenException('Email belum terverifikasi; tidak dapat menautkan akun.');
      await this.prisma.$transaction([
        this.prisma.oAuthAccount.create({ data: { userId: byEmail.id, provider: 'google', providerAccountId: id.sub, email: id.email } }),
        this.prisma.user.update({ where: { id: byEmail.id }, data: { emailVerified: true } }),
      ]);
      this.logger.log(`Linked Google account to existing user ${byEmail.id}`);
      return byEmail;
    }
    return this.createUser({
      email: id.email,
      emailVerified: id.emailVerified,
      displayName: id.name ?? id.email.split('@')[0],
      avatarUrl: id.picture,
      oauth: { provider: 'google', providerAccountId: id.sub },
    });
  }

  async createUser(input: {
    email: string;
    emailVerified: boolean;
    displayName: string;
    avatarUrl: string | null;
    oauth?: { provider: string; providerAccountId: string };
    role?: User['role'];
    passwordHash?: string;
  }): Promise<User> {
    const bootstrap = (env().BOOTSTRAP_SUPER_ADMIN_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    // Bootstrap super-admins only for *verified* emails (Google). A self-registered password account must never get it.
    const role = input.role ?? (input.emailVerified && bootstrap.includes(input.email.toLowerCase()) ? 'SUPER_ADMIN' : 'USER');

    for (let attempt = 0; attempt < 5; attempt++) {
      const username = this.usernameCandidate(input.email, attempt);
      try {
        return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const user = await tx.user.create({
            data: {
              email: input.email.toLowerCase(),
              emailVerified: input.emailVerified,
              role,
              ...(input.passwordHash ? { passwordHash: input.passwordHash, passwordUpdatedAt: new Date() } : {}),
              profile: {
                create: {
                  username,
                  displayName: input.displayName.slice(0, 60),
                  avatarUrl: input.avatarUrl?.startsWith('https://') ? input.avatarUrl.slice(0, 500) : null,
                },
              },
              preferences: { create: { defaultRadiusMeters: env().DEFAULT_RADIUS_METERS } },
              oauthAccounts: input.oauth ? { create: { ...input.oauth, email: input.email } } : undefined,
            },
          });
          if (role !== 'USER') {
            await tx.adminAuditLog.create({
              data: { actorId: null, action: 'USER_BOOTSTRAP_ROLE', targetType: 'user', targetId: user.id, metadata: { role } },
            });
          }
          return user;
        });
      } catch (e) {
        if (isUniqueViolation(e, 'username')) continue;
        if (isUniqueViolation(e, 'email')) {
          const existing = await this.prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
          if (existing) return this.ensureUsable(existing);
        }
        throw e;
      }
    }
    throw new Error('Could not allocate a unique username');
  }

  private usernameCandidate(email: string, attempt: number): string {
    const base = email
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9_.]/g, '')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 20)
      .padEnd(3, '0');
    return attempt === 0 ? base : `${base}_${randomBytes(3).toString('hex')}`;
  }

  private ensureUsable(user: User): User {
    if (user.status === 'SUSPENDED') throw new ForbiddenException('Akun kamu sedang ditangguhkan. Hubungi dukungan MAM!.');
    if (user.status === 'DELETED') throw new ForbiddenException('Akun ini telah dihapus.');
    return user;
  }
}
