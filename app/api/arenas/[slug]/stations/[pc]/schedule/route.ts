import { NextResponse } from 'next/server';
import { stationSchedule } from '@/lib/booking/service';
import { NO_STORE } from '@/lib/http';
import { isPreview } from '@/lib/preview';

// Public: when one station is taken during the next 7 days (times only, no names).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; pc: string }> }) {
  const { slug, pc } = await params;
  const pcNumber = Number(pc);
  if (!/^[a-z0-9-]{1,60}$/.test(slug) || !Number.isInteger(pcNumber) || pcNumber < 1 || pcNumber > 999) {
    return NextResponse.json({ error: 'invalid' }, { status: 400, headers: NO_STORE });
  }
  if (isPreview()) return NextResponse.json({ taken: [] }, { headers: NO_STORE });
  const taken = await stationSchedule(slug, pcNumber);
  if (!taken) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  return NextResponse.json({ taken }, { headers: NO_STORE });
}
