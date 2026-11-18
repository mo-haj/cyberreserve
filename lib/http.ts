// Small helpers shared by the API routes that change data.

/** True when the request comes from a page of this same site (blocks cross-site form posts). */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const NO_STORE = { 'Cache-Control': 'no-store' };
