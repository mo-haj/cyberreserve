import { redirect } from 'next/navigation';

// The arena dashboard moved to /admin/<arena>.
export default async function ManageArenaMoved({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(/^[a-z0-9-]{1,60}$/.test(slug) ? `/admin/${slug}` : '/admin');
}
