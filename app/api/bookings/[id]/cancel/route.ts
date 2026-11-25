import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { cancelByPlayer } from '@/lib/booking/service';
import { NO_STORE, sameOrigin } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { now } from '@/lib/time';

// A player cancels their own booking, before it starts.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'signed_out' }, { status: 401, headers: NO_STORE });
  if (!rateLimit(`cancel-user:${user.id}`, 6, 60_000, now().getTime())) {
    return NextResponse.json({ error: 'too_many' }, { status: 429, headers: NO_STORE });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: NO_STORE });
  const ok = await cancelByPlayer(user.id, id);
  return ok
    ? NextResponse.json({ ok: true }, { headers: NO_STORE })
    : NextResponse.json({ error: 'too_late' }, { status: 409, headers: NO_STORE });
}
