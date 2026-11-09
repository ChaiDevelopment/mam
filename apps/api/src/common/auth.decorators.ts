import { ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import type { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  role: Role;
  sessionId: string;
  via: 'cookie' | 'bearer';
}

export const IS_PUBLIC = 'mam:isPublic';
export const MIN_ROLE = 'mam:minRole';
export const SKIP_CSRF = 'mam:skipCsrf';

/** Route is reachable without authentication. If a valid token is present, req.user is still populated. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Minimum role (hierarchical: USER < MODERATOR < ADMIN < SUPER_ADMIN). Always verified server-side against the DB. */
export const MinRole = (role: Role) => SetMetadata(MIN_ROLE, role);
/** Only for endpoints that are not state-changing via ambient cookies (e.g. OAuth callback with its own state check). */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);

export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthUser | undefined => {
  return ctx.switchToHttp().getRequest().user;
});

export const ClientMeta = createParamDecorator((_d: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return { ip: (req.ip as string | undefined) ?? null, userAgent: (req.headers['user-agent'] as string | undefined)?.slice(0, 400) ?? null };
});
export type ClientMetaInfo = { ip: string | null; userAgent: string | null };
