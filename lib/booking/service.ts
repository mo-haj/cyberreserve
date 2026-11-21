// Online booking: create, cancel, arena actions, schedule, and the minute job
// that sends "still coming?" reminders. Server only. Telegram messages are
// best effort: a failed message never undoes a booking.
import { BookingStatus, Prisma } from '@prisma/client';
import { cityName } from '@/lib/cities';
import { prisma } from '@/lib/prisma';
import { now as clockNow, formatDamascusTime } from '@/lib/time';
import { escapeHtml, tg, tgResult } from '@/lib/telegram/api';
import { background } from '@/lib/background';
import { GROUP_SELECT } from '@/lib/cafes';
import { BOOKING, checkRequest, isBlocked, priceWithOffers, reminderAt, type BookingCheck, type OfferKind } from '@/lib/booking/rules';
import { ARENA_TEXT, BOOKING_TEXT, banUntilText, formatWhen, reasonText, type BookingFacts, type BotLang } from '@/lib/booking/texts';

const HOLDING: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED];
const MIN = 60_000;
const TYPE_NAME: Record<string, string> = { PC: 'PC', PS5: 'PS5', PS4: 'PS4', XBOX: 'Xbox' };

export type CreateError =
  | Exclude<BookingCheck, 'ok'>
  | 'not_found'
  | 'maintenance'
  | 'taken'
  | 'has_active'
  | 'blocked'
  | 'profile'
  /** This arena stopped taking this player's bookings (detail: reason, until). */
  | 'arena_banned'
  /** The arena cancelled this player's booking at this time (detail: reason). */
  | 'arena_cancelled';

export type CreateResult =
  | { ok: true; booking: { id: string; start: string; end: string; price: string } }
  | { ok: false; error: CreateError; detail?: { reason: string; until: string | null } };

/** "PS5 2": a station's name as players see it (number within its type). */
async function stationName(cafeId: string, pcNumber: number, type: string): Promise<string> {
  const index = await prisma.device.count({
    where: { cafeId, type: type as never, archivedAt: null, pcNumber: { lte: pcNumber } },
  });
  return `${TYPE_NAME[type] ?? type} ${index}`;
}

async function facts(bookingId: string, lang: BotLang) {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      device: { select: { pcNumber: true, type: true, cafeId: true, cafe: { select: { nameAr: true, nameEn: true } } } },
      user: { select: { id: true, name: true, nickname: true, fullName: true, phone: true, homeCity: true, telegramChatId: true, strikesCount: true } },
    },
  });
  if (!b) return null;
  const f: BookingFacts = {
    arena: lang === 'ar' ? b.device.cafe.nameAr : b.device.cafe.nameEn,
    station: await stationName(b.device.cafeId, b.device.pcNumber, b.device.type),
    when: formatWhen(lang, b.startTime, b.endTime),
    price: b.totalPrice.toFixed(0),
  };
  return { b, f };
}

function playerLabel(u: { nickname: string | null; name: string; fullName: string | null } | null): string {
  if (!u) return '—';
  return u.fullName ? `${u.nickname ?? u.name} (${u.fullName})` : (u.nickname ?? u.name);
}

const send = (chatId: string | number, text: string, keyboard?: { text: string; callback_data: string }[][]) =>
  tg('sendMessage', { chat_id: chatId, text, ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}) });

/** Owners and staff of an arena who can get Telegram messages. */
async function arenaChats(cafeId: string): Promise<string[]> {
  const members = await prisma.arenaMember.findMany({
    where: { cafeId, user: { telegramChatId: { not: null } } },
    select: { user: { select: { telegramChatId: true } } },
  });
  return members.map((m) => m.user.telegramChatId!).filter(Boolean);
}

async function tellArena(cafeId: string, text: string, keyboard?: { text: string; callback_data: string }[][]) {
  for (const chat of await arenaChats(cafeId)) await send(chat, text, keyboard);
}

/** The public site address for links in bot messages, when known. */
function siteUrl(): string | null {
  const own = process.env.SITE_URL?.trim().replace(/\/$/, '');
  if (own) return own;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : null;
}

type Keyboard = { text: string; callback_data: string }[][];

