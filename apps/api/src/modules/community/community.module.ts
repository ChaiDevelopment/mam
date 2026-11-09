import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { homeQuerySchema } from '@mam/validation';
import { Public } from '../../common/auth.decorators';
import { ApiZodQuery, ZodPipe } from '../../common/zod';
import { NotificationsModule } from '../notifications/notifications.service';
import { RestaurantsCoreModule } from '../restaurants/restaurants-core.module';
import { BadgesService } from './badges.service';
import { CommunityService } from './community.service';

@ApiTags('community')
@Controller()
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  @Public()
  @Get('home')
  @ApiZodQuery(homeQuerySchema)
  home(@Query(new ZodPipe(homeQuerySchema)) q: z.infer<typeof homeQuerySchema>) {
    const center = q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : null;
    return this.community.home(center, q.radius);
  }

  @Public()
  @Get('community/leaderboard')
  leaderboard() {
    return this.community.leaderboard();
  }
}

@Module({
  imports: [NotificationsModule, RestaurantsCoreModule],
  controllers: [CommunityController],
  providers: [BadgesService, CommunityService],
  exports: [BadgesService],
})
export class CommunityModule {}
