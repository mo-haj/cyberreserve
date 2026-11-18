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
    cancelledByArena: (f: BookingFacts) => `ألغت الصالة ${f.arena} حجزك (${f.station}، ${f.when}). للاستفسار تواصل مع الصالة.`,
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
    cancelledByArena: (f: BookingFacts) => `${f.arena} cancelled your booking (${f.station}, ${f.when}). Contact the arena with questions.`,
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
  doneCancel: (player: string) => `❌ أُلغي حجز ${player}، والجهاز متاح الآن.`,
  notAllowed: 'هذا الحجز ليس لصالة تديرها.',
  tooLate: 'لا يمكن تغيير هذا الحجز الآن.',
};
