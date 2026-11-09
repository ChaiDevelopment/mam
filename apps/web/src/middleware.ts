import { NextResponse, type NextRequest } from 'next/server';

/**
 * UX-level route protection: redirects visitors without a session cookie to the login page.
 * Real authorization is always enforced by the API — this only avoids rendering empty private pages.
 */
const PROTECTED = [/^\/profil(\/|$)/, /^\/koleksi$/, /^\/favorit/, /^\/notifikasi/, /^\/tempat\/[^/]+\/ulas/, /^\/tambah-tempat$/];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!PROTECTED.some((r) => r.test(pathname))) return NextResponse.next();
  const hasSession = req.cookies.has('mam_at') || req.cookies.has('mam_rt');
  if (hasSession) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/masuk';
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/profil/:path*', '/koleksi', '/favorit/:path*', '/notifikasi/:path*', '/tempat/:placeId/ulas', '/tambah-tempat'] };
