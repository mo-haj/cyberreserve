import { NextResponse } from 'next/server';
import { poolSchedule } from '@/lib/booking/service';
import { NO_STORE } from '@/lib/http';
import { isPreview } from '@/lib/preview';

// Public: when each station of one group (a zone, or a type without a zone)
// is taken during the next 7 days, for "book any free station".
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TYPES = new Set(['PC', 'PS5', 'PS4', 'XBOX']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? '';
  const group = url.searchParams.get('group') ?? '';
  if (!/^[a-z0-9-]{1,60}$/.test(slug) || !TYPES.has(type) || (group && !UUID.test(group))) {
    return NextResponse.json({ error: 'invalid' }, { status: 400, headers: NO_STORE });
  }
  if (isPreview()) return NextResponse.json({ stations: [], offers: [] }, { headers: NO_STORE });
  const schedule = await poolSchedule(slug, type, group || null);
  if (!schedule) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  return NextResponse.json(schedule, { headers: NO_STORE });
}
