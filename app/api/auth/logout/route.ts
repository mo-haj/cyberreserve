import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { endSession, SESSION_COOKIE } from '@/lib/auth/session';
import { safeNextPath } from '@/lib/safe-redirect';
import { sameOrigin } from '@/lib/http';

// Signs out the current browser. Submitted by the header's sign-out form (POST),
// then returns to the page the visitor was on.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  // Other websites cannot sign a visitor out.
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const form = await request.formData().catch(() => null);
  const next = safeNextPath(typeof form?.get('next') === 'string' ? (form?.get('next') as string) : '/');
  try {
    await endSession((await cookies()).get(SESSION_COOKIE)?.value);
  } catch (err) {
    console.error('[auth/logout] failed:', err instanceof Error ? err.message : err);
  }
  // Headers carry ASCII only: encode any other character of the (already safe) path.
  const location = next.replace(/[^\x21-\x7e]/g, (c) => encodeURIComponent(c));
  const response = new NextResponse(null, { status: 303, headers: { Location: location } });
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
