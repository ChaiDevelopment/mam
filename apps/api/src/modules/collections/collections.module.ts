import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Collection } from '@prisma/client';
import type { z } from 'zod';
import type { CollectionItemView, CollectionView } from '@mam/shared-types';
import { addCollectionItemSchema, createCollectionSchema, updateCollectionSchema } from '@mam/validation';
import { AuthUser, CurrentUser, Public } from '../../common/auth.decorators';
import { PrismaService, isUniqueViolation } from '../../common/prisma.service';
import { ApiZodBody, ZodPipe } from '../../common/zod';
import { RestaurantsCoreModule } from '../restaurants/restaurants-core.module';
import { RestaurantsService } from '../restaurants/restaurants.service';

const MAX_COLLECTIONS = 50;
const MAX_ITEMS = 200;

@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
  ) {}

  private async toView(c: Collection & { _count: { items: number } }, firstRestaurantId: string | null): Promise<CollectionView> {
    const owner = await this.prisma.userProfile.findUnique({ where: { userId: c.userId }, select: { username: true, displayName: true } });
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      isPublic: c.isPublic,
      itemCount: c._count.items,
      coverRestaurantId: firstRestaurantId,
      owner: { userId: c.userId, username: owner?.username ?? '', displayName: owner?.displayName ?? '' },
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }

  private async owned(userId: string, id: string) {
    const c = await this.prisma.collection.findFirst({ where: { id, deletedAt: null } });
    if (!c) throw new NotFoundException('Koleksi tidak ditemukan.');
    if (c.userId !== userId) throw new ForbiddenException('Ini bukan koleksimu.');
    return c;
  }

  async mine(userId: string): Promise<CollectionView[]> {
    const rows = await this.prisma.collection.findMany({
      where: { userId, deletedAt: null },
      include: { _count: { select: { items: true } }, items: { take: 1, orderBy: { createdAt: 'desc' }, select: { restaurantId: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return Promise.all(rows.map((r) => this.toView(r, r.items[0]?.restaurantId ?? null)));
  }

  async get(id: string, viewerId?: string): Promise<CollectionView & { items: CollectionItemView[] }> {
    const c = await this.prisma.collection.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { items: true } }, items: { orderBy: { createdAt: 'desc' }, take: MAX_ITEMS } },
    });
    if (!c || (!c.isPublic && c.userId !== viewerId)) throw new NotFoundException('Koleksi tidak ditemukan.');
    const rows = await this.restaurants.loadMany(c.items.map((i) => i.restaurantId));
    const views = new Map((await this.restaurants.toViews(rows, { liveName: true })).map((v) => [v.id, v]));
    const items: CollectionItemView[] = c.items
      .filter((i) => views.has(i.restaurantId))
      .map((i) => {
        const v = views.get(i.restaurantId)!;
        return { id: i.id, restaurant: { id: v.id, name: v.name, googlePlaceId: v.googlePlaceId, placeKey: v.placeKey, location: v.location }, note: i.note, addedAt: i.createdAt.toISOString() };
      });
    return { ...(await this.toView(c, c.items[0]?.restaurantId ?? null)), items };
  }

  async create(userId: string, b: z.infer<typeof createCollectionSchema>) {
    if ((await this.prisma.collection.count({ where: { userId, deletedAt: null } })) >= MAX_COLLECTIONS) {
      throw new ConflictException(`Maksimal ${MAX_COLLECTIONS} koleksi.`);
    }
    const c = await this.prisma.collection.create({ data: { userId, name: b.name, description: b.description ?? null, isPublic: b.isPublic }, include: { _count: { select: { items: true } } } });
    return this.toView(c, null);
  }

  async update(userId: string, id: string, b: z.infer<typeof updateCollectionSchema>) {
    await this.owned(userId, id);
    const c = await this.prisma.collection.update({ where: { id }, data: b, include: { _count: { select: { items: true } } } });
    return this.toView(c, null);
  }

  async remove(userId: string, id: string) {
    await this.owned(userId, id);
    await this.prisma.collection.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async addItem(userId: string, id: string, b: z.infer<typeof addCollectionItemSchema>): Promise<CollectionItemView> {
    await this.owned(userId, id);
    if ((await this.prisma.collectionItem.count({ where: { collectionId: id } })) >= MAX_ITEMS) throw new ConflictException(`Maksimal ${MAX_ITEMS} tempat per koleksi.`);
    const restaurantId = b.restaurantId ? await this.restaurants.canonicalId(b.restaurantId) : await this.restaurants.resolveGooglePlace(b.googlePlaceId!, userId);
    try {
      const item = await this.prisma.collectionItem.create({ data: { collectionId: id, restaurantId, note: b.note ?? null } });
      await this.prisma.collection.update({ where: { id }, data: { updatedAt: new Date() } });
      const v = await this.restaurants.view(restaurantId, { liveName: false });
      return { id: item.id, restaurant: { id: v.id, name: v.name, googlePlaceId: v.googlePlaceId, placeKey: v.placeKey, location: v.location }, note: item.note, addedAt: item.createdAt.toISOString() };
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Tempat ini sudah ada di koleksi.');
      throw e;
    }
  }

  async removeItem(userId: string, id: string, itemId: string) {
    await this.owned(userId, id);
    await this.prisma.collectionItem.deleteMany({ where: { id: itemId, collectionId: id } });
  }
}

const uuid = new ParseUUIDPipe();

@ApiTags('collections')
@Controller('collections')
export class CollectionsController {
  constructor(private readonly svc: CollectionsService) {}

  @Get()
  mine(@CurrentUser() u: AuthUser) {
    return this.svc.mine(u.id);
  }

  @Public()
  @Get(':id')
  get(@Param('id', uuid) id: string, @CurrentUser() u?: AuthUser) {
    return this.svc.get(id, u?.id);
  }

  @Post()
  @ApiZodBody(createCollectionSchema)
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(createCollectionSchema)) b: z.infer<typeof createCollectionSchema>) {
    return this.svc.create(u.id, b);
  }

  @Patch(':id')
  @ApiZodBody(updateCollectionSchema)
  update(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(new ZodPipe(updateCollectionSchema)) b: z.infer<typeof updateCollectionSchema>) {
    return this.svc.update(u.id, id, b);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) {
    return this.svc.remove(u.id, id);
  }

  @Post(':id/items')
  @ApiZodBody(addCollectionItemSchema)
  addItem(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(new ZodPipe(addCollectionItemSchema)) b: z.infer<typeof addCollectionItemSchema>) {
    return this.svc.addItem(u.id, id, b);
  }

  @Delete(':id/items/:itemId')
  @HttpCode(204)
  removeItem(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Param('itemId', uuid) itemId: string) {
    return this.svc.removeItem(u.id, id, itemId);
  }
}

@Module({ imports: [RestaurantsCoreModule], controllers: [CollectionsController], providers: [CollectionsService] })
export class CollectionsModule {}
