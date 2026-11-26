// Handles updates from Telegram for sign-in. Called by the webhook route
// (production) and, through it, by the local poller (development).
//
// Flow:
//   1. Website creates a LoginRequest and shows a 6-digit code.
//   2. Player opens t.me/<bot>?start=login_<shortId> (or sends that command).
//      The request is bound to the first Telegram account that opens it.
//   3. Bot asks for the code; the player types it. 3 wrong codes -> FAILED.
//      (Stops "send someone your login link" phishing: the victim does not
//      see the attacker's code. 3 tries out of 900,000 codes cannot be guessed.)
//   4. First time only: the player shares their phone with Telegram's
//      contact button; we accept it only if it is their own number. Typed
//      numbers are refused with an explanation (they cannot be verified).
//   5. Request becomes CONFIRMED; the website's poll then opens a session.
//
// Every message from the player gets a reply, so the chat never goes silent.

import { z } from 'zod';
import { LoginStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { now } from '@/lib/time';
import { sendHtml, sendText, tg } from '@/lib/telegram/api';
import { bookScreen, favouritesScreen, languageDone, languageScreen, tournamentsScreen, type Screen } from '@/lib/telegram/menu';
import { saveRating, saveReviewComment } from '@/lib/engage';
import { ENGAGE_TEXT } from '@/lib/engage-texts';
import { cancelByPlayer, confirmComing, markByArena, upcomingForBot } from '@/lib/booking/service';
import { supportContactFor } from '@/lib/legal';
import { ARENA_TEXT, BOOKING_TEXT, CANCEL_REASONS } from '@/lib/booking/texts';
import {
  BOT_COMMANDS,
  BOT_TEXT,
  LANG_BUTTONS,
  MEMBER_BUTTONS,
  MEMBER_TEXT,
  MEMBER_ACTIONS,
  memberAction,
  type MemberAction,
  MAX_CODE_ATTEMPTS,
  asBotLocale,
  botLocale,
  langCallback,
  parseLangCallback,
  displayName,
  isBareStart,
  isOwnContact,
  normalizePhone,
  parseStartPayload,
  parseTypedCode,
} from '@/lib/telegram/logic';

const From = z.object({
  id: z.number(),
  first_name: z.string().default(''),
  last_name: z.string().optional(),
  language_code: z.string().optional(),
});

// Only the parts of an update we use; everything else is ignored.
export const TelegramUpdate = z.object({
  update_id: z.number(),
  message: z
    .object({
      chat: z.object({ id: z.number(), type: z.string() }),
      from: From.optional(),
      text: z.string().optional(),
      contact: z
        .object({
          phone_number: z.string(),
          user_id: z.number().optional(),
          first_name: z.string().optional(),
          last_name: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      from: From,
      data: z.string().optional(),
      message: z.object({ chat: z.object({ id: z.number() }), message_id: z.number().optional() }).optional(),
    })
    .optional(),
});
export type TelegramUpdate = z.infer<typeof TelegramUpdate>;

const REMOVE_KEYBOARD = { remove_keyboard: true };

/** "My bookings" and "Help", always visible at the bottom of the chat once signed in. */
function memberKeyboard(lang: 'ar' | 'en') {
  const b = MEMBER_BUTTONS[lang];
  return {
    keyboard: [
      [{ text: b.book }, { text: b.favorites }],
      [{ text: b.bookings }, { text: b.tournaments }],
      [{ text: b.support }, { text: b.language }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

// The "/" command menu, sent to Telegram once per server start.
let commandsSet = false;
function ensureCommands() {
  if (commandsSet) return;
  commandsSet = true;
  void Promise.all([
    tg('setMyCommands', { commands: BOT_COMMANDS.en }),
    tg('setMyCommands', { commands: BOT_COMMANDS.ar, language_code: 'ar' }),
  ]).catch(() => {
    commandsSet = false;
  });
}

export async function handleUpdate(update: TelegramUpdate): Promise<void> {
  ensureCommands();
  if (update.callback_query) return onCallback(update.callback_query);
  const msg = update.message;
  if (!msg?.from || msg.chat.type !== 'private') return;
  // Kind only, never content or numbers: enough to follow a sign-in in the logs.
  console.log(`[telegram] message: ${msg.contact ? 'contact' : msg.text?.startsWith('/start') ? 'start' : msg.text ? 'text' : 'other'}`);
  if (msg.contact) return onContact(msg.chat.id, msg.from, msg.contact);
  if (msg.text !== undefined) return onText(msg.chat.id, msg.from, msg.text);
  // Stickers, photos, voice...: point back to the current step.
  return onText(msg.chat.id, msg.from, '');
}

type FromT = z.infer<typeof From>;
type Text = (typeof BOT_TEXT)[keyof typeof BOT_TEXT];

function contactKeyboard(t: Text) {
  return {
    keyboard: [[{ text: t.shareButton, request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: false,
    is_persistent: true,
    // Telegram has no way to lock the text box; this hint replaces its placeholder.
    input_field_placeholder: t.sharePlaceholder,
  };
}

async function onText(chatId: number, from: FromT, text: string) {
  // Telegram's app language until we know this player's sign-in; then the sign-in's language.
  let t: Text = BOT_TEXT[botLocale(from.language_code)];
  const telegramUserId = String(from.id);

  // An arena member was asked to type why they cancel a booking. Never take a
  // sign-in code (any format), a command, a menu button, or anything typed
  // while a sign-in is under way as the reason; and always ask before cancelling.
  if (text.trim() && !text.startsWith('/') && parseTypedCode(text) === null && !parseStartPayload(text)) {
    const menuButton = Object.values(MEMBER_BUTTONS).some((b) => (Object.values(b) as string[]).includes(text.trim()));
    const pending = menuButton ? null : await prisma.telegramPending.findUnique({ where: { chatId: String(chatId) } });
    if (pending && pending.kind === 'review_comment' && pending.expiresAt > now()) {
      const signingIn = await prisma.loginRequest.count({
        where: { telegramUserId, status: { in: [LoginStatus.PENDING, LoginStatus.AWAITING_CONTACT] }, expiresAt: { gt: now() } },
      });
      if (!signingIn) {
        await saveReviewComment(pending.bookingId, text);
        await prisma.telegramPending.deleteMany({ where: { chatId: String(chatId) } });
        const lang = (await prisma.booking.findUnique({ where: { id: pending.bookingId }, select: { locale: true } }))?.locale === 'en' ? 'en' : 'ar';
        await sendText(chatId, ENGAGE_TEXT[lang].rateDone);
        return;
      }
    }
    if (pending && pending.kind === 'cancel_reason' && pending.expiresAt > now()) {
      const signingIn = await prisma.loginRequest.count({
        where: { telegramUserId, status: { in: [LoginStatus.PENDING, LoginStatus.AWAITING_CONTACT] }, expiresAt: { gt: now() } },
      });
      if (!signingIn) {
        const reason = text.trim().slice(0, 300);
        await prisma.telegramPending.update({
          where: { chatId: String(chatId) },
          data: { kind: 'cancel_confirm', text: reason, expiresAt: new Date(now().getTime() + 10 * 60_000) },
        });
        await sendText(chatId, ARENA_TEXT.confirmReason(reason), {
          inline_keyboard: [
            [
              { text: ARENA_TEXT.confirmYes, callback_data: `bkr:y:${pending.bookingId}` },
              { text: ARENA_TEXT.confirmNo, callback_data: `bkr:k:${pending.bookingId}` },
            ],
          ],
        });
        return;
      }
    }
  }

  const shortId = parseStartPayload(text);
  if (shortId) {
    // Bind the request to the first Telegram account that opens it.
    const bound = await prisma.loginRequest.updateMany({
      where: {
        shortId,
        status: LoginStatus.PENDING,
        expiresAt: { gt: now() },
        OR: [{ telegramUserId: null }, { telegramUserId }],
      },
      data: { telegramUserId },
    });
    const req = bound.count === 1 ? await prisma.loginRequest.findUnique({ where: { shortId } }) : null;
    if (!req) {
      await sendText(chatId, t.invalid, REMOVE_KEYBOARD);
      return;
    }
    // Same language as the website; the buttons switch it for this sign-in.
    await sendText(chatId, BOT_TEXT[asBotLocale(req.locale)].askCode, langKeyboard(shortId));
    return;
  }

  // Anything else: answer according to this player's open sign-in, if any.
  const request = await prisma.loginRequest.findFirst({
    where: {
      telegramUserId,
      status: { in: [LoginStatus.PENDING, LoginStatus.AWAITING_CONTACT] },
      expiresAt: { gt: now() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!request) {
    // Already signed in before? Then this is a player we know: answer as such.
    const me = await prisma.user.findUnique({
      where: { telegramChatId: telegramUserId },
      select: { id: true, name: true, nickname: true, botLocale: true },
    });
    if (me) return onMember(chatId, from, me, text);
    await sendText(chatId, isBareStart(text) ? t.welcome : t.noPending, REMOVE_KEYBOARD);
    return;
  }
  t = BOT_TEXT[asBotLocale(request.locale)];

  if (request.status === LoginStatus.AWAITING_CONTACT) {
    await sendText(chatId, t.useButton, contactKeyboard(t));
    return;
  }

  const typed = parseTypedCode(text);
  if (typed === null) {
    await sendText(chatId, t.notACode);
    return;
  }

  if (typed !== request.code) {
    const counted = await prisma.loginRequest.updateMany({
      where: { id: request.id, status: LoginStatus.PENDING, attempts: { lt: MAX_CODE_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    const attempts = request.attempts + (counted.count === 1 ? 1 : MAX_CODE_ATTEMPTS);
    if (attempts >= MAX_CODE_ATTEMPTS) {
      await prisma.loginRequest.updateMany({
        where: { id: request.id, status: LoginStatus.PENDING },
        data: { status: LoginStatus.FAILED },
      });
      await sendText(chatId, t.wrong);
    } else {
      await sendText(chatId, t.wrongTry(MAX_CODE_ATTEMPTS - attempts));
    }
    return;
  }

  const user = await prisma.user.findUnique({ where: { telegramChatId: telegramUserId } });
  if (user?.phone) {
    const confirmed = await prisma.loginRequest.updateMany({
      where: { id: request.id, status: LoginStatus.PENDING },
      data: { status: LoginStatus.CONFIRMED, userId: user.id },
    });
    await sendText(chatId, confirmed.count === 1 ? t.done : t.invalid, confirmed.count === 1 ? memberKeyboard(asBotLocale(request.locale)) : REMOVE_KEYBOARD);
    return;
  }

  const moved = await prisma.loginRequest.updateMany({
    where: { id: request.id, status: LoginStatus.PENDING },
    data: { status: LoginStatus.AWAITING_CONTACT },
  });
  if (moved.count !== 1) {
    await sendText(chatId, t.invalid);
    return;
  }
  await sendText(chatId, t.askContact, contactKeyboard(t));
}

function langKeyboard(shortId: string) {
  return {
    inline_keyboard: [LANG_BUTTONS.map((b) => ({ text: b.label, callback_data: langCallback(shortId, b.locale) }))],
  };
}

/** Stars after a visit (rv:<1-5>:<bookingId>), or "skip the comment" (rv:s:<bookingId>). */
async function onRating(cb: NonNullable<TelegramUpdate['callback_query']>, chatId: number, data: string) {
  await tg('answerCallbackQuery', { callback_query_id: cb.id });
  const [, what, bookingId] = data.split(':');
  if (!bookingId) return;
  if (what === 's') {
    await prisma.telegramPending.deleteMany({ where: { chatId: String(chatId), kind: 'review_comment' } });
    const lang = (await prisma.booking.findUnique({ where: { id: bookingId }, select: { locale: true } }))?.locale === 'en' ? 'en' : 'ar';
    await sendText(chatId, ENGAGE_TEXT[lang].rateDone);
    return;
  }
  const r = await saveRating(String(cb.from.id), bookingId, Number(what));
  if (!r.ok) {
    await sendText(chatId, ENGAGE_TEXT[botLocale(cb.from.language_code)].rateFail);
    return;
  }
  // Remove the star buttons from the question.
  if (cb.message?.message_id) await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
  await prisma.telegramPending.upsert({
    where: { chatId: String(chatId) },
    create: { chatId: String(chatId), kind: 'review_comment', bookingId, expiresAt: new Date(now().getTime() + 15 * 60_000) },
    update: { kind: 'review_comment', bookingId, text: null, expiresAt: new Date(now().getTime() + 15 * 60_000) },
  });
  await sendText(chatId, ENGAGE_TEXT[r.lang].rateThanks(Number(what)), {
    inline_keyboard: [[{ text: ENGAGE_TEXT[r.lang].rateSkip, callback_data: `rv:s:${bookingId}` }]],
  });
}

/** Language buttons, booking buttons; anything else (e.g. the old number-picking flow): start again. */
async function onCallback(cb: NonNullable<TelegramUpdate['callback_query']>) {
  const chatId = cb.message?.chat.id ?? cb.from.id;
  const data = cb.data ?? '';
  if (data.startsWith('bkr:')) return onCancelReason(cb, chatId, data);
  if (data.startsWith('rv:')) return onRating(cb, chatId, data);
  if (data.startsWith('bp:') || data.startsWith('bk:')) return onBookingButton(cb, chatId, data);
  if (data.startsWith('m:')) {
    await tg('answerCallbackQuery', { callback_query_id: cb.id });
    const me = await prisma.user.findUnique({
      where: { telegramChatId: String(cb.from.id) },
      select: { id: true, name: true, nickname: true, botLocale: true },
    });
    if (!me) {
      await sendText(chatId, BOT_TEXT[botLocale(cb.from.language_code)].noPending, REMOVE_KEYBOARD);
      return;
    }
    // m:lang:ar / m:lang:en: the player picked the bot language.
    const picked = /^m:lang:(ar|en)$/.exec(data)?.[1] as 'ar' | 'en' | undefined;
    if (picked) {
      await prisma.user.update({ where: { id: me.id }, data: { botLocale: picked } });
      // The new language's bottom buttons come with the confirmation.
      await sendText(chatId, languageDone(picked), memberKeyboard(picked));
      return;
    }
    const action = data.slice(2);
    if ((MEMBER_ACTIONS as string[]).includes(action)) return onMember(chatId, cb.from, me, '', action as MemberAction);
    return;
  }
  await tg('answerCallbackQuery', { callback_query_id: cb.id });
  const lang = parseLangCallback(cb.data);
  if (!lang) {
    await sendText(chatId, BOOKING_FALLBACK[botLocale(cb.from.language_code)]);
    return;
  }
  const t = BOT_TEXT[lang.locale];
  const switched = await prisma.loginRequest.updateMany({
    where: {
      shortId: lang.shortId,
      telegramUserId: String(cb.from.id),
      status: { in: [LoginStatus.PENDING, LoginStatus.AWAITING_CONTACT] },
      expiresAt: { gt: now() },
    },
    data: { locale: lang.locale },
  });
  if (switched.count !== 1) {
    await sendText(chatId, t.invalid);
    return;
  }
  const req = await prisma.loginRequest.findUnique({ where: { shortId: lang.shortId }, select: { status: true } });
  // Repeat the current step in the chosen language.
  if (req?.status === LoginStatus.AWAITING_CONTACT) await sendText(chatId, t.askContact, contactKeyboard(t));
  else await sendText(chatId, t.askCode, langKeyboard(lang.shortId));
}

const BOOKING_FALLBACK = { ar: BOT_TEXT.ar.invalid, en: BOT_TEXT.en.invalid };

/**
 * Booking buttons:
 *   bp:y:<id> / bp:c:<id>  player: "I'm coming" / cancel
 *   bk:a|n|c:<id>          arena owner/staff: arrived / no-show / cancel
 * The Telegram account pressing must be the booking's player, or a member of
 * the booking's arena (checked in lib/booking/service).
 */
const REASON_KEY: Record<string, string> = { m: 'k:maintenance', t: 'k:taken', x: 'k:closed' };

/** bkr:<m|t|x|o|n>:<id>: the reason picked after pressing "cancel" on a booking. */
async function onCancelReason(cb: NonNullable<TelegramUpdate['callback_query']>, chatId: number, data: string) {
  const m = /^bkr:([mtxonyk]):([0-9a-f-]{36})$/.exec(data);
  if (!m) {
    await tg('answerCallbackQuery', { callback_query_id: cb.id });
    return;
  }
  const [, k, bookingId] = m;
  await tg('answerCallbackQuery', { callback_query_id: cb.id });
  if (k === 'y' || k === 'k') {
    // Yes / no to the reason typed a moment ago (only this chat's own pending reason).
    const pending = await prisma.telegramPending.findUnique({ where: { chatId: String(chatId) } });
    const valid = pending?.kind === 'cancel_confirm' && pending.bookingId === bookingId && pending.expiresAt > now();
    await prisma.telegramPending.deleteMany({ where: { chatId: String(chatId) } });
    if (!valid) return void (await sendText(chatId, ARENA_TEXT.tooLate));
    if (k === 'k') return void (await sendText(chatId, ARENA_TEXT.keptBooking));
    return cancelWithReason(chatId, String(cb.from.id), bookingId, pending!.text ?? '');
  }
  if (k === 'o') {
    await prisma.telegramPending.upsert({
      where: { chatId: String(chatId) },
      create: { chatId: String(chatId), kind: 'cancel_reason', bookingId, expiresAt: new Date(now().getTime() + 10 * 60_000) },
      update: { kind: 'cancel_reason', bookingId, text: null, expiresAt: new Date(now().getTime() + 10 * 60_000) },
    });
    await sendText(chatId, ARENA_TEXT.typeReason);
    return;
  }
  return cancelWithReason(chatId, String(cb.from.id), bookingId, REASON_KEY[k] ?? '');
}

async function cancelWithReason(chatId: number, telegramUserId: string, bookingId: string, reason: string) {
  const user = await prisma.user.findUnique({ where: { telegramChatId: telegramUserId }, select: { id: true } });
  if (!user) return void (await sendText(chatId, ARENA_TEXT.notAllowed));
  const result = await markByArena(user.id, bookingId, 'cancel', { reason });
  if (!result.ok) return void (await sendText(chatId, result.error === 'not_allowed' ? ARENA_TEXT.notAllowed : result.error === 'too_early' ? ARENA_TEXT.tooEarly : ARENA_TEXT.tooLate));
  await sendText(chatId, ARENA_TEXT.doneCancel(result.player));
}

async function onBookingButton(cb: NonNullable<TelegramUpdate['callback_query']>, chatId: number, data: string) {
  const m = /^(bp|bk):([ycan]):([0-9a-f-]{36})$/.exec(data);
  const user = m ? await prisma.user.findUnique({ where: { telegramChatId: String(cb.from.id) }, select: { id: true } }) : null;
  if (!m || !user) {
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: ARENA_TEXT.notAllowed, show_alert: true });
    return;
  }
  const [, who, act, bookingId] = m;
  if (who === 'bp') {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { locale: true } });
    const t = BOOKING_TEXT[booking?.locale === 'en' ? 'en' : 'ar'];
    const ok = act === 'y' ? await confirmComing(user.id, bookingId) : act === 'c' ? await cancelByPlayer(user.id, bookingId) : false;
    await tg('answerCallbackQuery', { callback_query_id: cb.id, ...(ok ? {} : { text: t.tooLate, show_alert: true }) });
    if (ok && act === 'y') await sendText(chatId, t.comingOk);
    return;
  }
  // Cancel: first ask why (the reason goes to the player with an apology).
  if (act === 'c') {
    const b = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { status: true, user: { select: { name: true, nickname: true } }, device: { select: { cafe: { select: { members: { where: { userId: user.id }, select: { userId: true } } } } } } },
    });
    if (!b || b.device.cafe.members.length === 0) {
      await tg('answerCallbackQuery', { callback_query_id: cb.id, text: ARENA_TEXT.notAllowed, show_alert: true });
      return;
    }
    await tg('answerCallbackQuery', { callback_query_id: cb.id });
    const who = b.user?.nickname ?? b.user?.name ?? '—';
    await sendText(chatId, ARENA_TEXT.askReason(who), {
      inline_keyboard: [
        [{ text: CANCEL_REASONS.maintenance.ar, callback_data: `bkr:m:${bookingId}` }],
        [{ text: CANCEL_REASONS.taken.ar, callback_data: `bkr:t:${bookingId}` }],
        [{ text: CANCEL_REASONS.closed.ar, callback_data: `bkr:x:${bookingId}` }],
        [
          { text: ARENA_TEXT.reasonOther, callback_data: `bkr:o:${bookingId}` },
          { text: ARENA_TEXT.reasonNone, callback_data: `bkr:n:${bookingId}` },
        ],
      ],
    });
    return;
  }
  const mark = act === 'a' ? 'arrived' : act === 'n' ? 'noshow' : null;
  if (!mark) return;
  const result = await markByArena(user.id, bookingId, mark);
  if (!result.ok) {
    await tg('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: result.error === 'not_allowed' ? ARENA_TEXT.notAllowed : result.error === 'too_early' ? ARENA_TEXT.tooEarly : ARENA_TEXT.tooLate,
      show_alert: true,
    });
    return;
  }
  await tg('answerCallbackQuery', { callback_query_id: cb.id });
  const done = mark === 'arrived' ? ARENA_TEXT.doneArrived : mark === 'noshow' ? ARENA_TEXT.doneNoShow : ARENA_TEXT.doneCancel;
  await sendText(chatId, done(result.player));
}

async function onContact(
  chatId: number,
  from: FromT,
  contact: NonNullable<NonNullable<TelegramUpdate['message']>['contact']>,
) {
  const pending = await prisma.loginRequest.findFirst({
    where: { telegramUserId: String(from.id), status: LoginStatus.AWAITING_CONTACT, expiresAt: { gt: now() } },
    orderBy: { createdAt: 'desc' },
    select: { locale: true },
  });
  const t = BOT_TEXT[pending ? asBotLocale(pending.locale) : botLocale(from.language_code)];
  if (!isOwnContact(from.id, contact.user_id)) {
    await sendText(chatId, t.notOwn, contactKeyboard(t));
    return;
  }
  const phone = normalizePhone(contact.phone_number);
  if (!phone) {
    await sendText(chatId, t.badPhone, REMOVE_KEYBOARD);
    return;
  }

  const request = await prisma.loginRequest.findFirst({
    where: {
      telegramUserId: String(from.id),
      status: LoginStatus.AWAITING_CONTACT,
      expiresAt: { gt: now() },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!request) {
    await sendText(chatId, t.noPending, REMOVE_KEYBOARD);
    return;
  }

  const telegramChatId = String(from.id);
  const name = displayName(from.first_name, from.last_name);

  // The Telegram account id never changes; a phone number can be given to
  // someone else by the carrier. So a known number from a DIFFERENT Telegram
  // account never takes over the old account: a player gets a fresh account
  // (the old one keeps its history without the number); an account that
  // manages an arena is not signed in at all.
  const userId = await prisma.$transaction(async (tx) => {
    const byTelegram = await tx.user.findUnique({ where: { telegramChatId } });
    const byPhone = await tx.user.findUnique({ where: { phone }, include: { arenas: { select: { cafeId: true }, take: 1 } } });
    if (byTelegram) {
      // Keep the phone if it is free or already theirs.
      const phoneFree = !byPhone || byPhone.id === byTelegram.id;
      await tx.user.update({
        where: { id: byTelegram.id },
        data: { name, ...(phoneFree ? { phone } : {}) },
      });
      return byTelegram.id;
    }
    if (byPhone && !byPhone.telegramChatId) {
      // A number added before Telegram sign-in existed: attach it.
      await tx.user.update({ where: { id: byPhone.id }, data: { telegramChatId, name } });
      return byPhone.id;
    }
    if (byPhone) {
      if (byPhone.arenas.length > 0) return 'locked' as const;
      await tx.user.update({ where: { id: byPhone.id }, data: { phone: null } });
    }
    const created = await tx.user.create({ data: { name, phone, telegramChatId } });
    return created.id;
  });
  if (userId === 'locked') {
    await prisma.auditLog.create({ data: { actorType: 'SYSTEM', action: 'login.phone_locked', details: { telegram: telegramChatId } } }).catch(() => undefined);
    await sendText(chatId, t.phoneLocked, REMOVE_KEYBOARD);
    return;
  }

  await prisma.loginRequest.updateMany({
    where: { id: request.id, status: LoginStatus.AWAITING_CONTACT },
    data: { status: LoginStatus.CONFIRMED, userId },
  });
  // Signed in: the contact button goes, the "My bookings / Help" buttons come.
  await sendText(chatId, t.done, memberKeyboard(asBotLocale(request.locale)));
}

/**
 * A message from a player who has signed in before (and has no sign-in
 * waiting): /bookings lists what is coming with cancel buttons, /support
 * gives help, anything else a short home message with the next booking.
 */
async function onMember(
  chatId: number,
  from: FromT,
  me: { id: string; name: string; nickname: string | null; botLocale: string | null },
  text: string,
  pressed: MemberAction | null = null,
) {
  // The language picked with /language, else that of their last sign-in on
  // the website, else Telegram's.
  let lang: 'ar' | 'en';
  if (me.botLocale === 'ar' || me.botLocale === 'en') lang = me.botLocale;
  else {
    const last = await prisma.loginRequest.findFirst({
      where: { telegramUserId: String(from.id) },
      orderBy: { createdAt: 'desc' },
      select: { locale: true },
    });
    lang = last ? asBotLocale(last.locale) : botLocale(from.language_code);
  }
  const t = MEMBER_TEXT[lang];
  const keys = memberKeyboard(lang);
  const action = pressed ?? memberAction(text);
  const b = MEMBER_BUTTONS[lang];
  const show = async (s: Screen) => {
    // A screen without its own buttons keeps the bottom keyboard in place.
    await sendHtml(chatId, s.html, s.buttons.length > 0 ? { inline_keyboard: s.buttons } : keys);
  };

  if (action === 'book') return show(await bookScreen(me.id, lang));
  if (action === 'favorites') return show(await favouritesScreen(me.id, lang));
  if (action === 'tournaments') return show(await tournamentsScreen(me.id, lang));
  if (action === 'language') return show(languageScreen(lang));

  if (action === 'support') {
    // The bottom buttons come with this reply, so they stay in the chat from now on.
    await sendText(chatId, t.support(supportContactFor()), keys);
    return;
  }

  const list = await upcomingForBot(me.id, lang);
  if (action === 'bookings') {
    if (list.length === 0) {
      await sendText(chatId, t.noBookings, keys);
      return;
    }
    for (const b of list) {
      await sendText(
        chatId,
        b.text,
        b.canCancel ? { inline_keyboard: [[{ text: BOOKING_TEXT[lang].cancelButton, callback_data: `bp:c:${b.id}` }]] } : keys,
      );
    }
    return;
  }

  // The home message brings the bottom buttons, so players with the older
  // two-button keyboard get the full one.
  await sendText(chatId, t.home(me.nickname ?? me.name, list[0]?.text ?? null), keys);
}
