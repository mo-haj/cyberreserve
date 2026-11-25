// The signed-in player's bot screens beyond "My bookings" and "Help":
// 🎮 Book, ⭐ Favourites, 🏆 Tournaments and /language. Each returns the
// message (Telegram HTML) and the buttons under it.
import { prisma } from '@/lib/prisma';
import { CITIES } from '@/lib/cities';
import { freeStations } from '@/lib/engage';
import { whenText } from '@/lib/engage-texts';
import { isOpenAt } from '@/lib/hours';
import { siteUrl } from '@/lib/site';
import { escapeHtml } from '@/lib/telegram/api';
import { now } from '@/lib/time';

type Lang = 'ar' | 'en';
type Button = { text: string; url?: string; callback_data?: string };
export type Screen = { html: string; buttons: Button[][] };

const h = escapeHtml;
const cityName = (key: string, lang: Lang) => CITIES.find((c) => c.key === key)?.[lang] ?? key;
const link = (path = '') => {
  const site = siteUrl();
  return site ? `${site}${path}` : null;
};
/** A URL button, left out when the site address is unknown. */
const urlRow = (text: string, path = ''): Button[][] => {
  const url = link(path);
  return url ? [[{ text, url }]] : [];
};

const T = {
  ar: {
    openSite: '🌐 فتح L3ib',
    bookTitle: '🎮 <b>احجز جهازك</b>',
    bookBody: 'اختر الصالة والجهاز والوقت من الموقع، ويصلك تأكيد الحجز هنا.',
    bookFav: 'أو ادخل مباشرةً إلى إحدى صالاتك المفضلة:',
    favTitle: '⭐ <b>صالاتك المفضلة</b>',
    favEmpty:
      'لا توجد صالات مفضلة بعد.\n\nافتح صفحة أي صالة على الموقع واضغط <b>⭐ متابعة</b>، فتظهر هنا ويصلك جديدها من عروض وبطولات.',
    free: (n: number, total: number) => `🖥 ${n} من ${total} أجهزة متاحة الآن`,
    full: '🖥 كل الأجهزة مشغولة الآن',
    closed: '🌙 مغلقة الآن',
    favHint: 'اضغط اسم الصالة لفتح صفحتها والحجز.',
    tourTitle: '🏆 <b>بطولاتك القادمة</b>',
    tourEmpty: 'لست مسجّلًا في أي بطولة قادمة.\n\nتجد البطولات في صفحات الصالات على الموقع، والتسجيل بضغطة زر.',
    players: (n: number, max: number) => `👥 ${n} من ${max} لاعبين`,
    feeFree: '💵 مجانية',
    fee: (v: string) => `💵 ${v} ل.س، تُدفع في الصالة قبل البدء`,
    langAsk: '🌐 <b>لغة البوت</b>\n\nاختر اللغة التي تصلك بها رسائل البوت:',
    langDone: '✅ تم. ستصلك رسائل البوت بالعربية من الآن.',
  },
  en: {
    openSite: '🌐 Open L3ib',
    bookTitle: '🎮 <b>Book a station</b>',
    bookBody: 'Pick the arena, station and time on the website; the booking confirmation arrives here.',
    bookFav: 'Or go straight to one of your favourite arenas:',
    favTitle: '⭐ <b>Your favourite arenas</b>',
    favEmpty:
      'No favourite arenas yet.\n\nOpen any arena page on the website and press <b>⭐ Follow</b>: it shows up here, and its new offers and tournaments reach you.',
    free: (n: number, total: number) => `🖥 ${n} of ${total} stations free now`,
    full: '🖥 All stations are busy right now',
    closed: '🌙 Closed now',
    favHint: 'Tap an arena name to open its page and book.',
    tourTitle: '🏆 <b>Your upcoming tournaments</b>',
    tourEmpty: "You're not signed up for any upcoming tournament.\n\nArenas list their tournaments on their pages on the website; signing up is one tap.",
    players: (n: number, max: number) => `👥 ${n} of ${max} players`,
    feeFree: '💵 Free entry',
    fee: (v: string) => `💵 ${v} SYP, paid at the arena before the start`,
    langAsk: '🌐 <b>Bot language</b>\n\nChoose the language of the bot messages:',
    langDone: '✅ Done. Bot messages will reach you in English from now on.',
  },
} as const;

async function favouriteArenas(userId: string, take: number) {
  const rows = await prisma.arenaFollow.findMany({
    where: { userId, cafe: { isPublished: true } },
    orderBy: { createdAt: 'asc' },
    take,
    select: {
      cafe: {
        select: {
          id: true,
          slug: true,
          nameAr: true,
          nameEn: true,
          city: true,
          openMin: true,
          closeMin: true,
          _count: { select: { devices: { where: { archivedAt: null, isMaintenance: false } } } },
        },
      },
    },
  });
  return rows.map((r) => r.cafe);
}

