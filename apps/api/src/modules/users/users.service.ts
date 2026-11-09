import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Role, User } from '@prisma/client';
import type { BadgeView, Me, PublicProfile, UserPreferences } from '@mam/shared-types';
import type { UpdateMeInput } from '@mam/validation';
import { BADGE_DEFINITIONS } from '../community/badges';
import { CacheService } from '../../common/cache.service';
import { PrismaService, isUniqueViolation } from '../../common/prisma.service';
import { StorageService } from '../uploads/storage.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly storage: StorageService,
  ) {}

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  /** Development helper used by dev-login only. */
  async setRoleUnchecked(userId: string, role: Role): Promise<User> {
    const u = await this.prisma.user.update({ where: { id: userId }, data: { role } });
    return u;
  }

  async resolveUserId(idOrUsername: string): Promise<string> {
    const where = UUID_RE.test(idOrUsername) ? { userId: idOrUsername } : { username: idOrUsername.toLowerCase() };
    const p = await this.prisma.userProfile.findFirst({ where: { ...where, user: { status: 'ACTIVE' } }, select: { userId: true } });
    if (!p) throw new NotFoundException('Pengguna tidak ditemukan.');
    return p.userId;
  }

  async publicProfile(idOrUsername: string): Promise<PublicProfile> {
    const userId = await this.resolveUserId(idOrUsername);
    return this.buildProfile(userId);
  }

  private async buildProfile(userId: string): Promise<PublicProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, badges: { orderBy: { awardedAt: 'asc' } } },
    });
    if (!user?.profile) throw new NotFoundException('Pengguna tidak ditemukan.');
    const [reviewCount, photoCount, helpfulReceived] = await Promise.all([
      this.prisma.review.count({ where: { userId, status: 'PUBLISHED' } }),
      this.prisma.reviewPhoto.count({ where: { userId, deletedAt: null, review: { status: 'PUBLISHED' } } }),
      this.prisma.reviewReaction.count({ where: { type: 'HELPFUL', review: { userId, status: 'PUBLISHED' } } }),
    ]);
    const badges: BadgeView[] = user.badges.map((b) => ({
      code: b.code,
      name: BADGE_DEFINITIONS[b.code].name,
      description: BADGE_DEFINITIONS[b.code].description,
      awardedAt: b.awardedAt.toISOString(),
    }));
    return {
      userId: user.id,
      username: user.profile.username,
      displayName: user.profile.displayName,
      avatarUrl: user.profile.avatarUrl,
      bio: user.profile.bio,
      joinedAt: user.createdAt.toISOString(),
      stats: { reviewCount, photoCount, helpfulReceived },
      badges,
    };
  }

  async me(userId: string): Promise<Me> {
    const [profile, user] = await Promise.all([
      this.buildProfile(userId),
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        include: { profile: true, preferences: true, oauthAccounts: { select: { provider: true } } },
      }),
    ]);
    const p = user.preferences;
    const preferences: UserPreferences = {
      defaultRadiusMeters: p?.defaultRadiusMeters ?? 5000,
      preferredCategories: (p?.preferredCategories ?? []) as UserPreferences['preferredCategories'],
      budget: (p?.budget ?? null) as UserPreferences['budget'],
      saveSearchHistory: p?.saveSearchHistory ?? true,
      notificationsEnabled: p?.notificationsEnabled ?? true,
    };
    return {
      ...profile,
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role,
      status: user.status,
      locationVisibility: user.profile!.locationVisibility,
      preferences,
      linkedProviders: user.oauthAccounts.map((o) => o.provider),
      hasPassword: !!user.passwordHash,
    };
  }

  async updateMe(userId: string, input: UpdateMeInput): Promise<Me> {
    try {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        if (input.username || input.displayName || input.bio !== undefined || input.locationVisibility) {
          await tx.userProfile.update({
            where: { userId },
            data: {
              username: input.username,
              displayName: input.displayName,
              bio: input.bio,
              locationVisibility: input.locationVisibility,
            },
          });
        }
        if (input.preferences) {
          await tx.userPreference.upsert({
            where: { userId },
            create: { userId, ...input.preferences, preferredCategories: input.preferences.preferredCategories ?? [] },
            update: { ...input.preferences },
          });
          if (input.preferences.saveSearchHistory === false) await tx.searchHistory.deleteMany({ where: { userId } });
        }
      });
    } catch (e) {
      if (isUniqueViolation(e, 'username')) throw new ConflictException('Username sudah dipakai.');
      throw e;
    }
    return this.me(userId);
  }

  /**
   * Account deletion: the account is anonymized immediately and personal data is removed.
   * Reviews are soft-deleted (hidden at once); their text is scrubbed by RetentionService after 30 days,
   * which keeps a short moderation/audit window for abuse investigations.
   */
  async deleteAccount(userId: string): Promise<void> {
    const photos = await this.prisma.reviewPhoto.findMany({ where: { userId }, select: { storageKey: true, thumbKey: true } });
    const short = userId.slice(0, 8);
    const sessions = await this.prisma.session.findMany({ where: { userId }, select: { id: true } });
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.update({
        where: { id: userId },
        data: { status: 'DELETED', deletedAt: new Date(), email: `deleted+${userId}@deleted.mam.invalid`, emailVerified: false, role: 'USER', passwordHash: null, passwordUpdatedAt: null },
      });
      await tx.userProfile.update({
        where: { userId },
        data: { username: `deleted_${short}_${Date.now().toString(36)}`, displayName: 'Pengguna terhapus', avatarUrl: null, bio: null, locationVisibility: 'HIDDEN' },
      });
      await tx.review.updateMany({ where: { userId, status: { not: 'DELETED' } }, data: { status: 'DELETED', deletedAt: new Date() } });
      await tx.reviewPhoto.updateMany({ where: { userId }, data: { deletedAt: new Date() } });
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.oAuthAccount.deleteMany({ where: { userId } });
      await tx.favorite.deleteMany({ where: { userId } });
      await tx.collection.deleteMany({ where: { userId } });
      await tx.searchHistory.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.reviewReaction.deleteMany({ where: { userId } });
      await tx.userPreference.deleteMany({ where: { userId } });
      await tx.adminAuditLog.create({ data: { actorId: userId, action: 'ACCOUNT_DELETED', targetType: 'user', targetId: userId } });
    });
    await this.cache.del(...sessions.map((s) => `authstate:${userId}:${s.id}`));
    for (const p of photos) {
      await this.storage.remove(p.storageKey).catch(() => undefined);
      await this.storage.remove(p.thumbKey).catch(() => undefined);
    }
  }

  async recordSearch(userId: string, query: string) {
    const pref = await this.prisma.userPreference.findUnique({ where: { userId }, select: { saveSearchHistory: true } });
    if (pref && !pref.saveSearchHistory) return;
    await this.prisma.searchHistory.create({ data: { userId, query: query.slice(0, 120) } });
  }

  searchHistory(userId: string) {
    return this.prisma.searchHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, query: true, createdAt: true },
      distinct: ['query'],
    });
  }

  async clearSearchHistory(userId: string) {
    await this.prisma.searchHistory.deleteMany({ where: { userId } });
  }
}
