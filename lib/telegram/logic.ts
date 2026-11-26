// Pure rules for the Telegram sign-in bot (no network, no database), so they
// can be unit-tested. The handler in ./bot.ts wires them to Prisma and the API.

export const START_PREFIX = 'login_';

/** "/start login_<shortId>" -> shortId, otherwise null. */
export function parseStartPayload(text: string | undefined): string | null {
  if (!text) return null;
  const m = /^\/start(?:@\w+)?\s+login_([A-Za-z0-9_-]{8,40})\s*$/.exec(text.trim());
  return m ? m[1] : null;
}

/** True for a bare "/start" (no payload). */
export function isBareStart(text: string | undefined): boolean {
  return !!text && /^\/start(?:@\w+)?\s*$/.test(text.trim());
}

export const CODE_LENGTH = 6;
export const MAX_CODE_ATTEMPTS = 3;

/**
 * Reads a sign-in code typed in Telegram. Accepts Arabic-Indic (٠-٩) and
 * Persian (۰-۹) digits and ignores spaces and dashes ("482 913", "٤٨٢-٩١٣").
 * Returns the number, or null if the text is not exactly six digits.
 */
export function parseTypedCode(text: string | undefined): number | null {
  if (!text) return null;
  const western = text
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s\-\u00A0\u200F\u200E]/g, '');
  if (!/^\d{6}$/.test(western) || western.startsWith('0')) return null;
  return Number(western);
}

/** "482913" -> "482 913", easier to read and type. */
export function formatCode(code: number): string {
  const s = String(code);
  return `${s.slice(0, 3)} ${s.slice(3)}`;
}

export type BotLocale = 'ar' | 'en';

/** Button data for the language switch: "lang:<shortId>:ar". Max 64 bytes. */
export function langCallback(shortId: string, locale: BotLocale): string {
  return `lang:${shortId}:${locale}`;
}

export function parseLangCallback(data: string | undefined): { shortId: string; locale: BotLocale } | null {
  const m = /^lang:([A-Za-z0-9_-]{8,40}):(ar|en)$/.exec(data ?? '');
  return m ? { shortId: m[1], locale: m[2] as BotLocale } : null;
}

export function asBotLocale(value: string | null | undefined): BotLocale {
  return value === 'en' ? 'en' : 'ar';
}

/** A shared contact counts only if it is the sender's own number. */
export function isOwnContact(fromId: number, contactUserId: number | undefined): boolean {
  return contactUserId !== undefined && contactUserId === fromId;
}

/**
 * Normalises a phone number to international form "+<digits>".
 * Telegram always sends the full international number (Syria: 9639XXXXXXXX,
 * a tourist: their own country code). A Syrian local "09XXXXXXXX" or
 * "00963..." is converted too, so the same person never gets two accounts.
 */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[^\d]/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (/^09\d{8}$/.test(digits)) digits = `963${digits.slice(1)}`;
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) return null;
  return `+${digits}`;
}

export function displayName(first: string, last?: string): string {
  return [first, last].filter(Boolean).join(' ').trim().slice(0, 80) || 'Player';
}

/** Bot replies in Arabic unless the player's Telegram is set to another language. */
export function botLocale(languageCode: string | undefined): BotLocale {
  return !languageCode || languageCode.startsWith('ar') ? 'ar' : 'en';
}

/** Language switch buttons, each in its own language. */
export const LANG_BUTTONS: { locale: BotLocale; label: string }[] = [
  { locale: 'ar', label: '🇸🇾 العربية' },
  { locale: 'en', label: '🇬🇧 English' },
];

