// Fixed-window rate limiter kept in memory. Good enough for one web container;
// if the site ever runs on several servers, move this to the database.

const buckets = new Map<string, { count: number; resetAt: number }>();
let lastSweep = 0;

export function rateLimit(key: string, limit: number, windowMs: number, nowMs: number): boolean {
  if (nowMs - lastSweep > 60_000) {
    for (const [k, b] of buckets) if (b.resetAt <= nowMs) buckets.delete(k);
    lastSweep = nowMs;
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= nowMs) {
    buckets.set(key, { count: 1, resetAt: nowMs + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/**
 * Visitor IP, from a header the visitor cannot forge where we run:
 * - Vercel sets x-real-ip / x-vercel-forwarded-for itself (a client value is replaced);
 * - Cloudflare's cf-connecting-ip only counts when BEHIND_CLOUDFLARE=1, because
 *   anywhere else a visitor can simply send that header;
 * - otherwise the LAST hop of x-forwarded-for: the one our own proxy (tunnel)
 *   added. Earlier hops are whatever the visitor sent.
 */
export function clientIp(headers: Headers): string {
  const first = (v: string | null) => v?.split(',')[0]?.trim() || null;
  if (process.env.VERCEL) {
    return first(headers.get('x-real-ip')) ?? first(headers.get('x-vercel-forwarded-for')) ?? first(headers.get('x-forwarded-for')) ?? 'local';
  }
  if (process.env.BEHIND_CLOUDFLARE === '1') {
    const cf = first(headers.get('cf-connecting-ip'));
    if (cf) return cf;
  }
  const hops = headers.get('x-forwarded-for')?.split(',').map((h) => h.trim()).filter(Boolean) ?? [];
  return hops[hops.length - 1] ?? first(headers.get('x-real-ip')) ?? 'local';
}
