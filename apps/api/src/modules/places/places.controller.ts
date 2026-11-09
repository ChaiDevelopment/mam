import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import {
  autocompleteQuerySchema,
  createPlaceSchema,
  nearbyQuerySchema,
  placeIdSchema,
  surpriseQuerySchema,
  textSearchQuerySchema,
} from '@mam/validation';
import { AuthUser, CurrentUser, Public } from '../../common/auth.decorators';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../../common/zod';
import { UsersService } from '../users/users.service';
import { EmailLinksService } from '../auth/email-links.service';
import { PlacesService } from './places.service';

const placeIdPipe = new ZodPipe(placeIdSchema);
const photoQuery = z.object({
  name: z.string().regex(/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/, 'Nama foto tidak valid').max(600),
  maxWidth: z.coerce.number().int().min(64).max(1600).default(800),
});
const detailQuery = z.object({ lat: z.coerce.number().min(-90).max(90).optional(), lng: z.coerce.number().min(-180).max(180).optional() });

@ApiTags('places (OpenStreetMap + community; Google Maps when configured)')
@Controller('places')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class PlacesController {
  constructor(
    private readonly places: PlacesService,
    private readonly users: UsersService,
    private readonly links: EmailLinksService,
  ) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiZodBody(createPlaceSchema)
  @ApiOperation({
    summary:
      'Submit a food place missing from OpenStreetMap/Google. Users: PENDING until a moderator approves (rejections are e-mailed). Staff: published directly. 409 for near-duplicates within 75 m.',
  })
  async create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(createPlaceSchema)) b: z.infer<typeof createPlaceSchema>) {
    await this.links.requireVerified(u.id);
    return this.places.submitPlace(b, { id: u.id, role: u.role });
  }

  @Get('submissions/mine')
  @ApiOperation({ summary: "The current user's place submissions with their moderation status" })
  mySubmissions(@CurrentUser() u: AuthUser) {
    return this.places.mySubmissions(u.id);
  }

  @Public()
  @Get('nearby')
  @ApiZodQuery(nearbyQuerySchema)
  @ApiOperation({ summary: 'Nearby food places (default radius 5000 m). OpenStreetMap + community places, merged with Google results when configured.' })
  nearby(@Query(new ZodPipe(nearbyQuerySchema)) q: z.infer<typeof nearbyQuerySchema>) {
    return this.places.nearby(q);
  }

  @Public()
  @Get('search')
  @ApiZodQuery(textSearchQuerySchema)
  async search(@Query(new ZodPipe(textSearchQuerySchema)) q: z.infer<typeof textSearchQuerySchema>, @CurrentUser() user?: AuthUser) {
    if (user) void this.users.recordSearch(user.id, q.q).catch(() => undefined);
    const center = q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : undefined;
    return this.places.textSearch(q.q, center, q.radius);
  }

  @Public()
  @Get('autocomplete')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiZodQuery(autocompleteQuerySchema)
  autocomplete(@Query(new ZodPipe(autocompleteQuerySchema)) q: z.infer<typeof autocompleteQuerySchema>) {
    const center = q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : undefined;
    return this.places.autocomplete(q.input, center, q.sessionToken, q.kind);
  }

  @Public()
  @Get('surprise')
  @ApiZodQuery(surpriseQuerySchema)
  @ApiOperation({ summary: 'Surprise me: a randomized but relevant pick inside the radius, with reasons.' })
  surprise(@Query(new ZodPipe(surpriseQuerySchema)) q: z.infer<typeof surpriseQuerySchema>) {
    return this.places.surprise(q);
  }

  @Public()
  @Get('photo')
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @ApiOperation({ summary: 'Redirects to a short-lived Google photo URL. Photos are never stored by MAM!.' })
  async photo(@Query(new ZodPipe(photoQuery)) q: z.infer<typeof photoQuery>, @Res() res: Response) {
    const uri = await this.places.photoUri(q.name, q.maxWidth);
    if (!uri.startsWith('https://')) throw new BadRequestException();
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.redirect(302, uri);
  }

  @Public()
  @Get(':placeId/location')
  location(@Param('placeId', placeIdPipe) placeId: string) {
    return this.places.placeLocation(placeId);
  }

  @Public()
  @Get(':placeId/external-reviews')
  @ApiOperation({ summary: 'Google review excerpts (max 5, as provided by Google) with author attribution.' })
  externalReviews(@Param('placeId', placeIdPipe) placeId: string) {
    return this.places.externalReviews(placeId);
  }

  @Public()
  @Get(':placeId')
  @ApiZodQuery(detailQuery)
  detail(@Param('placeId', placeIdPipe) placeId: string, @Query(new ZodPipe(detailQuery)) q: z.infer<typeof detailQuery>) {
    const center = q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : null;
    return this.places.detail(placeId, center);
  }
}
