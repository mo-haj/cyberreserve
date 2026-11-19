import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { NO_STORE, sameOrigin } from '@/lib/http';
import { NewArena } from '@/lib/manage/rules';
import { createArena } from '@/lib/manage/service';

// Super admin only: add a new arena. It starts hidden; the admin then adds
// its owner, stations and details on its dashboard page and publishes it.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE });
  const user = await getCurrentUser();
  // Same answer for "signed out" and "not the admin": nothing to learn here.
  if (!user?.superAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE });
  const parsed = NewArena.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', field: String(parsed.error.issues[0]?.path[0] ?? '') }, { status: 400, headers: NO_STORE });
  }
  const result = await createArena(parsed.data, user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409, headers: NO_STORE });
  return NextResponse.json({ ok: true, slug: result.slug }, { headers: NO_STORE });
}
