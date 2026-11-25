// Arena owners ask to join (/join); the site admin approves or declines.
// Approval creates the arena hidden, with the requester as its owner. Server only.
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { tg } from '@/lib/telegram/api';
import { adminTelegramIds } from '@/lib/auth/admin';
import { CITIES, cityName } from '@/lib/cities';
import { siteUrl } from '@/lib/site';
import { slugify } from '@/lib/manage/rules';
import { now } from '@/lib/time';

export const JoinInput = z.object({
  nameAr: z.string().trim().min(2).max(80),
  nameEn: z.string().trim().min(2).max(80),
  city: z.enum(CITIES.map((c) => c.key) as [string, ...string[]]),
  area: z.string().trim().min(2).max(80),
  address: z.string().trim().min(2).max(160),
  stations: z.number().int().min(1).max(300),
  software: z.string().trim().max(60).default(''),
  note: z.string().trim().max(500).default(''),
});
export type JoinInput = z.infer<typeof JoinInput>;

export type JoinView = {
  id: string;
  nameAr: string;
  nameEn: string;
  city: string;
  area: string;
  address: string;
  stations: number;
  software: string;
  note: string;
  status: 'PENDING' | 'APPROVED' | 'DECLINED';
  cafeSlug: string | null;
  reply: string | null;
  createdAt: string;
};

const view = (r: Prisma.ArenaRequestGetPayload<object>): JoinView => ({
  id: r.id,
  nameAr: r.nameAr,
  nameEn: r.nameEn,
  city: r.city,
  area: r.area,
  address: r.address,
  stations: r.stations,
  software: r.software,
  note: r.note,
  status: r.status as JoinView['status'],
  cafeSlug: r.cafeSlug,
  reply: r.reply,
  createdAt: r.createdAt.toISOString(),
});

export async function myRequest(userId: string): Promise<JoinView | null> {
  const r = await prisma.arenaRequest.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
  return r ? view(r) : null;
}

export async function submitRequest(userId: string, input: JoinInput): Promise<'ok' | 'pending' | 'too_many'> {
  if (await prisma.arenaRequest.count({ where: { userId, status: 'PENDING' } })) return 'pending';
  // A few tries a week at most (declined ones count too).
  if ((await prisma.arenaRequest.count({ where: { userId, createdAt: { gt: new Date(now().getTime() - 7 * 86400_000) } } })) >= 3) return 'too_many';
  const r = await prisma.arenaRequest.create({ data: { userId, ...input } });
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, name: true, phone: true } });
  const site = siteUrl();
  const text = [
    '🏟 طلب انضمام صالة جديد',
    '',
    `${input.nameAr} (${input.nameEn})`,
    `📍 ${input.area}، ${cityName(input.city, 'ar')}`,
    `🖥 ${input.stations} جهاز${input.software ? ` · ${input.software}` : ''}`,
    `👤 ${u?.fullName ?? u?.name ?? ''} · ⁦${u?.phone ?? ''}⁩`,
    input.note ? `\n${input.note}` : '',
  ]
    .filter((l, i) => l !== '' || i === 1)
    .join('\n');
  for (const id of adminTelegramIds()) {
    await tg('sendMessage', {
      chat_id: id,
      text,
      ...(site ? { reply_markup: { inline_keyboard: [[{ text: 'فتح الطلبات', url: `${site}/admin#requests` }]] } } : {}),
    }).catch(() => undefined);
  }
  void r;
  return 'ok';
}

/** Site admin: pending requests first, then the last decided ones. */
export async function listRequests(): Promise<(JoinView & { who: string; phone: string })[]> {
  const rows = await prisma.arenaRequest.findMany({
    where: { OR: [{ status: 'PENDING' }, { decidedAt: { gt: new Date(now().getTime() - 30 * 86400_000) } }] },
    orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
    take: 50,
    include: { user: { select: { fullName: true, name: true, nickname: true, phone: true } } },
  });
  return rows.map((r) => ({ ...view(r), who: r.user.fullName ?? r.user.nickname ?? r.user.name, phone: r.user.phone ?? '' }));
}

async function freeSlug(base: string): Promise<string> {
  const root = base || 'arena';
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? root : `${root.slice(0, 55)}-${i + 1}`;
    if (!(await prisma.cafe.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  return `${root.slice(0, 50)}-${Date.now().toString(36)}`;
}

async function tellRequester(userId: string, text: string, url?: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { telegramChatId: true } });
  if (!u?.telegramChatId) return;
  await tg('sendMessage', {
    chat_id: u.telegramChatId,
    text,
    ...(url ? { reply_markup: { inline_keyboard: [[{ text: 'فتح لوحة التحكم', url }]] } } : {}),
  }).catch(() => undefined);
}

/** Approve: a hidden arena with the requester as owner. Returns its slug. */
export async function approveRequest(adminId: string, id: string): Promise<{ ok: true; slug: string } | { ok: false; error: 'not_found' }> {
  const r = await prisma.arenaRequest.findUnique({ where: { id } });
  if (!r || r.status !== 'PENDING') return { ok: false, error: 'not_found' };
  const slug = await freeSlug(slugify(r.nameEn));
  const created = await prisma.$transaction(async (tx) => {
    const claimed = await tx.arenaRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'APPROVED', cafeSlug: slug, decidedAt: now() } });
    if (claimed.count !== 1) return false;
    const cafe = await tx.cafe.create({
      data: {
        slug,
        nameAr: r.nameAr,
        nameEn: r.nameEn,
        city: r.city,
        areaAr: r.area,
        areaEn: r.area,
        addressAr: r.address,
        addressEn: r.address,
        taglineAr: '',
        taglineEn: '',
        hoursAr: '',
        hoursEn: '',
        hourlyRate: new Prisma.Decimal(0),
        nightShiftRate: new Prisma.Decimal(0),
        coverImage: '/cafes/cover-default.svg',
        isPublished: false,
      },
      select: { id: true },
    });
    await tx.arenaMember.create({ data: { cafeId: cafe.id, userId: r.userId, role: 'OWNER' } });
    await tx.auditLog.create({ data: { actorType: 'ADMIN', userId: adminId, action: 'admin.request.approve', details: { request: id, arena: slug } } });
    return true;
  });
  if (!created) return { ok: false, error: 'not_found' };
  const site = siteUrl();
  await tellRequester(
    r.userId,
    `🎉 تمت الموافقة على انضمام «${r.nameAr}»!\n\nافتح لوحة التحكم وأضف الأجهزة والأسعار والصور. الصالة مخفية الآن، وتظهر للاعبين بعد أن نراجعها وننشرها.`,
    site ? `${site}/admin/${slug}` : undefined,
  );
  return { ok: true, slug };
}

export async function declineRequest(adminId: string, id: string, reason: string): Promise<boolean> {
  const r = await prisma.arenaRequest.findUnique({ where: { id }, select: { userId: true, nameAr: true } });
  const done = await prisma.arenaRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'DECLINED', reply: reason.trim().slice(0, 300) || null, decidedAt: now() } });
  if (done.count !== 1 || !r) return false;
  await prisma.auditLog.create({ data: { actorType: 'ADMIN', userId: adminId, action: 'admin.request.decline', details: { request: id } } });
  await tellRequester(r.userId, `لم نتمكن من قبول طلب «${r.nameAr}» حاليًا.${reason.trim() ? `\n\nالسبب: ${reason.trim()}` : ''}\n\nيمكنك التواصل معنا أو إرسال طلب جديد لاحقًا.`);
  return true;
}
