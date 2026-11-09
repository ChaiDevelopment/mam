import { Global, Injectable, Module } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { CacheService } from './cache.service';
import { PrismaService } from './prisma.service';

export interface PlatformConfig {
  defaultRadiusMeters: number;
  reviewMinTextLength: number;
  reviewsRequireApproval: boolean;
  maxReviewsPerDay: number;
}

const CACHE_KEY = 'platform-config:v1';

/** Runtime platform configuration: env defaults overridden by rows in app_config (editable by admins). */
@Injectable()
export class AppConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  defaults(): PlatformConfig {
    const e = env();
    return {
      defaultRadiusMeters: e.DEFAULT_RADIUS_METERS,
      reviewMinTextLength: e.REVIEW_MIN_TEXT_LENGTH,
      reviewsRequireApproval: e.REVIEWS_REQUIRE_APPROVAL,
      maxReviewsPerDay: e.MAX_REVIEWS_PER_DAY,
    };
  }

  async get(): Promise<PlatformConfig> {
    return this.cache.wrap(CACHE_KEY, 30, async () => {
      const rows = await this.prisma.appConfig.findMany();
      const cfg = { ...this.defaults() } as Record<string, unknown>;
      for (const r of rows) if (r.key in cfg) cfg[r.key] = r.value;
      return cfg as unknown as PlatformConfig;
    });
  }

  async update(patch: Partial<PlatformConfig>, actorId: string, tx: Prisma.TransactionClient) {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      await tx.appConfig.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue, updatedById: actorId },
        update: { value: value as Prisma.InputJsonValue, updatedById: actorId },
      });
    }
    await this.cache.del(CACHE_KEY);
  }
}

@Global()
@Module({ providers: [AppConfigService], exports: [AppConfigService] })
export class AppConfigModule {}
