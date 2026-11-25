// Keeping players and owners coming back: nightly owner summary, "tell me
// when a station frees up", ratings after a visit, followed arenas,
// tournaments and the owner's stats. Server only.
import { BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { now, startOfDamascusDay, toDamascusParts, formatDamascusDate } from '@/lib/time';
import { tg } from '@/lib/telegram/api';
import { siteUrl } from '@/lib/site';
import { formatWhen, type BotLang } from '@/lib/booking/texts';
import { ENGAGE_TEXT, whenText } from '@/lib/engage-texts';

const HOLDING: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED];
const MIN = 60_000;
type Keyboard = { text: string; callback_data?: string; url?: string }[][];

const send = (chatId: string | number, text: string, keyboard?: Keyboard) =>
  tg('sendMessage', { chat_id: chatId, text, ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}) });

/** A player's bot language: the language of their last booking. */
async function langOf(userId: string): Promise<BotLang> {
  // The language picked in the bot (/language) wins, else the last booking's.
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { botLocale: true } });
  if (u?.botLocale === 'ar' || u?.botLocale === 'en') return u.botLocale;
  const b = await prisma.booking.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { locale: true } });
  return b?.locale === 'en' ? 'en' : 'ar';
}

const arenaLink = (slug: string) => {
  const site = siteUrl();
  return site ? `${site}/arenas/${slug}` : null;
};

/** Stations free right now at an arena (optionally of one type). */
export async function freeStations(cafeId: string, type = '', at = now()): Promise<number> {
  return prisma.device.count({
    where: {
      cafeId,
      archivedAt: null,
      isMaintenance: false,
      ...(type ? { type: type as never } : {}),
      bookings: { none: { status: { in: HOLDING }, startTime: { lte: at }, endTime: { gt: at } } },
    },
  });
}

// ------------------------------------------------------------------ 1. nightly summary

/** The owner's day in numbers (Damascus day of `at`). */
export async function daySummary(cafeId: string, at = now()) {
  const from = startOfDamascusDay(at);
  const to = new Date(from.getTime() + 24 * 60 * MIN);
  const inDay = { device: { cafeId }, startTime: { gte: from, lt: to } };
  const [online, walkIns, arrived, noShows, cancelled, ratings, hours] = await Promise.all([
    prisma.booking.count({ where: { device: { cafeId }, isWalkIn: false, createdAt: { gte: from, lt: to } } }),
    prisma.booking.count({ where: { ...inDay, isWalkIn: true } }),
    prisma.booking.count({ where: { ...inDay, actualStart: { not: null }, isWalkIn: false } }),
    prisma.booking.count({ where: { ...inDay, status: BookingStatus.NO_SHOW } }),
    prisma.booking.count({ where: { ...inDay, status: BookingStatus.CANCELLED } }),
    prisma.arenaReview.aggregate({ where: { cafeId, createdAt: { gte: from, lt: to }, hidden: false }, _avg: { stars: true }, _count: true }),
    prisma.booking.findMany({
      where: { ...inDay, status: { in: [...HOLDING, BookingStatus.COMPLETED] } },
      select: { startTime: true },
    }),
  ]);
  const perHour = new Map<number, number>();
  for (const b of hours) {
    const h = toDamascusParts(b.startTime).hour;
    perHour.set(h, (perHour.get(h) ?? 0) + 1);
  }
  const busiest = [...perHour.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    online,
    walkIns,
    arrived,
    noShows,
    cancelled,
    busiestHour: busiest ? busiest[0] : null,
    ratingAvg: ratings._avg.stars,
    ratingCount: ratings._count,
  };
}

/** Each night at 23:30 Damascus, once per arena: the day to its owners. */
export async function nightlySummaries(at = now()): Promise<void> {
  const p = toDamascusParts(at);
  if (p.hour * 60 + p.minute < 23 * 60 + 30) return;
  const today = formatDamascusDate(at);
  const cafes = await prisma.cafe.findMany({
    where: { isPublished: true, isDemo: false, OR: [{ summarySentOn: null }, { summarySentOn: { not: today } }] },
    select: { id: true, slug: true, nameAr: true },
    take: 50,
  });
  for (const c of cafes) {
    // Claim the arena first, so two ticks never send it twice.
    const claimed = await prisma.cafe.updateMany({
      where: { id: c.id, OR: [{ summarySentOn: null }, { summarySentOn: { not: today } }] },
      data: { summarySentOn: today },
    });
    if (claimed.count !== 1) continue;
    const owners = await prisma.arenaMember.findMany({
      where: { cafeId: c.id, role: 'OWNER', user: { telegramChatId: { not: null } } },
      select: { user: { select: { telegramChatId: true } } },
    });
    if (owners.length === 0) continue;
    const s = await daySummary(c.id, at);
    const text = ENGAGE_TEXT.ar.summary(c.nameAr, s);
    const link = arenaLink(c.slug)?.replace('/arenas/', '/admin/');
    for (const o of owners) {
      await send(o.user.telegramChatId!, text, link ? [[{ text: ENGAGE_TEXT.ar.openDashboard, url: link }]] : undefined).catch(() => undefined);
    }
  }
}

