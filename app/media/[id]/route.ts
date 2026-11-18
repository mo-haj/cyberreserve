import { prisma } from '@/lib/prisma';

// Serves uploaded arena logos and banners. An id never changes its content
// (a new upload gets a new id), so browsers may cache it for a year.
export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Not found', { status: 404 });
  const img = await prisma.arenaImage.findUnique({ where: { id }, select: { mime: true, data: true } });
  if (!img || !['image/png', 'image/jpeg', 'image/webp'].includes(img.mime)) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(img.data), {
    headers: {
      'Content-Type': img.mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
