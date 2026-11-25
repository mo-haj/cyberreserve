/** The public site address for links in bot messages, when known. */
export function siteUrl(): string | null {
  const own = process.env.SITE_URL?.trim().replace(/\/$/, '');
  if (own) return own;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : null;
}

/**
 * Search engines may list the site only when ALLOW_INDEXING=1. Until the real
 * arenas are in, everything is hidden from Google (noindex, robots.txt says no).
 */
export function indexingOn(): boolean {
  return process.env.ALLOW_INDEXING?.trim() === '1';
}
