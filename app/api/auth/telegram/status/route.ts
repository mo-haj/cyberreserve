import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pollLoginRequest, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { now } from '@/lib/time';

// Public: the login page polls this every 2 seconds with its secret token.
// When Telegram has confirmed, it sets the session cookie.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({ token: z.string().min(1).max(100) });
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  if (!rateLimit(`login-status:${clientIp(request.headers)}`, 90, 60_000, now().getTime())) {
    return NextResponse.json({ status: 'too_many' }, { status: 429, headers: NO_STORE });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: NO_STORE });
  }
  try {
    const result = await pollLoginRequest(parsed.data.token);
    if (result.status !== 'signed_in') {
      return NextResponse.json({ status: result.status }, { headers: NO_STORE });
    }
    const response = NextResponse.json(
      { status: 'signed_in', needsProfile: !result.profileComplete },
      { headers: NO_STORE },
    );
    response.cookies.set(SESSION_COOKIE, result.sessionToken, sessionCookieOptions(request, result.sessionExpires));
    return response;
  } catch (err) {
    console.error('[auth/status] failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ status: 'error' }, { status: 503, headers: NO_STORE });
  }
}
