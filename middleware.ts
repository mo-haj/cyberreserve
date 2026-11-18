import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Application-layer admin guard (defense in depth).
//
// Layer 1 is Cloudflare Access at the edge. This is layer 2: if the edge is
// ever misconfigured, admin paths are still closed by default.
//
// Phase 0 checks only that the Cf-Access-Jwt-Assertion header is PRESENT.
// It does not verify the JWT signature yet, so this is only safe when the
// origin is unreachable except through Cloudflare (see SECURITY.md).
// TODO (before Phase 2 ships): verify the signature against the team's JWKS.

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/profile', '/manage', '/manage/:path*'],
};

export function middleware(request: NextRequest) {
  // Profile and arena panel: no session cookie at all -> straight to sign-in (a clean 307,
  // before any page streaming). The page itself still checks the session.
  const path = request.nextUrl.pathname;
  if (path === '/profile' || path === '/manage' || path.startsWith('/manage/')) {
    if (request.cookies.get('cr_session')?.value) return NextResponse.next();
    // Build the address from the visitor's Host (Docker's internal name would be wrong).
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? request.nextUrl.host;
    const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '');
    return NextResponse.redirect(new URL(`${proto}://${host}/login?next=${encodeURIComponent(path)}`));
  }

  // Local development only. Must never be 'true' in production.
  if (process.env.SKIP_ACCESS_CHECK === 'true') {
    return NextResponse.next();
  }

  const assertion = request.headers.get('cf-access-jwt-assertion');
  if (assertion && assertion.trim() !== '') {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return new NextResponse('403 Forbidden', {
    status: 403,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
