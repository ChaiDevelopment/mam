import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { ReactionTypes } from '@mam/shared-types';
import {
  makeCreateReviewSchema,
  makeUpdateReviewSchema,
  reactionSchema,
  reportSchema,
  reviewFeedQuerySchema,
} from '@mam/validation';
import { AuthUser, CurrentUser, Public } from '../../common/auth.decorators';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../../common/zod';
import { EmailLinksService } from '../auth/email-links.service';
import { ReviewsService } from './reviews.service';

// Text length minimum is enforced in the service using the runtime-configurable value.
const createSchema = makeCreateReviewSchema(1);
const updateSchema = makeUpdateReviewSchema(1);
const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('reviews (MAM! community)')
@Controller('reviews')
export class ReviewsController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly links: EmailLinksService,
  ) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiZodBody(createSchema)
  @ApiOperation({ summary: 'Create a review. One review per user per restaurant (409 if one exists — edit it instead).' })
  async create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(createSchema)) b: z.infer<typeof createSchema>) {
    await this.links.requireVerified(u.id);
    return this.reviews.create(u, b);
  }

  @Public()
  @Get('feed')
  @ApiZodQuery(reviewFeedQuerySchema)
  feed(@Query(new ZodPipe(reviewFeedQuerySchema)) q: z.infer<typeof reviewFeedQuerySchema>, @CurrentUser() u?: AuthUser) {
    return this.reviews.feed(q, u);
  }

  @Public()
  @Get(':id')
  get(@Param('id', uuid) id: string, @CurrentUser() u?: AuthUser) {
    return this.reviews.get(id, u);
  }

  @Patch(':id')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiZodBody(updateSchema)
  @ApiOperation({ summary: 'Edit own review (updates the same record).' })
  update(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(new ZodPipe(updateSchema)) b: z.infer<typeof updateSchema>) {
    return this.reviews.update(u, id, b);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) {
    return this.reviews.remove(u, id);
  }

  @Post(':id/reactions')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiZodBody(reactionSchema)
  react(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(new ZodPipe(reactionSchema)) b: z.infer<typeof reactionSchema>) {
    return this.reviews.react(u, id, b.type);
  }

  @Delete(':id/reactions/:type')
  @HttpCode(200)
  unreact(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Param('type', new ZodPipe(z.enum(ReactionTypes))) type: (typeof ReactionTypes)[number]) {
    return this.reviews.unreact(u, id, type);
  }

  @Post(':id/report')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiZodBody(reportSchema)
  report(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(new ZodPipe(reportSchema)) b: z.infer<typeof reportSchema>) {
    return this.reviews.report(u, id, b.reason, b.details);
  }
}
