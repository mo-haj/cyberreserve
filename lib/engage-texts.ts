// Telegram texts for summaries, free-station alerts, ratings, follows and tournaments.
import type { BotLang } from '@/lib/booking/texts';
import { formatDamascusTime, toDamascusParts } from '@/lib/time';

const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;
const stars = (n: number) => '⭐'.repeat(Math.round(n));

const DAYS = {
  ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};
export const whenText = (lang: BotLang, iso: string) => {
  const d = new Date(iso);
  const p = toDamascusParts(d);
  return `${DAYS[lang][p.weekday]} ${p.day}/${p.month}${lang === 'ar' ? '،' : ','} ${formatDamascusTime(d)}`;
};

interface Summary {
  online: number;
  walkIns: number;
  arrived: number;
  noShows: number;
  cancelled: number;
  busiestHour: number | null;
  ratingAvg: number | null;
  ratingCount: number;
}

export const ENGAGE_TEXT = {
  ar: {
    summary: (arena: string, s: Summary) =>
      s.online + s.walkIns + s.cancelled + s.noShows === 0
        ? `🌙 ملخص اليوم — ${arena}\n\nيوم هادئ: لا حجوزات اليوم.`
        : [
            `🌙 ملخص اليوم — ${arena}`,
            '',
            `📥 حجوزات أونلاين: ${s.online}`,
            `✅ وصلوا: ${s.arrived}`,
            `🚫 لم يحضروا: ${s.noShows}`,
            `↩️ أُلغيت: ${s.cancelled}`,
            `🎮 تشغيل مباشر: ${s.walkIns}`,
            s.busiestHour !== null ? `🔥 أكثر ساعة ازدحامًا: ${hourLabel(s.busiestHour)}` : '',
            s.ratingCount ? `⭐ تقييمات اليوم: ${s.ratingAvg?.toFixed(1)} من 5 (${s.ratingCount})` : '',
          ]
            .filter((l) => l !== '')
            .join('\n'),
    openDashboard: 'فتح لوحة التحكم',
    freeNow: (arena: string, n: number) => `🟢 ${arena}: ${n === 1 ? 'فرغ جهاز الآن' : `${n} أجهزة فارغة الآن`}! احجز قبل أن يسبقك أحد.`,
    bookNow: 'احجز الآن',
    rateAsk: (arena: string, when: string) => `🎮 كيف كانت جلستك في ${arena}؟\n🗓 ${when}\n\nقيّم الصالة (تقييمك يساعد اللاعبين الآخرين):`,
    rateThanks: (n: number) => `${stars(n)} شكرًا! هل تريد إضافة تعليق قصير؟ اكتبه الآن، أو اضغط «تخطي».`,
    rateSkip: 'تخطي',
    rateDone: 'شكرًا، تم حفظ تقييمك 🙏',
    rateFail: 'لا يمكن تقييم هذه الزيارة.',
    openArena: 'فتح صفحة الصالة',
    newOffer: (arena: string, offer: string) => `🏷 عرض جديد في ${arena}:\n${offer}`,
    joinedTournament: (arena: string, title: string, when: string, fee: string) =>
      `✅ تم تسجيلك في «${title}»\n🏟 ${arena}\n🗓 ${when}\n\n` +
      (fee === '0' ? 'البطولة مجانية. احضر قبل الموعد بقليل.' : `💵 رسوم الدخول: ${fee} ل.س\nالرجاء دفع الرسوم في الصالة قبل بدء البطولة لتثبيت مكانك.`),
    newTournament: (arena: string, title: string, game: string, when: string, prize: string) =>
      `🏆 بطولة جديدة في ${arena}\n\n${title}\n🎮 ${game}\n🗓 ${when}${prize ? `\n🎁 ${prize}` : ''}\n\nسجّل من صفحة الصالة قبل امتلاء الأماكن.`,
  },
  en: {
    summary: (arena: string, s: Summary) =>
      s.online + s.walkIns + s.cancelled + s.noShows === 0
        ? `🌙 Today at ${arena}\n\nA quiet day: no bookings today.`
        : [
            `🌙 Today at ${arena}`,
            '',
            `📥 Online bookings: ${s.online}`,
            `✅ Arrived: ${s.arrived}`,
            `🚫 No-shows: ${s.noShows}`,
            `↩️ Cancelled: ${s.cancelled}`,
            `🎮 Walk-ins: ${s.walkIns}`,
            s.busiestHour !== null ? `🔥 Busiest hour: ${hourLabel(s.busiestHour)}` : '',
            s.ratingCount ? `⭐ Today's ratings: ${s.ratingAvg?.toFixed(1)} of 5 (${s.ratingCount})` : '',
          ]
            .filter((l) => l !== '')
            .join('\n'),
    openDashboard: 'Open dashboard',
    freeNow: (arena: string, n: number) => `🟢 ${arena}: ${n === 1 ? 'a station is free now' : `${n} stations are free now`}! Book before someone else does.`,
    bookNow: 'Book now',
    rateAsk: (arena: string, when: string) => `🎮 How was your session at ${arena}?\n🗓 ${when}\n\nRate the arena (it helps other players):`,
    rateThanks: (n: number) => `${stars(n)} Thanks! Want to add a short comment? Type it now, or press “Skip”.`,
    rateSkip: 'Skip',
    rateDone: 'Thanks, your rating is saved 🙏',
    rateFail: 'This visit cannot be rated.',
    openArena: 'Open arena page',
    newOffer: (arena: string, offer: string) => `🏷 New offer at ${arena}:\n${offer}`,
    joinedTournament: (arena: string, title: string, when: string, fee: string) =>
      `✅ You're signed up for “${title}”\n🏟 ${arena}\n🗓 ${when}\n\n` +
      (fee === '0' ? 'Entry is free. Arrive a little before the start.' : `💵 Entry fee: ${fee} SYP\nPlease pay the fee at the arena before the tournament starts to keep your place.`),
    newTournament: (arena: string, title: string, game: string, when: string, prize: string) =>
      `🏆 New tournament at ${arena}\n\n${title}\n🎮 ${game}\n🗓 ${when}${prize ? `\n🎁 ${prize}` : ''}\n\nSign up on the arena page before it fills up.`,
  },
} satisfies Record<BotLang, unknown>;
