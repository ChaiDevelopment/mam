import { Controller, Delete, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FavoriteView } from '@mam/shared-types';
import { AuthUser, CurrentUser } from '../../common/auth.decorators';
import { PrismaService } from '../../common/prisma.service';
import { RestaurantsCoreModule } from '../restaurants/restaurants-core.module';
import { RestaurantsService } from '../restaurants/restaurants.service';

@Injectable()
export class FavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
  ) {}

  async list(userId: string): Promise<FavoriteView[]> {
    const favs = await this.prisma.favorite.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 200 });
    const rows = await this.restaurants.loadMany(favs.map((f) => f.restaurantId));
    const views = new Map((await this.restaurants.toViews(rows, { liveName: true })).map((v) => [v.id, v]));
    return favs
      .filter((f) => views.has(f.restaurantId))
      .map((f) => {
        const v = views.get(f.restaurantId)!;
        return { restaurant: { id: v.id, name: v.name, googlePlaceId: v.googlePlaceId, placeKey: v.placeKey, location: v.location, stats: v.stats }, createdAt: f.createdAt.toISOString() };
      });
  }

  async status(userId: string, restaurantId: string) {
    const id = await this.restaurants.canonicalId(restaurantId);
    return { favorited: !!(await this.prisma.favorite.findUnique({ where: { userId_restaurantId: { userId, restaurantId: id } } })) };
  }

  /** Idempotent. */
  async add(userId: string, restaurantId: string) {
    const id = await this.restaurants.canonicalId(restaurantId);
    await this.prisma.favorite.upsert({ where: { userId_restaurantId: { userId, restaurantId: id } }, create: { userId, restaurantId: id }, update: {} });
  }

  async remove(userId: string, restaurantId: string) {
    const id = await this.restaurants.canonicalId(restaurantId).catch(() => restaurantId);
    await this.prisma.favorite.deleteMany({ where: { userId, restaurantId: id } });
  }
}

const uuid = new ParseUUIDPipe();

@ApiTags('favorites')
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly svc: FavoritesService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.svc.list(u.id);
  }

  @Get(':restaurantId')
  status(@CurrentUser() u: AuthUser, @Param('restaurantId', uuid) id: string) {
    return this.svc.status(u.id, id);
  }

  @Post(':restaurantId')
  @HttpCode(204)
  add(@CurrentUser() u: AuthUser, @Param('restaurantId', uuid) id: string) {
    return this.svc.add(u.id, id);
  }

  @Delete(':restaurantId')
  @HttpCode(204)
  remove(@CurrentUser() u: AuthUser, @Param('restaurantId', uuid) id: string) {
    return this.svc.remove(u.id, id);
  }
}

@Module({ imports: [RestaurantsCoreModule], controllers: [FavoritesController], providers: [FavoritesService] })
export class FavoritesModule {}
