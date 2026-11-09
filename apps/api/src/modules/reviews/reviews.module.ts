import { Module } from '@nestjs/common';
import { CommunityModule } from '../community/community.module';
import { NotificationsModule } from '../notifications/notifications.service';
import { RestaurantsCoreModule } from '../restaurants/restaurants-core.module';
import { UploadsModule } from '../uploads/uploads.module';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [RestaurantsCoreModule, UploadsModule, CommunityModule, NotificationsModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
