// Arena subscriptions to the platform (set by the site admin). Server only.
// Not tracked (no end date) = free / trial: everything works.
// Expired or paused by hand: the arena stays visible, online booking stops.
import { prisma } from '@/lib/prisma';
import { tg } from '@/lib/telegram/api';
import { siteUrl, supportEmail } from '@/lib/site';
import { formatDamascusDate, now } from '@/lib/time';

export type SubState = 'free' | 'active' | 'ending' | 'expired' | 'paused';
export const WARN_DAYS = 7;

export function subState(c: { subEndsAt: Date | null; subPaused: boolean }, at = now()): SubState {
  if (c.subPaused) return 'paused';
  if (!c.subEndsAt) return 'free';
  if (c.subEndsAt <= at) return 'expired';
  return c.subEndsAt.getTime() - at.getTime() <= WARN_DAYS * 86400_000 ? 'ending' : 'active';
}

/** Online booking allowed? */
export const bookingOpen = (c: { subEndsAt: Date | null; subPaused: boolean }, at = now()) => !['expired', 'paused'].includes(subState(c, at));

/** Site admin: add a month or a year (from today, or from the current end if still running). */
export async function extendSubscription(cafeId: string, plan: 'MONTH' | 'YEAR'): Promise<Date> {
  const c = await prisma.cafe.findUniqueOrThrow({ where: { id: cafeId }, select: { subEndsAt: true } });
  const at = now();
  const from = c.subEndsAt && c.subEndsAt > at ? c.subEndsAt : at;
  const end = new Date(from);
  if (plan === 'MONTH') end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCFullYear(end.getUTCFullYear() + 1);
  await prisma.cafe.update({
    where: { id: cafeId },
    data: { subPlan: plan, subEndsAt: end, subPaused: false, subWarnedAt: null, subExpiredAt: null },
  });
  return end;
}

async function tellOwners(cafeId: string, slug: string, text: string) {
  const owners = await prisma.arenaMember.findMany({
    where: { cafeId, role: 'OWNER', user: { telegramChatId: { not: null } } },
    select: { user: { select: { telegramChatId: true } } },
  });
  const site = siteUrl();
  for (const o of owners) {
    await tg('sendMessage', {
      chat_id: o.user.telegramChatId,
      text,
      ...(site ? { reply_markup: { inline_keyboard: [[{ text: 'فتح لوحة التحكم', url: `${site}/admin/${slug}` }]] } } : {}),
    }).catch(() => undefined);
  }
}

const renewLine = () => {
  const mail = supportEmail();
  return mail ? `لتجديد الاشتراك تواصل مع إدارة المنصة: ${mail}` : 'لتجديد الاشتراك تواصل مع إدارة المنصة.';
};

/** Every minute (cheap): a reminder 7 days before the end, and a notice when it ends. Once each. */
export async function subscriptionReminders(at = now()): Promise<void> {
  const soon = new Date(at.getTime() + WARN_DAYS * 86400_000);
  const warn = await prisma.cafe.findMany({
    where: { subPaused: false, subWarnedAt: null, subEndsAt: { gt: at, lte: soon } },
    select: { id: true, slug: true, nameAr: true, subEndsAt: true },
    take: 50,
  });
  for (const c of warn) {
    const claimed = await prisma.cafe.updateMany({ where: { id: c.id, subWarnedAt: null }, data: { subWarnedAt: at } });
    if (claimed.count !== 1) continue;
    await tellOwners(
      c.id,
      c.slug,
      `⏳ ${c.nameAr}: سينتهي اشتراك صالتك في منصة حجوزات الصالات الأونلاين (CyberReserve) بتاريخ ${formatDamascusDate(c.subEndsAt!)}.\nبعد انتهائه يتوقف الحجز الأونلاين لصالتك.\n\n${renewLine()}`,
    );
  }
  const ended = await prisma.cafe.findMany({
    where: { subPaused: false, subExpiredAt: null, subEndsAt: { lte: at } },
    select: { id: true, slug: true, nameAr: true },
    take: 50,
  });
  for (const c of ended) {
    const claimed = await prisma.cafe.updateMany({ where: { id: c.id, subExpiredAt: null }, data: { subExpiredAt: at } });
    if (claimed.count !== 1) continue;
    await tellOwners(
      c.id,
      c.slug,
      `⛔ ${c.nameAr}: انتهى اشتراك صالتك في منصة حجوزات الصالات الأونلاين (CyberReserve)، وتوقف الحجز الأونلاين.\nالحجوزات الموجودة باقية كما هي.\n\n${renewLine()}`,
    );
  }
}
