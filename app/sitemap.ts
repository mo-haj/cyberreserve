import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { indexingOn, requestHost, siteUrl } from '@/lib/site';

// Arena pages the site admin marked for Google (real arenas), so they are found quickly.
export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!indexingOn(await requestHost())) return [];
  const site = siteUrl() ?? '';
  const arenas = await prisma.cafe
    .findMany({ where: { isPublished: true, isDemo: false, searchVisible: true }, select: { slug: true, updatedAt: true } })
    .catch(() => [] as { slug: string; updatedAt: Date }[]);
  return [
    { url: `${site}/`, changeFrequency: 'hourly', priority: 1 },
    ...arenas.map((a) => ({ url: `${site}/arenas/${a.slug}`, lastModified: a.updatedAt, changeFrequency: 'daily' as const, priority: 0.8 })),
    { url: `${site}/join`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${site}/terms`, changeFrequency: 'yearly', priority: 0.1 },
    { url: `${site}/privacy`, changeFrequency: 'yearly', priority: 0.1 },
  ];
}
