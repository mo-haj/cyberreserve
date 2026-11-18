import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public. Used by the Docker healthcheck and uptime monitors.
// Always does a real database round-trip — never cached.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', db: 'connected' }, { headers: NO_STORE });
  } catch (err) {
    // Log the reason server-side; never leak connection details to the client.
    console.error('[health] database check failed:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { status: 'error', db: 'disconnected' },
      { status: 503, headers: NO_STORE },
    );
  }
}
