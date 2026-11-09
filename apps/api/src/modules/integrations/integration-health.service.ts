import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { IntegrationHealth } from '@mam/shared-types';
import { MetricsService } from '../../common/metrics.service';
import { PrismaService } from '../../common/prisma.service';

interface Counter {
  ok: number;
  err: number;
  latency: number;
  lastSuccessAt?: Date;
  lastErrorAt?: Date;
  lastErrorMessage?: string;
}

/**
 * Tracks success/error/latency per external provider. Counters are aggregated in memory and
 * flushed to integration_status every 30 s; the admin dashboard reads from that table.
 */
@Injectable()
export class IntegrationHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('IntegrationHealth');
  private pending = new Map<string, Counter>();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.flush(), 30_000);
    this.timer.unref?.();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }

  record(provider: string, ok: boolean, latencyMs: number, error?: string) {
    const c = this.pending.get(provider) ?? { ok: 0, err: 0, latency: 0 };
    if (ok) {
      c.ok++;
      c.lastSuccessAt = new Date();
    } else {
      c.err++;
      c.lastErrorAt = new Date();
      c.lastErrorMessage = error?.slice(0, 500);
      this.logger.warn(`${provider} error: ${error}`);
    }
    c.latency += latencyMs;
    this.pending.set(provider, c);
    this.metrics.inc('mam_external_requests_total', { provider, outcome: ok ? 'ok' : 'error' });
  }

  async flush() {
    const entries = [...this.pending.entries()];
    this.pending.clear();
    for (const [provider, c] of entries) {
      try {
        const existing = await this.prisma.integrationStatus.findUnique({ where: { provider } });
        const resetWindow = !existing || Date.now() - existing.windowStartedAt.getTime() > 24 * 3600_000;
        await this.prisma.integrationStatus.upsert({
          where: { provider },
          create: {
            provider,
            configured: true,
            healthy: c.err === 0 || !!c.lastSuccessAt,
            lastCheckedAt: new Date(),
            lastSuccessAt: c.lastSuccessAt,
            lastErrorAt: c.lastErrorAt,
            lastErrorMessage: c.lastErrorMessage,
            successCount: c.ok,
            errorCount: c.err,
            totalLatencyMs: BigInt(Math.round(c.latency)),
          },
          update: {
            configured: true,
            healthy: (c.lastSuccessAt?.getTime() ?? 0) >= (c.lastErrorAt?.getTime() ?? 0),
            lastCheckedAt: new Date(),
            lastSuccessAt: c.lastSuccessAt ?? undefined,
            lastErrorAt: c.lastErrorAt ?? undefined,
            lastErrorMessage: c.lastErrorMessage ?? undefined,
            successCount: resetWindow ? c.ok : { increment: c.ok },
            errorCount: resetWindow ? c.err : { increment: c.err },
            totalLatencyMs: resetWindow ? BigInt(Math.round(c.latency)) : { increment: BigInt(Math.round(c.latency)) },
            windowStartedAt: resetWindow ? new Date() : undefined,
          },
        });
      } catch (e) {
        this.logger.warn(`flush failed for ${provider}: ${(e as Error).message}`);
      }
    }
  }

  async markConfigured(provider: string, configured: boolean, healthy: boolean | null, message?: string) {
    await this.prisma.integrationStatus.upsert({
      where: { provider },
      create: { provider, configured, healthy, lastCheckedAt: new Date(), lastErrorMessage: message },
      update: { configured, healthy, lastCheckedAt: new Date(), ...(message ? { lastErrorMessage: message, lastErrorAt: healthy ? undefined : new Date() } : {}) },
    });
  }

  async list(notes: Record<string, { configured: boolean; note: string }>): Promise<IntegrationHealth[]> {
    await this.flush();
    const rows = await this.prisma.integrationStatus.findMany();
    const byProvider = new Map(rows.map((r) => [r.provider, r]));
    return Object.entries(notes).map(([provider, n]) => {
      const r = byProvider.get(provider);
      const total = (r?.successCount ?? 0) + (r?.errorCount ?? 0);
      return {
        provider: provider as IntegrationHealth['provider'],
        configured: n.configured,
        healthy: n.configured ? (r?.healthy ?? null) : false,
        lastCheckedAt: r?.lastCheckedAt?.toISOString() ?? null,
        lastErrorAt: r?.lastErrorAt?.toISOString() ?? null,
        lastErrorMessage: r?.lastErrorMessage ?? null,
        errorCount24h: r?.errorCount ?? 0,
        successCount24h: r?.successCount ?? 0,
        avgLatencyMs: total ? Math.round(Number(r!.totalLatencyMs) / total) : null,
        note: n.note,
      };
    });
  }
}
