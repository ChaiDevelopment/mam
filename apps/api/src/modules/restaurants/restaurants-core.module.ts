import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.service';
import { IntegrationsCoreModule } from '../integrations/integrations-core.module';
import { GooglePlacesClient } from '../places/google-places.client';
import { CommunityStatsService } from './community-stats.service';
import { LocalPlacesService } from './local-places.service';
import { RestaurantsService } from './restaurants.service';

/** Restaurant domain services without controllers (avoids circular module imports). */
@Module({
  imports: [CategoriesModule, IntegrationsCoreModule],
  providers: [RestaurantsService, CommunityStatsService, LocalPlacesService, GooglePlacesClient],
  exports: [RestaurantsService, CommunityStatsService, LocalPlacesService, GooglePlacesClient, CategoriesModule],
})
export class RestaurantsCoreModule {}
