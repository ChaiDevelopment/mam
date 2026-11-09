import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

/** Assigns a request ID, logs one structured line per request and records latency metrics. */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('Request');
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request & { requestId?: string; user?: { id: string } }, res: Response, next: NextFunction) {
    const incoming = req.header('x-request-id');
    req.requestId = incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const route = (req.route?.path as string | undefined) ?? 'unmatched';
      this.metrics.observeHttp(req.method, `${req.baseUrl ?? ''}${route}`, res.statusCode, ms);
      if (req.originalUrl.includes('/health')) return;
      this.logger.log(
        JSON.stringify({
          id: req.requestId,
          m: req.method,
          // Strip query strings: they may contain coordinates, which must not be logged.
          p: req.originalUrl.split('?')[0],
          s: res.statusCode,
          ms: Math.round(ms),
          u: req.user?.id,
        }),
      );
    });
    next();
  }
}
