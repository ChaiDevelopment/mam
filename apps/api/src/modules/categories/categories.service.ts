import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth.decorators';
import { CacheService } from '../../common/cache.service';
import { PrismaService } from '../../common/prisma.service';
import { DEFAULT_CATEGORY_DEFS } from './category-mapping';

export interface CategoryDef {
  id: string;
  slug: string;
  nameId: string;
  nameEn: string;
  emoji: string | null;
  googleTypes: string[];
  sortOrder: number;
  isActive: boolean;
}

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async all(): Promise<CategoryDef[]> {
    return this.cache.wrap('categories:v1', 300, async () => {
      const rows = await this.prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }] });
      if (rows.length) return rows;
      // Fresh database without seed: fall back to built-in definitions so discovery still works.
      return DEFAULT_CATEGORY_DEFS.map((d, i) => ({ ...d, id: d.slug, sortOrder: i, isActive: true }));
    });
  }

  async active() {
    return (await this.all()).filter((c) => c.isActive);
  }

  invalidate() {
    return this.cache.del('categories:v1');
  }
}

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Public()
  @Get()
  async list() {
    return (await this.categories.active()).map(({ slug, nameId, nameEn, emoji }) => ({ slug, nameId, nameEn, emoji }));
  }
}

@Module({ providers: [CategoriesService], controllers: [CategoriesController], exports: [CategoriesService] })
export class CategoriesModule {}
