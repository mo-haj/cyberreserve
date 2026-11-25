import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { tick } from '@/lib/booking/service';
import { NO_STORE } from '@/lib/http';

// The minute job ("still coming?" reminders, cancelling unanswered bookings,
// closing finished ones) for hosts where the site cannot run a timer itself
// (Vercel). An outside scheduler such as cron-job.org calls this every minute
// with the CRON_SECRET from the settings in a header:
//   Authorization: Bearer <CRON_SECRET>
// Never in the link (?key=...): links end up in logs and browser history.
// Without CRON_SECRET set, or with a wrong one, this address does not exist (404).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function same(a: string | null, b: string): boolean {
  if (!a) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function run(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) return new NextResponse(null, { status: 404 });
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? null;
  if (!same(bearer, secret)) return new NextResponse(null, { status: 404 });
  const started = Date.now();
  await tick();
  return NextResponse.json({ ok: true, ms: Date.now() - started }, { headers: NO_STORE });
}

export const GET = run;
export const POST = run;
