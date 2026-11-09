import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  googleIdTokenSchema,
  loginSchema,
  mfaResendSchema,
  mfaVerifySchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@mam/validation';
import { env } from '../../config/env';
import { AuthUser, ClientMeta, ClientMetaInfo, CurrentUser, Public, SkipCsrf } from '../../common/auth.decorators';
import { CacheService } from '../../common/cache.service';
import { REFRESH_COOKIE } from '../../common/guards';
import { ApiZodBody, ZodPipe } from '../../common/zod';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { GoogleIdentityService } from './google-identity.service';
import { MfaService } from './mfa.service';
import { EmailLinksService } from './email-links.service';
import { TokenService } from './token.service';

const OAUTH_COOKIE = 'mam_oauth';
const startQuery = z.object({
  app: z.enum(['web', 'admin']).default('web'),
  // Only same-site relative paths are accepted (open-redirect protection).
  returnTo: z
    .string()
    .max(300)
    .regex(/^\/(?!\/)[^\s\\]*$/)
    .default('/'),
});
const callbackQuery = z.object({
  code: z.string().max(2000).optional(),
  state: z.string().max(200).optional(),
  error: z.string().max(200).optional(),
});
const devLoginSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(60).optional(),
  role: z.enum(['USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN']).optional(),
  client: z.enum(['WEB', 'ADMIN', 'ANDROID']).default('WEB'),
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger('AuthController');
  constructor(
    private readonly google: GoogleIdentityService,
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    private readonly cache: CacheService,
    private readonly mfa: MfaService,
    private readonly links: EmailLinksService,
  ) {}

  @Public()
  @Get('providers')
  @ApiOperation({ summary: 'Which login methods are configured on this server' })
  providers() {
    return { google: this.google.isConfigured(), password: true, devLogin: env().DEV_LOGIN_ENABLED && env().NODE_ENV !== 'production' };
  }

  // ───────────── Email + password (works without Google) ─────────────
  /** Web/admin get httpOnly session cookies; Android gets tokens in the body (same as Google login). */
  private async startSession(user: { id: string; role: string }, client: 'WEB' | 'ADMIN' | 'ANDROID', res: Response, meta: ClientMetaInfo) {
    if (client === 'ADMIN' && user.role === 'USER') throw new ForbiddenException('Akun ini tidak memiliki akses admin.');
    const t = await this.tokens.issue(user.id, client, meta);
    if (client === 'ANDROID') return { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.expiresIn, user: await this.users.me(user.id) };
    this.tokens.setAuthCookies(res, t);
    return { ok: true, user: await this.users.me(user.id) };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @HttpCode(201)
  @ApiZodBody(registerSchema)
  @ApiOperation({ summary: 'Create an account with email + password and start a session' })
  async register(@Body(new ZodPipe(registerSchema)) b: z.infer<typeof registerSchema>, @Res({ passthrough: true }) res: Response, @ClientMeta() meta: ClientMetaInfo) {
    if (b.client === 'ADMIN') throw new ForbiddenException('Akun admin tidak dapat didaftarkan dari dasbor admin.');
    const user = await this.auth.registerWithPassword(b);
    // The account works right away; writing reviews/adding places needs the verified address.
    await this.links.sendVerification({ ...user, profile: { displayName: b.displayName } }).catch((e) => this.logger.error(`verification mail failed: ${(e as Error).message}`));
    return this.startSession(user, b.client, res, meta);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiZodBody(loginSchema)
  @ApiOperation({ summary: 'Log in with email + password. Generic error on wrong email or password; temporary lock after repeated failures.' })
  async login(@Body(new ZodPipe(loginSchema)) b: z.infer<typeof loginSchema>, @Res({ passthrough: true }) res: Response, @ClientMeta() meta: ClientMetaInfo) {
    const user = await this.auth.loginWithPassword(b.email, b.password);
    if (b.client === 'ADMIN' && user.role === 'USER') throw new ForbiddenException('Akun ini tidak memiliki akses admin.');
    // Staff accounts: second factor — a one-time code e-mailed to the account address.
    if (this.mfa.requiredFor(user.role)) return this.mfa.start(user, b.client);
    return this.startSession(user, b.client, res, meta);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('mfa/verify')
  @HttpCode(200)
  @ApiZodBody(mfaVerifySchema)
  @ApiOperation({ summary: 'Second login step for staff: the 6-digit code sent by e-mail' })
  async mfaVerify(@Body(new ZodPipe(mfaVerifySchema)) b: z.infer<typeof mfaVerifySchema>, @Res({ passthrough: true }) res: Response, @ClientMeta() meta: ClientMetaInfo) {
    const { userId, client } = await this.mfa.verify(b.challengeId, b.code);
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'ACTIVE') throw new ForbiddenException('Akun tidak aktif.');
    return this.startSession(user, client, res, meta);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('mfa/resend')
  @HttpCode(200)
  @ApiZodBody(mfaResendSchema)
  @ApiOperation({ summary: 'Send a new MFA code (at most every 30 seconds)' })
  mfaResend(@Body(new ZodPipe(mfaResendSchema)) b: z.infer<typeof mfaResendSchema>) {
    return this.mfa.resend(b.challengeId);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-email')
  @HttpCode(200)
  @ApiZodBody(verifyEmailSchema)
  @ApiOperation({ summary: 'Confirm the e-mail address with the link token (single use, 48 h)' })
  verifyEmail(@Body(new ZodPipe(verifyEmailSchema)) b: z.infer<typeof verifyEmailSchema>) {
    return this.links.verifyEmail(b.token);
  }

  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  @Post('resend-verification')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send the verification e-mail again (logged-in user)' })
  resendVerification(@CurrentUser() user: AuthUser) {
    return this.links.resendVerification(user.id);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @Post('forgot-password')
  @HttpCode(200)
  @ApiZodBody(forgotPasswordSchema)
  @ApiOperation({ summary: 'E-mail a password reset link. Always answers ok (no account enumeration).' })
  forgotPassword(@Body(new ZodPipe(forgotPasswordSchema)) b: z.infer<typeof forgotPasswordSchema>) {
    return this.links.forgotPassword(b.email);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @Post('reset-password')
  @HttpCode(200)
  @ApiZodBody(resetPasswordSchema)
  @ApiOperation({ summary: 'Set a new password with the reset link token (single use, 1 h); signs out all devices' })
  resetPassword(@Body(new ZodPipe(resetPasswordSchema)) b: z.infer<typeof resetPasswordSchema>) {
    return this.links.resetPassword(b.token, b.newPassword);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password')
  @HttpCode(204)
  @ApiZodBody(changePasswordSchema)
  @ApiOperation({ summary: 'Set or change the password of the current account (current password required if one exists)' })
  async changePassword(@CurrentUser() user: AuthUser, @Body(new ZodPipe(changePasswordSchema)) b: z.infer<typeof changePasswordSchema>) {
    await this.auth.changePassword(user.id, b.currentPassword, b.newPassword);
  }

  // ───────────── Web/Admin: server-side authorization code flow with PKCE ─────────────
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('google/start')
  @ApiOperation({ summary: 'Begin Google OAuth (web/admin). Redirects to Google.' })
  start(@Query(new ZodPipe(startQuery)) q: z.infer<typeof startQuery>, @Res() res: Response) {
    const r = this.google.createAuthRequest(q.app);
    res.cookie(OAUTH_COOKIE, JSON.stringify({ s: r.state, n: r.nonce, v: r.codeVerifier, a: q.app, r: q.returnTo }), {
      httpOnly: true,
      signed: true,
      sameSite: 'lax', // must survive the top-level redirect back from accounts.google.com
      secure: env().COOKIE_SECURE ?? env().NODE_ENV === 'production',
      path: '/api/v1/auth/google',
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(302, r.url);
  }

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('google/callback')
  @ApiOperation({ summary: 'Google OAuth redirect target. Verifies state, PKCE and nonce, then sets session cookies.' })
  async callback(
    @Query(new ZodPipe(callbackQuery)) q: z.infer<typeof callbackQuery>,
    @Req() req: Request,
    @Res() res: Response,
    @ClientMeta() meta: ClientMetaInfo,
  ) {
    const raw = req.signedCookies?.[OAUTH_COOKIE] as string | false | undefined;
    res.clearCookie(OAUTH_COOKIE, { path: '/api/v1/auth/google' });
    let saved: { s: string; n: string; v: string; a: 'web' | 'admin'; r: string } | null = null;
    try {
      saved = raw ? JSON.parse(raw) : null;
    } catch {
      saved = null;
    }
    const app = saved?.a ?? 'web';
    const base = app === 'admin' ? env().ADMIN_PUBLIC_URL : env().WEB_PUBLIC_URL;
    const fail = (code: string) => res.redirect(302, `${base}/masuk?error=${encodeURIComponent(code)}`);

    if (q.error) return fail('google_denied');
    if (!saved || !q.state || !q.code || saved.s !== q.state) return fail('invalid_state');
    try {
      const identity = await this.google.exchangeCode(q.code, saved.v, app, saved.n);
      const user = await this.auth.findOrCreateFromGoogle(identity);
      if (app === 'admin' && user.role === 'USER') return fail('not_staff');
      const t = await this.tokens.issue(user.id, app === 'admin' ? 'ADMIN' : 'WEB', meta);
      this.tokens.setAuthCookies(res, t);
      return res.redirect(302, `${base}${saved.r}`);
    } catch (e) {
      this.logger.warn(`OAuth callback failed: ${(e as Error).message}`);
      if (e instanceof ForbiddenException) return fail('account_unavailable');
      return fail('login_failed');
    }
  }

  // ───────────── Android: native Credential Manager ID token ─────────────
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('nonce')
  @ApiOperation({ summary: 'Issue a single-use nonce for native Google sign-in (valid 5 minutes)' })
  async nonce() {
    const nonce = randomBytes(24).toString('base64url');
    await this.cache.set(`authnonce:${nonce}`, 1, 300);
    return { nonce, expiresIn: 300 };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('google')
  @HttpCode(200)
  @ApiZodBody(googleIdTokenSchema)
  @ApiOperation({ summary: 'Exchange a Google ID token (Android) for MAM! tokens' })
  async googleNative(@Body(new ZodPipe(googleIdTokenSchema)) b: z.infer<typeof googleIdTokenSchema>, @ClientMeta() meta: ClientMetaInfo) {
    const key = `authnonce:${b.nonce}`;
    if (!(await this.cache.get(key))) throw new UnauthorizedException('Nonce tidak valid atau kedaluwarsa.');
    await this.cache.del(key); // single use
    const identity = await this.google.verifyIdToken(b.idToken, b.nonce);
    const user = await this.auth.findOrCreateFromGoogle(identity);
    const t = await this.tokens.issue(user.id, 'ANDROID', meta);
    return { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.expiresIn, user: await this.users.me(user.id) };
  }

  // ───────────── Session lifecycle ─────────────
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  @ApiZodBody(refreshSchema)
  @ApiOperation({ summary: 'Rotate refresh token. Web: cookie. Android: refreshToken in body.' })
  async refresh(
    @Body(new ZodPipe(refreshSchema)) b: z.infer<typeof refreshSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @ClientMeta() meta: ClientMetaInfo,
  ) {
    const fromCookie = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const token = b.refreshToken ?? fromCookie;
    if (!token) throw new UnauthorizedException('Refresh token tidak ada.');
    try {
      const t = await this.tokens.rotate(token, meta);
      if (!b.refreshToken) {
        this.tokens.setAuthCookies(res, t);
        return { ok: true, expiresIn: t.expiresIn };
      }
      return { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.expiresIn };
    } catch (e) {
      if (!b.refreshToken) this.tokens.clearAuthCookies(res);
      throw e;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(
    @Body(new ZodPipe(refreshSchema)) b: z.infer<typeof refreshSchema>,
    @CurrentUser() user: AuthUser | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (user) await this.tokens.revokeSession(user.sessionId, user.id);
    const rt = b.refreshToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined);
    if (rt) await this.tokens.revokeByRefreshToken(rt);
    this.tokens.clearAuthCookies(res);
  }

  @Post('logout-all')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke every session of the current user' })
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.tokens.revokeAllForUser(user.id);
    this.tokens.clearAuthCookies(res);
  }

  @Get('me')
  @ApiOperation({ summary: 'Current authenticated user' })
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.id);
  }

  // ───────────── Development only ─────────────
  @Public()
  @Post('dev-login')
  @HttpCode(200)
  @ApiOperation({ summary: 'DEVELOPMENT ONLY: log in without Google. Disabled unless DEV_LOGIN_ENABLED=true and NODE_ENV!=production.' })
  async devLogin(
    @Body(new ZodPipe(devLoginSchema)) b: z.infer<typeof devLoginSchema>,
    @Res({ passthrough: true }) res: Response,
    @ClientMeta() meta: ClientMetaInfo,
  ) {
    if (!env().DEV_LOGIN_ENABLED || env().NODE_ENV === 'production') throw new NotFoundException();
    let user = await this.users.findByEmail(b.email);
    if (!user) {
      user = await this.auth.createUser({ email: b.email, emailVerified: true, displayName: b.displayName ?? b.email.split('@')[0], avatarUrl: null, role: b.role });
    } else if (b.role && user.role !== b.role) {
      user = await this.users.setRoleUnchecked(user.id, b.role);
    }
    if (user.status !== 'ACTIVE') throw new ForbiddenException('Akun tidak aktif.');
    const t = await this.tokens.issue(user.id, b.client, meta);
    if (b.client === 'ANDROID') return { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.expiresIn, user: await this.users.me(user.id) };
    this.tokens.setAuthCookies(res, t);
    return { ok: true, user: await this.users.me(user.id) };
  }
}
