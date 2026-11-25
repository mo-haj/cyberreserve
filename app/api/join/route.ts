import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { NO_STORE, sameOrigin } from '@/lib/http';
import { JoinInput, submitRequest } from '@/lib/join';
import { rateLimit } from '@/lib/rate-limit';
import { now } from '@/lib/time';

// An arena owner asks to join the site. Signed-in (Telegram), profile complete.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'signed_out' }, { status: 401, headers: NO_STORE });
  if (!user.profileComplete) return NextResponse.json({ error: 'profile' }, { status: 403, headers: NO_STORE });
  if (!rateLimit(`join:${user.id}`, 3, 60 * 60_000, now().getTime())) return NextResponse.json({ error: 'too_many' }, { status: 429, headers: NO_STORE });
  const parsed = JoinInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid', field: String(parsed.error.issues[0]?.path[0] ?? '') }, { status: 400, headers: NO_STORE });
  const r = await submitRequest(user.id, parsed.data);
  return r === 'ok' ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : NextResponse.json({ error: r }, { status: 409, headers: NO_STORE });
}