export const BOT_TEXT = {
  ar: {
    welcome: 'أهلاً بك في بوت L3ib. لتسجيل الدخول اضغط "تسجيل الدخول" على الموقع واتبع الخطوات.',
    askCode:
      'اكتب هنا رمز الدخول المكوّن من 6 أرقام الظاهر على الموقع.\n\nإذا لم تبدأ تسجيل الدخول بنفسك الآن، تجاهل هذه الرسالة ولا تعطِ الرمز لأحد.',
    notACode: 'أرسل الرمز فقط: 6 أرقام كما تظهر على الموقع، مثل 482913.',
    wrongTry: (left: number) => `الرمز غير صحيح. بقي لك ${left === 1 ? 'محاولة واحدة' : 'محاولتان'}.`,
    invalid: 'رابط تسجيل الدخول غير صالح أو منتهي الصلاحية. ابدأ من جديد من الموقع.',
    wrong: 'أدخلت رمزاً خاطئاً 3 مرات، فألغينا الطلب لحمايتك. ابدأ من جديد من الموقع.',
    askContact:
      'الرمز صحيح ✅\n\nخطوة أخيرة (أول مرة فقط): نحتاج رقم هاتفك لحجوزاتك.\n\n👇 اضغط زر "📱 مشاركة رقمي" في أسفل المحادثة.\nسيصلنا رقمك كاملاً مع رمز الدولة، مثل:\n\u2066+963 9XX XXX XXX\u2069\nأرقام الزوار من خارج سوريا تعمل أيضاً.\n\nلا يظهر الزر؟ افتح هذه المحادثة من تطبيق تيليغرام على الهاتف (تيليغرام ويب قد لا يعرضه).',
    shareButton: '📱 مشاركة رقمي',
    sharePlaceholder: 'اضغط زر 📱 مشاركة رقمي في الأسفل',
    useButton:
      'لا تكتب الرقم 🙏 الرقم المكتوب لا يمكن التأكد أنه رقمك.\n\n👇 اضغط زر "📱 مشاركة رقمي" في أسفل المحادثة، وتيليغرام يرسله لنا موثّقاً بالشكل \u2066+963 9XX XXX XXX\u2069.\n\nلا يظهر الزر؟ افتح هذه المحادثة من تطبيق تيليغرام على الهاتف.',
    notOwn: 'يجب أن تشارك رقمك أنت، وليس رقم شخص آخر. اضغط زر "📱 مشاركة رقمي".',
    noPending: 'لا يوجد طلب تسجيل دخول بانتظارك. اضغط "تسجيل الدخول" على الموقع لتبدأ.',
    phoneLocked:
      'هذا الرقم مرتبط بحساب يدير صالة من حساب تيليغرام آخر. لحماية الصالة لا نستطيع تسجيل الدخول به من هذا الحساب. تواصل مع إدارة الموقع لنقل الحساب.',
    badPhone: 'تعذّر قراءة الرقم. حاول مرة أخرى من الموقع.',
    done: 'تم تسجيل الدخول ✅ ارجع إلى الموقع، ستدخل تلقائياً خلال ثوانٍ.',
  },
  en: {
    welcome: 'Welcome to the L3ib bot. To sign in, press "Sign in" on the website and follow the steps.',
    askCode:
      'Type the 6-digit sign-in code shown on the website here.\n\nIf you did not just start signing in yourself, ignore this message and never give the code to anyone.',
    notACode: 'Send only the code: the 6 digits shown on the website, like 482913.',
    wrongTry: (left: number) => `That code is wrong. ${left === 1 ? '1 try' : `${left} tries`} left.`,
    invalid: 'This sign-in link is invalid or has expired. Start again from the website.',
    wrong: 'A wrong code was typed 3 times, so we cancelled the request to protect you. Start again from the website.',
    askContact:
      'Code accepted ✅\n\nLast step (first time only): we need your phone number for your bookings.\n\n👇 Tap "📱 Share my number" at the bottom of the chat.\nWe receive your full number with the country code, like:\n+963 9XX XXX XXX\nVisitors\' foreign numbers work too.\n\nNo button? Open this chat in the Telegram phone app (Telegram Web may not show it).',
    shareButton: '📱 Share my number',
    sharePlaceholder: 'Tap 📱 Share my number below',
    useButton:
      'Please do not type the number 🙏 a typed number cannot be checked as yours.\n\n👇 Tap "📱 Share my number" at the bottom of the chat; Telegram sends it to us verified, like +963 9XX XXX XXX.\n\nNo button? Open this chat in the Telegram phone app.',
    notOwn: 'Please share your own number, not someone else\'s. Use the "📱 Share my number" button.',
    noPending: 'There is no sign-in waiting for you. Press "Sign in" on the website to start.',
    phoneLocked:
      'This number belongs to an account that manages an arena, from a different Telegram account. To protect the arena we cannot sign you in from this account. Contact the site team to move the account.',
    badPhone: 'Could not read that number. Try again from the website.',
    done: 'Signed in ✅ Go back to the website; it signs you in within a few seconds.',
  },
} as const;

