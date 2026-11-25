import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { setFollow, unwatchFree, watchFree } from '@/lib/engage';
import { NO_STORE, sameOrigin } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { now } from '@/lib/time';

// A signed-in player follows / unfollows an arena, or asks to be told when a
// station frees up there.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.discriminatedUnion('what', [
  z.object({ what: z.literal('follow'), on: z.boolean() }),
  z.object({ what: z.literal('watch'), on: z.boolean(), type: z.enum(['', 'PC', 'PS5', 'PS4', 'XBOX']).default('') }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'signed_out' }, { status: 401, headers: NO_STORE });
  if (!rateLimit(`engage:${user.id}`, 20, 60_000, now().getTime())) return NextResponse.json({ error: 'too_many' }, { status: 429, headers: NO_STORE });
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: NO_STORE });
  const b = parsed.data;
  if (b.what === 'follow') {
    const r = await setFollow(user.id, slug, b.on);
    return r === 'ok' ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : NextResponse.json({ error: r }, { status: 404, headers: NO_STORE });
  }
  if (!b.on) {
    await unwatchFree(user.id, slug);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }
  const r = await watchFree(user.id, slug, b.type);
  return r === 'ok' ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : NextResponse.json({ error: r }, { status: r === 'not_found' ? 404 : 409, headers: NO_STORE });
}