// ------------------------------------------------------------------ 2. free-station alerts

export const WATCH_HOURS = 3;

export async function watchFree(userId: string, slug: string, type: string): Promise<'ok' | 'not_found' | 'no_telegram' | 'has_free'> {
  const cafe = await prisma.cafe.findFirst({ where: { slug, isPublished: true }, select: { id: true } });
  if (!cafe) return 'not_found';
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { telegramChatId: true } });
  if (!u?.telegramChatId) return 'no_telegram';
  if ((await freeStations(cafe.id, type)) > 0) return 'has_free';
  const expiresAt = new Date(now().getTime() + WATCH_HOURS * 60 * MIN);
  await prisma.freeWatch.upsert({
    where: { cafeId_userId: { cafeId: cafe.id, userId } },
    create: { cafeId: cafe.id, userId, stationType: type, expiresAt },
    update: { stationType: type, expiresAt, createdAt: now() },
  });
  return 'ok';
}

export async function unwatchFree(userId: string, slug: string): Promise<void> {
  await prisma.freeWatch.deleteMany({ where: { userId, cafe: { slug } } });
}

export async function isWatching(userId: string, cafeId: string): Promise<boolean> {
  return (await prisma.freeWatch.count({ where: { userId, cafeId, expiresAt: { gt: now() } } })) > 0;
}

/** Every minute: tell waiting players that a station is free. */
export async function processFreeWatches(at = now()): Promise<void> {
  await prisma.freeWatch.deleteMany({ where: { expiresAt: { lte: at } } });
  const watches = await prisma.freeWatch.findMany({
    take: 200,
    orderBy: { createdAt: 'asc' },
    select: { id: true, cafeId: true, userId: true, stationType: true, cafe: { select: { slug: true, nameAr: true, nameEn: true } }, user: { select: { telegramChatId: true } } },
  });
  const free = new Map<string, number>();
  for (const w of watches) {
    const key = `${w.cafeId}:${w.stationType}`;
    if (!free.has(key)) free.set(key, await freeStations(w.cafeId, w.stationType, at));
    const n = free.get(key)!;
    if (n <= 0) continue;
    const done = await prisma.freeWatch.deleteMany({ where: { id: w.id } });
    if (done.count !== 1 || !w.user.telegramChatId) continue;
    const lang = await langOf(w.userId);
    const link = arenaLink(w.cafe.slug);
    await send(
      w.user.telegramChatId,
      ENGAGE_TEXT[lang].freeNow(lang === 'ar' ? w.cafe.nameAr : w.cafe.nameEn, n),
      link ? [[{ text: ENGAGE_TEXT[lang].bookNow, url: link }]] : undefined,
    ).catch(() => undefined);
  }
}

// ------------------------------------------------------------------ 4. ratings

