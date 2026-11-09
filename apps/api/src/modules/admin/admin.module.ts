import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  adminAuditQuerySchema,
  adminCategorySchema,
  adminConfigSchema,
  adminMergeRestaurantSchema,
  adminModerateReviewSchema,
  adminPlatformLinkSchema,
  adminReportsQuerySchema,
  adminResolveReportSchema,
  adminRestaurantsQuerySchema,
  adminReviewsQuerySchema,
  adminUpdateRestaurantSchema,
  adminUpdateUserSchema,
  adminUsersQuerySchema,
  placeDecisionSchema,
  placeSubmissionsQuerySchema,
} from '@mam/validation';
import { AuthUser, ClientMeta, ClientMetaInfo, CurrentUser, MinRole } from '../../common/auth.decorators';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../../common/zod';
import { CommunityModule } from '../community/community.module';
import { NotificationsModule } from '../notifications/notifications.service';
import { RestaurantsCoreModule } from '../restaurants/restaurants-core.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { UploadsModule } from '../uploads/uploads.module';
import { AdminService } from './admin.service';

const uuid = new ParseUUIDPipe();
const categoryPatch = adminCategorySchema.partial();

/**
 * Every route requires at least MODERATOR (class-level). Stricter routes declare ADMIN / SUPER_ADMIN.
 * Roles are verified by RolesGuard against the database, never against client-provided claims.
 */