/** Send, and remember the message so it can be edited when the booking changes. */
async function sendTracked(chatId: string, text: string, bookingId: string, kind: 'arena' | 'player' | 'reminder', keyboard?: Keyboard) {
  const msg = await tgResult<{ message_id: number }>('sendMessage', {
    chat_id: chatId,
    text,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
  if (msg?.message_id) {
    await prisma.bookingMessage.create({ data: { bookingId, chatId, messageId: msg.message_id, kind } }).catch(() => undefined);
  }
}

export type BookingChange = 'arena_cancel' | 'player_cancel' | 'auto_cancel' | 'arrived' | 'noshow' | 'coming';

/**
 * Update the Telegram messages already sent about a booking: a clear title on
 * top, the old text struck through when it no longer holds, buttons removed.
 */
async function refreshMessages(bookingId: string, change: BookingChange) {
  const rows = await prisma.bookingMessage.findMany({ where: { bookingId } });
  if (rows.length === 0) return;
  const ar = await facts(bookingId, 'ar');
  if (!ar) return;
  const lang = (ar.b.locale === 'en' ? 'en' : 'ar') as BotLang;
  const mine = lang === 'ar' ? ar : ((await facts(bookingId, lang)) ?? ar);
  const pt = BOOKING_TEXT[lang];
  const u = ar.b.user;
  const struck = change !== 'arrived' && change !== 'coming';
  for (const r of rows) {
    let head: string | null = null;
    let body = '';
    if (r.kind === 'arena') {
      body = ARENA_TEXT.newBooking(ar.f, playerLabel(u), u?.phone ?? '—', u?.homeCity ? cityName(u.homeCity, 'ar') : '—');
      head =
        change === 'arena_cancel'
          ? ARENA_TEXT.headCancelled(reasonText(ar.b.cancelReason, 'ar'))
          : change === 'player_cancel'
            ? ARENA_TEXT.headPlayerCancelled
            : change === 'auto_cancel'
              ? ARENA_TEXT.headAutoCancelled
              : change === 'arrived'
                ? ARENA_TEXT.headArrived
                : change === 'noshow'
                  ? ARENA_TEXT.headNoShow
                  : null;
    } else {
      const ask = reminderAt(ar.b.createdAt, ar.b.startTime);
      body =
        r.kind === 'reminder'
          ? pt.reminder(mine.f, formatDamascusTime(new Date(ar.b.startTime.getTime() - BOOKING.answerByBeforeMin * MIN)))
          : pt.confirmed(mine.f, ask ? formatDamascusTime(ask) : null);
      head =
        change === 'arena_cancel'
          ? pt.headCancelledByArena(reasonText(ar.b.cancelReason, lang))
          : change === 'player_cancel'
            ? pt.headCancelledByYou
            : change === 'auto_cancel'
              ? pt.headCancelledNoAnswer
              : change === 'noshow'
                ? pt.headNoShow
                : change === 'coming' && r.kind === 'reminder'
                  ? pt.headComing
                  : null;
    }
    if (!head) continue;
    await tg('editMessageText', {
      chat_id: r.chatId,
      message_id: r.messageId,
      parse_mode: 'HTML',
      text: `<b>${escapeHtml(head)}</b>\n\n${struck ? `<s>${escapeHtml(body)}</s>` : escapeHtml(body)}`,
      reply_markup: { inline_keyboard: [] },
    });
  }
}

// ------------------------------------------------------------------ arena bans

/** The arena's stop on this player, if one is in force now. */
export async function activeBan(cafeId: string, userId: string, at = clockNow()) {
  const ban = await prisma.arenaBan.findUnique({ where: { cafeId_userId: { cafeId, userId } } });
  if (!ban || (ban.until && ban.until <= at)) return null;
  return ban;
}

/** Stop (or change the stop on) a player at one arena, and tell them why. */
export async function banPlayer(cafeId: string, byUserId: string, userId: string, until: Date | null, reason: string) {
  await prisma.arenaBan.upsert({
    where: { cafeId_userId: { cafeId, userId } },
    create: { cafeId, userId, until, reason, byUserId },
    update: { until, reason, byUserId, createdAt: clockNow() },
  });
  await prisma.auditLog.create({
    data: { actorType: 'OWNER', userId: byUserId, action: 'arena.ban', details: { cafeId, player: userId, until: until?.toISOString() ?? 'forever' } },
  });
  background('ban notify', async () => {
    const [u, cafe] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { telegramChatId: true, bookings: { orderBy: { createdAt: 'desc' }, take: 1, select: { locale: true } } } }),
      prisma.cafe.findUnique({ where: { id: cafeId }, select: { nameAr: true, nameEn: true } }),
    ]);
    if (!u?.telegramChatId || !cafe) return;
    const lang = (u.bookings[0]?.locale === 'en' ? 'en' : 'ar') as BotLang;
    await send(u.telegramChatId, BOOKING_TEXT[lang].banned(lang === 'ar' ? cafe.nameAr : cafe.nameEn, banUntilText(until, lang), reason));
  });
}

