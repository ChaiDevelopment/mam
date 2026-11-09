import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { z } from 'zod';
import { platformLinkSubmissionSchema, resolvePlaceSchema, restaurantReviewsQuerySchema } from '@mam/validation';
import { AuthUser, CurrentUser, Public } from '../../common/auth.decorators';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../../common/zod';
import { ReviewsModule } from '../reviews/reviews.module';
import { ReviewsService } from '../reviews/reviews.service';
import { CommunityStatsService } from './community-stats.service';
import { RestaurantsCoreModule } from './restaurants-core.module';
import { RestaurantsService } from './restaurants.service';

const uuid = new ParseUUIDPipe();

@ApiTags('restaurants (MAM! references)')
@Controller('restaurants')
export class RestaurantsController {
  constructor(
    private readonly restaurants: RestaurantsService,
    private readonly stats: CommunityStatsService,
    private readonly reviews: ReviewsService,
  ) {}

  @Post('resolve')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiZodBody(resolvePlaceSchema)
  @ApiOperation({ summary: 'Get or create the internal MAM! restaurant UUID for a Google Place ID.' })
  async resolve(@CurrentUser() u: AuthUser, @Body(new ZodPipe(resolvePlaceSchema)) b: z.infer<typeof resolvePlaceSchema>) {
    const id = await this.restaurants.resolveGooglePlace(b.googlePlaceId, u.id);
    return this.restaurants.view(id, { liveName: false });
  }

  @Public()
  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.restaurants.view(id);
  }

  @Public()
  @Get(':id/reviews')
  @ApiZodQuery(restaurantReviewsQuerySchema)
  reviewsFor(@Param('id', uuid) id: string, @Query(new ZodPipe(restaurantReviewsQuerySchema)) q: z.infer<typeof restaurantReviewsQuerySchema>, @CurrentUser() u?: AuthUser) {
    return this.reviews.listForRestaurant(id, q.sort, q.page, q.pageSize, u);
  }

  @Public()
  @Get(':id/statistics')
  async statistics(@Param('id', uuid) id: string) {
    return this.stats.forOne(await this.restaurants.canonicalId(id));
  }

  @Get(':id/my-review')
  myReview(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) {
    return this.reviews.myReviewFor(u.id, id);
  }

  @Public()
  @Get(':id/platform-links')
  @ApiOperation({ summary: 'Delivery platform links with source and verification status. Never fabricated.' })
  platformLinks(@Param('id', uuid) id: string) {
    return this.restaurants.platformLinks(id);
  }

  @Post(':id/platform-links')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiZodBody(platformLinkSubmissionSchema)
  submitLink(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(new ZodPipe(platformLinkSubmissionSchema)) b: z.infer<typeof platformLinkSubmissionSchema>) {
    return this.restaurants.submitPlatformLink(id, u.id, b.provider, b.url);
  }
}

@Module({
  imports: [RestaurantsCoreModule, ReviewsModule],
  controllers: [RestaurantsController],
})
export class RestaurantsModule {}
