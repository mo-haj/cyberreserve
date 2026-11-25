/** The public site address for links in bot messages, when known. */
export function siteUrl(): string | null {
  const own = process.env.SITE_URL?.trim().replace(/\/$/, '');
  if (own) return own;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : null;
}

/**
 * Search engines may list the site only on its own domain: SITE_URL set to a
 * real domain (not *.vercel.app), and the visitor on that domain. The
 * vercel.app address is never listed (it would duplicate the real one).
 * ALLOW_INDEXING=0 hides everything, whatever the domain.
 */
export function indexingOn(host?: string | null): boolean {
  if (process.env.ALLOW_INDEXING?.trim() === '0') return false;
  const own = process.env.SITE_URL?.trim();
  if (!own) return false;
  let ownHost: string;
  try {
    ownHost = new URL(own).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (/(\.vercel\.app|localhost|127\.0\.0\.1)$/.test(ownHost)) return false;
  if (host) {
    const h = host.toLowerCase().split(':')[0];
    if (h !== ownHost && h !== `www.${ownHost}`) return false;
  }
  return true;
}

/** The host the visitor asked for (server components and route handlers). */
export async function requestHost(): Promise<string | null> {
  const { headers } = await import('next/headers');
  const h = await headers();
  return h.get('x-forwarded-host') ?? h.get('host');
}

/** Support / contact e-mail shown in the footer and in owner messages (SUPPORT_EMAIL). */
export function supportEmail(): string | null {
  const v = process.env.SUPPORT_EMAIL?.trim();
  return v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}
