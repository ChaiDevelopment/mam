import { Injectable } from '@nestjs/common';
import type { CommunityPlaceCard, HomeSections, LatLng, LeaderboardEntry } from '@mam/shared-types';
import { CacheService } from '../../common/cache.service';
import { haversineMeters } from '../../common/geo';
import { PrismaService } from '../../common/prisma.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { QUALITY_THRESHOLD } from './badges';

const SECTION_LIMIT = 8;

/** Community-powered sections (MAM! data). Section IDs are cached briefly; Google names are fetched live. */
@Injectable()
export class CommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly restaurants: RestaurantsService,
  ) {}

  private async sectionIds(center: LatLng | null, radius: number) {
    const key = `home:${center ? `${center.lat.toFixed(2)},${center.lng.toFixed(2)}` : 'all'}:${radius}`;
    return this.cache.wrap(key, 120, async () => {
      const area = center
        ? await this.restaurants.nearbyCommunity(center, radius, 500).then((r) => r.map((x) => x.id))
        : null;
      if (area && !area.length) return { trending: [], recentlyReviewed: [], topRated: [], budgetFriendly: [], hiddenGems: [], recentlyDiscovered: [] };
      const ids = area ?? null;
      const q = <T>(sql: Promise<T>) => sql;
      const [trending, recentlyReviewed, topRated, budgetFriendly, hiddenGems, recentlyDiscovered] = await Promise.all([
        q(this.prisma.$queryRaw<{ id: string }[]>`
          SELECT r.restaurant_id AS id
            FROM reviews r LEFT JOIN review_reactions x ON x.review_id = r.id AND x.created_at > now() - interval '14 days'
           WHERE r.status = 'PUBLISHED' AND r.created_at > now() - interval '14 days'
             AND (${ids}::uuid[] IS NULL OR r.restaurant_id = ANY(${ids}::uuid[]))
           GROUP BY r.restaurant_id
           ORDER BY COUNT(DISTINCT r.id) * 3 + COUNT(x.id) DESC
           LIMIT ${SECTION_LIMIT}`),
        q(this.prisma.$queryRaw<{ id: string }[]>`
          SELECT restaurant_id AS id FROM reviews
           WHERE status = 'PUBLISHED' AND (${ids}::uuid[] IS NULL OR restaurant_id = ANY(${ids}::uuid[]))
           GROUP BY restaurant_id ORDER BY MAX(created_at) DESC LIMIT ${SECTION_LIMIT}`),
        // Bayesian average (prior 3.5, weight 3) so a single 5★ review cannot top the list.
        q(this.prisma.$queryRaw<{ id: string }[]>`
          SELECT restaurant_id AS id FROM reviews
           WHERE status = 'PUBLISHED' AND (${ids}::uuid[] IS NULL OR restaurant_id = ANY(${ids}::uuid[]))
           GROUP BY restaurant_id HAVING COUNT(*) >= 2
           ORDER BY (SUM(overall_rating) + 3.5 * 3) / (COUNT(*) + 3) DESC LIMIT ${SECTION_LIMIT}`),
        q(this.prisma.$queryRaw<{ id: string }[]>`
          SELECT restaurant_id AS id FROM reviews
           WHERE status = 'PUBLISHED' AND price_paid IS NOT NULL AND (${ids}::uuid[] IS NULL OR restaurant_id = ANY(${ids}::uuid[]))
           GROUP BY restaurant_id HAVING COUNT(*) >= 2 AND percentile_disc(0.5) WITHIN GROUP (ORDER BY price_paid) <= 25000
              AND AVG(overall_rating) >= 3.5
           ORDER BY percentile_disc(0.5) WITHIN GROUP (ORDER BY price_paid) ASC LIMIT ${SECTION_LIMIT}`),
        q(this.prisma.$queryRaw<{ id: string }[]>`
          SELECT restaurant_id AS id FROM reviews
           WHERE status = 'PUBLISHED' AND (${ids}::uuid[] IS NULL OR restaurant_id = ANY(${ids}::uuid[]))
           GROUP BY restaurant_id HAVING COUNT(*) BETWEEN 2 AND 10 AND AVG(overall_rating) >= 4.3
           ORDER BY AVG(overall_rating) DESC, COUNT(*) DESC LIMIT ${SECTION_LIMIT}`),
        q(this.prisma.$queryRaw<{ id: string }[]>`
          SELECT re.id FROM restaurants re
           WHERE re.status = 'ACTIVE' AND re.created_at > now() - interval '30 days'
             AND EXISTS (SELECT 1 FROM reviews r WHERE r.restaurant_id = re.id AND r.status = 'PUBLISHED')
             AND (${ids}::uuid[] IS NULL OR re.id = ANY(${ids}::uuid[]))
           ORDER BY re.created_at DESC LIMIT ${SECTION_LIMIT}`),
      ]);
      const pick = (rows: { id: string }[]) => rows.map((r) => r.id);
      return {
        trending: pick(trending),
        recentlyReviewed: pick(recentlyReviewed),
        topRated: pick(topRated),
        budgetFriendly: pick(budgetFriendly),
        hiddenGems: pick(hiddenGems),
        recentlyDiscovered: pick(recentlyDiscovered),
      };
    });
  }

  async home(center: LatLng | null, radius: number): Promise<HomeSections> {
    const sections = await this.sectionIds(center, radius);
    const all = [...new Set(Object.values(sections).flat())];
    const rows = await this.restaurants.loadMany(all);
    const views = new Map((await this.restaurants.toViews(rows, { liveName: true })).map((v) => [v.id, v]));
    const card = (id: string): CommunityPlaceCard | null => {
      const v = views.get(id);
      if (!v || v.status !== 'ACTIVE') return null;
      return {
        restaurant: { id: v.id, name: v.name, googlePlaceId: v.googlePlaceId, placeKey: v.placeKey, location: v.location, categories: v.categories },
        stats: v.stats,
        distanceMeters: center && v.location ? Math.round(haversineMeters(center, v.location)) : null,
      };
    };
    const build = (ids: string[]) => ids.map(card).filter((c): c is CommunityPlaceCard => !!c);
    return {
      trending: build(sections.trending),
      recentlyReviewed: build(sections.recentlyReviewed),
      topRated: build(sections.topRated),
      budgetFriendly: build(sections.budgetFriendly),
      hiddenGems: build(sections.hiddenGems),
      recentlyDiscovered: build(sections.recentlyDiscovered),
    };
  }

  /** Quality-weighted leaderboard (last 90 days). Quantity alone does not rank: low-quality reviews score 0. */
  async leaderboard(): Promise<LeaderboardEntry[]> {
    return this.cache.wrap('leaderboard:v1', 300, async () => {
      const rows = await this.prisma.$queryRaw<
        { user_id: string; username: string; display_name: string; avatar_url: string | null; quality: number; reviews: bigint; helpful: bigint }[]
      >`
        SELECT u.id AS user_id, p.username, p.display_name, p.avatar_url,
               COALESCE(SUM(r.quality_score) FILTER (WHERE r.quality_score >= ${QUALITY_THRESHOLD}), 0)::float AS quality,
               COUNT(r.id) AS reviews,
               (SELECT COUNT(*) FROM review_reactions x JOIN reviews rr ON rr.id = x.review_id
                 WHERE rr.user_id = u.id AND rr.status = 'PUBLISHED' AND x.type = 'HELPFUL' AND x.user_id <> u.id) AS helpful
          FROM users u
          JOIN user_profiles p ON p.user_id = u.id
          JOIN reviews r ON r.user_id = u.id AND r.status = 'PUBLISHED' AND r.created_at > now() - interval '90 days'
         WHERE u.status = 'ACTIVE'
         GROUP BY u.id, p.username, p.display_name, p.avatar_url
         ORDER BY quality DESC
         LIMIT 50`;
      return rows
        .map((r) => ({ ...r, score: Math.round((r.quality + 0.2 * Number(r.helpful)) * 100) / 100 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map((r, i) => ({
          rank: i + 1,
          userId: r.user_id,
          username: r.username,
          displayName: r.display_name,
          avatarUrl: r.avatar_url,
          qualityScore: r.score,
          reviewCount: Number(r.reviews),
          helpfulReceived: Number(r.helpful),
        }));
    });
  }
}
