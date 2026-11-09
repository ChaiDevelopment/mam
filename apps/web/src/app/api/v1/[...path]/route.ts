import type { NextRequest } from 'next/server';

/**
 * Runtime reverse proxy to the MAM! API (same-origin for the browser → first-party cookies, CSRF works).
 * Unlike next.config rewrites, the upstream URL is read at request time, so one build works in any environment.
 */
export const dynamic = 'force-dynamic';

const FORWARD_REQUEST_HEADERS = ['accept', 'authorization', 'content-type', 'cookie', 'user-agent', 'x-csrf-token', 'x-request-id', 'accept-language'];
const DROP_RESPONSE_HEADERS = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive']);

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const upstream = process.env.API_INTERNAL_URL || 'http://localhost:4000';
  const url = `${upstream}/api/v1/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
  const headers = new Headers();
  for (const h of FORWARD_REQUEST_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const fwd = req.headers.get('x-forwarded-for');
  headers.set('x-forwarded-for', fwd ?? (req.headers.get('x-real-ip') || '127.0.0.1'));
  headers.set('x-forwarded-host', req.headers.get('host') ?? '');
  headers.set('x-forwarded-proto', req.nextUrl.protocol.replace(':', ''));

  const hasBody = !['GET', 'HEAD'].includes(req.method);
  let res: Response;
  try {
    res = await fetch(url, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      redirect: 'manual',
      cache: 'no-store',
      // @ts-expect-error — required by Node fetch when streaming a request body
      duplex: hasBody ? 'half' : undefined,
    });
  } catch {
    return Response.json({ statusCode: 502, error: 'Bad Gateway', message: 'Server MAM! tidak dapat dihubungi. Coba lagi sebentar lagi.' }, { status: 502 });
  }
  const out = new Headers();
  res.headers.forEach((v, k) => {
    if (!DROP_RESPONSE_HEADERS.has(k) && k !== 'set-cookie') out.set(k, v);
  });
  for (const c of res.headers.getSetCookie()) out.append('set-cookie', c);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };
