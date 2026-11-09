import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { SessionClient } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'crypto';
import type { CookieOptions, Response } from 'express';
import { env } from '../../config/env';
import { CacheService } from '../../common/cache.service';
import { ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE } from '../../common/guards';
import { PrismaService } from '../../common/prisma.service';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  sessionId: string;
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Access tokens: short-lived HS256 JWTs. Refresh tokens: 256-bit random strings, stored hashed,
 * rotated on each use. Re-use of a rotated refresh token revokes the whole session family.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async issue(userId: string, client: SessionClient, meta: { ip: string | null; userAgent: string | null }, familyId: string = randomUUID()): Promise<IssuedTokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    const session = await this.prisma.session.create({
      data: {
        userId,
        client,
        familyId,
        refreshTokenHash: sha256(refreshToken),
        ip: meta.ip,
        userAgent: meta.userAgent,
        expiresAt: new Date(Date.now() + env().REFRESH_TTL_DAYS * 86400_000),
      },
    });
    const accessToken = await this.signAccess(userId, session.id);
    return { accessToken, refreshToken, expiresIn: env().JWT_ACCESS_TTL_SECONDS, sessionId: session.id };
  }

  signAccess(userId: string, sessionId: string) {
    return this.jwt.signAsync(
      { sub: userId, sid: sessionId },
      { secret: env().JWT_ACCESS_SECRET, expiresIn: env().JWT_ACCESS_TTL_SECONDS, issuer: 'mam-api', audience: 'mam', algorithm: 'HS256' },
    );
  }

  async rotate(refreshToken: string, meta: { ip: string | null; userAgent: string | null }): Promise<IssuedTokens & { userId: string; client: SessionClient }> {
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: sha256(refreshToken) } });
    if (!session) throw new UnauthorizedException('Sesi tidak ditemukan. Silakan masuk kembali.');
    if (session.revokedAt) {
      // Token re-use: someone replayed an already-rotated refresh token. Kill the entire family.
      await this.revokeFamily(session.familyId);
      throw new UnauthorizedException('Sesi tidak valid. Silakan masuk kembali.');
    }
    if (session.expiresAt < new Date()) throw new UnauthorizedException('Sesi telah berakhir. Silakan masuk kembali.');
    const user = await this.prisma.user.findUnique({ where: { id: session.userId }, select: { status: true } });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Akun tidak aktif.');

    const claimed = await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });
    if (claimed.count === 0) throw new UnauthorizedException('Sesi sedang diperbarui. Coba lagi.');
    await this.cache.del(`authstate:${session.userId}:${session.id}`);
    const tokens = await this.issue(session.userId, session.client, meta, session.familyId);
    return { ...tokens, userId: session.userId, client: session.client };
  }

  async revokeSession(sessionId: string, userId: string) {
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.cache.del(`authstate:${userId}:${sessionId}`);
  }

  async revokeByRefreshToken(refreshToken: string) {
    const s = await this.prisma.session.findUnique({ where: { refreshTokenHash: sha256(refreshToken) } });
    if (s) await this.revokeSession(s.id, s.userId);
  }

  async revokeFamily(familyId: string) {
    const sessions = await this.prisma.session.findMany({ where: { familyId }, select: { id: true, userId: true } });
    await this.prisma.session.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.cache.del(...sessions.map((s) => `authstate:${s.userId}:${s.id}`));
  }

  async revokeAllForUser(userId: string) {
    const sessions = await this.prisma.session.findMany({ where: { userId, revokedAt: null }, select: { id: true } });
    await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.cache.del(...sessions.map((s) => `authstate:${userId}:${s.id}`));
  }

  // ───────────── Cookies (web/admin) ─────────────
  private cookieBase(): CookieOptions {
    const e = env();
    return {
      secure: e.COOKIE_SECURE ?? e.NODE_ENV === 'production',
      sameSite: 'lax',
      domain: e.COOKIE_DOMAIN || undefined,
    };
  }

  setAuthCookies(res: Response, t: IssuedTokens) {
    const base = this.cookieBase();
    res.cookie(ACCESS_COOKIE, t.accessToken, { ...base, httpOnly: true, path: '/', maxAge: t.expiresIn * 1000 });
    res.cookie(REFRESH_COOKIE, t.refreshToken, { ...base, httpOnly: true, path: '/api/v1/auth', maxAge: env().REFRESH_TTL_DAYS * 86400_000 });
    // Readable by JS on purpose: double-submit CSRF token.
    res.cookie(CSRF_COOKIE, randomBytes(24).toString('base64url'), { ...base, httpOnly: false, path: '/', maxAge: env().REFRESH_TTL_DAYS * 86400_000 });
  }

  clearAuthCookies(res: Response) {
    const base = this.cookieBase();
    res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
    res.clearCookie(REFRESH_COOKIE, { ...base, path: '/api/v1/auth' });
    res.clearCookie(CSRF_COOKIE, { ...base, path: '/' });
  }
}
