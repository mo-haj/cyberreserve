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

/** Visitor IP: Cloudflare's header first, then the proxy chain, else "local". */
export function clientIp(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headers.get('x-real-ip') ??
    'local'
  );
}
