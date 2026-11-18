import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LOCALE_COOKIE } from '@/lib/i18n';
import { safeNextPath } from '@/lib/safe-redirect';

// Public: switches the interface language, then returns to the page the visitor was on.
// GET /api/lang?to=en&next=/arenas/mezzeh-arena
export const dynamic = 'force-dynamic';

const Query = z.object({
  to: z.enum(['ar', 'en']),
  next: z.string().max(512).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid language' }, { status: 400 });
  }
  // Relative redirect: works the same behind the Cloudflare tunnel and on localhost.
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: safeNextPath(parsed.data.next) },
  });
  response.cookies.set(LOCALE_COOKIE, parsed.data.to, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: false,
  });
  return response;
}
