import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Prisma, Restaurant } from '@prisma/client';
import { type CategorySlug, type DeliveryProvider, type LatLng, type PlatformLinkView, type RestaurantView, localPlaceKey, parseLocalPlaceKey } from '@mam/shared-types';
import { PrismaService, isUniqueViolation } from '../../common/prisma.service';
import { categoriesFromTypes } from '../categories/category-mapping';
import { CategoriesService } from '../categories/categories.service';
import { FoodPlatformRegistry } from '../integrations/food-platforms';
import { FIELD_MASKS, GooglePlacesClient, GooglePlacesError } from '../places/google-places.client';
import { CommunityStatsService } from './community-stats.service';

const storedNameSource = (s: string | undefined): RestaurantView['nameSource'] => (s === 'ADMIN' ? 'ADMIN' : s === 'OSM' ? 'OSM' : 'COMMUNITY');

/** Google ToS: latitude/longitude may be cached for at most 30 consecutive days. */
export const GOOGLE_LOCATION_TTL_DAYS = 30;

type RestaurantWithRefs = Restaurant & {
  externalRefs: { provider: string; externalPlaceId: string }[];
  categories: { category: { slug: string } }[];
};

@Injectable()
export class RestaurantsService {
  private readonly logger = new Logger('Restaurants');

  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GooglePlacesClient,
    private readonly categories: CategoriesService,
    private readonly stats: CommunityStatsService,
    private readonly platforms: FoodPlatformRegistry,
  ) {}

  /** Follows merge chains so references to merged duplicates land on the surviving record. */
  async canonicalId(id: string): Promise<string> {
    let current = id;
    for (let i = 0; i < 5; i++) {
      const r = await this.prisma.restaurant.findUnique({ where: { id: current }, select: { mergedIntoId: true, status: true } });
      if (!r) throw new NotFoundException('Restoran tidak ditemukan.');
      if (r.status !== 'MERGED' || !r.mergedIntoId) return current;
      current = r.mergedIntoId;
    }
    return current;
  }

  async idsForPlaceIds(placeIds: string[]): Promise<Map<string, string>> {
    if (!placeIds.length) return new Map();
    const refs = await this.prisma.externalPlaceRef.findMany({
      where: { provider: 'GOOGLE', externalPlaceId: { in: placeIds } },
      select: { externalPlaceId: true, restaurantId: true, restaurant: { select: { mergedIntoId: true, status: true } } },
    });
    return new Map(refs.map((r) => [r.externalPlaceId, r.restaurant.status === 'MERGED' && r.restaurant.mergedIntoId ? r.restaurant.mergedIntoId : r.restaurantId]));
  }

  /**
   * Returns the internal restaurant UUID for a Google Place ID, creating the reference if needed.
   * The Place ID is verified against Google when the integration is configured.
   */
  async resolveGooglePlace(placeId: string, userId: string | null): Promise<string> {
    // Places stored in MAM! (OpenStreetMap imports, community additions) already have an internal UUID.
    const localId = parseLocalPlaceKey(placeId);
    if (localId) {
      if (!/^[0-9a-f-]{36}$/i.test(localId)) throw new NotFoundException('Tempat tidak ditemukan.');
      return this.canonicalId(localId);
    }
    const existing = await this.idsForPlaceIds([placeId]);
    if (existing.has(placeId)) return existing.get(placeId)!;

    let location: LatLng | null = null;
    let types: string[] = [];
    if (this.google.isConfigured()) {
      try {
        const p = await this.google.details(placeId, `${FIELD_MASKS.locationOnly},types`);
        if (p.location) location = { lat: p.location.latitude, lng: p.location.longitude };
        types = p.types ?? [];
      } catch (e) {
        if (e instanceof GooglePlacesError && (e.reason === 'NOT_FOUND' || e.reason === 'INVALID_REQUEST')) {
          throw new NotFoundException('Tempat tidak ditemukan di Google Maps.');
        }
        throw new ServiceUnavailableException('Google Maps sedang tidak dapat dihubungi. Coba lagi nanti.');
      }
    } else {
      throw new ServiceUnavailableException('Integrasi Google Maps belum dikonfigurasi; tempat tidak dapat diverifikasi.');
    }

    const defs = await this.categories.all();
    const slugs = categoriesFromTypes(types, defs);
    try {
      return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const r = await tx.restaurant.create({
          data: { createdById: userId, nameSource: 'NONE', externalRefs: { create: { provider: 'GOOGLE', externalPlaceId: placeId } } },
        });
        if (location) await this.setLocation(tx, r.id, location);
        const catIds = defs.filter((d) => slugs.includes(d.slug as CategorySlug) && d.id !== d.slug).map((d) => d.id);
        if (catIds.length) {
          await tx.restaurantCategory.createMany({ data: catIds.map((categoryId) => ({ restaurantId: r.id, categoryId, source: 'GOOGLE_TYPE' as const })), skipDuplicates: true });
        }
        return r.id;
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        const again = await this.idsForPlaceIds([placeId]);
        if (again.has(placeId)) return again.get(placeId)!;
      }
      throw e;
    }
  }

  async setLocation(tx: Prisma.TransactionClient | PrismaService, restaurantId: string, loc: LatLng) {
    await tx.$executeRaw`
      UPDATE restaurants
         SET location = ST_SetSRID(ST_MakePoint(${loc.lng}, ${loc.lat}), 4326)::geography,
             location_cached_at = now()
       WHERE id = ${restaurantId}::uuid AND source = 'GOOGLE'`;
  }

  /** Refreshes the ≤30-day coordinate cache for restaurants that appeared in fresh Google results. */
  async refreshLocations(items: { restaurantId: string; location: LatLng }[]) {
    for (const it of items) {
      await this.setLocation(this.prisma, it.restaurantId, it.location).catch((e) => this.logger.warn(`location refresh failed: ${(e as Error).message}`));
    }
  }

  async locations(ids: string[]): Promise<Map<string, LatLng>> {
    if (!ids.length) return new Map();
    const rows = await this.prisma.$queryRaw<{ id: string; lat: number; lng: number }[]>`
      SELECT id, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
        FROM restaurants WHERE id = ANY(${ids}::uuid[]) AND location IS NOT NULL`;
    return new Map(rows.map((r) => [r.id, { lat: r.lat, lng: r.lng }]));
  }

  /**
   * Live display names. Google names are fetched on demand (never persisted); community/admin names are stored.
   * Calls are limited to 5 concurrent requests per invocation.
   */
  async displayNames(rows: { id: string; name: string | null; nameSource?: string; googlePlaceId: string | null }[]): Promise<Map<string, { name: string | null; source: RestaurantView['nameSource'] }>> {
    const out = new Map<string, { name: string | null; source: RestaurantView['nameSource'] }>();
    const needGoogle = rows.filter((r) => r.googlePlaceId);
    const queue = [...needGoogle];
    const worker = async () => {
      while (queue.length) {
        const r = queue.shift()!;
        if (!this.google.isConfigured()) break;
        try {
          const p = await this.google.details(r.googlePlaceId!, FIELD_MASKS.nameOnly);
          if (p.displayName?.text) out.set(r.id, { name: p.displayName.text, source: 'GOOGLE_LIVE' });
        } catch {
          /* fall back below */
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(5, needGoogle.length) }, worker));
    for (const r of rows) {
      if (out.has(r.id)) continue;
      out.set(r.id, r.name ? { name: r.name, source: storedNameSource(r.nameSource) } : { name: null, source: 'UNAVAILABLE' });
    }
    return out;
  }

  private async load(id: string): Promise<RestaurantWithRefs> {
    const r = await this.prisma.restaurant.findFirst({
      where: { id, deletedAt: null },
      include: { externalRefs: { select: { provider: true, externalPlaceId: true } }, categories: { include: { category: { select: { slug: true } } } } },
    });
    if (!r) throw new NotFoundException('Restoran tidak ditemukan.');
    return r;
  }

  async view(id: string, opts: { liveName?: boolean } = { liveName: true }): Promise<RestaurantView> {
    const canonical = await this.canonicalId(id);
    const r = await this.load(canonical);
    return (await this.toViews([r], opts))[0];
  }

  async toViews(rows: RestaurantWithRefs[], opts: { liveName?: boolean } = {}): Promise<RestaurantView[]> {
    const ids = rows.map((r) => r.id);
    const [statsMap, locs] = await Promise.all([this.stats.forMany(ids), this.locations(ids)]);
    const refRows = rows.map((r) => ({
      id: r.id,
      name: r.name,
      nameSource: r.nameSource,
      googlePlaceId: r.externalRefs.find((e) => e.provider === 'GOOGLE')?.externalPlaceId ?? null,
    }));
    const names = opts.liveName
      ? await this.displayNames(refRows)
      : new Map(refRows.map((r) => [r.id, { name: r.name, source: (r.name ? storedNameSource(r.nameSource) : 'UNAVAILABLE') as RestaurantView['nameSource'] }]));
    return rows.map((r, i) => ({
      id: r.id,
      name: names.get(r.id)?.name ?? null,
      nameSource: r.nameSource === 'ADMIN' && names.get(r.id)?.source !== 'GOOGLE_LIVE' ? 'ADMIN' : (names.get(r.id)?.source ?? 'UNAVAILABLE'),
      source: r.source,
      placeKey: r.source === 'GOOGLE' ? refRows[i].googlePlaceId : localPlaceKey(r.id),
      googlePlaceId: refRows[i].googlePlaceId,
      location: locs.get(r.id) ?? null,
      categories: r.categories.map((c) => c.category.slug as CategorySlug),
      status: r.status,
      stats: statsMap.get(r.id)!,
    }));
  }

  async loadMany(ids: string[]): Promise<RestaurantWithRefs[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.restaurant.findMany({
      where: { id: { in: ids }, deletedAt: null },
      include: { externalRefs: { select: { provider: true, externalPlaceId: true } }, categories: { include: { category: { select: { slug: true } } } } },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r) => !!r) as RestaurantWithRefs[];
  }

  /** Community restaurants within a radius, using PostGIS geography (spheroidal distance). */
  async nearbyCommunity(center: LatLng, radiusMeters: number, limit = 50): Promise<{ id: string; distanceMeters: number }[]> {
    return this.prisma.$queryRaw<{ id: string; distanceMeters: number }[]>`
      SELECT r.id,
             ST_Distance(r.location, ST_SetSRID(ST_MakePoint(${center.lng}, ${center.lat}), 4326)::geography) AS "distanceMeters"
        FROM restaurants r
       WHERE r.location IS NOT NULL
         AND r.status = 'ACTIVE'
         AND r.deleted_at IS NULL
         AND ST_DWithin(r.location, ST_SetSRID(ST_MakePoint(${center.lng}, ${center.lat}), 4326)::geography, ${radiusMeters})
       ORDER BY "distanceMeters" ASC
       LIMIT ${limit}`;
  }

  // ───────────── Platform links ─────────────
  async platformLinks(restaurantId: string): Promise<PlatformLinkView[]> {
    const id = await this.canonicalId(restaurantId);
    const links = await this.prisma.platformLink.findMany({ where: { restaurantId: id } });
    return this.platforms.all().map((p) => {
      const link = links.find((l) => l.provider === p.id);
      if (link && link.availability === 'VERIFIED' && link.url) {
        return {
          provider: p.id,
          providerName: p.getProviderName(),
          url: link.url,
          availability: 'VERIFIED',
          lastVerifiedAt: link.lastVerifiedAt?.toISOString() ?? null,
          source: link.source === 'PROVIDER_API' ? 'PROVIDER_API' : 'ADMIN_VERIFIED',
          note: 'Tautan resmi telah diverifikasi oleh tim MAM!. Menu, harga, dan ketersediaan hanya ada di aplikasi penyedia.',
        };
      }
      if (link && link.availability === 'UNAVAILABLE') {
        return {
          provider: p.id,
          providerName: p.getProviderName(),
          url: null,
          availability: 'UNAVAILABLE',
          lastVerifiedAt: link.lastVerifiedAt?.toISOString() ?? null,
          source: 'ADMIN_VERIFIED',
          note: `Tim MAM! memverifikasi restoran ini tidak tersedia di ${p.getProviderName()}.`,
        };
      }
      if (link && link.url) {
        return {
          provider: p.id,
          providerName: p.getProviderName(),
          url: link.url,
          availability: 'UNVERIFIED',
          lastVerifiedAt: null,
          source: 'USER_SUBMITTED',
          note: 'Tautan dikirim oleh pengguna dan belum diverifikasi. Periksa kembali sebelum memesan.',
        };
      }
      return {
        provider: p.id,
        providerName: p.getProviderName(),
        url: null,
        availability: 'NOT_INTEGRATED',
        lastVerifiedAt: null,
        source: 'NONE',
        note: `Data ${p.getProviderName()} tidak tersedia: MAM! belum memiliki akses API resmi. Kami tidak menampilkan menu atau harga yang tidak terverifikasi.`,
      };
    });
  }

  async submitPlatformLink(restaurantId: string, userId: string, provider: DeliveryProvider, url: string): Promise<PlatformLinkView> {
    const id = await this.canonicalId(restaurantId);
    if (!this.platforms.isOfficialUrl(provider, url)) {
      throw new BadRequestException(`Tautan harus mengarah ke domain resmi ${this.platforms.get(provider).getProviderName()}.`);
    }
    const existing = await this.prisma.platformLink.findUnique({ where: { restaurantId_provider: { restaurantId: id, provider } } });
    if (existing && existing.source !== 'USER_SUBMITTED') {
      throw new BadRequestException('Tautan untuk penyedia ini sudah diverifikasi oleh tim MAM!.');
    }
    await this.prisma.platformLink.upsert({
      where: { restaurantId_provider: { restaurantId: id, provider } },
      create: { restaurantId: id, provider, url, availability: 'UNVERIFIED', source: 'USER_SUBMITTED', submittedById: userId },
      update: { url, availability: 'UNVERIFIED', submittedById: userId },
    });
    return (await this.platformLinks(id)).find((l) => l.provider === provider)!;
  }
}
