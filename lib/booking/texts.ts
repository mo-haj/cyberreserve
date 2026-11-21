// Telegram messages about bookings (player and arena), Arabic and English.
import { formatDamascusTime, toDamascusParts } from '@/lib/time';

export type BotLang = 'ar' | 'en';

const DAYS = {
  ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

/** "Wed 18/11, 18:00–20:00" */
export function formatWhen(lang: BotLang, start: Date, end: Date): string {
  const p = toDamascusParts(start);
  const sep = lang === 'ar' ? '،' : ',';
  return `${DAYS[lang][p.weekday]} ${p.day}/${p.month}${sep} ${formatDamascusTime(start)}–${formatDamascusTime(end)}`;
}

export interface BookingFacts {
  arena: string;
  station: string;
  when: string;
  price: string;
}

/** Ready-made reasons an arena can give when it cancels a booking. */
export const CANCEL_REASONS = {
  maintenance: { ar: 'الجهاز يحتاج صيانة', en: 'The station needs maintenance' },
  taken: { ar: 'الجهاز محجوز لشخص آخر بهذا الوقت', en: 'The station is taken by someone else at that time' },
  closed: { ar: 'الصالة مغلقة بهذا الوقت', en: 'The arena is closed at that time' },
} as const;
export type CancelReasonKey = keyof typeof CANCEL_REASONS;

/** Stored reason ("k:<key>" or own words) in the reader's language; '' if none. */
export function reasonText(stored: string | null | undefined, lang: BotLang): string {
  if (!stored) return '';
  if (stored.startsWith('k:')) {
    const r = CANCEL_REASONS[stored.slice(2) as CancelReasonKey];
    return r ? r[lang] : '';
  }
  return stored;
}

/** "until Sat 28/11, 18:00" or "for good". */
export function banUntilText(until: Date | null, lang: BotLang): string {
  if (!until) return lang === 'ar' ? 'بشكل دائم' : 'for good';
  const p = toDamascusParts(until);
  const when = `${DAYS[lang][p.weekday]} ${p.day}/${p.month}${lang === 'ar' ? '،' : ','} ${formatDamascusTime(until)}`;
  return lang === 'ar' ? `حتى ${when}` : `until ${when}`;
}

export const BOOKING_TEXT = {
  ar: {
    confirmed: (f: BookingFacts, askAt: string | null) =>
      `✅ تم الحجز\n\n🏟 ${f.arena}\n🎮 ${f.station}\n🗓 ${f.when}\n💵 ${f.price} ل.س (تُدفع في الصالة)\n\n` +
      (askAt ? `⏰ الساعة ${askAt} سأسألك هنا إن كنت قادماً. إذا لم تجب قبل 15 دقيقة من بداية الحجز يُلغى تلقائياً.\n\n` : '') +
      `لا تستطيع الحضور؟ ألغِ الحجز ليأخذ غيرك الجهاز.`,
    cancelButton: '❌ إلغاء الحجز',
    comingButton: '✅ نعم، قادم',
    reminder: (f: BookingFacts, answerBy: string) =>
      `⏰ حجزك يبدأ قريباً\n\n🏟 ${f.arena}\n🎮 ${f.station}\n🗓 ${f.when}\n\nهل ستأتي؟ إذا لم تجب حتى ${answerBy} نلغي الحجز تلقائياً ليستفيد غيرك من الجهاز.`,
    comingOk: '👍 ممتاز، الجهاز محجوز لك. نراك هناك!',
    cancelledByYou: (f: BookingFacts) => `تم إلغاء حجزك في ${f.arena} (${f.station}، ${f.when}).`,
    cancelledNoAnswer: (f: BookingFacts) =>
      `لم تؤكد حضورك، فألغينا حجزك في ${f.arena} (${f.station}، ${f.when}). يمكنك الحجز من جديد من الموقع.`,
    cancelledByArena: (f: BookingFacts, reason: string, link: string | null) =>
      `😔 نعتذر منك، ألغت الصالة ${f.arena} حجزك (${f.station}، ${f.when}).` +
      (reason ? `\n\n📝 السبب: ${reason}` : '') +
      `\n\n💡 جرّب «احجز أي جهاز» في صفحة الصالة: تختار الوقت ونعطيك أي جهاز فاضي.` +
      (link ? `\n${link}` : ''),
    banned: (arena: string, until: string, reason: string) =>
      `🚫 أوقفت الصالة ${arena} حجوزاتك عندها ${until}.\n\n📝 السبب: ${reason}\n\nما زال بإمكانك الحجز في الصالات الأخرى.`,
    unbanned: (arena: string) => `✅ رفعت الصالة ${arena} الإيقاف عنك، ويمكنك الحجز عندها من جديد.`,
    headCancelledByArena: (reason: string) => `❌ ألغت الصالة هذا الحجز${reason ? `\nالسبب: ${reason}` : ''}`,
    headCancelledByYou: '❌ ألغيت هذا الحجز',
    headCancelledNoAnswer: '⌛ أُلغي هذا الحجز (لم تؤكد حضورك)',
    headNoShow: '🚫 سُجّلت غائباً عن هذا الحجز',
    headComing: '✅ أكدت أنك قادم',
    noShow: (f: BookingFacts, strikes: number, limit: number) =>
      `سجّلت الصالة ${f.arena} أنك لم تحضر حجزك (${f.when}).\nالغيابات: ${strikes} من ${limit}. عند ${limit} يتوقف الحجز لمدة أسبوع.`,
    tooLate: 'لا يمكن تغيير هذا الحجز الآن (بدأ أو انتهى أو أُلغي).',
  },
  en: {
    confirmed: (f: BookingFacts, askAt: string | null) =>
      `✅ Booked\n\n🏟 ${f.arena}\n🎮 ${f.station}\n🗓 ${f.when}\n💵 ${f.price} SYP (pay at the arena)\n\n` +
      (askAt ? `⏰ At ${askAt} I'll ask here whether you are coming. With no answer 15 minutes before the start, the booking is cancelled.\n\n` : '') +
      `Can't make it? Cancel so someone else can play.`,
    cancelButton: '❌ Cancel booking',
    comingButton: "✅ Yes, I'm coming",
    reminder: (f: BookingFacts, answerBy: string) =>
      `⏰ Your booking starts soon\n\n🏟 ${f.arena}\n🎮 ${f.station}\n🗓 ${f.when}\n\nAre you coming? With no answer by ${answerBy} we cancel it so someone else can play.`,
    comingOk: '👍 Great, the station is held for you. See you there!',
    cancelledByYou: (f: BookingFacts) => `Your booking at ${f.arena} (${f.station}, ${f.when}) is cancelled.`,
    cancelledNoAnswer: (f: BookingFacts) =>
      `You did not confirm, so your booking at ${f.arena} (${f.station}, ${f.when}) was cancelled. You can book again on the website.`,
    cancelledByArena: (f: BookingFacts, reason: string, link: string | null) =>
      `😔 Sorry, ${f.arena} cancelled your booking (${f.station}, ${f.when}).` +
      (reason ? `\n\n📝 Reason: ${reason}` : '') +
      `\n\n💡 Try "Book any station" on the arena page: pick a time and get any free station.` +
      (link ? `\n${link}` : ''),
    banned: (arena: string, until: string, reason: string) =>
      `🚫 ${arena} stopped taking your bookings ${until}.\n\n📝 Reason: ${reason}\n\nYou can still book at other arenas.`,
    unbanned: (arena: string) => `✅ ${arena} lifted the stop: you can book there again.`,
    headCancelledByArena: (reason: string) => `❌ The arena cancelled this booking${reason ? `\nReason: ${reason}` : ''}`,
    headCancelledByYou: '❌ You cancelled this booking',
    headCancelledNoAnswer: '⌛ Cancelled (you did not confirm)',
    headNoShow: '🚫 Marked as not showing up',
    headComing: "✅ You confirmed you're coming",
    noShow: (f: BookingFacts, strikes: number, limit: number) =>
      `${f.arena} marked you as not showing up for your booking (${f.when}).\nNo-shows: ${strikes} of ${limit}. At ${limit}, booking is paused for a week.`,
    tooLate: 'This booking cannot be changed now (it started, ended or was cancelled).',
  },
} as const;

/** Messages to arena owners and staff (Arabic: arenas are in Syria). */
export const ARENA_TEXT = {
  newBooking: (f: BookingFacts, player: string, phone: string, city: string) =>
    `🎮 حجز جديد\n\n👤 ${player}\n📱 \u2066${phone}\u2069\n🏙 ${city}\n🎮 ${f.station}\n🗓 ${f.when}\n💵 ${f.price} ل.س`,
  playerCancelled: (f: BookingFacts, player: string) => `↩️ ألغى ${player} حجزه: ${f.station}، ${f.when}. الجهاز متاح الآن.`,
  autoCancelled: (f: BookingFacts, player: string) =>
    `⌛ أُلغي حجز ${player} تلقائياً (لم يؤكد حضوره): ${f.station}، ${f.when}. الجهاز متاح الآن.`,
  playerComing: (f: BookingFacts, player: string) => `👍 أكد ${player} أنه قادم: ${f.station}، ${f.when}.`,
  arrived: '✅ وصل',
  noShow: '🚫 لم يحضر',
  cancel: '❌ إلغاء',
  doneArrived: (player: string) => `✅ تم تسجيل وصول ${player}.`,
  doneNoShow: (player: string) => `🚫 تم تسجيل غياب ${player}، والجهاز متاح الآن.`,
  doneCancel: (player: string) => `❌ أُلغي حجز ${player}، والجهاز متاح الآن. أبلغناه بالإلغاء.`,
  askReason: (player: string) => `لماذا تلغي حجز ${player}؟ اختر سبباً أو اكتب سببك. سنرسله له مع اعتذار.`,
  reasonOther: '✍️ سبب آخر (أكتبه)',
  reasonNone: 'بدون سبب',
  typeReason: '✍️ اكتب سبب الإلغاء في رسالة واحدة (خلال 10 دقائق):',
  headCancelled: (reason: string) => `❌ أُلغي الحجز${reason ? `\nالسبب: ${reason}` : ''}`,
  headPlayerCancelled: '↩️ ألغى اللاعب الحجز',
  headAutoCancelled: '⌛ أُلغي تلقائياً (لم يؤكد حضوره)',
  headArrived: '✅ وصل اللاعب',
  headNoShow: '🚫 لم يحضر',
  notAllowed: 'هذا الحجز ليس لصالة تديرها.',
  tooLate: 'لا يمكن تغيير هذا الحجز الآن.',
};
