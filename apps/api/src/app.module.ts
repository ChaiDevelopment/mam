import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './common/app-config.service';
import { AuditModule } from './common/audit.service';
import { CacheModule, CacheService } from './common/cache.service';
import { MailModule } from './common/mail.service';
import { AuthGuard, CsrfGuard, RolesGuard } from './common/guards';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { MetricsModule } from './common/metrics.service';
import { PrismaModule } from './common/prisma.service';
import { RequestContextMiddleware } from './common/request-context.middleware';
import { CacheThrottlerStorage } from './common/throttler-storage';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { CategoriesModule } from './modules/categories/categories.service';
import { CollectionsModule } from './modules/collections/collections.module';
import { CommunityModule } from './modules/community/community.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { HealthModule } from './modules/health/health.module';
import { IntegrationsCoreModule } from './modules/integrations/integrations-core.module';
import { NotificationsModule } from './modules/notifications/notifications.service';
import { PlacesModule } from './modules/places/places.module';
import { RestaurantsModule } from './modules/restaurants/restaurants.module';
import { RetentionModule } from './modules/retention/retention.service';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    PrismaModule,
    CacheModule,
    MailModule,
    MetricsModule,
    AuditModule,
    AppConfigModule,
    IntegrationsCoreModule,
    ThrottlerModule.forRootAsync({
      inject: [CacheService],
      useFactory: (cache: CacheService) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
        storage: new CacheThrottlerStorage(cache),
        getTracker: (req: Record<string, unknown>) => {
          const user = req.user as { id?: string } | undefined;
          return user?.id ? `u:${user.id}` : `ip:${String(req.ip)}`;
        },
      }),
    }),
    AuthModule,
    UsersModule,
    CategoriesModule,
    PlacesModule,
    RestaurantsModule,
    ReviewsModule,
    UploadsModule,
    CollectionsModule,
    FavoritesModule,
    NotificationsModule,
    CommunityModule,
    AdminModule,
    HealthModule,
    RetentionModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters: authenticate → authorize roles → CSRF → rate limit (per user when known).
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}
