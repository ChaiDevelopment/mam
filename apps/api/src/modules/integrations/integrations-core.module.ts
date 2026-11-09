import { Global, Module } from '@nestjs/common';
import { FoodPlatformRegistry } from './food-platforms';
import { IntegrationHealthService } from './integration-health.service';

@Global()
@Module({
  providers: [IntegrationHealthService, FoodPlatformRegistry],
  exports: [IntegrationHealthService, FoodPlatformRegistry],
})
export class IntegrationsCoreModule {}
