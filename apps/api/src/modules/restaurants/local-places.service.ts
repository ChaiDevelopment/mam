import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CategorySlug,
  type LatLng,
  type LocalPlaceInfo,
  type PlaceDetail,
  type PlaceSource,
  type PlaceSubmissionView,
  type BrandInfo,
  type MediaCredit,
  type PlaceSummary,
  LOCALITY_PREFIX,
  OSM_ATTRIBUTION,
  localPlaceKey,
} from '@mam/shared-types';
import type { CreatePlaceInput } from '@mam/validation';
import { PrismaService } from '../../common/prisma.service';
import { osmUrl } from '../categories/osm-mapping';
import { CommunityStatsService } from './community-stats.service';

interface LocalRow {
  id: string;
  name: string;
  source: PlaceSource;
  address: string | null;
  phone: string | null;
  website: string | null;
  opening_hours: string | null;
  cuisine: string | null;
  place_kind: string | null;
  city: string | null;
  province: string | null;
  lat: number;
  lng: number;
  distance: number | null;
  osm_id: string | null;
  cats: string[] | null;
  brand: string | null;
  brand_wikidata: string | null;
  brand_info: {
    name: string; description: string | null; website: string | null;
    logo_url: string | null; logo_thumb_url: string | null; logo_license: string | null; logo_license_url: string | null; logo_author: string | null; logo_source_url: string | null;
    image_url: string | null; image_thumb_url: string | null; image_license: string | null; image_license_url: string | null; image_author: string | null; image_source_url: string | null;
  } | null;
}

function credit(url: string | null, thumb: string | null, author: string | null, license: string | null, licenseUrl: string | null, source: string | null): MediaCredit | null {
  if (!url || !license) return null;
  return { url, thumbUrl: thumb ?? url, author: author ?? 'Tidak diketahui', license, licenseUrl, sourceUrl: source };
}

function brandOf(r: LocalRow): BrandInfo | null {
  const b = r.brand_info;
  if (!b && !r.brand) return null;
  return {
    name: b?.name ?? r.brand!,
    wikidata: r.brand_wikidata,
    description: b?.description ?? null,
    website: b?.website ?? null,
    logo: b ? credit(b.logo_url, b.logo_thumb_url, b.logo_author, b.logo_license, b.logo_license_url, b.logo_source_url) : null,
    image: b ? credit(b.image_url, b.image_thumb_url, b.image_author, b.image_license, b.image_license_url, b.image_source_url) : null,
  };
}

export interface LocalSuggestion {
  placeId: string;
  text: string;
  secondaryText: string | null;
}

/** Duplicate guard for community additions: same-ish name within this distance is treated as the same place. */
export const DUPLICATE_RADIUS_METERS = 75;

/** Escapes LIKE wildcards in user input (default escape character is backslash). */
const escapeLike = (v: string) => v.replace(/[\\%_]/g, (m) => `\\${m}`);

const point = (c: LatLng) => `ST_SetSRID(ST_MakePoint(${Number(c.lng)}, ${Number(c.lat)}), 4326)::geography`;

/**
 * Places stored in MAM!: OpenStreetMap imports (ODbL) and community additions. Unlike Google content these may be
 * stored, searched and shown without a live provider call, so discovery works with no Google API key at all.
 */