@ApiTags('admin')
@MinRole('MODERATOR')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  // Users
  @Get('users')
  @ApiZodQuery(adminUsersQuerySchema)
  users(@Query(new ZodPipe(adminUsersQuerySchema)) q: z.infer<typeof adminUsersQuerySchema>) {
    return this.admin.users(q);
  }

  @Get('users/:id')
  user(@Param('id', uuid) id: string) {
    return this.admin.user(id);
  }

  @Patch('users/:id')
  @MinRole('ADMIN')
  @ApiZodBody(adminUpdateUserSchema)
  @ApiOperation({ summary: 'Suspend/restore or change role. Requires ADMIN; hierarchy rules enforced.' })
  updateUser(@CurrentUser() a: AuthUser, @Param('id', uuid) id: string, @Body(new ZodPipe(adminUpdateUserSchema)) b: z.infer<typeof adminUpdateUserSchema>, @ClientMeta() m: ClientMetaInfo) {
    return this.admin.updateUser(a, id, b, m);
  }

  // Place submissions (community-added restaurants waiting for approval)
  @Get('place-submissions')
  @ApiZodQuery(placeSubmissionsQuerySchema)
  @ApiOperation({ summary: 'Community place submissions by status (PENDING oldest first), with submitter and nearby possible duplicates' })
  placeSubmissions(@Query(new ZodPipe(placeSubmissionsQuerySchema)) q: z.infer<typeof placeSubmissionsQuerySchema>) {
    return this.admin.placeSubmissions(q);
  }

  @Patch('place-submissions/:id')
  @ApiZodBody(placeDecisionSchema)
  @ApiOperation({ summary: 'Approve or reject (reason required, e-mailed to the submitter) a place submission' })
  decidePlace(@CurrentUser() a: AuthUser, @Param('id', uuid) id: string, @Body(new ZodPipe(placeDecisionSchema)) b: z.infer<typeof placeDecisionSchema>, @ClientMeta() m: ClientMetaInfo) {
    return this.admin.decidePlaceSubmission(a, id, b.action, b.reason, m);
  }

  // Reports & moderation
  @Get('reports')
  @ApiZodQuery(adminReportsQuerySchema)
  reports(@Query(new ZodPipe(adminReportsQuerySchema)) q: z.infer<typeof adminReportsQuerySchema>) {
    return this.admin.reports(q);
  }

  @Patch('reports/:id')
  @ApiZodBody(adminResolveReportSchema)
  resolveReport(@CurrentUser() a: AuthUser, @Param('id', uuid) id: string, @Body(new ZodPipe(adminResolveReportSchema)) b: z.infer<typeof adminResolveReportSchema>, @ClientMeta() m: ClientMetaInfo) {
    return this.admin.resolveReport(a, id, b, m);
  }

  @Get('reviews')
  @ApiZodQuery(adminReviewsQuerySchema)
  reviews(@Query(new ZodPipe(adminReviewsQuerySchema)) q: z.infer<typeof adminReviewsQuerySchema>) {
    return this.admin.reviewsList(q);
  }

  @Post('reviews/:id/moderate')
  @ApiZodBody(adminModerateReviewSchema)
  moderate(@CurrentUser() a: AuthUser, @Param('id', uuid) id: string, @Body(new ZodPipe(adminModerateReviewSchema)) b: z.infer<typeof adminModerateReviewSchema>, @ClientMeta() m: ClientMetaInfo) {
    return this.admin.moderateReview(a, id, b.action, b.reason, m);
  }

  // Restaurants
  @Get('restaurants')
  @ApiZodQuery(adminRestaurantsQuerySchema)
  restaurants(@Query(new ZodPipe(adminRestaurantsQuerySchema)) q: z.infer<typeof adminRestaurantsQuerySchema>) {
    return this.admin.restaurantsList(q);
  }

  @Get('restaurants/duplicates')
  duplicates() {
    return this.admin.duplicates();
  }

  @Patch('restaurants/:id')
  @MinRole('ADMIN')
  @ApiZodBody(adminUpdateRestaurantSchema)
  updateRestaurant(@CurrentUser() a: AuthUser, @Param('id', uuid) id: string, @Body(new ZodPipe(adminUpdateRestaurantSchema)) b: z.infer<typeof adminUpdateRestaurantSchema>, @ClientMeta() m: ClientMetaInfo) {
    return this.admin.updateRestaurant(a, id, b, m);
  }

  @Post('restaurants/:id/merge')
  @MinRole('ADMIN')
  @ApiZodBody(adminMergeRestaurantSchema)
  merge(@CurrentUser() a: AuthUser, @Param('id', uuid) id: string, @Body(new ZodPipe(adminMergeRestaurantSchema)) b: z.infer<typeof adminMergeRestaurantSchema>, @ClientMeta() m: ClientMetaInfo) {
    return this.admin.mergeRestaurant(a, id, b, m);
  }

  @Put('restaurants/:id/platform-links')
  @MinRole('ADMIN')
  @ApiZodBody(adminPlatformLinkSchema)
  platformLink(@CurrentUser() a: AuthUser, @Param('id', uuid) id: string, @Body(new ZodPipe(adminPlatformLinkSchema)) b: z.infer<typeof adminPlatformLinkSchema>, @ClientMeta() m: ClientMetaInfo) {
    return this.admin.setPlatformLink(a, id, b, m);
  }

  // Categories
  @Get('categories')
  categories() {
    return this.admin.categoryList();
  }

  @Patch('categories/:id')
  @MinRole('ADMIN')
  @ApiZodBody(categoryPatch)
  updateCategory(@CurrentUser() a: AuthUser, @Param('id', uuid) id: string, @Body(new ZodPipe(categoryPatch)) b: z.infer<typeof categoryPatch>, @ClientMeta() m: ClientMetaInfo) {
    return this.admin.updateCategory(a, id, b, m);
  }

  // System
  @Get('audit-logs')
  @MinRole('ADMIN')
  @ApiZodQuery(adminAuditQuerySchema)
  audit(@Query(new ZodPipe(adminAuditQuerySchema)) q: z.infer<typeof adminAuditQuerySchema>) {
    return this.admin.auditLogs(q);
  }

  @Get('config')
  @MinRole('ADMIN')
  config() {
    return this.admin.getConfig();
  }

  @Patch('config')
  @MinRole('SUPER_ADMIN')
  @ApiZodBody(adminConfigSchema)
  updateConfig(@CurrentUser() a: AuthUser, @Body(new ZodPipe(adminConfigSchema)) b: z.infer<typeof adminConfigSchema>, @ClientMeta() m: ClientMetaInfo) {
    return this.admin.updateConfig(a, b, m);
  }

  @Get('integrations')
  @MinRole('ADMIN')
  integrations() {
    return this.admin.integrations();
  }

  @Post('integrations/check')
  @MinRole('ADMIN')
  check(@CurrentUser() a: AuthUser, @ClientMeta() m: ClientMetaInfo) {
    return this.admin.checkIntegrations(a, m);
  }

  @Get('storage')
  @MinRole('ADMIN')
  storage() {
    return this.admin.storageStats();
  }
}

@Module({
  imports: [RestaurantsCoreModule, ReviewsModule, NotificationsModule, UploadsModule, CommunityModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
