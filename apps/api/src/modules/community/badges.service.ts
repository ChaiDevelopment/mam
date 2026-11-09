import { Injectable, Logger } from '@nestjs/common';
import type { BadgeCode } from '@prisma/client';
import { PrismaService, isUniqueViolation } from '../../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BADGE_DEFINITIONS, QUALITY_THRESHOLD } from './badges';

/** Awards badges from verifiable activity only. Badges are never revoked automatically. */
@Injectable()
export class BadgesService {
  private readonly logger = new Logger('Badges');
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async evaluate(userId: string): Promise<BadgeCode[]> {
    const owned = new Set((await this.prisma.userBadge.findMany({ where: { userId }, select: { code: true } })).map((b) => b.code));
    const earned: BadgeCode[] = [];
    const check = async (code: BadgeCode, fn: () => Promise<boolean>) => {
      if (owned.has(code)) return;
      if (await fn()) earned.push(code);
    };
    const quality = { userId, status: 'PUBLISHED' as const, qualityScore: { gte: QUALITY_THRESHOLD } };

    await check('FIRST_BITE', async () => (await this.prisma.review.count({ where: { userId, status: 'PUBLISHED' } })) >= 1);
    await check('FOOD_EXPLORER', async () => {
      const rows = await this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(DISTINCT rc.category_id) AS n
          FROM reviews r JOIN restaurant_categories rc ON rc.restaurant_id = r.restaurant_id
         WHERE r.user_id = ${userId}::uuid AND r.status = 'PUBLISHED' AND r.quality_score >= ${QUALITY_THRESHOLD}`;
      return Number(rows[0]?.n ?? 0) >= 5;
    });
    await check('HIDDEN_GEM_HUNTER', async () => {
      const rows = await this.prisma.$queryRaw<{ n: bigint }[]>`
        WITH firsts AS (
          SELECT DISTINCT ON (restaurant_id) restaurant_id, user_id
            FROM reviews WHERE status = 'PUBLISHED' ORDER BY restaurant_id, created_at ASC)
        SELECT COUNT(*) AS n FROM firsts f
         WHERE f.user_id = ${userId}::uuid
           AND (SELECT COUNT(*) FROM reviews o WHERE o.restaurant_id = f.restaurant_id AND o.status = 'PUBLISHED' AND o.user_id <> f.user_id) >= 3
           AND (SELECT AVG(overall_rating) FROM reviews o WHERE o.restaurant_id = f.restaurant_id AND o.status = 'PUBLISHED') >= 4.0`;
      return Number(rows[0]?.n ?? 0) >= 3;
    });
    await check('REVIEW_MASTER', async () => {
      const [n, helpful] = await Promise.all([
        this.prisma.review.count({ where: quality }),
        this.prisma.reviewReaction.count({ where: { type: 'HELPFUL', userId: { not: userId }, review: { userId, status: 'PUBLISHED' } } }),
      ]);
      return n >= 20 && helpful >= 25;
    });
    await check('LOCAL_FOODIE', async () => {
      const rows = await this.prisma.$queryRaw<{ n: bigint }[]>`
        WITH mine AS (
          SELECT DISTINCT re.id, re.location FROM reviews r JOIN restaurants re ON re.id = r.restaurant_id
           WHERE r.user_id = ${userId}::uuid AND r.status = 'PUBLISHED' AND r.quality_score >= ${QUALITY_THRESHOLD} AND re.location IS NOT NULL)
        SELECT COALESCE(MAX(cnt), 0) AS n FROM (
          SELECT a.id, COUNT(b.id) AS cnt FROM mine a JOIN mine b ON ST_DWithin(a.location, b.location, 3000) GROUP BY a.id) t`;
      return Number(rows[0]?.n ?? 0) >= 8;
    });
    await check('PHOTO_HUNTER', async () => {
      const photos = await this.prisma.reviewPhoto.findMany({ where: { userId, deletedAt: null, review: { status: 'PUBLISHED' } }, select: { reviewId: true } });
      return photos.length >= 15 && new Set(photos.map((p) => p.reviewId)).size >= 5;
    });

    for (const code of earned) {
      try {
        await this.prisma.userBadge.create({ data: { userId, code } });
        await this.notifications.notify(userId, 'BADGE_EARNED', `Lencana baru: ${BADGE_DEFINITIONS[code].name}!`, BADGE_DEFINITIONS[code].description, '/profil');
      } catch (e) {
        if (!isUniqueViolation(e)) this.logger.warn(`badge ${code} failed: ${(e as Error).message}`);
      }
    }
    return earned;
  }
}
