import { Injectable, Logger, Module, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { env } from '../../config/env';
import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../uploads/storage.service';
import { UploadsModule } from '../uploads/uploads.module';

const ADVISORY_LOCK_KEY = 74_2031; // arbitrary constant, unique to this job

/**
 * Data-retention jobs (every 6 hours, single-instance via a Postgres advisory lock):
 *  - Google ToS: purge cached restaurant coordinates older than 30 days.
 *  - Remove photo uploads never attached to a review (24 h).
 *  - Search history older than 90 days; expired sessions; old read notifications.
 *  - Scrub review text of deleted accounts after a 30-day moderation window.
 */
@Injectable()
export class RetentionService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Retention');
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  onApplicationBootstrap() {
    if (env().NODE_ENV === 'test') return;
    const first = setTimeout(() => void this.run(), 60_000);
    first.unref?.();
    this.timer = setInterval(() => void this.run(), 6 * 3600_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<Record<string, number>> {
    const [{ locked }] = await this.prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS locked`;
    if (!locked) return {};
    try {
      const result: Record<string, number> = {};
      result.googleLocationsPurged = await this.prisma.$executeRaw`
        UPDATE restaurants SET location = NULL, location_cached_at = NULL
         WHERE location_cached_at IS NOT NULL AND location_cached_at < now() - interval '30 days'`;

      const orphans = await this.prisma.reviewPhoto.findMany({
        where: { reviewId: null, deletedAt: null, createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } },
        take: 500,
      });
      for (const p of orphans) {
        await this.storage.remove(p.storageKey).catch(() => undefined);
        await this.storage.remove(p.thumbKey).catch(() => undefined);
      }
      result.orphanPhotosRemoved = (await this.prisma.reviewPhoto.updateMany({ where: { id: { in: orphans.map((o) => o.id) } }, data: { deletedAt: new Date() } })).count;

      result.searchHistoryDeleted = (await this.prisma.searchHistory.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86400_000) } } })).count;
      result.sessionsDeleted = (
        await this.prisma.session.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: new Date(Date.now() - 30 * 86400_000) } }] } })
      ).count;
      result.notificationsDeleted = (await this.prisma.notification.deleteMany({ where: { readAt: { lt: new Date(Date.now() - 180 * 86400_000) } } })).count;
      result.deletedAccountReviewsScrubbed = await this.prisma.$executeRaw`
        UPDATE reviews r SET review_text = '', price_paid = NULL
          FROM users u
         WHERE r.user_id = u.id AND u.status = 'DELETED' AND u.deleted_at < now() - interval '30 days' AND r.review_text <> ''`;
      this.logger.log(`retention run: ${JSON.stringify(result)}`);
      return result;
    } finally {
      await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`;
    }
  }
}

@Module({ imports: [UploadsModule], providers: [RetentionService], exports: [RetentionService] })
export class RetentionModule {}
