import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { joinTournament } from '@/lib/engage';
import { NO_STORE, sameOrigin } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { now } from '@/lib/time';

// A signed-in player signs up for (or leaves) an arena's tournament.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'signed_out' }, { status: 401, headers: NO_STORE });
  if (!user.profileComplete) return NextResponse.json({ error: 'profile' }, { status: 403, headers: NO_STORE });
  if (!rateLimit(`tournament:${user.id}`, 10, 60_000, now().getTime())) return NextResponse.json({ error: 'too_many' }, { status: 429, headers: NO_STORE });
  const { id } = await params;
  const body = z.object({ on: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!/^[0-9a-f-]{36}$/.test(id) || !body.success) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: NO_STORE });
  const r = await joinTournament(user.id, id, body.data.on);
  return r === 'ok' ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : NextResponse.json({ error: r }, { status: r === 'not_found' ? 404 : 409, headers: NO_STORE });
}
