import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CsrfGuard, RolesGuard } from './guards';

function ctx(req: Record<string, unknown>) {
  return { switchToHttp: () => ({ getRequest: () => ({ header: (n: string) => (req.headers as Record<string, string>)?.[n.toLowerCase()], ...req }) }), getHandler: () => null, getClass: () => null } as never;
}

describe('CsrfGuard', () => {
  const guard = new CsrfGuard({ getAllAndOverride: () => false } as unknown as Reflector);

  it('allows safe methods', () => {
    expect(guard.canActivate(ctx({ method: 'GET', cookies: { mam_at: 'x' }, headers: {} }))).toBe(true);
  });
  it('allows bearer clients (no ambient credentials)', () => {
    expect(guard.canActivate(ctx({ method: 'POST', cookies: {}, headers: { authorization: 'Bearer abc' } }))).toBe(true);
  });
  it('rejects cookie-authenticated writes without a matching token', () => {
    expect(() => guard.canActivate(ctx({ method: 'POST', cookies: { mam_at: 'x', mam_csrf: 'token123' }, headers: {} }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx({ method: 'POST', cookies: { mam_at: 'x', mam_csrf: 'token123' }, headers: { 'x-csrf-token': 'token124' } }))).toThrow(ForbiddenException);
  });
  it('accepts a matching double-submit token', () => {
    expect(guard.canActivate(ctx({ method: 'DELETE', cookies: { mam_at: 'x', mam_csrf: 'token123' }, headers: { 'x-csrf-token': 'token123' } }))).toBe(true);
  });
});

describe('RolesGuard', () => {
  const guardFor = (min: string | undefined) => new RolesGuard({ getAllAndOverride: () => min } as unknown as Reflector);
  it('passes when no role is required', () => {
    expect(guardFor(undefined).canActivate(ctx({ user: { role: 'USER' } }))).toBe(true);
  });
  it('enforces hierarchy', () => {
    expect(() => guardFor('MODERATOR').canActivate(ctx({ user: { role: 'USER' } }))).toThrow(ForbiddenException);
    expect(guardFor('MODERATOR').canActivate(ctx({ user: { role: 'ADMIN' } }))).toBe(true);
    expect(() => guardFor('SUPER_ADMIN').canActivate(ctx({ user: { role: 'ADMIN' } }))).toThrow(ForbiddenException);
  });
});
