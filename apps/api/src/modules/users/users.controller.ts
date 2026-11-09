import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { z } from 'zod';
import { deleteAccountSchema, paginationSchema, updateMeSchema } from '@mam/validation';
import { AuthUser, CurrentUser, Public } from '../../common/auth.decorators';
import { ApiZodBody, ZodPipe } from '../../common/zod';
import { ReviewsService } from '../reviews/reviews.service';
import { TokenService } from '../auth/token.service';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly reviews: ReviewsService,
    private readonly tokens: TokenService,
  ) {}

  @Get('me')
  me(@CurrentUser() u: AuthUser) {
    return this.users.me(u.id);
  }

  @Patch('me')
  @ApiZodBody(updateMeSchema)
  updateMe(@CurrentUser() u: AuthUser, @Body(new ZodPipe(updateMeSchema)) b: z.infer<typeof updateMeSchema>) {
    return this.users.updateMe(u.id, b);
  }

  @Delete('me')
  @HttpCode(204)
  @ApiOperation({ summary: 'Permanently delete (anonymize) the account. Body: {"confirm":"HAPUS AKUN SAYA"}' })
  @ApiZodBody(deleteAccountSchema)
  async deleteMe(@CurrentUser() u: AuthUser, @Body(new ZodPipe(deleteAccountSchema)) _b: unknown, @Res({ passthrough: true }) res: Response) {
    await this.users.deleteAccount(u.id);
    this.tokens.clearAuthCookies(res);
  }

  @Get('me/search-history')
  history(@CurrentUser() u: AuthUser) {
    return this.users.searchHistory(u.id);
  }

  @Delete('me/search-history')
  @HttpCode(204)
  clearHistory(@CurrentUser() u: AuthUser) {
    return this.users.clearSearchHistory(u.id);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Public profile by user ID or username' })
  profile(@Param('id') id: string) {
    return this.users.publicProfile(id);
  }

  @Public()
  @Get(':id/reviews')
  async userReviews(
    @Param('id') id: string,
    @Query(new ZodPipe(paginationSchema)) q: z.infer<typeof paginationSchema>,
    @CurrentUser() viewer?: AuthUser,
  ) {
    const userId = await this.users.resolveUserId(id);
    return this.reviews.listByUser(userId, q.page, q.pageSize, viewer?.id);
  }
}
