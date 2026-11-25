import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 1. Signed-in pages (profile, dashboard): a visitor with no session cookie at
//    all goes straight to sign-in (a clean redirect before any page work).
//    The pages and APIs themselves still check the session and the rights
//    (arena member or super admin), so a fake cookie gets nothing.
// 2. admin.<domain> is not used: one domain means one sign-in, so an admin
//    can also book for themselves or a friend without signing in twice.
//    Any admin.<domain> address moves (308) to the same page on <domain>,
//    and its root to <domain>/admin.

export const config = {
  // Every page and API, not static files (admin.<domain> must move as a whole).
  matcher: ['/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)'],
};

const SIGNED_IN = /^\/(admin|manage|profile)(\/|$)/;

function visitorHost(request: NextRequest): string {
  // The visitor's Host (Docker's or Vercel's internal name would be wrong).
  return request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? request.nextUrl.host;
}

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const host = visitorHost(request);

  if (host.toLowerCase().startsWith('admin.')) {
    const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '');
    const to = new URL(`${proto}://${host.slice('admin.'.length)}${path === '/' ? '/admin' : path}${request.nextUrl.search}`);
    return NextResponse.redirect(to, 308);
  }

  if (!SIGNED_IN.test(path)) return NextResponse.next();

  if (request.cookies.get('cr_session')?.value) return NextResponse.next();
  const next = path.startsWith('/manage') ? path.replace(/^\/manage/, '/admin') : path;
  // Same host the request came in on (Next needs an absolute URL here; a
  // relative Location makes it throw and answer 500).
  const login = request.nextUrl.clone();
  login.pathname = '/login';
  login.search = `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(login, 307);
}