/** After a visit the arena marked "arrived" has ended: ask the player for stars. */
export async function askRatings(at = now()): Promise<void> {
  const due = await prisma.booking.findMany({
    where: {
      isWalkIn: false,
      actualStart: { not: null },
      ratingAskedAt: null,
      status: { in: [BookingStatus.COMPLETED, BookingStatus.CONFIRMED] },
      endTime: { lte: new Date(at.getTime() - 10 * MIN), gt: new Date(at.getTime() - 6 * 60 * MIN) },
      user: { telegramChatId: { not: null } },
    },
    take: 100,
    select: {
      id: true,
      userId: true,
      startTime: true,
      endTime: true,
      locale: true,
      user: { select: { telegramChatId: true } },
      device: { select: { cafeId: true, cafe: { select: { nameAr: true, nameEn: true } } } },
    },
  });
  for (const b of due) {
    const claimed = await prisma.booking.updateMany({ where: { id: b.id, ratingAskedAt: null }, data: { ratingAskedAt: at } });
    if (claimed.count !== 1 || !b.userId) continue;
    // One rating per player per arena per day is enough.
    const already = await prisma.arenaReview.count({
      where: { userId: b.userId, cafeId: b.device.cafeId, createdAt: { gte: new Date(at.getTime() - 20 * 60 * MIN) } },
    });
    if (already) continue;
    const lang: BotLang = b.locale === 'en' ? 'en' : 'ar';
    const arena = lang === 'ar' ? b.device.cafe.nameAr : b.device.cafe.nameEn;
    await send(b.user!.telegramChatId!, ENGAGE_TEXT[lang].rateAsk(arena, formatWhen(lang, b.startTime, b.endTime)), [
      [1, 2, 3, 4, 5].map((n) => ({ text: `${n}⭐`, callback_data: `rv:${n}:${b.id}` })),
    ]).catch(() => undefined);
  }
}

/** Stars from the bot button. Only the player of a visit the arena confirmed. */
export async function saveRating(telegramChatId: string, bookingId: string, stars: number): Promise<{ ok: true; lang: BotLang } | { ok: false }> {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return { ok: false };
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { userId: true, actualStart: true, locale: true, user: { select: { telegramChatId: true } }, device: { select: { cafeId: true } } },
  });
  if (!b?.userId || !b.actualStart || b.user?.telegramChatId !== telegramChatId) return { ok: false };
  await prisma.arenaReview.upsert({
    where: { bookingId },
    create: { bookingId, cafeId: b.device.cafeId, userId: b.userId, stars },
    update: { stars },
  });
  return { ok: true, lang: b.locale === 'en' ? 'en' : 'ar' };
}

export async function saveReviewComment(bookingId: string, comment: string): Promise<void> {
  const text = comment.trim().slice(0, 300);
  if (text) await prisma.arenaReview.updateMany({ where: { bookingId }, data: { comment: text } });
}

/** Average and count, for the arena page and the list. */
export async function ratings(cafeIds: string[]): Promise<Map<string, { avg: number; count: number }>> {
  const rows = await prisma.arenaReview.groupBy({
    by: ['cafeId'],
    where: { cafeId: { in: cafeIds }, hidden: false },
    _avg: { stars: true },
    _count: true,
  });
  return new Map(rows.map((r) => [r.cafeId, { avg: Math.round((r._avg.stars ?? 0) * 10) / 10, count: r._count }]));
}

export async function recentReviews(cafeId: string, take = 6) {
  const rows = await prisma.arenaReview.findMany({
    where: { cafeId, hidden: false, comment: { not: null } },
    orderBy: { createdAt: 'desc' },
    take,
    select: { id: true, stars: true, comment: true, createdAt: true, user: { select: { nickname: true, name: true } } },
  });
  return rows.map((r) => ({ id: r.id, stars: r.stars, comment: r.comment ?? '', at: r.createdAt.toISOString(), who: r.user.nickname ?? r.user.name }));
}

/** Site admin: hide or show a review (owners cannot touch them). */
export async function setReviewHidden(cafeId: string, id: string, hidden: boolean): Promise<boolean> {
  return (await prisma.arenaReview.updateMany({ where: { id, cafeId }, data: { hidden } })).count === 1;
}

// ------------------------------------------------------------------ follow

export async function setFollow(userId: string, slug: string, on: boolean): Promise<'ok' | 'not_found'> {
  const cafe = await prisma.cafe.findFirst({ where: { slug, isPublished: true }, select: { id: true } });
  if (!cafe) return 'not_found';
  if (on) await prisma.arenaFollow.upsert({ where: { cafeId_userId: { cafeId: cafe.id, userId } }, create: { cafeId: cafe.id, userId }, update: {} });
  else await prisma.arenaFollow.deleteMany({ where: { cafeId: cafe.id, userId } });
  return 'ok';
}

export async function isFollowing(userId: string, cafeId: string): Promise<boolean> {
  return (await prisma.arenaFollow.count({ where: { userId, cafeId } })) > 0;
}

export async function followerCount(cafeId: string): Promise<number> {
  return prisma.arenaFollow.count({ where: { cafeId } });
}

