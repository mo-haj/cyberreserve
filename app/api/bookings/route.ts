import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { CreateBookingInput } from '@/lib/booking/api';
import { bookAny, createBooking, listMyBookings } from '@/lib/booking/service';
import { NO_STORE, sameOrigin } from '@/lib/http';
import { getLocale } from '@/lib/locale';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { now } from '@/lib/time';

// Signed-in players: list their bookings (GET) and book a station (POST).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'signed_out' }, { status: 401, headers: NO_STORE });
  return NextResponse.json({ bookings: await listMyBookings(user.id) }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE });
  if (!rateLimit(`book:${clientIp(request.headers)}`, 10, 60_000, now().getTime())) {
    return NextResponse.json({ error: 'too_many' }, { status: 429, headers: NO_STORE });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'signed_out' }, { status: 401, headers: NO_STORE });
  const parsed = CreateBookingInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: NO_STORE });
  const { slug, pcNumber, pool, start, minutes } = parsed.data;
  if (!pcNumber && !pool) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: NO_STORE });
  try {
    const base = { userId: user.id, slug, minutes, start: start === 'now' ? ('now' as const) : new Date(start), lang: await getLocale() };
    const result = pcNumber
      ? { ...(await createBooking({ ...base, pcNumber })), pcNumber }
      : await bookAny({ ...base, type: pool!.type, groupId: pool!.groupId });
    if (!result.ok) {
      const status = result.error === 'taken' || result.error === 'has_active' || result.error === 'arena_banned' || result.error === 'arena_cancelled' ? 409 : result.error === 'not_found' ? 404 : 400;
      return NextResponse.json({ error: result.error, ...('detail' in result && result.detail ? { detail: result.detail } : {}) }, { status, headers: NO_STORE });
    }
    return NextResponse.json({ ...result.booking, pcNumber: result.pcNumber }, { status: 201, headers: NO_STORE });
  } catch (err) {
    console.error('[api/bookings] failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'generic' }, { status: 503, headers: NO_STORE });
  }
}
