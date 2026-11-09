import { localPlaceKey } from '@mam/shared-types';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type ReactionType, type Review, type ReviewStatus } from '@prisma/client';
import { ROLE_RANK, type Paginated, type ReviewView } from '@mam/shared-types';
import type { CreateReviewInput, UpdateReviewInput } from '@mam/validation';
import { AppConfigService } from '../../common/app-config.service';
import type { AuthUser } from '../../common/auth.decorators';
import { paginate, skipTake } from '../../common/pagination';
import { PrismaService, isUniqueViolation } from '../../common/prisma.service';
import { BadgesService } from '../community/badges.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CommunityStatsService } from '../restaurants/community-stats.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { UploadsService } from '../uploads/uploads.service';
import { StorageService } from '../uploads/storage.service';
import {
  AUTO_HIDE_REPORT_THRESHOLD,
  computeOverall,
  computeQualityScore,
  initialStatus,
  spamSignals,
  statusAfterAuthorEdit,
} from './review-rules';

const reviewInclude = {
  user: { select: { id: true, profile: { select: { username: true, displayName: true, avatarUrl: true } } } },
  photos: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' as const } },
  restaurant: { select: { id: true, name: true, nameSource: true, source: true, externalRefs: { where: { provider: 'GOOGLE' as const }, select: { externalPlaceId: true } } } },
} satisfies Prisma.ReviewInclude;
type ReviewRow = Prisma.ReviewGetPayload<{ include: typeof reviewInclude }>;