/** A new offer or tournament: tell the arena's followers (each in their language). */
export async function tellFollowers(cafeId: string, build: (lang: BotLang, arena: string) => string): Promise<void> {
  const cafe = await prisma.cafe.findUnique({ where: { id: cafeId }, select: { slug: true, nameAr: true, nameEn: true, isPublished: true } });
  if (!cafe?.isPublished) return;
  const follows = await prisma.arenaFollow.findMany({
    where: { cafeId, user: { telegramChatId: { not: null } } },
    select: { userId: true, user: { select: { telegramChatId: true } } },
    take: 2000,
  });
  const link = arenaLink(cafe.slug);
  for (const f of follows) {
    const lang = await langOf(f.userId);
    await send(f.user.telegramChatId!, build(lang, lang === 'ar' ? cafe.nameAr : cafe.nameEn), link ? [[{ text: ENGAGE_TEXT[lang].openArena, url: link }]] : undefined).catch(
      () => undefined,
    );
  }
}

// ------------------------------------------------------------------ 6. tournaments

export interface TournamentView {
  id: string;
  titleAr: string;
  titleEn: string;
  game: string;
  startsAt: string;
  maxPlayers: number;
  fee: string;
  prizeAr: string;
  prizeEn: string;
  noteAr: string;
  noteEn: string;
  entries: number;
  /** The viewer signed up (arena page only). */
  joined?: boolean;
}

const T_SELECT = {
  id: true,
  titleAr: true,
  titleEn: true,
  game: true,
  startsAt: true,
  maxPlayers: true,
  fee: true,
  prizeAr: true,
  prizeEn: true,
  noteAr: true,
  noteEn: true,
  _count: { select: { entries: true } },
} as const;

function tView(t: Prisma.TournamentGetPayload<{ select: typeof T_SELECT }>): TournamentView {
  const { _count, fee, startsAt, ...rest } = t;
  return { ...rest, fee: fee.toFixed(0), startsAt: startsAt.toISOString(), entries: _count.entries };
}

/** Upcoming tournaments (and today's), for the arena page. */
export async function upcomingTournaments(cafeId: string, viewerId?: string): Promise<TournamentView[]> {
  const rows = await prisma.tournament.findMany({
    where: { cafeId, startsAt: { gt: new Date(now().getTime() - 6 * 60 * MIN) } },
    orderBy: { startsAt: 'asc' },
    take: 10,
    select: T_SELECT,
  });
  const mine = viewerId
    ? new Set((await prisma.tournamentEntry.findMany({ where: { userId: viewerId, tournamentId: { in: rows.map((r) => r.id) } }, select: { tournamentId: true } })).map((e) => e.tournamentId))
    : new Set<string>();
  return rows.map((r) => ({ ...tView(r), joined: mine.has(r.id) }));
}

/** Owner view: tournaments with who signed up. */
export async function ownerTournaments(cafeId: string) {
  const rows = await prisma.tournament.findMany({
    where: { cafeId, startsAt: { gt: new Date(now().getTime() - 7 * 24 * 60 * MIN) } },
    orderBy: { startsAt: 'asc' },
    take: 30,
    select: {
      ...T_SELECT,
      entries: { orderBy: { createdAt: 'asc' }, select: { createdAt: true, user: { select: { id: true, nickname: true, fullName: true, name: true, phone: true } } } },
    },
  });
  return rows.map(({ entries, ...t }) => ({
    ...tView(t),
    players: entries.map((e) => ({ id: e.user.id, name: e.user.nickname ?? e.user.fullName ?? e.user.name, fullName: e.user.fullName ?? '', phone: e.user.phone ?? '', at: e.createdAt.toISOString() })),
  }));
}