export async function bookScreen(userId: string, lang: Lang): Promise<Screen> {
  const t = T[lang];
  const favs = await favouriteArenas(userId, 4);
  const buttons: Button[][] = urlRow(t.openSite);
  for (const c of favs) {
    const url = link(`/arenas/${c.slug}`);
    if (url) buttons.push([{ text: `⭐ ${lang === 'ar' ? c.nameAr : c.nameEn}`, url }]);
  }
  const html = `${t.bookTitle}\n\n${t.bookBody}${favs.length > 0 ? `\n\n${t.bookFav}` : ''}`;
  return { html, buttons };
}

export async function favouritesScreen(userId: string, lang: Lang): Promise<Screen> {
  const t = T[lang];
  const favs = await favouriteArenas(userId, 8);
  if (favs.length === 0) return { html: `${t.favTitle}\n\n${t.favEmpty}`, buttons: urlRow(t.openSite) };

  const at = now();
  const blocks: string[] = [];
  const buttons: Button[][] = [];
  for (const c of favs) {
    const name = lang === 'ar' ? c.nameAr : c.nameEn;
    const total = c._count.devices;
    const open = isOpenAt(c.openMin, c.closeMin, at);
    let dot: string;
    let status: string;
    if (open === false) {
      dot = '⚪';
      status = t.closed;
    } else {
      const free = await freeStations(c.id, '', at);
      dot = free > 0 ? '🟢' : '🟡';
      status = free > 0 ? t.free(free, total) : t.full;
    }
    blocks.push(`${dot} <b>${h(name)}</b>\n📍 ${h(cityName(c.city, lang))}\n${status}`);
    const url = link(`/arenas/${c.slug}`);
    if (url) buttons.push([{ text: `${dot} ${name}`, url }]);
  }
  return { html: `${t.favTitle}\n\n${blocks.join('\n\n')}\n\n<i>${t.favHint}</i>`, buttons };
}

export async function tournamentsScreen(userId: string, lang: Lang): Promise<Screen> {
  const t = T[lang];
  const rows = await prisma.tournamentEntry.findMany({
    // Still upcoming, or started within the last 6 hours (it may still be on).
    where: { userId, tournament: { startsAt: { gt: new Date(now().getTime() - 6 * 3600_000) } } },
    orderBy: { tournament: { startsAt: 'asc' } },
    take: 8,
    select: {
      tournament: {
        select: {
          titleAr: true,
          titleEn: true,
          game: true,
          startsAt: true,
          maxPlayers: true,
          fee: true,
          prizeAr: true,
          prizeEn: true,
          cafe: { select: { slug: true, nameAr: true, nameEn: true } },
          _count: { select: { entries: true } },
        },
      },
    },
  });
  if (rows.length === 0) return { html: `${t.tourTitle}\n\n${t.tourEmpty}`, buttons: urlRow(t.openSite) };

  const blocks: string[] = [];
  const buttons: Button[][] = [];
  for (const { tournament: x } of rows) {
    const arena = lang === 'ar' ? x.cafe.nameAr : x.cafe.nameEn;
    const prize = lang === 'ar' ? x.prizeAr : x.prizeEn;
    const fee = x.fee.toFixed(0);
    blocks.push(
      [
        `<b>${h(lang === 'ar' ? x.titleAr : x.titleEn)}</b>`,
        `🏟 ${h(arena)}`,
        `🎮 ${h(x.game)}`,
        `🗓 ${whenText(lang, x.startsAt.toISOString())}`,
        fee === '0' ? t.feeFree : t.fee(Number(fee).toLocaleString('en-US')),
        ...(prize ? [`🎁 ${h(prize)}`] : []),
        t.players(x._count.entries, x.maxPlayers),
      ].join('\n'),
    );
    const url = link(`/arenas/${x.cafe.slug}`);
    if (url && !buttons.some((b) => b[0].url === url)) buttons.push([{ text: `🏟 ${arena}`, url }]);
  }
  return { html: `${t.tourTitle}\n\n${blocks.join('\n\n')}`, buttons };
}

export function languageScreen(lang: Lang): Screen {
  const mark = (l: Lang) => (l === lang ? ' ✓' : '');
  return {
    html: T[lang].langAsk,
    buttons: [
      [
        { text: `🇸🇾 العربية${mark('ar')}`, callback_data: 'm:lang:ar' },
        { text: `🇬🇧 English${mark('en')}`, callback_data: 'm:lang:en' },
      ],
    ],
  };
}

export const languageDone = (lang: Lang) => T[lang].langDone;
