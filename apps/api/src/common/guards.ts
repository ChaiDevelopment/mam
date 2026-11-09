import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Role, UserStatus } from '@prisma/client';
import type { Request } from 'express';
import { timingSafeEqual } from 'crypto';
import { ROLE_RANK } from '@mam/shared-types';
import { env } from '../config/env';
import { AuthUser, IS_PUBLIC, MIN_ROLE, SKIP_CSRF } from './auth.decorators';
import { CacheService } from './cache.service';
import { PrismaService } from './prisma.service';

export const ACCESS_COOKIE = 'mam_at';
export const REFRESH_COOKIE = 'mam_rt';
export const CSRF_COOKIE = 'mam_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
}

type Req = Request & { user?: AuthUser };

/**
 * Global authentication guard. Accepts a Bearer token (Android) or the httpOnly access cookie (web/admin).
 * The user's role and status are always loaded from the database (cached ≤ 30 s), never trusted from the token.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Req>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const user = await this.authenticate(req).catch((e) => {
      if (isPublic) return undefined;
      throw e;
    });
    if (user) req.user = user;
    if (!user && !isPublic) throw new UnauthorizedException('Silakan masuk terlebih dahulu.');
    return true;
  }

  private async authenticate(req: Req): Promise<AuthUser | undefined> {
    const header = req.headers.authorization;
    let token: string | undefined;
    let via: AuthUser['via'] = 'cookie';
    if (header?.startsWith('Bearer ')) {
      token = header.slice(7).trim();
      via = 'bearer';
    } else {
      token = req.cookies?.[ACCESS_COOKIE];
    }
    if (!token) return undefined;
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: env().JWT_ACCESS_SECRET,
        issuer: 'mam-api',
        audience: 'mam',
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Sesi kamu telah berakhir. Silakan masuk kembali.');
    }
    const state = await this.loadUserState(payload.sub, payload.sid);
    if (!state || !state.sessionActive) throw new UnauthorizedException('Sesi tidak valid.');
    if (state.status !== 'ACTIVE') throw new ForbiddenException(state.status === 'SUSPENDED' ? 'Akun kamu sedang ditangguhkan.' : 'Akun tidak aktif.');
    return { id: payload.sub, role: state.role, sessionId: payload.sid, via };
  }

  private async loadUserState(userId: string, sessionId: string) {
    const key = `authstate:${userId}:${sessionId}`;
    const cached = await this.cache.get<{ role: Role; status: UserStatus; sessionActive: boolean }>(key);
    if (cached) return cached;
    const [user, session] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, status: true, lastActiveAt: true } }),
      this.prisma.session.findUnique({ where: { id: sessionId }, select: { revokedAt: true, expiresAt: true, userId: true } }),
    ]);
    if (!user) return null;
    const sessionActive = !!session && session.userId === userId && !session.revokedAt && session.expiresAt > new Date();
    const state = { role: user.role, status: user.status, sessionActive };
    await this.cache.set(key, state, 30);
    if (!user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > 10 * 60 * 1000) {
      this.prisma.user.update({ where: { id: userId }, data: { lastActiveAt: new Date() } }).catch(() => undefined);
    }
    return state;
  }
}

/** Hierarchical role check. Runs after AuthGuard, using the DB-sourced role. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const min = this.reflector.getAllAndOverride<Role | undefined>(MIN_ROLE, [ctx.getHandler(), ctx.getClass()]);
    if (!min) return true;
    const user = ctx.switchToHttp().getRequest<Req>().user;
    if (!user) throw new UnauthorizedException('Silakan masuk terlebih dahulu.');
    if (ROLE_RANK[user.role] < ROLE_RANK[min]) throw new ForbiddenException('Kamu tidak memiliki akses ke fitur ini.');
    return true;
  }
}

/**
 * Double-submit CSRF protection for cookie-authenticated, state-changing requests.
 * Bearer-token clients (Android) carry no ambient credentials and are exempt.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Req>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    if (this.reflector.getAllAndOverride<boolean>(SKIP_CSRF, [ctx.getHandler(), ctx.getClass()])) return true;
    const hasAmbientAuth = !!(req.cookies?.[ACCESS_COOKIE] || req.cookies?.[REFRESH_COOKIE]);
    const usesBearer = req.headers.authorization?.startsWith('Bearer ');
    if (!hasAmbientAuth || usesBearer) return true;
    const cookie = req.cookies?.[CSRF_COOKIE] as string | undefined;
    const header = req.header(CSRF_HEADER);
    if (!cookie || !header || cookie.length !== header.length || !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
      throw new ForbiddenException('Token CSRF tidak valid. Muat ulang halaman lalu coba lagi.');
    }
    return true;
  }
}