export async function unbanPlayer(cafeId: string, byUserId: string, userId: string): Promise<boolean> {
  const done = await prisma.arenaBan.deleteMany({ where: { cafeId, userId } });
  if (done.count === 0) return false;
  await prisma.auditLog.create({ data: { actorType: 'OWNER', userId: byUserId, action: 'arena.unban', details: { cafeId, player: userId } } });
  background('unban notify', async () => {
    const [u, cafe] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { telegramChatId: true, bookings: { orderBy: { createdAt: 'desc' }, take: 1, select: { locale: true } } } }),
      prisma.cafe.findUnique({ where: { id: cafeId }, select: { nameAr: true, nameEn: true } }),
    ]);
    if (!u?.telegramChatId || !cafe) return;
    const lang = (u.bookings[0]?.locale === 'en' ? 'en' : 'ar') as BotLang;
    await send(u.telegramChatId, BOOKING_TEXT[lang].unbanned(lang === 'ar' ? cafe.nameAr : cafe.nameEn));
  });
  return true;
}

// ------------------------------------------------------------------ create

export async function createBooking(input: {
  userId: string;
  slug: string;
  pcNumber: number;
  start: Date | 'now';
  minutes: number;
  lang: BotLang;
}): Promise<CreateResult> {
  const at = clockNow();
  const start = input.start === 'now' ? at : input.start;
  const check = checkRequest(start, input.minutes, at);
  if (check !== 'ok') return { ok: false, error: check };
  const end = new Date(start.getTime() + input.minutes * MIN);

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { fullName: true, nickname: true, termsAcceptedAt: true, homeCity: true, isBanned: true, bannedUntil: true },
  });
  if (!user?.fullName || !user.nickname || !user.termsAcceptedAt || !user.homeCity) return { ok: false, error: 'profile' };
  if (isBlocked(user.bannedUntil, user.isBanned, at)) return { ok: false, error: 'blocked' };

  const device = await prisma.device.findFirst({
    where: { pcNumber: input.pcNumber, archivedAt: null, cafe: { slug: input.slug, isPublished: true } },
    include: {
      cafe: {
        select: { id: true, hourlyRate: true, nightShiftRate: true, offers: { select: { hours: true, kind: true, price: true, stationType: true } } },
      },
    },
  });
  if (!device) return { ok: false, error: 'not_found' };
  if (device.isMaintenance) return { ok: false, error: 'maintenance' };

  const ban = await activeBan(device.cafe.id, input.userId, at);
  if (ban) return { ok: false, error: 'arena_banned', detail: { reason: ban.reason, until: ban.until?.toISOString() ?? null } };
  // The arena cancelled this player's booking at this time: do not let them simply book it again.
  const refused = await prisma.booking.findFirst({
    where: {
      userId: input.userId,
      cancelledBy: 'ARENA',
      status: BookingStatus.CANCELLED,
      device: { cafeId: device.cafe.id },
      startTime: { lt: end },
      endTime: { gt: start },
    },
    select: { cancelReason: true },
    orderBy: { cancelledAt: 'desc' },
  });
  if (refused) return { ok: false, error: 'arena_cancelled', detail: { reason: reasonText(refused.cancelReason, input.lang), until: null } };

  const active = await prisma.booking.count({
    where: { userId: input.userId, isWalkIn: false, status: { in: HOLDING }, endTime: { gt: at } },
  });
  if (active >= BOOKING.maxActivePerPlayer) return { ok: false, error: 'has_active' };

  const day = Number(device.hourlyRate ?? device.cafe.hourlyRate);
  const night = Number(device.nightRate ?? device.cafe.nightShiftRate);
  const offers = device.cafe.offers
    .filter((o) => !o.stationType || o.stationType === device.type)
    .map((o) => ({ hours: o.hours, kind: o.kind as OfferKind, price: Number(o.price) }));
  const { price } = priceWithOffers(start, input.minutes, day, night, offers);

  let id: string;
  try {
    const created = await prisma.booking.create({
      data: {
        userId: input.userId,
        deviceId: device.id,
        startTime: start,
        endTime: end,
        totalPrice: new Prisma.Decimal(price),
        status: BookingStatus.CONFIRMED,
        confirmedAt: at,
        locale: input.lang,
      },
      select: { id: true },
    });
    id = created.id;
  } catch (err) {
    // The database refuses two holds on one station at the same time (no_overlap_booking).
    if (String(err instanceof Error ? err.message : err).includes('no_overlap_booking')) return { ok: false, error: 'taken' };
    throw err;
  }

  await prisma.auditLog.create({
    data: { actorType: 'PLAYER', userId: input.userId, action: 'booking.create', details: { bookingId: id, slug: input.slug, pcNumber: input.pcNumber } },
  });
  background('booking notify', () => notifyCreated(id));
  return { ok: true, booking: { id, start: start.toISOString(), end: end.toISOString(), price: String(price) } };
}

