import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { endSession, SESSION_COOKIE } from '@/lib/auth/session';
import { safeNextPath } from '@/lib/safe-redirect';

// Signs out the current browser. Submitted by the header's sign-out form (POST),
// then returns to the page the visitor was on.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const next = safeNextPath(typeof form?.get('next') === 'string' ? (form?.get('next') as string) : '/');
  try {
    await endSession((await cookies()).get(SESSION_COOKIE)?.value);
  } catch (err) {
    console.error('[auth/logout] failed:', err instanceof Error ? err.message : err);
  }
  const response = new NextResponse(null, { status: 303, headers: { Location: next } });
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
