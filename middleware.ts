import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 1. Signed-in pages (profile, dashboard): a visitor with no session cookie at
//    all goes straight to sign-in (a clean redirect before any page work).
//    The pages and APIs themselves still check the session and the rights
//    (arena member or super admin), so a fake cookie gets nothing.
// 2. admin.<domain>: once the site has its own domain, the admin subdomain
//    opens the dashboard at its root (admin.example.com -> /admin).

export const config = {
  matcher: ['/', '/admin', '/admin/:path*', '/profile', '/manage', '/manage/:path*'],
};

function visitorHost(request: NextRequest): string {
  // The visitor's Host (Docker's or Vercel's internal name would be wrong).
  return request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? request.nextUrl.host;
}

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const host = visitorHost(request);

  if (path === '/') {
    if (!host.toLowerCase().startsWith('admin.')) return NextResponse.next();
    return NextResponse.rewrite(new URL('/admin', request.url));
  }

  if (request.cookies.get('cr_session')?.value) return NextResponse.next();
  const next = path.startsWith('/manage') ? path.replace(/^\/manage/, '/admin') : path;
  // Same host the request came in on (Next needs an absolute URL here; a
  // relative Location makes it throw and answer 500).
  const login = request.nextUrl.clone();
  login.pathname = '/login';
  login.search = `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(login, 307);
}