@Injectable()
export class LocalPlacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: CommunityStatsService,
  ) {}

  private select(center: LatLng | null) {
    return `
      SELECT r.id, r.name, r.source::text AS source, r.address, r.phone, r.website, r.opening_hours, r.cuisine, r.place_kind,
             r.city, r.province, ST_Y(r.location::geometry) AS lat, ST_X(r.location::geometry) AS lng,
             ${center ? `ST_Distance(r.location, ${point(center)})` : 'NULL::float8'} AS distance,
             (SELECT e.external_place_id FROM external_place_refs e WHERE e.restaurant_id = r.id AND e.provider = 'OSM' LIMIT 1) AS osm_id,
             (SELECT array_agg(c.slug ORDER BY c.sort_order) FROM restaurant_categories rc JOIN categories c ON c.id = rc.category_id
               WHERE rc.restaurant_id = r.id) AS cats,
             r.brand, r.brand_wikidata,
             (SELECT row_to_json(b) FROM (SELECT name, description, website, logo_url, logo_thumb_url, logo_license, logo_license_url, logo_author,
                     logo_source_url, image_url, image_thumb_url, image_license, image_license_url, image_author, image_source_url
                FROM brands WHERE wikidata = r.brand_wikidata) b) AS brand_info
        FROM restaurants r`;
  }

  private readonly visible = `r.source <> 'GOOGLE' AND r.status = 'ACTIVE' AND r.deleted_at IS NULL AND r.location IS NOT NULL`;

  /**
   * OSM + community places within the radius (PostGIS geography distance), nearest first, plus the total count.
   * With `reviewedFirst` (rating / most-reviewed sorts) places that have published MAM! reviews come first, so a
   * limited page never hides the rated places that those sorts are about.
   */
  async nearby(
    center: LatLng,
    radiusMeters: number,
    opts: { categories?: CategorySlug[]; limit?: number; reviewedFirst?: boolean } = {},
  ): Promise<{ items: PlaceSummary[]; total: number }> {
    const limit = Math.min(1000, Math.max(1, opts.limit ?? 100));
    const params: unknown[] = [radiusMeters, limit];
    let catFilter = '';
    if (opts.categories?.length) {
      params.push(opts.categories);
      catFilter = `AND EXISTS (SELECT 1 FROM restaurant_categories rc JOIN categories c ON c.id = rc.category_id
                                WHERE rc.restaurant_id = r.id AND c.slug = ANY($3::text[]))`;
    }
    const where = `WHERE ${this.visible} AND ST_DWithin(r.location, ${point(center)}, $1::float8) ${catFilter}`;
    const reviewed = `EXISTS (SELECT 1 FROM reviews rv WHERE rv.restaurant_id = r.id AND rv.status = 'PUBLISHED')`;
    const [rows, count] = await Promise.all([
      this.prisma.$queryRawUnsafe<LocalRow[]>(
        `${this.select(center)} ${where}
          ORDER BY ${opts.reviewedFirst ? `${reviewed} DESC,` : ''} r.location <-> ${point(center)}
          LIMIT $2::int`,
        ...params,
      ),
      this.prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM restaurants r ${where} AND $2::int > 0`, ...params),
    ]);
    return { items: await this.toSummaries(rows), total: Number(count[0]?.n ?? 0) };
  }

  /** Fuzzy name search (pg_trgm), biased to the user's area when a centre is given. */
  async search(q: string, center: LatLng | null, radiusMeters: number, limit = 40): Promise<PlaceSummary[]> {
    const term = escapeLike(q.trim().toLowerCase());
    const rows = await this.prisma.$queryRawUnsafe<LocalRow[]>(
      `${this.select(center)}
        WHERE ${this.visible} AND lower(r.name) LIKE '%' || $1 || '%'
          ${center ? `AND ST_DWithin(r.location, ${point(center)}, GREATEST($2::float8, 20000))` : ''}
        ORDER BY ${center ? `r.location <-> ${point(center)}` : 'similarity(lower(r.name), $1) DESC'}
        LIMIT $3::int`,
      term,
      radiusMeters,
      limit,
    );
    return this.toSummaries(rows);
  }

  async suggestFood(input: string, center: LatLng | null): Promise<LocalSuggestion[]> {
    const items = await this.search(input, center, 20000, 8);
    return items.map((p) => ({ placeId: p.placeId, text: p.name, secondaryText: [p.address, p.local?.city].filter(Boolean).join(' · ') || null }));
  }

  /** Cities, towns, suburbs and villages for manual location search (no Google needed). */
  async suggestLocalities(input: string, center: LatLng | null): Promise<LocalSuggestion[]> {
    const term = escapeLike(input.trim().toLowerCase());
    if (term.length < 2) return [];
    const rows = await this.prisma.$queryRawUnsafe<{ id: string; name: string; kind: string; context: string | null }[]>(
      `SELECT id, name, kind, context FROM localities
        WHERE lower(name) LIKE $1 || '%' OR (length($1) >= 4 AND lower(name) LIKE '%' || $1 || '%')
        ORDER BY CASE kind WHEN 'city' THEN 0 WHEN 'town' THEN 1 WHEN 'suburb' THEN 2 ELSE 3 END,
                 (lower(name) = $1) DESC,
                 ${center ? `location <-> ${point(center)},` : ''} COALESCE(population, 0) DESC
        LIMIT 8`,
      term,
    );
    const kindLabel: Record<string, string> = { city: 'Kota', town: 'Kota kecil', suburb: 'Kelurahan/kawasan', village: 'Desa' };
    return rows.map((r) => ({ placeId: `${LOCALITY_PREFIX}${r.id}`, text: r.name, secondaryText: [kindLabel[r.kind] ?? r.kind, r.context].filter(Boolean).join(' · ') }));
  }

  async localityLocation(id: string): Promise<{ location: LatLng; label: string }> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundException('Lokasi tidak ditemukan.');
    const rows = await this.prisma.$queryRaw<{ name: string; context: string | null; lat: number; lng: number }[]>`
      SELECT name, context, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM localities WHERE id = ${id}::uuid`;
    const r = rows[0];
    if (!r) throw new NotFoundException('Lokasi tidak ditemukan.');
    return { location: { lat: r.lat, lng: r.lng }, label: [r.name, r.context].filter(Boolean).join(', ') };
  }

  async detail(restaurantId: string, center: LatLng | null): Promise<PlaceDetail> {
    if (!/^[0-9a-f-]{36}$/i.test(restaurantId)) throw new NotFoundException('Tempat tidak ditemukan.');
    const rows = await this.prisma.$queryRawUnsafe<LocalRow[]>(`${this.select(center)} WHERE ${this.visible} AND r.id = $1::uuid`, restaurantId);
    if (!rows[0]) throw new NotFoundException('Tempat tidak ditemukan.');
    const [summary] = await this.toSummaries(rows);
    const r = rows[0];
    return {
      ...summary,
      phone: r.phone,
      website: r.website,
      openingHours: r.opening_hours ? r.opening_hours.split(/;\s*/).filter(Boolean) : null,
      photos: [],
      businessStatus: null,
    };
  }

  /**
   * A user submits a place that is missing from OpenStreetMap/Google. Regular users' submissions wait for a moderator
   * (status PENDING, not shown in discovery); staff submissions are published directly. Near-duplicates (same-ish name
   * within 75 m, including other pending submissions) are rejected with 409.
   */
  async submit(input: CreatePlaceInput, user: { id: string; role: string }): Promise<PlaceSubmissionView> {
    const center = { lat: input.lat, lng: input.lng };
    const dup = await this.prisma.$queryRawUnsafe<{ id: string; name: string; status: string }[]>(
      `SELECT r.id, r.name, r.status::text AS status FROM restaurants r
        WHERE r.status IN ('ACTIVE', 'PENDING') AND r.deleted_at IS NULL AND r.name IS NOT NULL
          AND ST_DWithin(r.location, ${point(center)}, ${DUPLICATE_RADIUS_METERS})
          AND (lower(r.name) = lower($1) OR similarity(lower(r.name), lower($1)) > 0.55)
        LIMIT 1`,
      input.name,
    );
    if (dup[0]) {
      throw new ConflictException({
        message:
          dup[0].status === 'PENDING'
            ? `Tempat serupa ("${dup[0].name}") sudah diajukan dan sedang menunggu persetujuan moderator.`
            : `Tempat serupa sudah ada di dekat titik ini: "${dup[0].name}".`,
        details: { placeId: dup[0].status === 'ACTIVE' ? localPlaceKey(dup[0].id) : null, restaurantId: dup[0].id, status: dup[0].status },
      });
    }
    const staff = user.role !== 'USER';
    const id = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO restaurants (id, status, name, name_source, source, location, address, phone, website, opening_hours, city,
                                  created_by, reviewed_by, reviewed_at, source_updated_at, created_at, updated_at)
         VALUES (gen_random_uuid(), $8::"RestaurantStatus", $1, 'COMMUNITY', 'COMMUNITY', ${point(center)}, $2, $3, $4, $5, $6, $7::uuid,
                 CASE WHEN $9 THEN $7::uuid END, CASE WHEN $9 THEN now() END, now(), now(), now())
         RETURNING id`,
        input.name,
        input.address ?? null,
        input.phone ?? null,
        input.website ?? null,
        input.openingHours ?? null,
        input.city ?? null,
        user.id,
        staff ? 'ACTIVE' : 'PENDING',
        staff,
      );
      const rid = rows[0].id;
      await tx.$executeRawUnsafe(
        `INSERT INTO restaurant_categories (restaurant_id, category_id, source, created_at)
         SELECT $1::uuid, c.id, 'COMMUNITY', now() FROM categories c WHERE c.slug = ANY($2::text[]) ON CONFLICT DO NOTHING`,
        rid,
        input.categories,
      );
      if (!input.city) {
        await tx.$executeRawUnsafe(
          `UPDATE restaurants r SET city = (SELECT l.name FROM localities l WHERE l.kind IN ('city','town')
                    AND ST_DWithin(l.location, r.location, 25000) ORDER BY l.location <-> r.location LIMIT 1)
            WHERE r.id = $1::uuid`,
          rid,
        );
      }
      return rid;
    });
    return (await this.submissions({ ids: [id] }))[0];
  }

  /** Submission views (community places) — by ids, by submitter, or by status for moderators. */
  async submissions(f: { ids?: string[]; userId?: string; status?: string; page?: number; pageSize?: number; withSubmitter?: boolean }): Promise<PlaceSubmissionView[]> {
    const where: string[] = [`r.source = 'COMMUNITY'`, 'r.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (f.ids) where.push(`r.id = ANY($${params.push(f.ids)}::uuid[])`);
    if (f.userId) where.push(`r.created_by = $${params.push(f.userId)}::uuid`);
    if (f.status) where.push(`r.status = $${params.push(f.status)}::"RestaurantStatus"`);
    const pageSize = Math.min(100, Math.max(1, f.pageSize ?? 50));
    const offset = (Math.max(1, f.page ?? 1) - 1) * pageSize;
    const rows = await this.prisma.$queryRawUnsafe<
      {
        id: string; name: string; address: string | null; city: string | null; phone: string | null; website: string | null;
        opening_hours: string | null; status: string; moderation_note: string | null; created_at: Date; reviewed_at: Date | null;
        lat: number; lng: number; cats: string[] | null; created_by: string | null; email: string | null; display_name: string | null; username: string | null;
      }[]
    >(
      `SELECT r.id, r.name, r.address, r.city, r.phone, r.website, r.opening_hours, r.status::text AS status, r.moderation_note, r.created_at, r.reviewed_at,
              ST_Y(r.location::geometry) AS lat, ST_X(r.location::geometry) AS lng, r.created_by, u.email::text AS email, p.display_name, p.username,
              (SELECT array_agg(c.slug ORDER BY c.sort_order) FROM restaurant_categories rc JOIN categories c ON c.id = rc.category_id WHERE rc.restaurant_id = r.id) AS cats
         FROM restaurants r LEFT JOIN users u ON u.id = r.created_by LEFT JOIN user_profiles p ON p.user_id = r.created_by
        WHERE ${where.join(' AND ')}
        ORDER BY r.created_at ${f.status === 'PENDING' ? 'ASC' : 'DESC'}
        LIMIT ${pageSize} OFFSET ${offset}`,
      ...params,
    );
    const nearby = new Map<string, NonNullable<PlaceSubmissionView['nearby']>>();
    if (f.withSubmitter && rows.length) {
      const near = await this.prisma.$queryRawUnsafe<{ sid: string; id: string; name: string; source: PlaceSource; d: number }[]>(
        `SELECT s.id AS sid, o.id, o.name, o.source::text AS source, ST_Distance(o.location, s.location) AS d
           FROM restaurants s JOIN restaurants o ON o.id <> s.id AND o.status IN ('ACTIVE','PENDING') AND o.deleted_at IS NULL
                AND o.name IS NOT NULL AND ST_DWithin(o.location, s.location, 150)
          WHERE s.id = ANY($1::uuid[]) ORDER BY d`,
        rows.map((r) => r.id),
      );
      for (const n of near) {
        const list = nearby.get(n.sid) ?? [];
        if (list.length < 5) list.push({ placeId: localPlaceKey(n.id), name: n.name, distanceMeters: Math.round(n.d), source: n.source });
        nearby.set(n.sid, list);
      }
    }
    return rows.map((r) => ({
      id: r.id,
      placeId: localPlaceKey(r.id),
      name: r.name,
      address: r.address,
      city: r.city,
      location: { lat: r.lat, lng: r.lng },
      categories: (r.cats ?? []) as CategorySlug[],
      phone: r.phone,
      website: r.website,
      openingHours: r.opening_hours,
      status: r.status as PlaceSubmissionView['status'],
      moderationNote: r.moderation_note,
      createdAt: r.created_at.toISOString(),
      reviewedAt: r.reviewed_at?.toISOString() ?? null,
      ...(f.withSubmitter
        ? {
            submittedBy: r.created_by ? { userId: r.created_by, displayName: r.display_name ?? '', username: r.username ?? '', email: r.email ?? '' } : null,
            nearby: nearby.get(r.id) ?? [],
          }
        : {}),
    }));
  }

  async countSubmissions(status: string): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM restaurants WHERE source = 'COMMUNITY' AND deleted_at IS NULL AND status = ${status}::"RestaurantStatus"`;
    return Number(row.n);
  }

  async counts(): Promise<{ osm: number; community: number; localities: number; lastImportAt: string | null }> {
    const [row] = await this.prisma.$queryRaw<{ osm: bigint; community: bigint; localities: bigint }[]>`
      SELECT (SELECT count(*) FROM restaurants WHERE source = 'OSM' AND deleted_at IS NULL) AS osm,
             (SELECT count(*) FROM restaurants WHERE source = 'COMMUNITY' AND deleted_at IS NULL) AS community,
             (SELECT count(*) FROM localities) AS localities`;
    const last = await this.prisma.dataImport.findFirst({ where: { provider: 'OSM', finishedAt: { not: null } }, orderBy: { finishedAt: 'desc' } });
    return { osm: Number(row.osm), community: Number(row.community), localities: Number(row.localities), lastImportAt: last?.finishedAt?.toISOString() ?? null };
  }

  private async toSummaries(rows: LocalRow[]): Promise<PlaceSummary[]> {
    if (!rows.length) return [];
    const statsMap = await this.stats.forMany(rows.map((r) => r.id));
    return rows.map((r) => {
      const s = statsMap.get(r.id);
      const local: LocalPlaceInfo = {
        brand: brandOf(r),
        kind: r.place_kind,
        cuisine: r.cuisine ? r.cuisine.split(';').filter(Boolean) : [],
        city: r.city,
        province: r.province,
        osmUrl: r.osm_id ? osmUrl(r.osm_id) : null,
        attribution: r.source === 'OSM' ? OSM_ATTRIBUTION : null,
      };
      return {
        placeId: localPlaceKey(r.id),
        source: r.source,
        local,
        restaurantId: r.id,
        name: r.name,
        address: r.address,
        location: { lat: r.lat, lng: r.lng },
        distanceMeters: r.distance === null ? null : Math.round(r.distance),
        primaryType: r.place_kind,
        categories: (r.cats ?? []) as CategorySlug[],
        openNow: null, // OSM opening_hours is not evaluated; we never guess open status.
        photo: null,
        google: {
          rating: null,
          userRatingCount: null,
          priceLevel: null,
          priceRange: null,
          // Plain navigation link (no Google content is fetched or stored).
          mapsUri: `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`,
        },
        community: s && s.reviewCount > 0 ? { reviewCount: s.reviewCount, averageOverall: s.averageOverall, medianPricePaid: s.medianPricePaid, lastReviewedAt: s.lastReviewedAt } : null,
      };
    });
  }
}
