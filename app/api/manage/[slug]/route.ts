import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { NO_STORE, sameOrigin } from '@/lib/http';
import { ManageAction } from '@/lib/manage/rules';
import { findPlayers, getManageData, getMembership, runAction } from '@/lib/manage/service';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { now } from '@/lib/time';
import { arenaActivity } from '@/lib/activity';
import { arenaStats } from '@/lib/engage';

// Arena dashboard API. Signed-in arena members reach only their own arena
// (staff only the live-floor actions); the super admin reaches every arena
// and alone may publish/hide it and choose its owners (see lib/manage).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SLUG = /^[a-z0-9-]{1,60}$/;

async function member(slug: string) {
  if (!SLUG.test(slug)) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const m = await getMembership(user, slug);
  return m ? { user, m } : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const found = await member((await params).slug);
  if (!found) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE });
  // ?activity=1: the activity tab (owners and the site admin only), loaded when opened.
  const q = new URL(request.url).searchParams;
  // ?players=<name or phone>: pick a player for a walk-in (staff too).
  if (q.has('players')) return NextResponse.json(await findPlayers(found.m.cafeId, q.get('players') ?? ''), { headers: NO_STORE });
  if (q.get('activity') === '1' || q.get('stats') === '1') {
    if (found.m.role !== 'OWNER' && !found.m.superAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE });
    return NextResponse.json(q.get('stats') === '1' ? await arenaStats(found.m.cafeId) : await arenaActivity(found.m.cafeId), { headers: NO_STORE });
  }
  return NextResponse.json(await getManageData(found.m.cafeId, { ...found.m, userId: found.user.id }), { headers: NO_STORE });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE });
  if (!rateLimit(`manage:${clientIp(request.headers)}`, 60, 60_000, now().getTime())) {
    return NextResponse.json({ error: 'too_many' }, { status: 429, headers: NO_STORE });
  }
  const found = await member((await params).slug);
  if (!found) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE });

  const parsed = ManageAction.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid', field: String(parsed.error.issues[0]?.path[0] ?? '') },
      { status: 400, headers: NO_STORE },
    );
  }
  try {
    const result = await runAction(found.m, found.user.id, parsed.data);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers: NO_STORE });
    // The arena is gone: nothing to reload, the panel leaves for /admin.
    if (parsed.data.action === 'deleteArena') return NextResponse.json({ ok: true, deleted: true }, { headers: NO_STORE });
    return NextResponse.json({ ok: true, data: await getManageData(found.m.cafeId, { ...found.m, userId: found.user.id }) }, { headers: NO_STORE });
  } catch (err) {
    console.error('[api/manage] failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'generic' }, { status: 503, headers: NO_STORE });
  }
}
