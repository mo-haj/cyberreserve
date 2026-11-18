// Shared handlers for the public arena API. Mounted at /api/arenas and, for
// older links, at /api/cafes.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCafeLive, listCafes } from '@/lib/cafes';
import { now } from '@/lib/time';

const NO_STORE = { 'Cache-Control': 'no-store' };
const Slug = z.string().regex(/^[a-z0-9-]{1,60}$/);

/** `live` = only slug + counts: what the home page needs every 5 seconds (~0.3 KB instead of ~7 KB). */
export async function listArenasResponse(live = false) {
  try {
    const arenas = await listCafes();
    if (live) {
      return NextResponse.json(
        { at: now().toISOString(), arenas: arenas.map((a) => ({ slug: a.slug, counts: a.counts })) },
        { headers: NO_STORE },
      );
    }
    return NextResponse.json({ at: now().toISOString(), arenas }, { headers: NO_STORE });
  } catch (err) {
    console.error('[api/arenas] failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}

export async function arenaStatusResponse(rawSlug: string) {
  const parsed = Slug.safeParse(rawSlug);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid arena' }, { status: 400 });
  try {
    const live = await getCafeLive(parsed.data);
    if (!live) return NextResponse.json({ error: 'Arena not found' }, { status: 404 });
    return NextResponse.json(live, { headers: NO_STORE });
  } catch (err) {
    console.error('[api/arenas/status] failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
