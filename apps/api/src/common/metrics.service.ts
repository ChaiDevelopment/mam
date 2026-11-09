import { Global, Injectable, Module } from '@nestjs/common';

interface Histogram {
  count: number;
  sum: number;
  buckets: number[];
}
const BUCKETS_MS = [25, 50, 100, 250, 500, 1000, 2500, 5000];

/** Minimal in-process metrics, exported in Prometheus text format at /api/v1/health/metrics. */
@Injectable()
export class MetricsService {
  private http = new Map<string, Histogram>();
  private counters = new Map<string, number>();

  observeHttp(method: string, route: string, status: number, ms: number) {
    const key = `${method}|${route}|${Math.floor(status / 100)}xx`;
    let h = this.http.get(key);
    if (!h) {
      h = { count: 0, sum: 0, buckets: BUCKETS_MS.map(() => 0) };
      this.http.set(key, h);
    }
    h.count++;
    h.sum += ms;
    BUCKETS_MS.forEach((b, i) => {
      if (ms <= b) h!.buckets[i]++;
    });
  }

  inc(name: string, labels: Record<string, string> = {}) {
    const key = `${name}|${Object.entries(labels)
      .map(([k, v]) => `${k}="${v.replace(/"/g, '')}"`)
      .join(',')}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  render(): string {
    const lines: string[] = [
      '# HELP mam_http_request_duration_ms HTTP request latency',
      '# TYPE mam_http_request_duration_ms histogram',
    ];
    for (const [key, h] of this.http) {
      const [method, route, status] = key.split('|');
      const l = `method="${method}",route="${route}",status="${status}"`;
      BUCKETS_MS.forEach((b, i) => lines.push(`mam_http_request_duration_ms_bucket{${l},le="${b}"} ${h.buckets[i]}`));
      lines.push(`mam_http_request_duration_ms_bucket{${l},le="+Inf"} ${h.count}`);
      lines.push(`mam_http_request_duration_ms_sum{${l}} ${h.sum.toFixed(1)}`);
      lines.push(`mam_http_request_duration_ms_count{${l}} ${h.count}`);
    }
    const names = new Set([...this.counters.keys()].map((k) => k.split('|')[0]));
    for (const n of names) lines.push(`# TYPE ${n} counter`);
    for (const [key, v] of this.counters) {
      const [name, labels] = key.split('|');
      lines.push(`${name}${labels ? `{${labels}}` : ''} ${v}`);
    }
    return lines.join('\n') + '\n';
  }
}

@Global()
@Module({ providers: [MetricsService], exports: [MetricsService] })
export class MetricsModule {}
