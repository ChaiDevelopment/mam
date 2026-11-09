import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ModerationActionType, Prisma, Role } from '@prisma/client';
import type {
  AdminOverview,
  AdminReportRow,
  AdminUserRow,
  AuditLogView,
  CategorySlug,
  IntegrationHealth,
  Paginated,
  ReviewView,
} from '@mam/shared-types';
import type { z } from 'zod';
import type {
  adminConfigSchema,
  adminMergeRestaurantSchema,
  adminPlatformLinkSchema,
  adminResolveReportSchema,
  adminUpdateRestaurantSchema,
  adminUpdateUserSchema,
} from '@mam/validation';
import { env } from '../../config/env';
import { AppConfigService } from '../../common/app-config.service';
import type { AuthUser, ClientMetaInfo } from '../../common/auth.decorators';
import { AuditService } from '../../common/audit.service';
import { CacheService } from '../../common/cache.service';
import { MailService, renderMail } from '../../common/mail.service';
import { paginate, skipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma.service';
import { TokenService } from '../auth/token.service';
import { CategoriesService } from '../categories/categories.service';
import { FoodPlatformRegistry } from '../integrations/food-platforms';
import { IntegrationHealthService } from '../integrations/integration-health.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GooglePlacesClient } from '../places/google-places.client';
import { CommunityStatsService } from '../restaurants/community-stats.service';
import { LocalPlacesService } from '../restaurants/local-places.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { MODERATION_TRANSITIONS } from '../reviews/review-rules';
import { ReviewsService } from '../reviews/reviews.service';
import { StorageService } from '../uploads/storage.service';
import { canManageUser } from './admin-rules';

const reviewIncludeForAdmin = {
  user: { select: { id: true, profile: { select: { username: true, displayName: true, avatarUrl: true } } } },
  photos: { where: { deletedAt: null } },
  restaurant: { select: { id: true, name: true, nameSource: true, source: true, externalRefs: { where: { provider: 'GOOGLE' as const }, select: { externalPlaceId: true } } } },
} satisfies Prisma.ReviewInclude;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly reviews: ReviewsService,
    private readonly restaurants: RestaurantsService,
    private readonly stats: CommunityStatsService,
    private readonly notifications: NotificationsService,
    private readonly tokens: TokenService,
    private readonly cache: CacheService,
    private readonly config: AppConfigService,
    private readonly categories: CategoriesService,
    private readonly health: IntegrationHealthService,
    private readonly platforms: FoodPlatformRegistry,
    private readonly google: GooglePlacesClient,
    private readonly storage: StorageService,
    private readonly localPlaces: LocalPlacesService,
    private readonly mail: MailService,
  ) {}

  // ───────────────────────── Overview ─────────────────────────
  async overview(): Promise<AdminOverview> {
    const since30 = new Date(Date.now() - 30 * 86400_000);
    const [users, active, published, restaurants, openReports, pending, trend, cats, recent] = await Promise.all([
      this.prisma.user.count({ where: { status: { not: 'DELETED' } } }),
      this.prisma.user.count({ where: { status: 'ACTIVE', lastActiveAt: { gte: since30 } } }),
      this.prisma.review.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.restaurant.count({ where: { status: { not: 'MERGED' }, deletedAt: null } }),
      this.prisma.reviewReport.count({ where: { status: 'OPEN' } }),
      this.prisma.review.count({ where: { status: 'PENDING' } }),
      this.prisma.$queryRaw<{ day: string; n: bigint }[]>`
        SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD') AS day, COUNT(*) AS n
          FROM reviews WHERE created_at >= ${since30} AND status <> 'DELETED'
         GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ slug: string; n: bigint }[]>`
        SELECT c.slug, COUNT(r.id) AS n FROM categories c
          JOIN restaurant_categories rc ON rc.category_id = c.id
          JOIN reviews r ON r.restaurant_id = rc.restaurant_id AND r.status = 'PUBLISHED'
         GROUP BY c.slug ORDER BY n DESC LIMIT 8`,
      this.auditLogs({ page: 1, pageSize: 10 }),
    ]);
    const byDay = new Map(trend.map((t) => [t.day, Number(t.n)]));
    const reviewTrend = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.now() - (29 - i) * 86400_000);
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d);
      return { date: day, count: byDay.get(day) ?? 0 };
    });
    return {
      totals: { users, activeUsers30d: active, publishedReviews: published, restaurants, openReports, pendingReviews: pending, pendingPlaces: await this.localPlaces.countSubmissions('PENDING') },
      reviewTrend,
      popularCategories: cats.map((c) => ({ slug: c.slug as CategorySlug, reviewCount: Number(c.n) })),
      recentActivity: recent.items,
    };
  }

  // ───────────────────────── Users ─────────────────────────
  async users(q: { page: number; pageSize: number; q?: string; role?: Role; status?: AdminUserRow['status'] }): Promise<Paginated<AdminUserRow>> {
    const where: Prisma.UserWhereInput = {
      role: q.role,
      status: q.status,
      ...(q.q
        ? { OR: [{ email: { contains: q.q, mode: 'insensitive' } }, { profile: { username: { contains: q.q, mode: 'insensitive' } } }, { profile: { displayName: { contains: q.q, mode: 'insensitive' } } }] }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { profile: true, _count: { select: { reviews: { where: { status: { not: 'DELETED' } } } } } },
        orderBy: { createdAt: 'desc' },
        ...skipTake(q.page, q.pageSize),
      }),
      this.prisma.user.count({ where }),
    ]);
    const reportCounts = await this.prisma.reviewReport.groupBy({ by: ['reviewId'], where: { review: { userId: { in: rows.map((r) => r.id) } } }, _count: { _all: true } });
    const reviewOwners = await this.prisma.review.findMany({ where: { id: { in: reportCounts.map((r) => r.reviewId) } }, select: { id: true, userId: true } });
    const owner = new Map(reviewOwners.map((r) => [r.id, r.userId]));
    const reportsByUser = new Map<string, number>();
    reportCounts.forEach((r) => {
      const u = owner.get(r.reviewId)!;
      reportsByUser.set(u, (reportsByUser.get(u) ?? 0) + r._count._all);
    });
    return paginate(
      rows.map((u) => ({
        userId: u.id,
        email: u.email,
        username: u.profile?.username ?? '',
        displayName: u.profile?.displayName ?? '',
        role: u.role,
        status: u.status,
        reviewCount: u._count.reviews,
        reportCount: reportsByUser.get(u.id) ?? 0,
        createdAt: u.createdAt.toISOString(),
        lastActiveAt: u.lastActiveAt?.toISOString() ?? null,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async user(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { profile: true } });
    if (!u) throw new NotFoundException('Pengguna tidak ditemukan.');
    const rows = await this.users({ page: 1, pageSize: 1, q: u.email });
    const row = rows.items.find((r) => r.userId === id);
    const [profile, recentAudit] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { userId: id } }),
      this.auditLogs({ page: 1, pageSize: 20, targetId: id }),
    ]);
    return {
      ...row!,
      profile: { userId: id, username: profile?.username ?? '', displayName: profile?.displayName ?? '', avatarUrl: profile?.avatarUrl ?? null, bio: profile?.bio ?? null, joinedAt: u.createdAt.toISOString(), stats: { reviewCount: row?.reviewCount ?? 0, photoCount: 0, helpfulReceived: 0 }, badges: [] },
      recentAudit: recentAudit.items,
    };
  }

  async updateUser(actor: AuthUser, id: string, b: z.infer<typeof adminUpdateUserSchema>, meta: ClientMetaInfo): Promise<AdminUserRow> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target || target.status === 'DELETED') throw new NotFoundException('Pengguna tidak ditemukan.');
    const check = canManageUser(actor, { id: target.id, role: target.role }, b.role);
    if (!check.ok) throw new ForbiddenException(check.reason);
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.update({ where: { id }, data: { status: b.status, role: b.role } });
      if (b.status && b.status !== target.status) {
        await this.audit.log({ actorId: actor.id, action: b.status === 'SUSPENDED' ? 'USER_SUSPENDED' : 'USER_RESTORED', targetType: 'user', targetId: id, metadata: { reason: b.reason, from: target.status, to: b.status }, ...meta }, tx);
      }
      if (b.role && b.role !== target.role) {
        await this.audit.log({ actorId: actor.id, action: 'USER_ROLE_CHANGED', targetType: 'user', targetId: id, metadata: { reason: b.reason, from: target.role, to: b.role }, ...meta }, tx);
      }
    });
    if (b.status === 'SUSPENDED') await this.tokens.revokeAllForUser(id);
    else {
      const sessions = await this.prisma.session.findMany({ where: { userId: id, revokedAt: null }, select: { id: true } });
      await this.cache.del(...sessions.map((s) => `authstate:${id}:${s.id}`));
    }
    if (b.status === 'SUSPENDED' || b.status === 'ACTIVE') {
      await this.notifications.notify(id, 'SYSTEM', b.status === 'SUSPENDED' ? 'Akunmu ditangguhkan' : 'Akunmu dipulihkan', `Alasan: ${b.reason}`, null);
    }
    const rows = await this.users({ page: 1, pageSize: 1, q: target.email });
    return rows.items[0];
  }

  // ───────────────────────── Reviews & moderation ─────────────────────────
  async reviewsList(q: { page: number; pageSize: number; status?: ReviewView['status']; q?: string }): Promise<Paginated<ReviewView>> {
    const where: Prisma.ReviewWhereInput = { status: q.status, ...(q.q ? { reviewText: { contains: q.q, mode: 'insensitive' } } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({ where, include: reviewIncludeForAdmin, orderBy: { createdAt: 'desc' }, ...skipTake(q.page, q.pageSize) }),
      this.prisma.review.count({ where }),
    ]);
    return paginate(await this.reviews.toViews(rows, undefined, { liveNames: false }), total, q.page, q.pageSize);
  }

  async moderateReview(actor: AuthUser, reviewId: string, action: ModerationActionType, reason: string, meta: ClientMetaInfo, reportId?: string, tx?: Prisma.TransactionClient) {
    const run = async (t: Prisma.TransactionClient) => {
      const r = await t.review.findUnique({ where: { id: reviewId } });
      if (!r) throw new NotFoundException('Ulasan tidak ditemukan.');
      const rule = MODERATION_TRANSITIONS[action];
      if (!rule.from.includes(r.status)) throw new ConflictException(`Aksi ${action} tidak dapat diterapkan pada ulasan berstatus ${r.status}.`);
      if (action === 'RESTORE' && r.status === 'DELETED' && !r.moderationLocked) {
        throw new ConflictException('Ulasan ini dihapus oleh penulisnya dan tidak dapat dipulihkan oleh moderator.');
      }
      await t.reviewRevision.create({ data: { reviewId, snapshot: { status: r.status, text: r.reviewText }, reason: `MODERATION_${action}` } });
      await t.review.update({
        where: { id: reviewId },
        data: {
          status: rule.to,
          deletedAt: rule.to === 'DELETED' ? new Date() : rule.to === 'PUBLISHED' ? null : undefined,
          moderationLocked: action === 'DELETE' ? true : action === 'RESTORE' ? false : undefined,
        },
      });
      await t.moderationAction.create({ data: { reviewId, moderatorId: actor.id, action, reason, previousStatus: r.status, newStatus: rule.to, reportId } });
      await this.audit.log({ actorId: actor.id, action: `REVIEW_${action}`, targetType: 'review', targetId: reviewId, metadata: { reason, from: r.status, to: rule.to, reportId }, ...meta }, t);
      const statusText: Record<string, string> = { HIDDEN: 'disembunyikan', REJECTED: 'ditolak', PUBLISHED: 'diterbitkan', DELETED: 'dihapus' };
      await this.notifications.notify(r.userId, 'REVIEW_MODERATED', `Ulasanmu ${statusText[rule.to] ?? 'diperbarui'} oleh moderator`, `Alasan: ${reason}`, `/ulasan/${reviewId}`, t);
      return r.restaurantId;
    };
    const restaurantId = tx ? await run(tx) : await this.prisma.$transaction(run);
    await this.stats.invalidate(restaurantId);
    const row = await this.prisma.review.findUniqueOrThrow({ where: { id: reviewId }, include: reviewIncludeForAdmin });
    return (await this.reviews.toViews([row], undefined, { liveNames: false }))[0];
  }

  // ───────────────────────── Reports ─────────────────────────
  async reports(q: { page: number; pageSize: number; status: AdminReportRow['status'] }): Promise<Paginated<AdminReportRow>> {
    const where = { status: q.status };
    const [rows, total] = await Promise.all([
      this.prisma.reviewReport.findMany({
        where,
        include: { reporter: { select: { id: true, profile: { select: { displayName: true } } } }, review: { include: reviewIncludeForAdmin } },
        orderBy: { createdAt: q.status === 'OPEN' ? 'asc' : 'desc' },
        ...skipTake(q.page, q.pageSize),
      }),
      this.prisma.reviewReport.count({ where }),
    ]);
    const views = await this.reviews.toViews(rows.map((r) => r.review), undefined, { liveNames: false });
    const byId = new Map(views.map((v) => [v.id, v]));
    return paginate(
      rows.map((r) => ({
        id: r.id,
        reason: r.reason,
        details: r.details,
        status: r.status,
        reporter: { userId: r.reporterId, displayName: r.reporter.profile?.displayName ?? '' },
        review: byId.get(r.reviewId)!,
        resolutionNote: r.resolutionNote,
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async resolveReport(actor: AuthUser, id: string, b: z.infer<typeof adminResolveReportSchema>, meta: ClientMetaInfo): Promise<AdminReportRow> {
    const report = await this.prisma.reviewReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Laporan tidak ditemukan.');
    if (report.status !== 'OPEN') throw new ConflictException('Laporan ini sudah diselesaikan.');
    if (b.status === 'RESOLVED_ACTION_TAKEN' && !b.reviewAction) throw new BadRequestException('Pilih tindakan untuk ulasan.');
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (b.reviewAction) await this.moderateReview(actor, report.reviewId, b.reviewAction, b.note, meta, id, tx);
      // Resolving one report with action resolves all open reports on the same review.
      const scope = b.status === 'RESOLVED_ACTION_TAKEN' ? { reviewId: report.reviewId, status: 'OPEN' as const } : { id };
      const affected = await tx.reviewReport.findMany({ where: scope, select: { id: true, reporterId: true } });
      await tx.reviewReport.updateMany({ where: scope, data: { status: b.status, resolvedById: actor.id, resolutionNote: b.note, resolvedAt: new Date() } });
      await this.audit.log({ actorId: actor.id, action: 'REPORT_RESOLVED', targetType: 'report', targetId: id, metadata: { status: b.status, reviewAction: b.reviewAction, note: b.note, affected: affected.length }, ...meta }, tx);
      for (const a of affected) {
        await this.notifications.notify(a.reporterId, 'REPORT_RESOLVED', 'Laporanmu telah ditinjau', b.status === 'RESOLVED_ACTION_TAKEN' ? 'Terima kasih! Moderator telah mengambil tindakan.' : 'Terima kasih! Moderator meninjau laporanmu dan tidak menemukan pelanggaran.', null, tx);
      }
    });
    const rows = await this.reports({ page: 1, pageSize: 50, status: b.status });
    return rows.items.find((r) => r.id === id)!;
  }

  // ───────────────────────── Place submissions ─────────────────────────
  async placeSubmissions(q: { status: 'PENDING' | 'ACTIVE' | 'REJECTED'; page: number; pageSize: number }) {
    const [items, total] = await Promise.all([
      this.localPlaces.submissions({ status: q.status, page: q.page, pageSize: q.pageSize, withSubmitter: true }),
      this.localPlaces.countSubmissions(q.status),
    ]);
    return paginate(items, total, q.page, q.pageSize);
  }

  /**
   * Approve (publish) or reject a community place submission. Rejections require a reason, which is e-mailed to the
   * submitter and shown in their submissions list. Both outcomes create an in-app notification and an audit entry.
   */
  async decidePlaceSubmission(actor: AuthUser, id: string, action: 'APPROVE' | 'REJECT', reason: string | undefined, meta: ClientMetaInfo) {
    const r = await this.prisma.restaurant.findUnique({ where: { id }, include: { createdBy: { select: { id: true, email: true, status: true, profile: { select: { displayName: true } } } } } });
    if (!r || r.deletedAt || r.source !== 'COMMUNITY') throw new NotFoundException('Pengajuan tempat tidak ditemukan.');
    if (r.status !== 'PENDING') throw new ConflictException('Pengajuan ini sudah diproses moderator lain.');
    const approve = action === 'APPROVE';
    const note = approve ? null : (reason ?? '').trim();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Conditional update: two moderators deciding at the same time cannot both succeed.
      const updated = await tx.restaurant.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: approve ? 'ACTIVE' : 'REJECTED', reviewedById: actor.id, reviewedAt: new Date(), moderationNote: note },
      });
      if (updated.count !== 1) throw new ConflictException('Pengajuan ini sudah diproses moderator lain.');
      await this.audit.log(
        { actorId: actor.id, action: approve ? 'PLACE_APPROVED' : 'PLACE_REJECTED', targetType: 'restaurant', targetId: id, metadata: { name: r.name, reason: note }, ...meta },
        tx,
      );
      if (r.createdById) {
        await this.notifications.notify(
          r.createdById,
          approve ? 'PLACE_APPROVED' : 'PLACE_REJECTED',
          approve ? 'Tempat kamu disetujui 🎉' : 'Pengajuan tempat ditolak',
          approve ? `"${r.name}" sudah tampil di MAM!. Terima kasih sudah melengkapi peta!` : `"${r.name}" tidak disetujui: ${note}`,
          approve ? `/tempat/mam-${id}` : '/profil',
          tx,
        );
      }
    });

    // E-mail after the commit (a mail outage must not undo the decision). Rejections are always e-mailed; approvals too.
    let emailed: 'smtp' | 'outbox' | null = null;
    const to = r.createdBy?.status === 'ACTIVE' ? r.createdBy.email : null;
    if (to) {
      const who = r.createdBy?.profile?.displayName || 'Sobat MAM!';
      const { text, html } = approve
        ? renderMail('Tempat kamu sudah tampil di MAM!', [
            `Halo ${who},`,
            `Pengajuan tempat "${r.name}" sudah disetujui moderator dan sekarang bisa ditemukan pengguna lain.`,
            `Lihat tempatnya: ${env().WEB_PUBLIC_URL}/tempat/mam-${id}`,
            'Terima kasih sudah membantu melengkapi peta kuliner Indonesia!',
          ])
        : renderMail('Pengajuan tempat belum bisa disetujui', [
            `Halo ${who},`,
            `Pengajuan tempat "${r.name}" belum bisa kami terima.`,
            `Alasan dari moderator: ${note}`,
            'Kamu boleh mengajukan ulang setelah memperbaiki datanya (nama, titik lokasi, atau kategori) lewat menu "Tambah tempat".',
          ]);
      try {
        emailed = (await this.mail.send({ to, subject: approve ? `Disetujui: ${r.name}` : `Pengajuan ditolak: ${r.name}`, text, html })).via;
      } catch (e) {
        await this.audit.log({ actorId: actor.id, action: 'EMAIL_FAILED', targetType: 'restaurant', targetId: id, metadata: { error: (e as Error).message.slice(0, 300) }, ...meta });
      }
    }
    const [view] = await this.localPlaces.submissions({ ids: [id], withSubmitter: true });
    return { ...view, emailed };
  }

  // ───────────────────────── Restaurants ─────────────────────────
  async restaurantsList(q: { page: number; pageSize: number; q?: string; status?: 'ACTIVE' | 'MERGED' | 'CLOSED' | 'HIDDEN' }) {
    const where: Prisma.RestaurantWhereInput = {
      deletedAt: null,
      status: q.status,
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { externalRefs: { some: { externalPlaceId: q.q } } }, ...(/^[0-9a-f-]{36}$/i.test(q.q) ? [{ id: q.q }] : [])] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.restaurant.findMany({
        where,
        include: { externalRefs: { select: { provider: true, externalPlaceId: true } }, categories: { include: { category: { select: { slug: true } } } } },
        orderBy: { createdAt: 'desc' },
        ...skipTake(q.page, q.pageSize),
      }),
      this.prisma.restaurant.count({ where }),
    ]);
    const views = await this.restaurants.toViews(rows, { liveName: false });
    return paginate(
      views.map((v, i) => ({ ...v, externalRefs: rows[i].externalRefs })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async updateRestaurant(actor: AuthUser, id: string, b: z.infer<typeof adminUpdateRestaurantSchema>, meta: ClientMetaInfo) {
    const r = await this.prisma.restaurant.findUnique({ where: { id } });
    if (!r || r.deletedAt) throw new NotFoundException('Restoran tidak ditemukan.');
    if (r.status === 'MERGED') throw new ConflictException('Restoran ini sudah digabungkan.');
    if (r.status === 'PENDING' || r.status === 'REJECTED') throw new ConflictException('Ini pengajuan tempat — proses lewat halaman "Pengajuan tempat" (pengaju akan diberi tahu).');
    if (b.name === null && r.source !== 'GOOGLE') throw new BadRequestException('Tempat dari OpenStreetMap/komunitas wajib memiliki nama.');
    const defs = await this.categories.all();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.restaurant.update({
        where: { id },
        data: {
          status: b.status,
          ...(b.name !== undefined ? { name: b.name, nameSource: b.name ? 'ADMIN' : 'NONE' } : {}),
        },
      });
      if (b.categories) {
        await tx.restaurantCategory.deleteMany({ where: { restaurantId: id } });
        const ids = defs.filter((d) => b.categories!.includes(d.slug as CategorySlug)).map((d) => d.id);
        await tx.restaurantCategory.createMany({ data: ids.map((categoryId) => ({ restaurantId: id, categoryId, source: 'ADMIN' as const })) });
      }
      await this.audit.log({ actorId: actor.id, action: 'RESTAURANT_UPDATED', targetType: 'restaurant', targetId: id, metadata: { ...b }, ...meta }, tx);
    });
    return this.restaurants.view(id, { liveName: false });
  }

  async duplicates() {
    const pairs = await this.prisma.$queryRaw<{ a: string; b: string; d: number }[]>`
      SELECT a.id AS a, b.id AS b, ST_Distance(a.location, b.location) AS d
        FROM restaurants a JOIN restaurants b
          ON a.id < b.id AND ST_DWithin(a.location, b.location, 30)
       WHERE a.status = 'ACTIVE' AND b.status = 'ACTIVE' AND a.deleted_at IS NULL AND b.deleted_at IS NULL
         -- Neighbouring stalls (food courts, rows of warung) are not duplicates: require similar names when both are known.
         AND (a.name IS NULL OR b.name IS NULL OR similarity(lower(a.name), lower(b.name)) > 0.4)
       ORDER BY d ASC LIMIT 50`;
    const rows = await this.restaurants.loadMany([...new Set(pairs.flatMap((p) => [p.a, p.b]))]);
    const views = new Map((await this.restaurants.toViews(rows, { liveName: true })).map((v) => [v.id, v]));
    return pairs
      .filter((p) => views.has(p.a) && views.has(p.b))
      .map((p) => ({ a: views.get(p.a)!, b: views.get(p.b)!, distanceMeters: Math.round(p.d), reason: `Dua referensi berjarak ${Math.round(p.d)} m` }));
  }

  async mergeRestaurant(actor: AuthUser, sourceId: string, b: z.infer<typeof adminMergeRestaurantSchema>, meta: ClientMetaInfo) {
    if (sourceId === b.targetRestaurantId) throw new BadRequestException('Sumber dan tujuan tidak boleh sama.');
    const [src, dst] = await Promise.all([
      this.prisma.restaurant.findUnique({ where: { id: sourceId } }),
      this.prisma.restaurant.findUnique({ where: { id: b.targetRestaurantId } }),
    ]);
    if (!src || !dst) throw new NotFoundException('Restoran tidak ditemukan.');
    if (src.status === 'MERGED' || dst.status === 'MERGED') throw new ConflictException('Salah satu restoran sudah digabungkan.');
    const summary = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Reviews: a user with reviews on both keeps the target's; the source's is retired (audited).
      const srcReviews = await tx.review.findMany({ where: { restaurantId: sourceId } });
      let moved = 0;
      let retired = 0;
      for (const r of srcReviews) {
        const clash = await tx.review.findUnique({ where: { userId_restaurantId: { userId: r.userId, restaurantId: dst.id } } });
        if (clash) {
          await tx.reviewRevision.create({ data: { reviewId: r.id, snapshot: { mergedInto: dst.id, keptReviewId: clash.id }, reason: 'MERGE_DUPLICATE' } });
          await tx.review.update({ where: { id: r.id }, data: { status: 'DELETED', deletedAt: new Date(), moderationLocked: true } });
          retired++;
        } else {
          await tx.review.update({ where: { id: r.id }, data: { restaurantId: dst.id } });
          moved++;
        }
      }
      const favs = await tx.favorite.findMany({ where: { restaurantId: sourceId } });
      for (const f of favs) {
        await tx.favorite.upsert({ where: { userId_restaurantId: { userId: f.userId, restaurantId: dst.id } }, create: { userId: f.userId, restaurantId: dst.id, createdAt: f.createdAt }, update: {} });
      }
      await tx.favorite.deleteMany({ where: { restaurantId: sourceId } });
      const items = await tx.collectionItem.findMany({ where: { restaurantId: sourceId } });
      for (const it of items) {
        const exists = await tx.collectionItem.findUnique({ where: { collectionId_restaurantId: { collectionId: it.collectionId, restaurantId: dst.id } } });
        if (exists) await tx.collectionItem.delete({ where: { id: it.id } });
        else await tx.collectionItem.update({ where: { id: it.id }, data: { restaurantId: dst.id } });
      }
      await tx.externalPlaceRef.updateMany({ where: { restaurantId: sourceId }, data: { restaurantId: dst.id } });
      const links = await tx.platformLink.findMany({ where: { restaurantId: sourceId } });
      for (const l of links) {
        const exists = await tx.platformLink.findUnique({ where: { restaurantId_provider: { restaurantId: dst.id, provider: l.provider } } });
        if (exists) await tx.platformLink.delete({ where: { id: l.id } });
        else await tx.platformLink.update({ where: { id: l.id }, data: { restaurantId: dst.id } });
      }
      await tx.restaurant.update({ where: { id: sourceId }, data: { status: 'MERGED', mergedIntoId: dst.id } });
      const result = { movedReviews: moved, retiredDuplicateReviews: retired, favorites: favs.length, collectionItems: items.length };
      await this.audit.log({ actorId: actor.id, action: 'RESTAURANT_MERGED', targetType: 'restaurant', targetId: sourceId, metadata: { into: dst.id, reason: b.reason, ...result }, ...meta }, tx);
      return result;
    });
    await Promise.all([this.stats.invalidate(sourceId), this.stats.invalidate(dst.id)]);
    return { ...(await this.restaurants.view(dst.id, { liveName: false })), merge: summary };
  }

  async setPlatformLink(actor: AuthUser, restaurantId: string, b: z.infer<typeof adminPlatformLinkSchema>, meta: ClientMetaInfo) {
    const id = await this.restaurants.canonicalId(restaurantId);
    if (b.availability === 'VERIFIED') {
      if (!b.url) throw new BadRequestException('URL wajib untuk tautan terverifikasi.');
      if (!this.platforms.isOfficialUrl(b.provider, b.url)) throw new BadRequestException('URL bukan domain resmi penyedia.');
    }
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.platformLink.upsert({
        where: { restaurantId_provider: { restaurantId: id, provider: b.provider } },
        create: { restaurantId: id, provider: b.provider, url: b.availability === 'VERIFIED' ? b.url : null, availability: b.availability, source: 'ADMIN_VERIFIED', verifiedById: actor.id, lastVerifiedAt: new Date() },
        update: { url: b.availability === 'VERIFIED' ? b.url : null, availability: b.availability, source: 'ADMIN_VERIFIED', verifiedById: actor.id, lastVerifiedAt: new Date() },
      });
      await this.audit.log({ actorId: actor.id, action: 'PLATFORM_LINK_VERIFIED', targetType: 'restaurant', targetId: id, metadata: { ...b }, ...meta }, tx);
    });
    return (await this.restaurants.platformLinks(id)).find((l) => l.provider === b.provider)!;
  }

  // ───────────────────────── Categories ─────────────────────────
  async categoryList() {
    const rows = await this.prisma.category.findMany({ include: { _count: { select: { restaurants: true } } }, orderBy: { sortOrder: 'asc' } });
    return rows.map((c) => ({ id: c.id, slug: c.slug, nameId: c.nameId, nameEn: c.nameEn, emoji: c.emoji, sortOrder: c.sortOrder, isActive: c.isActive, googleTypes: c.googleTypes, restaurantCount: c._count.restaurants }));
  }

  async updateCategory(actor: AuthUser, id: string, b: Partial<{ nameId: string; nameEn: string; emoji: string; sortOrder: number; isActive: boolean }>, meta: ClientMetaInfo) {
    const c = await this.prisma.category.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Kategori tidak ditemukan.');
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.category.update({ where: { id }, data: b });
      await this.audit.log({ actorId: actor.id, action: 'CATEGORY_UPDATED', targetType: 'category', targetId: id, metadata: { before: { nameId: c.nameId, isActive: c.isActive, sortOrder: c.sortOrder }, after: b }, ...meta }, tx);
    });
    await this.categories.invalidate();
    return (await this.categoryList()).find((x) => x.id === id);
  }

  // ───────────────────────── Audit / config / system ─────────────────────────
  async auditLogs(q: { page: number; pageSize: number; action?: string; actorId?: string; targetId?: string }): Promise<Paginated<AuditLogView>> {
    const where: Prisma.AdminAuditLogWhereInput = { action: q.action, actorId: q.actorId, targetId: q.targetId };
    const [rows, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({ where, include: { actor: { select: { id: true, role: true, profile: { select: { displayName: true } } } } }, orderBy: { createdAt: 'desc' }, ...skipTake(q.page, q.pageSize) }),
      this.prisma.adminAuditLog.count({ where }),
    ]);
    return paginate(
      rows.map((r) => ({
        id: r.id,
        actor: r.actor ? { userId: r.actor.id, displayName: r.actor.profile?.displayName ?? '', role: r.actor.role } : null,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        metadata: (r.metadata as Record<string, unknown> | null) ?? null,
        ip: r.ip,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async getConfig() {
    return { effective: await this.config.get(), defaults: this.config.defaults() };
  }

  async updateConfig(actor: AuthUser, b: z.infer<typeof adminConfigSchema>, meta: ClientMetaInfo) {
    const { reason, ...patch } = b;
    const before = await this.config.get();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await this.config.update(patch, actor.id, tx);
      await this.audit.log({ actorId: actor.id, action: 'CONFIG_UPDATED', targetType: 'config', targetId: null, metadata: { reason, before, patch }, ...meta }, tx);
    });
    return this.getConfig();
  }

  private async osmNote(): Promise<{ configured: boolean; note: string }> {
    const c = await this.localPlaces.counts().catch(() => null);
    if (!c) return { configured: false, note: 'Data OpenStreetMap tidak dapat dibaca.' };
    const last = c.lastImportAt ? new Date(c.lastImportAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : 'belum pernah';
    return {
      configured: c.osm > 0,
      note: `${c.osm.toLocaleString('id-ID')} tempat dari OpenStreetMap, ${c.community.toLocaleString('id-ID')} tambahan komunitas, ${c.localities.toLocaleString('id-ID')} lokalitas. Impor terakhir: ${last}.`,
    };
  }

  private integrationNotes(redisOk: boolean, dbOk: boolean, storage: { ok: boolean; message: string }, osm: { configured: boolean; note: string }) {
    const notes: Record<string, { configured: boolean; note: string }> = {
      OSM: osm,
      GOOGLE: { configured: this.google.isConfigured(), note: this.google.isConfigured() ? 'Places API (New) via kunci server.' : 'Opsional. GOOGLE_MAPS_SERVER_API_KEY belum diisi — penemuan memakai OpenStreetMap + data komunitas.' },
      DATABASE: { configured: true, note: dbOk ? 'PostgreSQL + PostGIS terhubung.' : 'Database tidak merespons.' },
      REDIS: { configured: this.cache.driver === 'redis' || redisOk, note: redisOk ? 'Redis terhubung.' : 'Redis tidak tersedia — memakai cache memori (satu instance).' },
      STORAGE: { configured: storage.ok, note: storage.message },
    };
    for (const p of this.platforms.all()) {
      notes[p.id] = {
        configured: false,
        note: p.partnerKeyConfigured()
          ? `Kunci mitra ${p.getProviderName()} terisi, tetapi belum ada implementasi API resmi yang terdokumentasi. Menggunakan tautan terverifikasi admin.`
          : `Tidak ada akses API resmi ${p.getProviderName()}. Menggunakan tautan terverifikasi admin / kiriman pengguna.`,
      };
    }
    return notes;
  }

  async integrations(): Promise<IntegrationHealth[]> {
    const [redisOk, dbOk, storage] = await Promise.all([
      this.cache.ping(),
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.storage.healthy(),
    ]);
    return this.health.list(this.integrationNotes(redisOk, dbOk, storage, await this.osmNote()));
  }

  async checkIntegrations(actor: AuthUser, meta: ClientMetaInfo): Promise<IntegrationHealth[]> {
    const [redisOk, dbOk, storage] = await Promise.all([
      this.cache.ping(),
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.storage.healthy(),
    ]);
    await this.health.markConfigured('DATABASE', true, dbOk);
    await this.health.markConfigured('REDIS', redisOk, redisOk);
    await this.health.markConfigured('STORAGE', storage.ok, storage.ok, storage.ok ? undefined : storage.message);
    if (this.google.isConfigured()) {
      try {
        await this.google.autocomplete({ input: 'nasi goreng', kind: 'food' });
      } catch (e) {
        await this.health.markConfigured('GOOGLE', true, false, (e as Error).message);
      }
    } else {
      await this.health.markConfigured('GOOGLE', false, false, 'Not configured');
    }
    const osm = await this.osmNote();
    await this.health.markConfigured('OSM', osm.configured, osm.configured, osm.configured ? undefined : 'Belum ada data OpenStreetMap — jalankan scripts\import-osm.ps1');
    await this.audit.log({ actorId: actor.id, action: 'INTEGRATIONS_CHECKED', targetType: 'system', ...meta });
    return this.health.list(this.integrationNotes(redisOk, dbOk, storage, osm));
  }

  async storageStats() {
    const [byMime, orphaned] = await Promise.all([
      this.prisma.reviewPhoto.groupBy({ by: ['mimeType'], where: { deletedAt: null }, _count: { _all: true }, _sum: { fileSize: true } }),
      this.prisma.reviewPhoto.count({ where: { reviewId: null, deletedAt: null, createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } } }),
    ]);
    return {
      driver: this.storage.driver,
      totalFiles: byMime.reduce((a, b) => a + b._count._all, 0),
      totalBytes: byMime.reduce((a, b) => a + (b._sum.fileSize ?? 0), 0),
      byMime: byMime.map((m) => ({ mime: m.mimeType, files: m._count._all, bytes: m._sum.fileSize ?? 0 })),
      orphanedFiles: orphaned,
      note: 'Ukuran mencakup gambar utama; thumbnail (~10–15% tambahan) tidak dihitung.',
    };
  }
}
