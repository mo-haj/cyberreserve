import type { MetadataRoute } from 'next';
import { indexingOn, requestHost, siteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

// Search engines: the public pages only; never the dashboard, sign-in or the API.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = siteUrl();
  // Not on the real domain (e.g. the vercel.app address): ask search engines to stay out.
  if (!indexingOn(await requestHost())) return { rules: [{ userAgent: '*', disallow: '/' }] };
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/manage', '/api/', '/profile', '/login', '/media/'] }],
    ...(site ? { sitemap: `${site}/sitemap.xml`, host: site } : {}),
  };
}
