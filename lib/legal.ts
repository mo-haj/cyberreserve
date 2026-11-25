// Terms of use and privacy policy, in both languages. Plain language on
// purpose. The site owner should have a lawyer review these before launch.

export interface LegalSection {
  title: string;
  body: string[];
}

export interface LegalDoc {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

const UPDATED = '2026-11-18';

export function termsDoc(locale: 'ar' | 'en', contact: string): LegalDoc {
  if (locale === 'ar') {
    return {
      title: 'شروط الاستخدام',
      updated: `آخر تحديث: ${UPDATED}`,
      intro: 'باستخدامك CyberReserve أو تسجيل الدخول إليه فأنت توافق على هذه الشروط. إذا لم توافق عليها فلا تستخدم الموقع.',
      sections: [
        {
          title: 'ما هو CyberReserve',
          body: [
            'دليل لصالات الألعاب في سوريا يعرض الأجهزة الفاضية مباشرة، ويتيح الحجز عند تفعيله.',
            'كل صالة نشاط تجاري مستقل، وهي المسؤولة عن أجهزتها وأسعارها ودوامها وقواعدها وخدمتها. نحن نعرض المعلومات التي تقدّمها الصالة، وقد تتغير حالة الأجهزة في أي لحظة.',
          ],
        },
        {
          title: 'حسابك',
          body: [
            'تسجّل الدخول عبر تيليغرام، ويُربط حسابك برقم الهاتف الذي يرسله تيليغرام. حساب واحد لكل شخص.',
            'يجب أن يكون اسمك الكامل حقيقياً. اسم اللاعب يجب ألا يكون مسيئاً أو منتحلاً لشخص أو صالة أو علامة تجارية؛ يحق لنا تغييره أو إيقاف الحساب إذا خالف ذلك.',
            'أنت مسؤول عما يحدث عبر حسابك. لا تعطِ رمز الدخول لأحد، وسجّل الخروج من الأجهزة المشتركة.',
          ],
        },
        {
          title: 'الحجوزات',
          body: [
            'الحجز طلب لجهاز في صالة لوقت محدد، وتطبّق عليه قواعد الصالة (مدة الانتظار، الإلغاء، العمر، السلوك داخل الصالة).',
            'الدفع يتم في الصالة مباشرة ما لم يُذكر غير ذلك. الأسعار المعروضة تحددها الصالة وقد تتغير.',
            'الحجوزات الوهمية أو المتكررة دون حضور قد تؤدي إلى تقييد الحساب أو إيقافه.',
          ],
        },
        {
          title: 'الاستخدام المقبول',
          body: [
            'ممنوع: محاولة اختراق الموقع أو تعطيله، استخدام برامج آلية للحجز أو جمع البيانات، انتحال الهوية، أو استخدام الموقع لأي غرض غير قانوني.',
          ],
        },
        {
          title: 'حدود المسؤولية',
          body: [
            'نقدّم الموقع "كما هو". نعمل ليكون دقيقاً ومتاحاً، لكننا لا نضمن خلوّه من الأخطاء أو الانقطاع، ولسنا مسؤولين عن خدمة الصالات أو ما يحدث داخلها.',
          ],
        },
        {
          title: 'التغييرات والتواصل',
          body: [
            'قد نعدّل هذه الشروط، ونعرض تاريخ آخر تحديث أعلى الصفحة. استمرارك في استخدام الموقع بعد التعديل يعني موافقتك عليه.',
            `للأسئلة أو الشكاوى: ${contact}`,
          ],
        },
      ],
    };
  }
  return {
    title: 'Terms of use',
    updated: `Last updated: ${UPDATED}`,
    intro: 'By using or signing in to CyberReserve you agree to these terms. If you do not agree, do not use the site.',
    sections: [
      {
        title: 'What CyberReserve is',
        body: [
          'A directory of gaming arenas in Syria that shows free PCs live and, once enabled, lets you book.',
          'Each arena is an independent business and is responsible for its PCs, prices, hours, rules and service. We show the information the arena provides, and station status can change at any moment.',
        ],
      },
      {
        title: 'Your account',
        body: [
          'You sign in with Telegram, and your account is tied to the phone number Telegram sends. One account per person.',
          'Your full name must be real. Your player name must not be offensive or impersonate a person, arena or brand; we may change it or suspend the account if it does.',
          'You are responsible for what happens through your account. Never give your sign-in code to anyone, and sign out on shared computers.',
        ],
      },
      {
        title: 'Bookings',
        body: [
          'A booking is a request for a PC at an arena for a set time, and the arena\'s rules apply (waiting time, cancellation, age, behaviour inside the arena).',
          'You pay at the arena unless stated otherwise. Prices shown are set by the arena and may change.',
          'Fake bookings or repeated no-shows can lead to the account being limited or suspended.',
        ],
      },
      {
        title: 'Acceptable use',
        body: [
          'Not allowed: trying to break into or disrupt the site, using bots to book or collect data, impersonating others, or using the site for anything illegal.',
        ],
      },
      {
        title: 'Liability',
        body: [
          'The site is provided "as is". We work to keep it accurate and available, but do not guarantee it is free of errors or interruptions, and we are not responsible for the arenas\' service or what happens inside them.',
        ],
      },
      {
        title: 'Changes and contact',
        body: [
          'We may update these terms and show the date of the last update at the top. Using the site after an update means you accept it.',
          `Questions or complaints: ${contact}`,
        ],
      },
    ],
  };
}

export function privacyDoc(locale: 'ar' | 'en', contact: string): LegalDoc {
  if (locale === 'ar') {
    return {
      title: 'سياسة الخصوصية',
      updated: `آخر تحديث: ${UPDATED}`,
      intro: 'نجمع أقل قدر ممكن من البيانات، ونستخدمها فقط لتشغيل الحجوزات. لا نبيع بياناتك ولا نعرض إعلانات.',
      sections: [
        {
          title: 'ما نجمعه',
          body: [
            'من تيليغرام: معرّف حسابك، واسمك على تيليغرام، ورقم هاتفك (فقط عندما تضغط "مشاركة رقمي").',
            'منك: اسمك الكامل واسم اللاعب ومدينتك.',
            'عند الحجز: الصالة والجهاز والوقت وحالة الحجز.',
            'تقنياً: عنوان IP لفترة قصيرة لمنع الإساءة (حدّ عدد المحاولات)، وسجلات أخطاء لا تحتوي رمز الدخول أو رقمك.',
          ],
        },
        {
          title: 'لماذا نستخدمها',
          body: [
            'لتسجيل دخولك، ولربط كل حجز بشخص حقيقي، ولتتواصل الصالة معك بخصوص حجزك، ولحماية الموقع من الحجوزات الوهمية.',
          ],
        },
        {
          title: 'من يرى بياناتك',
          body: [
            'الصالة التي تحجز فيها ترى اسمك الكامل واسم اللاعب ومدينتك ورقم هاتفك وتفاصيل الحجز. الصالات الأخرى لا ترى شيئاً.',
            'لا نبيع بياناتك ولا نشاركها إلا مع مزوّدي الخدمة اللازمين لتشغيل الموقع: Vercel (الاستضافة) وNeon (قاعدة البيانات) وتيليغرام (الرسائل بينك وبين البوت، وفق سياسته الخاصة)، أو إذا ألزمنا القانون بذلك. خريطة موقع الصالة تُعرض من OpenStreetMap، فيصله عنوان IP الخاص بك عند فتح صفحة الصالة.',
          ],
        },
        {
          title: 'ملفات تعريف الارتباط (الكوكيز)',
          body: [
            'نحفظ في متصفحك ثلاثة أشياء صغيرة فقط: جلسة دخولك حتى لا تحتاج لتسجيل الدخول كل مرة (لمدة 30 يوماً)، واللغة التي اخترتها، وآخر مدينة اخترتها. لا نستخدم أي كوكيز للتتبّع أو الإعلانات.',
          ],
        },
        {
          title: 'الحفظ والأمان',
          body: [
            'تُحفظ البيانات على خوادمنا مع نسخ احتياطية. جلسة دخولك محفوظة بشكل مشفّر لا يمكن استخدامه حتى لو سُرقت قاعدة البيانات.',
            'نحتفظ بحسابك ما دام فعّالاً. سجلات الحجز قد نحتفظ بها مدة أطول لحل النزاعات مع الصالات.',
          ],
        },
        {
          title: 'حقوقك',
          body: [
            'يمكنك تعديل اسمك واسم اللاعب ومدينتك من صفحة "ملفي" في أي وقت.',
            `لطلب نسخة من بياناتك أو حذف حسابك، تواصل معنا: ${contact}`,
          ],
        },
      ],
    };
  }
  return {
    title: 'Privacy policy',
    updated: `Last updated: ${UPDATED}`,
    intro: 'We collect as little as possible and use it only to run bookings. We do not sell your data or show ads.',
    sections: [
      {
        title: 'What we collect',
        body: [
          'From Telegram: your account id, your Telegram name, and your phone number (only when you tap "Share my number").',
          'From you: your full name, player name and city.',
          'When you book: the arena, PC, time and booking status.',
          'Technical: your IP address for a short time to stop abuse (rate limits), and error logs that never contain your sign-in code or number.',
        ],
      },
      {
        title: 'Why we use it',
        body: [
          'To sign you in, to tie each booking to a real person, so the arena can contact you about your booking, and to protect the site from fake bookings.',
        ],
      },
      {
        title: 'Who sees your data',
        body: [
          'The arena you book at sees your full name, player name, city, phone number and the booking details. Other arenas see nothing.',
          'We do not sell your data. We share it only with the providers needed to run the site: Vercel (hosting), Neon (database) and Telegram (the messages between you and the bot, under its own policy), or when the law requires it. The arena map is loaded from OpenStreetMap, which receives your IP address when you open an arena page.',
        ],
      },
      {
        title: 'Cookies',
        body: [
          'We keep only three small things in your browser: your sign-in, so you do not have to sign in every visit (for 30 days), the language you chose, and the last city you picked. We use no tracking or advertising cookies.',
        ],
      },
      {
        title: 'Storage and security',
        body: [
          'Data is kept on our servers, with backups. Your sign-in is stored in a scrambled form that cannot be used even if the database were stolen.',
          'We keep your account while it is active. Booking records may be kept longer to settle disputes with arenas.',
        ],
      },
      {
        title: 'Your rights',
        body: [
          'You can change your full name, player name and city on the "My profile" page at any time.',
          `To get a copy of your data or delete your account, contact us: ${contact}`,
        ],
      },
    ],
  };
}

/** SUPPORT_CONTACT from .env (email, phone or @username); otherwise the bot. */
/**
 * SUPPORT_CONTACT for the bot to show, or null when it is unset or is this
 * bot itself (pointing a player back to the same chat helps nobody).
 */
export function supportContactFor(): string | null {
  const configured = process.env.SUPPORT_CONTACT?.trim();
  if (!configured) return null;
  const bot = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '').toLowerCase();
  if (bot && configured.replace(/^@/, '').toLowerCase() === bot) return null;
  return configured;
}

export function supportContact(): string {
  const configured = process.env.SUPPORT_CONTACT?.trim();
  if (configured) return configured;
  const bot = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '');
  return bot ? `@${bot}` : '—';
}
