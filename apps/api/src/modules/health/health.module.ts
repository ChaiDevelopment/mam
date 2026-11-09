import { Controller, Get, Header, Module, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/auth.decorators';
import { CacheService } from '../../common/cache.service';
import { MetricsService } from '../../common/metrics.service';
import { PrismaService } from '../../common/prisma.service';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly metrics: MetricsService,
  ) {}

  /** Liveness: the process is up. */
  @Public()
  @Get()
  live() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  /** Readiness: dependencies reachable. Redis is optional (degrades to in-memory cache). */
  @Public()
  @Get('ready')
  async ready() {
    const started = Date.now();
    const db = await this.prisma.$queryRaw<{ postgis: string }[]>`SELECT postgis_lib_version() AS postgis`.then(
      (r) => ({ ok: true, postgis: r[0]?.postgis }),
      () => ({ ok: false, postgis: null }),
    );
    const redis = await this.cache.ping();
    const body = { status: db.ok ? 'ok' : 'degraded', database: db, redis: { ok: redis, driver: this.cache.driver }, latencyMs: Date.now() - started };
    if (!db.ok) throw new ServiceUnavailableException(body);
    return body;
  }

  /** Prometheus metrics. Restrict access at the reverse proxy in production (see infrastructure/nginx). */
  @Public()
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4')
  metricsText() {
    return this.metrics.render();
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
