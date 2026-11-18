import { redirect } from 'next/navigation';

// Old address: arenas used to be called cafes.
export default async function OldCafePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(/^[a-z0-9-]{1,60}$/.test(slug) ? `/arenas/${slug}` : '/');
}
