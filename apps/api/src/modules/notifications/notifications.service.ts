import { Controller, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { NotificationType, Prisma } from '@prisma/client';
import { z } from 'zod';
import type { NotificationView } from '@mam/shared-types';
import { AuthUser, CurrentUser } from '../../common/auth.decorators';
import { paginate, skipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma.service';
import { ZodPipe } from '../../common/zod';

/** Notification types users cannot opt out of (transparency about actions taken on their content). */
const ALWAYS_SEND: NotificationType[] = ['REVIEW_MODERATED', 'REPORT_RESOLVED', 'SYSTEM', 'PLACE_APPROVED', 'PLACE_REJECTED'];

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(userId: string, type: NotificationType, title: string, body: string, link: string | null, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    if (!ALWAYS_SEND.includes(type)) {
      const pref = await client.userPreference.findUnique({ where: { userId }, select: { notificationsEnabled: true } });
      if (pref && !pref.notificationsEnabled) return;
      // Collapse reaction spam: at most one reaction notification per link per hour.
      if (type === 'REVIEW_REACTION' && link) {
        const recent = await client.notification.count({ where: { userId, type, link, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
        if (recent) return;
      }
    }
    await client.notification.create({ data: { userId, type, title: title.slice(0, 120), body: body.slice(0, 500), link } });
  }

  async list(userId: string, page: number, pageSize: number) {
    const where = { userId };
    const [rows, total, unread] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(page, pageSize) }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    const items: NotificationView[] = rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));
    return { ...paginate(items, total, page, pageSize), unread };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  }
}

const listQuery = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) });

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.svc.list(u.id, q.page, q.pageSize);
  }

  @Patch(':id/read')
  @HttpCode(204)
  read(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.markRead(u.id, id);
  }

  @Post('read-all')
  @HttpCode(204)
  readAll(@CurrentUser() u: AuthUser) {
    return this.svc.markAllRead(u.id);
  }
}

@Module({ providers: [NotificationsService], controllers: [NotificationsController], exports: [NotificationsService] })
export class NotificationsModule {}
