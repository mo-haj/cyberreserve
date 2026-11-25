import type { MetadataRoute } from 'next';
import { indexingOn, siteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

// Search engines: the public pages only; never the dashboard, sign-in or the API.
export default function robots(): MetadataRoute.Robots {
  const site = siteUrl();
  // Not launched yet: ask every search engine to stay out.
  if (!indexingOn()) return { rules: [{ userAgent: '*', disallow: '/' }] };
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/manage', '/api/', '/profile', '/login', '/media/'] }],
    ...(site ? { sitemap: `${site}/sitemap.xml`, host: site } : {}),
  };
}