/**
 * "Any free station": try the stations of one group (a zone, or one type
 * without a zone) in number order until one can be booked.
 */
export async function bookAny(input: {
  userId: string;
  slug: string;
  type: string;
  groupId: string | null;
  start: Date | 'now';
  minutes: number;
  lang: BotLang;
}): Promise<CreateResult & { pcNumber?: number }> {
  const at = clockNow();
  const start = input.start === 'now' ? at : input.start;
  const end = new Date(start.getTime() + input.minutes * MIN);
  const devices = await prisma.device.findMany({
    where: {
      type: input.type as Prisma.DeviceWhereInput['type'],
      groupId: input.groupId,
      archivedAt: null,
      isMaintenance: false,
      cafe: { slug: input.slug, isPublished: true },
      // Skip the ones already held during that time.
      bookings: { none: { status: { in: HOLDING }, startTime: { lt: end }, endTime: { gt: start } } },
    },
    orderBy: { pcNumber: 'asc' },
    select: { pcNumber: true },
  });
  if (devices.length === 0) return { ok: false, error: 'taken' };
  for (const d of devices) {
    const r = await createBooking({ ...input, pcNumber: d.pcNumber, start: input.start });
    if (r.ok) return { ...r, pcNumber: d.pcNumber };
    // Someone else just got it, or it went out of service: try the next one.
    if (r.error !== 'taken' && r.error !== 'maintenance' && r.error !== 'not_found') return r;
  }
  return { ok: false, error: 'taken' };
}

/** When a group of stations is taken, per station, for the "any station" sheet. */
export async function poolSchedule(slug: string, type: string, groupId: string | null) {
  const at = clockNow();
  const devices = await prisma.device.findMany({
    where: {
      type: type as Prisma.DeviceWhereInput['type'],
      groupId,
      archivedAt: null,
      isMaintenance: false,
      cafe: { slug, isPublished: true },
    },
    orderBy: { pcNumber: 'asc' },
    select: {
      pcNumber: true,
      bookings: {
        where: {
          status: { in: HOLDING },
          endTime: { gt: at },
          startTime: { lt: new Date(at.getTime() + (BOOKING.maxDaysAhead + 1) * 24 * 60 * MIN) },
        },
        select: { startTime: true, endTime: true },
      },
      cafe: { select: { offers: { orderBy: { hours: 'asc' }, select: { hours: true, kind: true, price: true, stationType: true } } } },
    },
  });
  if (devices.length === 0) return null;
  return {
    stations: devices.map((d) => ({
      pcNumber: d.pcNumber,
      taken: d.bookings.map((b) => ({ start: b.startTime.toISOString(), end: b.endTime.toISOString() })),
    })),
    offers: devices[0].cafe.offers
      .filter((o) => !o.stationType || o.stationType === type)
      .map((o) => ({ hours: o.hours, kind: o.kind as OfferKind, price: Number(o.price) })),
  };
}

