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
import { sendText, tg } from '@/lib/telegram/api';
import { cancelByPlayer, confirmComing, markByArena } from '@/lib/booking/service';
import { ARENA_TEXT, BOOKING_TEXT } from '@/lib/booking/texts';
import {
  BOT_TEXT,
  LANG_BUTTONS,
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
      message: z.object({ chat: z.object({ id: z.number() }) }).optional(),
    })
    .optional(),
});
export type TelegramUpdate = z.infer<typeof TelegramUpdate>;

const REMOVE_KEYBOARD = { remove_keyboard: true };

export async function handleUpdate(update: TelegramUpdate): Promise<void> {
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
    await sendText(chatId, confirmed.count === 1 ? t.done : t.invalid, REMOVE_KEYBOARD);
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

/** Language buttons, booking buttons; anything else (e.g. the old number-picking flow): start again. */
async function onCallback(cb: NonNullable<TelegramUpdate['callback_query']>) {
  const chatId = cb.message?.chat.id ?? cb.from.id;
  const data = cb.data ?? '';
  if (data.startsWith('bp:') || data.startsWith('bk:')) return onBookingButton(cb, chatId, data);
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
  const mark = act === 'a' ? 'arrived' : act === 'n' ? 'noshow' : act === 'c' ? 'cancel' : null;
  if (!mark) return;
  const result = await markByArena(user.id, bookingId, mark);
  if (!result.ok) {
    await tg('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: result.error === 'not_allowed' ? ARENA_TEXT.notAllowed : ARENA_TEXT.tooLate,
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

  const userId = await prisma.$transaction(async (tx) => {
    const byTelegram = await tx.user.findUnique({ where: { telegramChatId } });
    const byPhone = await tx.user.findUnique({ where: { phone } });
    if (byTelegram) {
      // Keep the phone if it is free or already theirs.
      const phoneFree = !byPhone || byPhone.id === byTelegram.id;
      await tx.user.update({
        where: { id: byTelegram.id },
        data: { name, ...(phoneFree ? { phone } : {}) },
      });
      return byTelegram.id;
    }
    if (byPhone) {
      // Same verified number, new Telegram account (e.g. reinstalled): attach it.
      await tx.user.update({ where: { id: byPhone.id }, data: { telegramChatId, name } });
      return byPhone.id;
    }
    const created = await tx.user.create({ data: { name, phone, telegramChatId } });
    return created.id;
  });

  await prisma.loginRequest.updateMany({
    where: { id: request.id, status: LoginStatus.AWAITING_CONTACT },
    data: { status: LoginStatus.CONFIRMED, userId },
  });
  await sendText(chatId, t.done, REMOVE_KEYBOARD);
}
