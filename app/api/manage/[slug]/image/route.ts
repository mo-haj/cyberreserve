import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { NO_STORE, sameOrigin } from '@/lib/http';
import { DEFAULT_COVER, checkImage, type ImageKind } from '@/lib/manage/images';
import { getManageData, getMembership } from '@/lib/manage/service';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { now } from '@/lib/time';

// Arena owners upload (POST, multipart: kind + file [+ itemId]) or remove
// (DELETE ?kind=[&itemId=]) their logo, banner, a zone photo (kind=group) or a
// post photo (kind=post). Stored in the database, served at /media/<id>.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KINDS = new Set<ImageKind>(['logo', 'cover', 'group', 'post']);
const UUID = /^[0-9a-f-]{36}$/;

/** The zone or post of this arena a photo belongs to, or null. */
async function itemOf(cafeId: string, kind: string, id: unknown): Promise<{ id: string } | null> {
  if (typeof id !== 'string' || !UUID.test(id)) return null;
  if (kind === 'group') return prisma.stationGroup.findFirst({ where: { id, cafeId }, select: { id: true } });
  if (kind === 'post') return prisma.cafeSection.findFirst({ where: { id, cafeId }, select: { id: true } });
  return null;
}

/** Set (or clear) the photo of a zone or post. */
function setItemPhoto(tx: Prisma.TransactionClient, kind: string, id: string, url: string | null) {
  return kind === 'group'
    ? tx.stationGroup.update({ where: { id }, data: { imageUrl: url } })
    : tx.cafeSection.update({ where: { id }, data: { imageUrl: url ?? '' } });
}

const forItem = (kind: string) => kind === 'group' || kind === 'post';

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
  const image = await prisma.$transaction(async (tx) => {
    await tx.arenaImage.deleteMany({ where: { cafeId, kind: stored } });
    const img = await tx.arenaImage.create({ data: { cafeId, kind: stored, mime: check.mime, data: Buffer.from(bytes) }, select: { id: true } });
    const url = `/media/${img.id}`;
    if (item) await setItemPhoto(tx, kind, item.id, url);
    else await tx.cafe.update({ where: { id: cafeId }, data: kind === 'logo' ? { logoImage: url } : { coverImage: url } });
    return img;
  });
  await prisma.auditLog.create({
    data: { actorType: 'OWNER', userId: found.user.id, action: `manage.upload.${kind}`, details: { arena: found.m.slug, imageId: image.id, bytes: bytes.length } },
  });
  return NextResponse.json({ ok: true, data: await getManageData(cafeId) }, { headers: NO_STORE });
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
    await prisma.$transaction(async (tx) => {
      await tx.arenaImage.deleteMany({ where: { cafeId, kind: `${kind}:${item.id}` } });
      await setItemPhoto(tx, kind, item.id, null);
    });
    return NextResponse.json({ ok: true, data: await getManageData(cafeId) }, { headers: NO_STORE });
  }
  await prisma.$transaction([
    prisma.arenaImage.deleteMany({ where: { cafeId, kind } }),
    prisma.cafe.update({ where: { id: cafeId }, data: kind === 'logo' ? { logoImage: null } : { coverImage: DEFAULT_COVER } }),
  ]);
  await prisma.auditLog.create({
    data: { actorType: 'OWNER', userId: found.user.id, action: `manage.remove.${kind}`, details: { arena: found.m.slug } },
  });
  return NextResponse.json({ ok: true, data: await getManageData(cafeId) }, { headers: NO_STORE });
}