async function notifyCreated(id: string) {
  const x = await facts(id, 'ar');
  if (!x) return;
  const lang = (x.b.locale === 'en' ? 'en' : 'ar') as BotLang;
  const mine = lang === 'ar' ? x : await facts(id, lang);
  if (x.b.user?.telegramChatId && mine) {
    const ask = reminderAt(x.b.createdAt, x.b.startTime);
    await sendTracked(x.b.user.telegramChatId, BOOKING_TEXT[lang].confirmed(mine.f, ask ? formatDamascusTime(ask) : null), id, 'player', [
      [{ text: BOOKING_TEXT[lang].cancelButton, callback_data: `bp:c:${id}` }],
    ]);
  }
  const u = x.b.user;
  const text = ARENA_TEXT.newBooking(x.f, playerLabel(u), u?.phone ?? '—', u?.homeCity ? cityName(u.homeCity, 'ar') : '—');
  for (const chat of await arenaChats(x.b.device.cafeId)) {
    await sendTracked(chat, text, id, 'arena', [
      [
        { text: ARENA_TEXT.arrived, callback_data: `bk:a:${id}` },
        { text: ARENA_TEXT.noShow, callback_data: `bk:n:${id}` },
        { text: ARENA_TEXT.cancel, callback_data: `bk:c:${id}` },
      ],
    ]);
  }
}

// ------------------------------------------------------------------ player

export async function listMyBookings(userId: string) {
  const at = clockNow();
  const rows = await prisma.booking.findMany({
    where: { userId, isWalkIn: false, OR: [{ endTime: { gt: new Date(at.getTime() - 30 * 24 * 60 * MIN) } }] },
    orderBy: { startTime: 'desc' },
    take: 20,
    include: { device: { select: { pcNumber: true, type: true, cafeId: true, cafe: { select: { slug: true, nameAr: true, nameEn: true } } } } },
  });
  return Promise.all(
    rows.map(async (b) => ({
      id: b.id,
      arenaSlug: b.device.cafe.slug,
      arenaAr: b.device.cafe.nameAr,
      arenaEn: b.device.cafe.nameEn,
      station: await stationName(b.device.cafeId, b.device.pcNumber, b.device.type),
      start: b.startTime.toISOString(),
      end: b.endTime.toISOString(),
      price: b.totalPrice.toFixed(0),
      status: b.status,
      /** Upcoming and still cancellable by the player. */
      canCancel: HOLDING.includes(b.status) && b.startTime > at,
      live: HOLDING.includes(b.status) && b.startTime <= at && b.endTime > at,
    })),
  );
}
export type MyBooking = Awaited<ReturnType<typeof listMyBookings>>[number];

/** For the bot: a player's bookings that have not ended yet, soonest first, as text lines. */
export async function upcomingForBot(userId: string, lang: BotLang, limit = 5) {
  const at = clockNow();
  const rows = await prisma.booking.findMany({
    where: { userId, isWalkIn: false, status: { in: HOLDING }, endTime: { gt: at } },
    orderBy: { startTime: 'asc' },
    take: limit,
    include: { device: { select: { pcNumber: true, type: true, cafeId: true, cafe: { select: { nameAr: true, nameEn: true } } } } },
  });
  return Promise.all(
    rows.map(async (b) => ({
      id: b.id,
      canCancel: b.startTime > at,
      text: `🏟 ${lang === 'ar' ? b.device.cafe.nameAr : b.device.cafe.nameEn}\n🎮 ${await stationName(b.device.cafeId, b.device.pcNumber, b.device.type)}\n🗓 ${formatWhen(lang, b.startTime, b.endTime)}`,
    })),
  );
}

/** Player cancels before the start. Returns false when it is too late or not theirs. */
export async function cancelByPlayer(userId: string, bookingId: string): Promise<boolean> {
  const at = clockNow();
  const done = await prisma.booking.updateMany({
    where: { id: bookingId, userId, status: { in: HOLDING }, startTime: { gt: at } },
    data: { status: BookingStatus.CANCELLED, cancelledAt: at, cancelledBy: 'PLAYER' },
  });
  if (done.count !== 1) return false;
  await prisma.auditLog.create({ data: { actorType: 'PLAYER', userId, action: 'booking.cancel', details: { bookingId } } });
  background('booking cancel notify', async () => {
    const x = await facts(bookingId, 'ar');
    if (!x) return;
    const lang = (x.b.locale === 'en' ? 'en' : 'ar') as BotLang;
    const mine = lang === 'ar' ? x : await facts(bookingId, lang);
    await refreshMessages(bookingId, 'player_cancel');
    if (x.b.user?.telegramChatId && mine) await send(x.b.user.telegramChatId, BOOKING_TEXT[lang].cancelledByYou(mine.f));
    await tellArena(x.b.device.cafeId, ARENA_TEXT.playerCancelled(x.f, playerLabel(x.b.user)));
  });
  return true;
}