export class TooManyRequests extends HttpException {
  constructor(message: string) {
    super({ message, error: 'Too Many Requests' }, HttpStatus.TOO_MANY_REQUESTS);
  }
}

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
    private readonly stats: CommunityStatsService,
    private readonly config: AppConfigService,
    private readonly uploads: UploadsService,
    private readonly storage: StorageService,
    private readonly badges: BadgesService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────────────────── Views ─────────────────────────
  async toViews(rows: ReviewRow[], viewerId?: string, opts: { liveNames?: boolean } = { liveNames: true }): Promise<ReviewView[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [counts, mine] = await Promise.all([
      this.prisma.reviewReaction.groupBy({ by: ['reviewId', 'type'], where: { reviewId: { in: ids } }, _count: { _all: true } }),
      viewerId ? this.prisma.reviewReaction.findMany({ where: { reviewId: { in: ids }, userId: viewerId }, select: { reviewId: true, type: true } }) : Promise.resolve([]),
    ]);
    const restaurantRows = [...new Map(rows.map((r) => [r.restaurant.id, { id: r.restaurant.id, name: r.restaurant.name, nameSource: r.restaurant.nameSource, googlePlaceId: r.restaurant.externalRefs[0]?.externalPlaceId ?? null }])).values()];
    const names = opts.liveNames
      ? await this.restaurants.displayNames(restaurantRows)
      : new Map(restaurantRows.map((r) => [r.id, { name: r.name, source: 'COMMUNITY' as const }]));

    return rows.map((r) => {
      const reactions = { HELPFUL: 0, YUMMY: 0, FUNNY: 0 } as Record<ReactionType, number>;
      counts.filter((c) => c.reviewId === r.id).forEach((c) => (reactions[c.type] = c._count._all));
      return {
        id: r.id,
        restaurantId: r.restaurantId,
        restaurantName: names.get(r.restaurantId)?.name ?? null,
        googlePlaceId: r.restaurant.externalRefs[0]?.externalPlaceId ?? null,
        placeKey: r.restaurant.source === 'GOOGLE' ? (r.restaurant.externalRefs[0]?.externalPlaceId ?? null) : localPlaceKey(r.restaurant.id),
        author: {
          userId: r.user.id,
          username: r.user.profile?.username ?? 'pengguna',
          displayName: r.user.profile?.displayName ?? 'Pengguna',
          avatarUrl: r.user.profile?.avatarUrl ?? null,
        },
        ratings: {
          taste: r.tasteRating,
          price: r.priceRating,
          portion: r.portionRating,
          cleanliness: r.cleanlinessRating,
          service: r.serviceRating,
          overall: Number(r.overallRating),
        },
        text: r.reviewText,
        pricePaid: r.pricePaid,
        currency: r.currency,
        visitType: r.visitType,
        visitedAt: r.visitedAt ? r.visitedAt.toISOString().slice(0, 10) : null,
        status: r.status,
        photos: r.photos.map((p) => this.uploads.toView(p)),
        reactions,
        myReactions: mine.filter((m) => m.reviewId === r.id).map((m) => m.type),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        edited: r.editCount > 0,
      };
    });
  }

  private async loadRow(id: string): Promise<ReviewRow> {
    const r = await this.prisma.review.findUnique({ where: { id }, include: reviewInclude });
    if (!r) throw new NotFoundException('Ulasan tidak ditemukan.');
    return r;
  }

  private canSee(r: { status: ReviewStatus; userId: string }, viewer?: AuthUser): boolean {
    if (r.status === 'PUBLISHED') return true;
    if (!viewer) return false;
    if (ROLE_RANK[viewer.role] >= ROLE_RANK.MODERATOR) return true;
    return r.userId === viewer.id && r.status !== 'DELETED';
  }

  async get(id: string, viewer?: AuthUser): Promise<ReviewView> {
    const r = await this.loadRow(id);
    if (!this.canSee(r, viewer)) throw new NotFoundException('Ulasan tidak ditemukan.');
    return (await this.toViews([r], viewer?.id))[0];
  }

  // ───────────────────────── Create / edit / delete ─────────────────────────
  async create(user: AuthUser, input: CreateReviewInput): Promise<ReviewView> {
    const cfg = await this.config.get();
    if (input.text.trim().length < cfg.reviewMinTextLength) {
      throw new BadRequestException(`Ulasan minimal ${cfg.reviewMinTextLength} karakter.`);
    }
    const since = new Date(Date.now() - 24 * 3600_000);
    const today = await this.prisma.review.count({ where: { userId: user.id, createdAt: { gte: since } } });
    if (today >= cfg.maxReviewsPerDay) throw new TooManyRequests(`Batas ${cfg.maxReviewsPerDay} ulasan per hari tercapai. Coba lagi besok.`);

    const restaurantId = input.restaurantId
      ? await this.restaurants.canonicalId(input.restaurantId)
      : await this.restaurants.resolveGooglePlace(input.googlePlaceId!, user.id);

    const existing = await this.prisma.review.findUnique({ where: { userId_restaurantId: { userId: user.id, restaurantId } } });
    if (existing && existing.status !== 'DELETED') {
      throw new ConflictException({
        message: 'Kamu sudah pernah mengulas tempat ini. Silakan edit ulasanmu yang ada.',
        details: { existingReviewId: existing.id },
      });
    }
    if (existing?.moderationLocked) {
      throw new ForbiddenException('Ulasanmu untuk tempat ini dihapus oleh moderator dan tidak dapat dibuat ulang.');
    }

    const signals = await this.collectSignals(user.id, restaurantId, input.text, existing?.id);
    const status = initialStatus(cfg.reviewsRequireApproval, signals);
    const photoIds = await this.validatePhotoIds(user.id, input.photoIds ?? [], existing?.id ?? null);
    const data = {
      tasteRating: input.ratings.taste,
      priceRating: input.ratings.price,
      portionRating: input.ratings.portion,
      cleanlinessRating: input.ratings.cleanliness,
      serviceRating: input.ratings.service,
      overallRating: new Prisma.Decimal(computeOverall(input.ratings)),
      reviewText: input.text.trim(),
      pricePaid: input.pricePaid ?? null,
      currency: 'IDR',
      visitType: input.visitType,
      visitedAt: input.visitedAt ?? null,
      status,
      qualityScore: new Prisma.Decimal(computeQualityScore({ text: input.text, photoCount: photoIds.length, pricePaid: input.pricePaid, visitedAt: input.visitedAt, ratings: input.ratings })),
    };

    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        let review: Review;
        if (existing) {
          // Re-creating after the author deleted it: revive the SAME row (unique (user_id, restaurant_id)).
          await tx.reviewRevision.create({ data: { reviewId: existing.id, snapshot: this.snapshot(existing), reason: 'RECREATE_AFTER_DELETE' } });
          const claimed = await tx.review.updateMany({ where: { id: existing.id, status: 'DELETED' }, data: { ...data, deletedAt: null, editCount: 0, createdAt: new Date() } });
          if (claimed.count === 0) throw new ConflictException('Ulasan sedang diperbarui. Coba lagi.');
          review = await tx.review.findUniqueOrThrow({ where: { id: existing.id } });
        } else {
          review = await tx.review.create({ data: { ...data, userId: user.id, restaurantId } });
        }
        if (photoIds.length) await tx.reviewPhoto.updateMany({ where: { id: { in: photoIds } }, data: { reviewId: review.id } });
        if (signals.length) {
          await tx.moderationAction.create({
            data: { reviewId: review.id, moderatorId: null, action: 'HIDE', reason: `Ditahan otomatis untuk ditinjau: ${signals.join(', ')}`, previousStatus: 'PENDING', newStatus: 'PENDING' },
          });
        }
        return review.id;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Kamu sudah pernah mengulas tempat ini. Silakan edit ulasanmu yang ada.');
      throw e;
    }
    await this.afterChange(restaurantId, user.id);
    return this.get(id, user);
  }

  async update(user: AuthUser, id: string, input: UpdateReviewInput): Promise<ReviewView> {
    const existing = await this.prisma.review.findUnique({ where: { id } });
    if (!existing || existing.status === 'DELETED') throw new NotFoundException('Ulasan tidak ditemukan.');
    if (existing.userId !== user.id) throw new ForbiddenException('Kamu hanya dapat mengedit ulasanmu sendiri.');
    const cfg = await this.config.get();
    if (input.text !== undefined && input.text.trim().length < cfg.reviewMinTextLength) {
      throw new BadRequestException(`Ulasan minimal ${cfg.reviewMinTextLength} karakter.`);
    }
    const ratings = input.ratings ?? {
      taste: existing.tasteRating,
      price: existing.priceRating,
      portion: existing.portionRating,
      cleanliness: existing.cleanlinessRating,
      service: existing.serviceRating,
    };
    const text = input.text?.trim() ?? existing.reviewText;
    const signals = input.text ? await this.collectSignals(user.id, existing.restaurantId, text, existing.id) : [];
    const status = statusAfterAuthorEdit(existing.status, cfg.reviewsRequireApproval, signals);
    const photoIds = input.photoIds ? await this.validatePhotoIds(user.id, input.photoIds, existing.id) : null;
    const photoCount = photoIds ? photoIds.length : await this.prisma.reviewPhoto.count({ where: { reviewId: id, deletedAt: null } });
    const pricePaid = input.pricePaid !== undefined ? input.pricePaid : existing.pricePaid;
    const visitedAt = input.visitedAt !== undefined ? input.visitedAt : existing.visitedAt;

    const removedPhotos: { storageKey: string; thumbKey: string }[] = [];
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.reviewRevision.create({ data: { reviewId: id, snapshot: this.snapshot(existing), reason: 'AUTHOR_EDIT' } });
      // Same record is updated — never a duplicate.
      await tx.review.update({
        where: { id },
        data: {
          tasteRating: ratings.taste,
          priceRating: ratings.price,
          portionRating: ratings.portion,
          cleanlinessRating: ratings.cleanliness,
          serviceRating: ratings.service,
          overallRating: new Prisma.Decimal(computeOverall(ratings)),
          reviewText: text,
          pricePaid,
          visitType: input.visitType ?? existing.visitType,
          visitedAt,
          status,
          editCount: { increment: 1 },
          qualityScore: new Prisma.Decimal(computeQualityScore({ text, photoCount, pricePaid, visitedAt, ratings })),
        },
      });
      if (photoIds) {
        const detached = await tx.reviewPhoto.findMany({ where: { reviewId: id, deletedAt: null, id: { notIn: photoIds } } });
        removedPhotos.push(...detached);
        await tx.reviewPhoto.updateMany({ where: { id: { in: detached.map((d) => d.id) } }, data: { deletedAt: new Date() } });
        if (photoIds.length) await tx.reviewPhoto.updateMany({ where: { id: { in: photoIds } }, data: { reviewId: id } });
      }
      if (status === 'PENDING' && existing.status !== 'PENDING') {
        await tx.moderationAction.create({
          data: { reviewId: id, moderatorId: null, action: 'HIDE', reason: signals.length ? `Ditahan otomatis: ${signals.join(', ')}` : 'Diedit setelah dimoderasi — menunggu peninjauan ulang', previousStatus: existing.status, newStatus: 'PENDING' },
        });
      }
    });
    for (const p of removedPhotos) {
      await this.storage.remove(p.storageKey).catch(() => undefined);
      await this.storage.remove(p.thumbKey).catch(() => undefined);
    }
    await this.afterChange(existing.restaurantId, user.id);
    return this.get(id, user);
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const existing = await this.prisma.review.findUnique({ where: { id } });
    if (!existing || existing.status === 'DELETED') throw new NotFoundException('Ulasan tidak ditemukan.');
    if (existing.userId !== user.id) throw new ForbiddenException('Kamu hanya dapat menghapus ulasanmu sendiri.');
    const photos = await this.prisma.reviewPhoto.findMany({ where: { reviewId: id, deletedAt: null } });
    await this.prisma.$transaction([
      this.prisma.reviewRevision.create({ data: { reviewId: id, snapshot: this.snapshot(existing), reason: 'AUTHOR_DELETE' } }),
      // Soft delete keeps the row (and its unique key) for auditability; re-creating revives this row.
      this.prisma.review.update({ where: { id }, data: { status: 'DELETED', deletedAt: new Date() } }),
      this.prisma.reviewPhoto.updateMany({ where: { reviewId: id }, data: { deletedAt: new Date() } }),
    ]);
    for (const p of photos) {
      await this.storage.remove(p.storageKey).catch(() => undefined);
      await this.storage.remove(p.thumbKey).catch(() => undefined);
    }
    await this.afterChange(existing.restaurantId, user.id);
  }

  private snapshot(r: Review): Prisma.InputJsonValue {
    return {
      status: r.status,
      ratings: [r.tasteRating, r.priceRating, r.portionRating, r.cleanlinessRating, r.serviceRating],
      overall: r.overallRating.toString(),
      text: r.reviewText,
      pricePaid: r.pricePaid,
      visitType: r.visitType,
      visitedAt: r.visitedAt?.toISOString() ?? null,
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  private async afterChange(restaurantId: string, userId: string) {
    await this.stats.invalidate(restaurantId);
    await this.badges.evaluate(userId).catch(() => undefined);
  }

  private async validatePhotoIds(userId: string, ids: string[], reviewId: string | null): Promise<string[]> {
    if (!ids.length) return [];
    const unique = [...new Set(ids)];
    const photos = await this.prisma.reviewPhoto.findMany({ where: { id: { in: unique }, userId, deletedAt: null } });
    if (photos.length !== unique.length) throw new BadRequestException('Beberapa foto tidak ditemukan atau bukan milikmu.');
    if (photos.some((p) => p.reviewId && p.reviewId !== reviewId)) throw new BadRequestException('Foto sudah dipakai di ulasan lain.');
    return unique;
  }

  private async collectSignals(userId: string, restaurantId: string, text: string, excludeReviewId?: string): Promise<string[]> {
    const [duplicate, burst] = await Promise.all([
      this.prisma.review.count({ where: { userId, reviewText: text.trim(), id: excludeReviewId ? { not: excludeReviewId } : undefined, status: { not: 'DELETED' } } }),
      // Many reviews from very new accounts on one restaurant in 24h suggests rating manipulation.
      this.prisma.review.count({
        where: { restaurantId, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) }, user: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600_000) } } },
      }),
    ]);
    return spamSignals({
      text,
      duplicateOfOwnText: duplicate > 0,
      restaurantBurst: burst >= 5,
    });
  }

  // ───────────────────────── Listing ─────────────────────────
  async listForRestaurant(restaurantId: string, sort: 'recent' | 'helpful' | 'highest' | 'lowest', page: number, pageSize: number, viewer?: AuthUser): Promise<Paginated<ReviewView>> {
    const id = await this.restaurants.canonicalId(restaurantId);
    const where = { restaurantId: id, status: 'PUBLISHED' as const };
    const orderBy: Prisma.ReviewOrderByWithRelationInput[] =
      sort === 'helpful'
        ? [{ reactions: { _count: 'desc' } }, { createdAt: 'desc' }]
        : sort === 'highest'
          ? [{ overallRating: 'desc' }, { createdAt: 'desc' }]
          : sort === 'lowest'
            ? [{ overallRating: 'asc' }, { createdAt: 'desc' }]
            : [{ createdAt: 'desc' }];
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({ where, include: reviewInclude, orderBy, ...skipTake(page, pageSize) }),
      this.prisma.review.count({ where }),
    ]);
    return paginate(await this.toViews(rows, viewer?.id), total, page, pageSize);
  }

  async listByUser(userId: string, page: number, pageSize: number, viewerId?: string): Promise<Paginated<ReviewView>> {
    const own = viewerId === userId;
    const where: Prisma.ReviewWhereInput = own ? { userId, status: { not: 'DELETED' } } : { userId, status: 'PUBLISHED' };
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({ where, include: reviewInclude, orderBy: { createdAt: 'desc' }, ...skipTake(page, pageSize) }),
      this.prisma.review.count({ where }),
    ]);
    return paginate(await this.toViews(rows, viewerId), total, page, pageSize);
  }

  async feed(q: { scope: 'latest' | 'nearby'; lat?: number; lng?: number; radius: number; page: number; pageSize: number }, viewer?: AuthUser): Promise<Paginated<ReviewView>> {
    let where: Prisma.ReviewWhereInput = { status: 'PUBLISHED' };
    if (q.scope === 'nearby') {
      if (q.lat === undefined || q.lng === undefined) throw new BadRequestException('lat dan lng wajib untuk feed sekitar.');
      const near = await this.restaurants.nearbyCommunity({ lat: q.lat, lng: q.lng }, q.radius, 500);
      where = { ...where, restaurantId: { in: near.map((n) => n.id) } };
    }
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({ where, include: reviewInclude, orderBy: { createdAt: 'desc' }, ...skipTake(q.page, q.pageSize) }),
      this.prisma.review.count({ where }),
    ]);
    return paginate(await this.toViews(rows, viewer?.id), total, q.page, q.pageSize);
  }

  async myReviewFor(userId: string, restaurantId: string): Promise<ReviewView | null> {
    const id = await this.restaurants.canonicalId(restaurantId);
    const r = await this.prisma.review.findFirst({ where: { userId, restaurantId: id, status: { not: 'DELETED' } }, include: reviewInclude });
    return r ? (await this.toViews([r], userId, { liveNames: false }))[0] : null;
  }

  // ───────────────────────── Reactions & reports ─────────────────────────
  private async reactionSummary(reviewId: string, userId: string) {
    const [counts, mine] = await Promise.all([
      this.prisma.reviewReaction.groupBy({ by: ['type'], where: { reviewId }, _count: { _all: true } }),
      this.prisma.reviewReaction.findMany({ where: { reviewId, userId }, select: { type: true } }),
    ]);
    const out = { HELPFUL: 0, YUMMY: 0, FUNNY: 0 } as Record<ReactionType, number>;
    counts.forEach((c) => (out[c.type] = c._count._all));
    return { ...out, mine: mine.map((m) => m.type) };
  }

  async react(user: AuthUser, reviewId: string, type: ReactionType) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId }, select: { userId: true, status: true } });
    if (!review || review.status !== 'PUBLISHED') throw new NotFoundException('Ulasan tidak ditemukan.');
    if (review.userId === user.id) throw new BadRequestException('Kamu tidak dapat memberi reaksi pada ulasanmu sendiri.');
    try {
      await this.prisma.reviewReaction.create({ data: { reviewId, userId: user.id, type } });
      const labels: Record<ReactionType, string> = { HELPFUL: 'membantu', YUMMY: 'bikin lapar', FUNNY: 'lucu' };
      await this.notifications.notify(review.userId, 'REVIEW_REACTION', 'Ulasanmu dapat reaksi!', `Seseorang menandai ulasanmu ${labels[type]}.`, `/ulasan/${reviewId}`);
      await this.badges.evaluate(review.userId).catch(() => undefined);
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // idempotent
    }
    return this.reactionSummary(reviewId, user.id);
  }

  async unreact(user: AuthUser, reviewId: string, type: ReactionType) {
    await this.prisma.reviewReaction.deleteMany({ where: { reviewId, userId: user.id, type } });
    return this.reactionSummary(reviewId, user.id);
  }

  async report(user: AuthUser, reviewId: string, reason: Prisma.ReviewReportCreateInput['reason'], details?: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId }, select: { userId: true, status: true, restaurantId: true } });
    if (!review || review.status === 'DELETED') throw new NotFoundException('Ulasan tidak ditemukan.');
    if (review.userId === user.id) throw new BadRequestException('Kamu tidak dapat melaporkan ulasanmu sendiri.');
    try {
      const report = await this.prisma.reviewReport.create({ data: { reviewId, reporterId: user.id, reason, details: details || null } });
      const open = await this.prisma.reviewReport.count({ where: { reviewId, status: 'OPEN' } });
      if (open >= AUTO_HIDE_REPORT_THRESHOLD && review.status === 'PUBLISHED') {
        await this.prisma.$transaction([
          this.prisma.review.update({ where: { id: reviewId }, data: { status: 'HIDDEN' } }),
          this.prisma.moderationAction.create({
            data: { reviewId, moderatorId: null, action: 'HIDE', reason: `Disembunyikan otomatis: ${open} laporan terbuka, menunggu peninjauan moderator.`, previousStatus: 'PUBLISHED', newStatus: 'HIDDEN' },
          }),
        ]);
        await this.stats.invalidate(review.restaurantId);
      }
      return { id: report.id };
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Kamu sudah melaporkan ulasan ini.');
      throw e;
    }
  }
}
