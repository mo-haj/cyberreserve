import { arenaStatusResponse } from '@/lib/api/arenas';

// Public: live station grid for one arena. Polled every 5 seconds.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  return arenaStatusResponse((await params).slug);
}