/** Player answers "still coming?" with yes. */
export async function confirmComing(userId: string, bookingId: string): Promise<boolean> {
  const at = clockNow();
  const done = await prisma.booking.updateMany({
    where: { id: bookingId, userId, status: { in: HOLDING }, endTime: { gt: at } },
    data: { stillComingAt: at },
  });
  if (done.count !== 1) return false;
  background('booking coming notify', async () => {
    await refreshMessages(bookingId, 'coming');
    const x = await facts(bookingId, 'ar');
    if (x) await tellArena(x.b.device.cafeId, ARENA_TEXT.playerComing(x.f, playerLabel(x.b.user)));
  });
  return true;
}

// ------------------------------------------------------------------ arena

export type ArenaMark = 'arrived' | 'noshow' | 'cancel';

/**
 * Arena owner or staff marks a booking. `userId` must be a member of the
 * booking's arena (checked here). Returns the player's display name, or an error.
 */
export async function markByArena(
  userId: string,
  bookingId: string,
  mark: ArenaMark,
  opts: { reason?: string; ban?: { until: Date | null; reason: string } } = {},
): Promise<{ ok: true; player: string } | { ok: false; error: 'not_allowed' | 'too_late' }> {
  const at = clockNow();
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, status: true, startTime: true, endTime: true, userId: true, actualStart: true, device: { select: { cafeId: true } } },
  });
  if (!b) return { ok: false, error: 'not_allowed' };
  const member = await prisma.arenaMember.findUnique({ where: { cafeId_userId: { cafeId: b.device.cafeId, userId } } });
  if (!member) return { ok: false, error: 'not_allowed' };
  if (!HOLDING.includes(b.status) || b.endTime <= at) return { ok: false, error: 'too_late' };

  if (mark === 'arrived') {
    await prisma.booking.update({ where: { id: b.id }, data: { actualStart: at } });
  } else if (mark === 'cancel') {
    await prisma.booking.update({
      where: { id: b.id },
      data: { status: BookingStatus.CANCELLED, cancelledAt: at, cancelledBy: 'ARENA', cancelReason: opts.reason?.trim() || null },
    });
    if (opts.ban && b.userId) await banPlayer(b.device.cafeId, userId, b.userId, opts.ban.until, opts.ban.reason);
  } else {
    // No-show counts only once the booking has started, and never after "arrived".
    if (b.startTime > at || b.actualStart) return { ok: false, error: 'too_late' };
    await prisma.booking.update({
      where: { id: b.id },
      data: { status: BookingStatus.NO_SHOW, endTime: at > b.startTime ? at : b.endTime },
    });
    if (b.userId) {
      const u = await prisma.user.update({
        where: { id: b.userId },
        data: { strikesCount: { increment: 1 } },
        select: { strikesCount: true },
      });
      if (u.strikesCount % BOOKING.strikesToBlock === 0) {
        await prisma.user.update({
          where: { id: b.userId },
          data: { bannedUntil: new Date(at.getTime() + BOOKING.blockDays * 24 * 60 * MIN) },
        });
      }
    }
  }
  await prisma.auditLog.create({ data: { actorType: 'OWNER', userId, action: `booking.${mark}`, details: { bookingId } } });

  await refreshMessages(b.id, mark === 'cancel' ? 'arena_cancel' : mark);
  const x = await facts(b.id, 'ar');
  const player = playerLabel(x?.b.user ?? null);
  if (x?.b.user?.telegramChatId && mark !== 'arrived') {
    const lang = (x.b.locale === 'en' ? 'en' : 'ar') as BotLang;
    const mine = lang === 'ar' ? x : await facts(b.id, lang);
    if (mine) {
      const cafe = await prisma.cafe.findUnique({ where: { id: b.device.cafeId }, select: { slug: true } });
      const site = siteUrl();
      const text =
        mark === 'cancel'
          ? BOOKING_TEXT[lang].cancelledByArena(mine.f, reasonText(x.b.cancelReason, lang), site && cafe ? `${site}/arenas/${cafe.slug}` : null)
          : BOOKING_TEXT[lang].noShow(mine.f, x.b.user.strikesCount, BOOKING.strikesToBlock);
      await send(x.b.user.telegramChatId, text).catch(() => undefined);
    }
  }
  return { ok: true, player };
}

