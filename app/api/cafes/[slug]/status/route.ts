import { arenaStatusResponse } from '@/lib/api/arenas';

// Old address kept for compatibility; same as /api/arenas/<slug>/status.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  return arenaStatusResponse((await params).slug);
}
