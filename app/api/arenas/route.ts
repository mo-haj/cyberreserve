import { listArenasResponse } from '@/lib/api/arenas';

// Public: all arenas with live free/busy counts. The home page polls ?live=1.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(request: Request) {
  return listArenasResponse(new URL(request.url).searchParams.get('live') === '1');
}
