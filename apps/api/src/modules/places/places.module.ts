import { Module } from '@nestjs/common';
import { RestaurantsCoreModule } from '../restaurants/restaurants-core.module';
import { UsersModule } from '../users/users.module';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';

@Module({
  imports: [RestaurantsCoreModule, UsersModule],
  controllers: [PlacesController],
  providers: [PlacesService],
  exports: [PlacesService],
})
export class PlacesModule {}
