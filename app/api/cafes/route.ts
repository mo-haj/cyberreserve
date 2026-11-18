import { listArenasResponse } from '@/lib/api/arenas';

// Old address kept for compatibility; same as /api/arenas.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET() {
  return listArenasResponse();
}