/**
 * Where the "still coming?" question stands, for the arena:
 * arrived · confirmed (player said yes) · waiting (asked, no answer yet, until
 * `at`) · later (will be asked at `at`) · close (booked shortly before: no question).
 */
function confirmState(b: { actualStart: Date | null; createdAt: Date; startTime: Date; reminderSentAt: Date | null; stillComingAt: Date | null }): {
  confirm: 'arrived' | 'confirmed' | 'waiting' | 'later' | 'close';
  confirmAt: string | null;
} {
  if (b.actualStart) return { confirm: 'arrived', confirmAt: null };
  const ask = reminderAt(b.createdAt, b.startTime);
  if (!ask) return { confirm: 'close', confirmAt: null };
  if (b.stillComingAt) return { confirm: 'confirmed', confirmAt: b.stillComingAt.toISOString() };
  if (b.reminderSentAt) return { confirm: 'waiting', confirmAt: new Date(b.startTime.getTime() - BOOKING.answerByBeforeMin * MIN).toISOString() };
  return { confirm: 'later', confirmAt: ask.toISOString() };
}

/** Upcoming online bookings of an arena, for the owner panel. */
export async function arenaBookings(cafeId: string) {
  const at = clockNow();
  const rows = await prisma.booking.findMany({
    where: { isWalkIn: false, device: { cafeId }, status: { in: HOLDING }, endTime: { gt: at } },
    orderBy: { startTime: 'asc' },
    take: 100,
    include: {
      device: { select: { pcNumber: true, type: true } },
      user: { select: { name: true, nickname: true, fullName: true, phone: true, homeCity: true, badges: { where: { cafeId }, select: { badge: true } } } },
    },
  });
  return Promise.all(
    rows.map(async (b) => ({
      id: b.id,
      userId: b.userId ?? '',
      station: await stationName(cafeId, b.device.pcNumber, b.device.type),
      start: b.startTime.toISOString(),
      end: b.endTime.toISOString(),
      price: b.totalPrice.toFixed(0),
      player: b.user?.nickname ?? b.user?.name ?? '—',
      fullName: b.user?.fullName ?? '',
      phone: b.user?.phone ?? '',
      city: b.user?.homeCity ?? '',
      badge: b.user?.badges[0]?.badge ?? '',
      arrived: !!b.actualStart,
      stillComing: !!b.stillComingAt,
      ...confirmState(b),
      started: b.startTime <= at,
    })),
  );
}
export type ArenaBooking = Awaited<ReturnType<typeof arenaBookings>>[number];

// ------------------------------------------------------------------ schedule

/** Taken time ranges of one station for the next 7 days (for the booking pop-up). */
export async function stationSchedule(slug: string, pcNumber: number) {
  const at = clockNow();
  const device = await prisma.device.findFirst({
    where: { pcNumber, archivedAt: null, cafe: { slug, isPublished: true } },
    select: {
      id: true,
      type: true,
      group: { select: GROUP_SELECT },
      cafe: { select: { offers: { orderBy: { hours: 'asc' }, select: { hours: true, kind: true, price: true, stationType: true, noteAr: true, noteEn: true } } } },
    },
  });
  if (!device) return null;
  const rows = await prisma.booking.findMany({
    where: {
      deviceId: device.id,
      status: { in: HOLDING },
      endTime: { gt: at },
      startTime: { lt: new Date(at.getTime() + (BOOKING.maxDaysAhead + 1) * 24 * 60 * MIN) },
    },
    select: { startTime: true, endTime: true },
    orderBy: { startTime: 'asc' },
  });
  return {
    taken: rows.map((r) => ({ start: r.startTime.toISOString(), end: r.endTime.toISOString() })),
    /** The station's zone with its hardware, for the pop-up (null when not in a zone). */
    zone: device.group,
    /** Price packages that apply to this station. */
    offers: device.cafe.offers
      .filter((o) => !o.stationType || o.stationType === device.type)
      .map((o) => ({ hours: o.hours, kind: o.kind as OfferKind, price: Number(o.price), noteAr: o.noteAr, noteEn: o.noteEn })),
  };
}

