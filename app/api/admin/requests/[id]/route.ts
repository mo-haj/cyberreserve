import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { NO_STORE, sameOrigin } from '@/lib/http';
import { approveRequest, declineRequest } from '@/lib/join';

// Site admin: approve (creates the hidden arena, requester = owner) or decline a join request.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve') }),
  z.object({ decision: z.literal('decline'), reason: z.string().max(300).default('') }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE });
  const user = await getCurrentUser();
  if (!user?.superAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE });
  const { id } = await params;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!/^[0-9a-f-]{36}$/.test(id) || !body.success) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: NO_STORE });
  if (body.data.decision === 'approve') {
    const r = await approveRequest(user.id, id);
    return r.ok ? NextResponse.json(r, { headers: NO_STORE }) : NextResponse.json({ error: r.error }, { status: 404, headers: NO_STORE });
  }
  return (await declineRequest(user.id, id, body.data.reason))
    ? NextResponse.json({ ok: true }, { headers: NO_STORE })
    : NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
}
