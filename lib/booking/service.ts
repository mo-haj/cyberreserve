// Online booking: create, cancel, arena actions, schedule, and the minute job
// that sends "still coming?" reminders. Server only. Telegram messages are
// best effort: a failed message never undoes a booking.
import { BookingStatus, Prisma } from '@prisma/client';
import { cityName } from '@/lib/cities';
import { prisma } from '@/lib/prisma';
import { now as clockNow, formatDamascusTime } from '@/lib/time';
import { tg } from '@/lib/telegram/api';
import { BOOKING, checkRequest, isBlocked, priceFor, reminderAt, type BookingCheck } from '@/lib/booking/rules';
import { ARENA_TEXT, BOOKING_TEXT, formatWhen, type BookingFacts, type BotLang } from '@/lib/booking/texts';

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
  | 'profile';

export type CreateResult =
  | { ok: true; booking: { id: string; start: string; end: string; price: string } }
  | { ok: false; error: CreateError };

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
    include: { cafe: { select: { id: true, hourlyRate: true, nightShiftRate: true } } },
  });
  if (!device) return { ok: false, error: 'not_found' };
  if (device.isMaintenance) return { ok: false, error: 'maintenance' };

  const active = await prisma.booking.count({
    where: { userId: input.userId, isWalkIn: false, status: { in: HOLDING }, endTime: { gt: at } },
  });
  if (active >= BOOKING.maxActivePerPlayer) return { ok: false, error: 'has_active' };

  const day = Number(device.hourlyRate ?? device.cafe.hourlyRate);
  const night = Number(device.nightRate ?? device.cafe.nightShiftRate);
  const price = priceFor(start, input.minutes, day, night);

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
  void notifyCreated(id).catch((e) => console.error('[booking] notify failed:', e instanceof Error ? e.message : e));
  return { ok: true, booking: { id, start: start.toISOString(), end: end.toISOString(), price: String(price) } };
}

async function notifyCreated(id: string) {
  const x = await facts(id, 'ar');
  if (!x) return;
  const lang = (x.b.locale === 'en' ? 'en' : 'ar') as BotLang;
  const mine = lang === 'ar' ? x : await facts(id, lang);
  if (x.b.user?.telegramChatId && mine) {
    const ask = reminderAt(x.b.createdAt, x.b.startTime);
    await send(x.b.user.telegramChatId, BOOKING_TEXT[lang].confirmed(mine.f, ask ? formatDamascusTime(ask) : null), [
      [{ text: BOOKING_TEXT[lang].cancelButton, callback_data: `bp:c:${id}` }],
    ]);
  }
  const u = x.b.user;
  await tellArena(
    x.b.device.cafeId,
    ARENA_TEXT.newBooking(x.f, playerLabel(u), u?.phone ?? '—', u?.homeCity ? cityName(u.homeCity, 'ar') : '—'),
    [
      [
        { text: ARENA_TEXT.arrived, callback_data: `bk:a:${id}` },
        { text: ARENA_TEXT.noShow, callback_data: `bk:n:${id}` },
        { text: ARENA_TEXT.cancel, callback_data: `bk:c:${id}` },
      ],
    ],
  );
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

/** Player cancels before the start. Returns false when it is too late or not theirs. */
export async function cancelByPlayer(userId: string, bookingId: string): Promise<boolean> {
  const at = clockNow();
  const done = await prisma.booking.updateMany({
    where: { id: bookingId, userId, status: { in: HOLDING }, startTime: { gt: at } },
    data: { status: BookingStatus.CANCELLED, cancelledAt: at, cancelledBy: 'PLAYER' },
  });
  if (done.count !== 1) return false;
  await prisma.auditLog.create({ data: { actorType: 'PLAYER', userId, action: 'booking.cancel', details: { bookingId } } });
  void (async () => {
    const x = await facts(bookingId, 'ar');
    if (!x) return;
    const lang = (x.b.locale === 'en' ? 'en' : 'ar') as BotLang;
    const mine = lang === 'ar' ? x : await facts(bookingId, lang);
    if (x.b.user?.telegramChatId && mine) await send(x.b.user.telegramChatId, BOOKING_TEXT[lang].cancelledByYou(mine.f));
    await tellArena(x.b.device.cafeId, ARENA_TEXT.playerCancelled(x.f, playerLabel(x.b.user)));
  })().catch(() => undefined);
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
  void (async () => {
    const x = await facts(bookingId, 'ar');
    if (x) await tellArena(x.b.device.cafeId, ARENA_TEXT.playerComing(x.f, playerLabel(x.b.user)));
  })().catch(() => undefined);
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
      data: { status: BookingStatus.CANCELLED, cancelledAt: at, cancelledBy: 'ARENA' },
    });
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

  const x = await facts(b.id, 'ar');
  const player = playerLabel(x?.b.user ?? null);
  if (x?.b.user?.telegramChatId && mark !== 'arrived') {
    const lang = (x.b.locale === 'en' ? 'en' : 'ar') as BotLang;
    const mine = lang === 'ar' ? x : await facts(b.id, lang);
    if (mine) {
      const text =
        mark === 'cancel'
          ? BOOKING_TEXT[lang].cancelledByArena(mine.f)
          : BOOKING_TEXT[lang].noShow(mine.f, x.b.user.strikesCount, BOOKING.strikesToBlock);
      await send(x.b.user.telegramChatId, text).catch(() => undefined);
    }
  }
  return { ok: true, player };
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
      user: { select: { name: true, nickname: true, fullName: true, phone: true, homeCity: true } },
    },
  });
  return Promise.all(
    rows.map(async (b) => ({
      id: b.id,
      station: await stationName(cafeId, b.device.pcNumber, b.device.type),
      start: b.startTime.toISOString(),
      end: b.endTime.toISOString(),
      price: b.totalPrice.toFixed(0),
      player: b.user?.nickname ?? b.user?.name ?? '—',
      fullName: b.user?.fullName ?? '',
      phone: b.user?.phone ?? '',
      city: b.user?.homeCity ?? '',
      arrived: !!b.actualStart,
      stillComing: !!b.stillComingAt,
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
    select: { id: true },
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
  return rows.map((r) => ({ start: r.startTime.toISOString(), end: r.endTime.toISOString() }));
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
    await send(x.b.user.telegramChatId, BOOKING_TEXT[lang].reminder(x.f, answerBy), [
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
