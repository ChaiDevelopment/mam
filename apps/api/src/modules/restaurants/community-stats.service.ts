import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CommunityStats } from '@mam/shared-types';
import { CacheService } from '../../common/cache.service';
import { PrismaService } from '../../common/prisma.service';

interface StatsRow {
  restaurant_id: string;
  review_count: bigint;
  avg_overall: Prisma.Decimal | null;
  avg_taste: Prisma.Decimal | null;
  avg_price: Prisma.Decimal | null;
  avg_portion: Prisma.Decimal | null;
  avg_cleanliness: Prisma.Decimal | null;
  avg_service: Prisma.Decimal | null;
  median_price: number | null;
  photo_count: bigint;
  last_reviewed_at: Date | null;
}

const round = (v: Prisma.Decimal | null) => (v === null ? null : Math.round(Number(v) * 100) / 100);

export function emptyStats(restaurantId: string): CommunityStats {
  return {
    restaurantId,
    reviewCount: 0,
    averageOverall: null,
    averages: { taste: null, price: null, portion: null, cleanliness: null, service: null },
    medianPricePaid: null,
    photoCount: 0,
    lastReviewedAt: null,
  };
}

/** MAM! community statistics (only PUBLISHED reviews count). MAM!-owned data, so caching is fine. */
@Injectable()
export class CommunityStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  key(id: string) {
    return `cstats:${id}`;
  }

  async invalidate(restaurantId: string) {
    await this.cache.del(this.key(restaurantId));
  }

  async forOne(restaurantId: string): Promise<CommunityStats> {
    return (await this.forMany([restaurantId])).get(restaurantId) ?? emptyStats(restaurantId);
  }

  async forMany(ids: string[]): Promise<Map<string, CommunityStats>> {
    const unique = [...new Set(ids)];
    const out = new Map<string, CommunityStats>();
    const misses: string[] = [];
    await Promise.all(
      unique.map(async (id) => {
        const hit = await this.cache.get<CommunityStats>(this.key(id));
        if (hit) out.set(id, hit);
        else misses.push(id);
      }),
    );
    if (misses.length) {
      const rows = await this.prisma.$queryRaw<StatsRow[]>`
        SELECT r.restaurant_id,
               COUNT(*)                         AS review_count,
               AVG(r.overall_rating)            AS avg_overall,
               AVG(r.taste_rating)::numeric     AS avg_taste,
               AVG(r.price_rating)::numeric     AS avg_price,
               AVG(r.portion_rating)::numeric   AS avg_portion,
               AVG(r.cleanliness_rating)::numeric AS avg_cleanliness,
               AVG(r.service_rating)::numeric   AS avg_service,
               percentile_disc(0.5) WITHIN GROUP (ORDER BY r.price_paid) FILTER (WHERE r.price_paid IS NOT NULL) AS median_price,
               (SELECT COUNT(*) FROM review_photos p JOIN reviews r2 ON r2.id = p.review_id
                 WHERE r2.restaurant_id = r.restaurant_id AND r2.status = 'PUBLISHED' AND p.deleted_at IS NULL) AS photo_count,
               MAX(r.created_at)                AS last_reviewed_at
          FROM reviews r
         WHERE r.status = 'PUBLISHED' AND r.restaurant_id = ANY(${misses}::uuid[])
         GROUP BY r.restaurant_id`;
      const byId = new Map(rows.map((r) => [r.restaurant_id, r]));
      for (const id of misses) {
        const r = byId.get(id);
        const stats: CommunityStats = r
          ? {
              restaurantId: id,
              reviewCount: Number(r.review_count),
              averageOverall: round(r.avg_overall),
              averages: {
                taste: round(r.avg_taste),
                price: round(r.avg_price),
                portion: round(r.avg_portion),
                cleanliness: round(r.avg_cleanliness),
                service: round(r.avg_service),
              },
              medianPricePaid: r.median_price,
              photoCount: Number(r.photo_count),
              lastReviewedAt: r.last_reviewed_at?.toISOString() ?? null,
            }
          : emptyStats(id);
        out.set(id, stats);
        await this.cache.set(this.key(id), stats, 120);
      }
    }
    return out;
  }
}
