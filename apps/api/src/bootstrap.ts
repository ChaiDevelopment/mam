import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env } from './config/env';

export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('MAM! API')
    .setDescription(
      'MAM! — Discover. Review. Eat. REST API v1.\n\n' +
        'Authentication: web/admin use httpOnly cookies + X-CSRF-Token (double submit); Android uses Bearer tokens.\n' +
        'Google Maps content is fetched live and never stored (only Place IDs, and coordinates for ≤ 30 days).',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addCookieAuth('mam_at')
    .build();
  return SwaggerModule.createDocument(app, config);
}

export async function createApp(): Promise<NestExpressApplication> {
  const e = env();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: e.NODE_ENV === 'production' ? ['log', 'warn', 'error'] : ['log', 'warn', 'error', 'debug'],
    bodyParser: true,
  });
  app.set('trust proxy', e.TRUST_PROXY);
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '256kb' });
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], imgSrc: ["'self'", 'data:'], styleSrc: ["'self'", "'unsafe-inline'"], scriptSrc: ["'self'", "'unsafe-inline'"] } },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser(e.COOKIE_SECRET));
  const origins = e.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({
    origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  if (e.NODE_ENV !== 'production') {
    SwaggerModule.setup('api/docs', app, buildOpenApi(app), { jsonDocumentUrl: 'api/docs-json' });
    new Logger('Bootstrap').log(`Swagger UI: ${e.API_PUBLIC_URL}/api/docs`);
  }
  return app;
}
