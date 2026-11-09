import { Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { CacheService } from './cache.service';

/** Throttler storage backed by Redis (shared across instances) with in-memory fallback. */
@Injectable()
export class CacheThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly cache: CacheService) {}

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string) {
    const windowSec = Math.max(1, Math.ceil(ttl / 1000));
    const blockKey = `rl:block:${throttlerName}:${key}`;
    const blockedUntil = await this.cache.get<number>(blockKey);
    if (blockedUntil && blockedUntil > Date.now()) {
      return { totalHits: limit + 1, timeToExpire: windowSec, isBlocked: true, timeToBlockExpire: Math.ceil((blockedUntil - Date.now()) / 1000) };
    }
    const totalHits = await this.cache.incr(`rl:${throttlerName}:${key}`, windowSec);
    const isBlocked = totalHits > limit;
    if (isBlocked && blockDuration > 0) {
      await this.cache.set(blockKey, Date.now() + blockDuration, Math.ceil(blockDuration / 1000));
    }
    return { totalHits, timeToExpire: windowSec, isBlocked, timeToBlockExpire: isBlocked ? Math.ceil(blockDuration / 1000) : 0 };
  }
}
