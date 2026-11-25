import { logArena } from '@/lib/activity';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { NO_STORE, sameOrigin } from '@/lib/http';
import { DEFAULT_COVER, checkImage, type ImageKind } from '@/lib/manage/images';
import { getManageData, getMembership } from '@/lib/manage/service';
import { prisma } from '@/lib/prisma';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { now } from '@/lib/time';
import { randomUUID } from 'node:crypto';

// Arena owners upload (POST, multipart: kind + file [+ itemId]) or remove
// (DELETE ?kind=[&itemId=]) their logo, banner, a zone photo (kind=group) or a
// post photo (kind=post). Stored in the database, served at /media/<id>.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Never hang: Vercel stops the request after this many seconds.
export const maxDuration = 30;

const KINDS = new Set<ImageKind>(['logo', 'cover', 'group', 'post', 'game']);
const UUID = /^[0-9a-f-]{36}$/;

/** The zone or post of this arena a photo belongs to, or null. */
async function itemOf(cafeId: string, kind: string, id: unknown): Promise<{ id: string } | null> {
  if (typeof id !== 'string' || !UUID.test(id)) return null;
  if (kind === 'group') return prisma.stationGroup.findFirst({ where: { id, cafeId }, select: { id: true } });
  if (kind === 'post') return prisma.cafeSection.findFirst({ where: { id, cafeId }, select: { id: true } });
  if (kind === 'game') return prisma.game.findFirst({ where: { id, ownerCafeId: cafeId }, select: { id: true } });
  return null;
}

const forItem = (kind: string) => kind === 'group' || kind === 'post' || kind === 'game';

/** Set (or clear) the photo of a zone, post or own game. */
function itemPhoto(kind: string, id: string, url: string | null) {
  if (kind === 'group') return prisma.stationGroup.update({ where: { id }, data: { imageUrl: url } });
  if (kind === 'game') return prisma.game.update({ where: { id }, data: { imageUrl: url } });
  return prisma.cafeSection.update({ where: { id }, data: { imageUrl: url ?? '' } });
}

async function owner(request: Request, slug: string) {
  if (!sameOrigin(request) || !/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const m = await getMembership(user, slug);
  return m?.role === 'OWNER' ? { user, m } : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!rateLimit(`upload:${clientIp(request.headers)}`, 20, 60_000, now().getTime())) {
    return NextResponse.json({ error: 'too_many' }, { status: 429, headers: NO_STORE });
  }
  const found = await owner(request, (await params).slug);
  if (!found) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE });

  const form = await request.formData().catch(() => null);
  const kind = form?.get('kind');
  const file = form?.get('file');
  if (typeof kind !== 'string' || !KINDS.has(kind as ImageKind) || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400, headers: NO_STORE });
  }
  if (file.size > 3 * 1024 * 1024) return NextResponse.json({ error: 'image_size' }, { status: 400, headers: NO_STORE });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkImage(kind as ImageKind, bytes);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400, headers: NO_STORE });

  const cafeId = found.m.cafeId;
  const item = forItem(kind) ? await itemOf(cafeId, kind, form?.get('itemId') ?? form?.get('groupId')) : null;
  if (forItem(kind) && !item) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  const stored = item ? `${kind}:${item.id}` : kind;
  // One batch (no long-held transaction): safe through a serverless pooler.
  const image = { id: randomUUID() };
  const url = `/media/${image.id}`;
  await prisma.$transaction([
    prisma.arenaImage.deleteMany({ where: { cafeId, kind: stored } }),
    prisma.arenaImage.create({ data: { id: image.id, cafeId, kind: stored, mime: check.mime, data: Buffer.from(bytes) }, select: { id: true } }),
    item
      ? itemPhoto(kind, item.id, url)
      : prisma.cafe.update({ where: { id: cafeId }, data: kind === 'logo' ? { logoImage: url } : { coverImage: url } }),
  ]);

  await logArena({ cafeId: found.m.cafeId, userId: found.user.id, action: `manage.upload.${kind}`, details: { imageId: image.id, bytes: bytes.length } });
  return NextResponse.json({ ok: true, data: await getManageData(cafeId, { ...found.m, userId: found.user.id }) }, { headers: NO_STORE });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const found = await owner(request, (await params).slug);
  if (!found) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE });
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  if (!kind || !KINDS.has(kind as ImageKind)) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: NO_STORE });
  const cafeId = found.m.cafeId;
  if (forItem(kind)) {
    const item = await itemOf(cafeId, kind, url.searchParams.get('itemId') ?? url.searchParams.get('groupId'));
    if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
    await prisma.$transaction([
      prisma.arenaImage.deleteMany({ where: { cafeId, kind: `${kind}:${item.id}` } }),
      itemPhoto(kind, item.id, null),
    ]);

    return NextResponse.json({ ok: true, data: await getManageData(cafeId, { ...found.m, userId: found.user.id }) }, { headers: NO_STORE });
  }
  await prisma.$transaction([
    prisma.arenaImage.deleteMany({ where: { cafeId, kind } }),
    prisma.cafe.update({ where: { id: cafeId }, data: kind === 'logo' ? { logoImage: null } : { coverImage: DEFAULT_COVER } }),
  ]);
  await logArena({ cafeId: found.m.cafeId, userId: found.user.id, action: `manage.remove.${kind}` });
  return NextResponse.json({ ok: true, data: await getManageData(cafeId, { ...found.m, userId: found.user.id }) }, { headers: NO_STORE });
}
