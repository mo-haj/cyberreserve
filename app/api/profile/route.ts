import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CITY_COOKIE, cityCookieOptions } from '@/lib/cities';
import { nicknameKey, ProfileInput } from '@/lib/profile';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { NO_STORE, sameOrigin } from '@/lib/http';
import { now } from '@/lib/time';

// Signed-in player saves their full name and player name (and, the first
// time, accepts the terms). Same-origin only.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE });
  if (!rateLimit(`profile:${clientIp(request.headers)}`, 20, 60_000, now().getTime())) {
    return NextResponse.json({ error: 'too_many' }, { status: 429, headers: NO_STORE });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'signed_out' }, { status: 401, headers: NO_STORE });

  const parsed = ProfileInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return NextResponse.json(
      { error: field === 'nickname' || field === 'fullName' || field === 'homeCity' ? field : 'invalid' },
      { status: 400, headers: NO_STORE },
    );
  }
  const { fullName, nickname, homeCity, acceptTerms } = parsed.data;

  try {
    const current = await prisma.user.findUnique({ where: { id: user.id }, select: { termsAcceptedAt: true } });
    if (!current) return NextResponse.json({ error: 'signed_out' }, { status: 401, headers: NO_STORE });
    if (!current.termsAcceptedAt && acceptTerms !== true) {
      return NextResponse.json({ error: 'terms' }, { status: 400, headers: NO_STORE });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        fullName,
        nickname,
        nicknameKey: nicknameKey(nickname),
        homeCity,
        ...(current.termsAcceptedAt ? {} : { termsAcceptedAt: now() }),
      },
    });
    const response = NextResponse.json({ ok: true }, { headers: NO_STORE });
    // The home page opens on the player's city from now on (they can still pick another).
    response.cookies.set(CITY_COOKIE, homeCity, cityCookieOptions());
    return response;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'nicknameTaken' }, { status: 409, headers: NO_STORE });
    }
    console.error('[api/profile] failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'generic' }, { status: 503, headers: NO_STORE });
  }
}