/** A command such as "/bookings" or "/bookings@MyBot" (lower-cased, no bot name), or null. */
export function parseCommand(text: string | undefined): string | null {
  const m = /^\/([a-z_]+)(?:@\w+)?(?:\s|$)/i.exec(text?.trim() ?? '');
  return m ? m[1].toLowerCase() : null;
}

/** The bot's "/" menu, per language (set once with setMyCommands). */
export const BOT_COMMANDS = {
  ar: [
    { command: 'book', description: 'احجز جهازًا' },
    { command: 'favorites', description: 'صالاتي المفضلة' },
    { command: 'bookings', description: 'حجوزاتي القادمة' },
    { command: 'tournaments', description: 'بطولاتي' },
    { command: 'language', description: 'لغة البوت' },
    { command: 'support', description: 'المساعدة' },
  ],
  en: [
    { command: 'book', description: 'Book a station' },
    { command: 'favorites', description: 'My favourite arenas' },
    { command: 'bookings', description: 'My upcoming bookings' },
    { command: 'tournaments', description: 'My tournaments' },
    { command: 'language', description: 'Bot language' },
    { command: 'support', description: 'Help' },
  ],
} as const;

/** Replies to a player who is already signed in (no sign-in waiting). */
export const MEMBER_TEXT = {
  ar: {
    home: (name: string, next: string | null) =>
      `👋 أهلاً ${name}، حسابك على L3ib مربوط بهذا الحساب على تيليغرام.\n\n` +
      (next ? `🎮 حجزك القادم:\n${next}\n\n` : '') +
      `الحجز يتم من الموقع. لتسجيل الدخول على جهاز جديد اضغط "تسجيل الدخول" على الموقع.`,
    noBookings: 'لا حجوزات قادمة. احجز جهازك من الموقع.',
    support: (contact: string | null) =>
      `🛟 المساعدة\n\n• لمشكلة في حجز: تواصل مع الصالة مباشرة، أو ألغِ الحجز من زر 📋 حجوزاتي.\n• لتغيير اسمك أو مدينتك: صفحة "ملفي" على الموقع.\n` +
      (contact ? `• لأي شيء آخر راسلنا على:\n${contact}` : '• قريباً: مراسلة فريق الدعم من هنا مباشرة.'),
  },
  en: {
    home: (name: string, next: string | null) =>
      `👋 Hi ${name}, your L3ib account is linked to this Telegram account.\n\n` +
      (next ? `🎮 Your next booking:\n${next}\n\n` : '') +
      `Booking is done on the website. To sign in on a new device, press "Sign in" on the website.`,
    noBookings: 'No upcoming bookings. Book a station on the website.',
    support: (contact: string | null) =>
      `🛟 Help\n\n• A problem with a booking: contact the arena directly, or cancel it from 📋 My bookings.\n• To change your name or city: "My profile" on the website.\n` +
      (contact ? `• Anything else, write to us:\n${contact}` : '• Coming soon: message the support team right here.'),
  },
} as const;

/** The two buttons kept at the bottom of the chat for signed-in players. */
export const MEMBER_BUTTONS = {
  ar: { book: '🎮 احجز', favorites: '⭐ مفضّلتي', bookings: '📋 حجوزاتي', tournaments: '🏆 بطولاتي', support: '🛟 المساعدة', language: '🌐 Language' },
  en: { book: '🎮 Book', favorites: '⭐ Favourites', bookings: '📋 My bookings', tournaments: '🏆 Tournaments', support: '🛟 Help', language: '🌐 اللغة' },
} as const;

export type MemberAction = 'book' | 'favorites' | 'bookings' | 'tournaments' | 'support' | 'language';
export const MEMBER_ACTIONS: MemberAction[] = ['book', 'favorites', 'bookings', 'tournaments', 'support', 'language'];

/** What a signed-in player asked for: a command or one of the buttons (either language). */
export function memberAction(text: string | undefined): MemberAction | null {
  const command = parseCommand(text);
  if (command === 'help') return 'support';
  if (command === 'lang') return 'language';
  if (command === 'favourites') return 'favorites';
  if (command && (MEMBER_ACTIONS as string[]).includes(command)) return command as MemberAction;
  const t = text?.trim();
  for (const b of Object.values(MEMBER_BUTTONS)) {
    for (const [action, label] of Object.entries(b)) if (t === label) return action as MemberAction;
  }
  return null;
}