// ------------------------------------------------------------------ minute job

/**
 * Runs every minute (instrumentation.ts). Idempotent: each step only touches
 * rows that still need it, so overlapping runs or restarts are harmless.
 */
export async function tick(): Promise<void> {
  const at = clockNow();

  // 1. "Still coming?" 60 minutes before, for bookings made well ahead.
  const due = await prisma.booking.findMany({
    where: {
      isWalkIn: false,
      status: BookingStatus.CONFIRMED,
      reminderSentAt: null,
      stillComingAt: null,
      startTime: { gt: new Date(at.getTime() + BOOKING.answerByBeforeMin * MIN), lte: new Date(at.getTime() + BOOKING.reminderBeforeMin * MIN) },
      user: { telegramChatId: { not: null } },
    },
    select: { id: true, createdAt: true, startTime: true, locale: true },
    take: 50,
  });
  for (const b of due) {
    const when = reminderAt(b.createdAt, b.startTime);
    // Booked shortly before the start: the player clearly means it, no question.
    if (!when) {
      await prisma.booking.updateMany({ where: { id: b.id, reminderSentAt: null }, data: { reminderSentAt: at, stillComingAt: at } });
      continue;
    }
    if (when > at) continue; // its time has not come yet (30-minute reminders)
    const claimed = await prisma.booking.updateMany({ where: { id: b.id, reminderSentAt: null }, data: { reminderSentAt: at } });
    if (claimed.count !== 1) continue;
    const lang = (b.locale === 'en' ? 'en' : 'ar') as BotLang;
    const x = await facts(b.id, lang);
    if (!x?.b.user?.telegramChatId) continue;
    const answerBy = formatDamascusTime(new Date(b.startTime.getTime() - BOOKING.answerByBeforeMin * MIN));
    await sendTracked(x.b.user.telegramChatId, BOOKING_TEXT[lang].reminder(x.f, answerBy), b.id, 'reminder', [
      [
        { text: BOOKING_TEXT[lang].comingButton, callback_data: `bp:y:${b.id}` },
        { text: BOOKING_TEXT[lang].cancelButton, callback_data: `bp:c:${b.id}` },
      ],
    ]);
  }

  // 2. No answer by 15 minutes before the start: free the station.
  const silent = await prisma.booking.findMany({
    where: {
      isWalkIn: false,
      status: BookingStatus.CONFIRMED,
      reminderSentAt: { not: null },
      stillComingAt: null,
      startTime: { lte: new Date(at.getTime() + BOOKING.answerByBeforeMin * MIN) },
    },
    select: { id: true, locale: true },
    take: 50,
  });
  for (const b of silent) {
    const done = await prisma.booking.updateMany({
      where: { id: b.id, status: BookingStatus.CONFIRMED, stillComingAt: null },
      data: { status: BookingStatus.CANCELLED, cancelledAt: at, cancelledBy: 'SYSTEM' },
    });
    if (done.count !== 1) continue;
    await refreshMessages(b.id, 'auto_cancel');
    const lang = (b.locale === 'en' ? 'en' : 'ar') as BotLang;
    const x = await facts(b.id, lang);
    if (x?.b.user?.telegramChatId) await send(x.b.user.telegramChatId, BOOKING_TEXT[lang].cancelledNoAnswer(x.f));
    const xa = lang === 'ar' ? x : await facts(b.id, 'ar');
    if (xa) await tellArena(xa.b.device.cafeId, ARENA_TEXT.autoCancelled(xa.f, playerLabel(xa.b.user)));
  }

  // 3. Finished sessions are marked completed (keeps lists and counts tidy).
  await prisma.booking.updateMany({
    where: { status: BookingStatus.CONFIRMED, endTime: { lte: at } },
    data: { status: BookingStatus.COMPLETED },
  });
}