export async function joinTournament(userId: string, id: string, on: boolean): Promise<'ok' | 'not_found' | 'full' | 'started' | 'banned'> {
  const t = await prisma.tournament.findUnique({ where: { id }, select: { cafeId: true, startsAt: true, maxPlayers: true, cafe: { select: { isPublished: true } } } });
  if (!t || !t.cafe.isPublished) return 'not_found';
  if (t.startsAt <= now()) return 'started';
  if (!on) {
    await prisma.tournamentEntry.deleteMany({ where: { tournamentId: id, userId } });
    return 'ok';
  }
  const ban = await prisma.arenaBan.findUnique({ where: { cafeId_userId: { cafeId: t.cafeId, userId } } });
  if (ban && (!ban.until || ban.until > now())) return 'banned';
  // Count and insert under a lock on the tournament row, so the last seat goes once.
  const r = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id = ${id} FOR UPDATE`;
    if (await tx.tournamentEntry.findUnique({ where: { tournamentId_userId: { tournamentId: id, userId } } })) return 'already' as const;
    if ((await tx.tournamentEntry.count({ where: { tournamentId: id } })) >= t.maxPlayers) return 'full' as const;
    await tx.tournamentEntry.create({ data: { tournamentId: id, userId } });
    return 'ok' as const;
  });
  if (r === 'full') return 'full';
  // A new sign-up: the player gets the details (and the fee to pay at the arena) on Telegram.
  if (r === 'ok') await tellJoined(userId, id).catch(() => undefined);
  return 'ok';
}

async function tellJoined(userId: string, tournamentId: string): Promise<void> {
  const [u, t] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { telegramChatId: true } }),
    prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { titleAr: true, titleEn: true, startsAt: true, fee: true, cafe: { select: { slug: true, nameAr: true, nameEn: true } } },
    }),
  ]);
  if (!u?.telegramChatId || !t) return;
  const lang = await langOf(userId);
  const link = arenaLink(t.cafe.slug);
  await send(
    u.telegramChatId,
    ENGAGE_TEXT[lang].joinedTournament(
      lang === 'ar' ? t.cafe.nameAr : t.cafe.nameEn,
      lang === 'ar' ? t.titleAr : t.titleEn,
      whenText(lang, t.startsAt.toISOString()),
      t.fee.toFixed(0),
    ),
    link ? [[{ text: ENGAGE_TEXT[lang].openArena, url: link }]] : undefined,
  );
}

// ------------------------------------------------------------------ 3. stats

/** The owner's last 30 days: busiest hours and days, regulars, no-shows. */
export async function arenaStats(cafeId: string, days = 30) {
  const at = now();
  const from = new Date(at.getTime() - days * 24 * 60 * MIN);
  const rows = await prisma.booking.findMany({
    where: { device: { cafeId }, startTime: { gte: from, lte: at } },
    select: { startTime: true, endTime: true, status: true, isWalkIn: true, userId: true, actualStart: true, totalPrice: true },
  });
  const byHour = Array.from({ length: 24 }, () => 0);
  const byDay = Array.from({ length: 7 }, () => 0);
  let online = 0;
  let walkIns = 0;
  let noShows = 0;
  let cancelled = 0;
  let hoursPlayed = 0;
  let revenue = 0;
  const players = new Map<string, number>();
  for (const b of rows) {
    if (b.status === BookingStatus.CANCELLED) {
      cancelled++;
      continue;
    }
    if (b.status === BookingStatus.NO_SHOW) {
      noShows++;
      continue;
    }
    if (b.isWalkIn) walkIns++;
    else online++;
    const p = toDamascusParts(b.startTime);
    byHour[p.hour]++;
    byDay[p.weekday]++;
    hoursPlayed += (b.endTime.getTime() - b.startTime.getTime()) / 3600_000;
    revenue += Number(b.totalPrice);
    if (b.userId) players.set(b.userId, (players.get(b.userId) ?? 0) + 1);
  }
  const top = [...players.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const users = await prisma.user.findMany({ where: { id: { in: top.map(([id]) => id) } }, select: { id: true, nickname: true, fullName: true, name: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.nickname ?? u.fullName ?? u.name]));
  const shown = online + noShows;
  const [rating, followers] = await Promise.all([ratings([cafeId]), followerCount(cafeId)]);
  return {
    days,
    online,
    walkIns,
    noShows,
    cancelled,
    noShowRate: shown ? Math.round((noShows / shown) * 100) : 0,
    hoursPlayed: Math.round(hoursPlayed),
    revenue: Math.round(revenue),
    byHour,
    byDay,
    regulars: top.map(([id, n]) => ({ name: nameOf.get(id) ?? '—', visits: n })),
    uniquePlayers: players.size,
    rating: rating.get(cafeId) ?? null,
    followers,
    reviews: await prisma.arenaReview.findMany({
      where: { cafeId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, stars: true, comment: true, hidden: true, createdAt: true, user: { select: { nickname: true, name: true } } },
    }).then((r) => r.map((x) => ({ id: x.id, stars: x.stars, comment: x.comment ?? '', hidden: x.hidden, at: x.createdAt.toISOString(), who: x.user.nickname ?? x.user.name }))),
  };
}
export type ArenaStats = Awaited<ReturnType<typeof arenaStats>>;

