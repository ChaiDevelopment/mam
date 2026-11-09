import { Global, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from '../config/env';

/**
 * Short-lived application cache (Redis, with an in-memory fallback for local development).
 * IMPORTANT: never put Google Places content here — only MAM!-owned data (community stats,
 * feeds, rate-limit counters). See docs/integrations/GOOGLE_MAPS.md.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger('Cache');
  private redis: Redis | null = null;
  private memory = new Map<string, { v: string; exp: number }>();
  private redisHealthy = false;

  constructor() {
    const url = env().REDIS_URL;
    if (url) {
      this.redis = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 1, enableOfflineQueue: false });
      this.redis.on('ready', () => {
        this.redisHealthy = true;
        this.logger.log('Redis connected');
      });
      this.redis.on('error', (e) => {
        if (this.redisHealthy) this.logger.warn(`Redis error, falling back to memory: ${e.message}`);
        this.redisHealthy = false;
      });
    } else {
      this.logger.warn('REDIS_URL not set — using in-memory cache (single instance only)');
    }
  }

  get driver(): 'redis' | 'memory' {
    return this.redis && this.redisHealthy ? 'redis' : 'memory';
  }

  async ping(): Promise<boolean> {
    if (!this.redis) return false;
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.redis && this.redisHealthy) {
      try {
        const v = await this.redis.get(key);
        return v ? (JSON.parse(v) as T) : null;
      } catch {
        /* fall through */
      }
    }
    const hit = this.memory.get(key);
    if (!hit) return null;
    if (hit.exp < Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return JSON.parse(hit.v) as T;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const v = JSON.stringify(value);
    if (this.redis && this.redisHealthy) {
      try {
        await this.redis.set(key, v, 'EX', ttlSeconds);
        return;
      } catch {
        /* fall through */
      }
    }
    if (this.memory.size > 5000) this.memory.clear();
    this.memory.set(key, { v, exp: Date.now() + ttlSeconds * 1000 });
  }

  async del(...keys: string[]): Promise<void> {
    if (!keys.length) return;
    if (this.redis && this.redisHealthy) {
      try {
        await this.redis.del(...keys);
      } catch {
        /* ignore */
      }
    }
    keys.forEach((k) => this.memory.delete(k));
  }

  /** Fixed-window counter. Returns the count after increment. */
  async incr(key: string, windowSeconds: number): Promise<number> {
    if (this.redis && this.redisHealthy) {
      try {
        const n = await this.redis.incr(key);
        if (n === 1) await this.redis.expire(key, windowSeconds);
        return n;
      } catch {
        /* fall through */
      }
    }
    const hit = this.memory.get(key);
    const now = Date.now();
    const n = hit && hit.exp > now ? Number(JSON.parse(hit.v)) + 1 : 1;
    this.memory.set(key, { v: JSON.stringify(n), exp: hit && hit.exp > now ? hit.exp : now + windowSeconds * 1000 });
    return n;
  }

  async wrap<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;
    const v = await fn();
    await this.set(key, v, ttlSeconds);
    return v;
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => undefined);
  }
}

@Global()
@Module({ providers: [CacheService], exports: [CacheService] })
export class CacheModule {}
