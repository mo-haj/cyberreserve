// Demo cafes shown until real cafes join. This file is the single source for
// them: the seed writes it to the database, and fixture mode (development
// screenshots only, see lib/cafes.ts) reads it directly.
//
// Every demo cafe is flagged isDemo and shows a "Demo" badge on the site.
// Names, addresses and specs are invented examples, not real businesses.
import type { GroupView } from '../lib/groups';

export interface DemoSection {
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  imageUrl: string;
}

export interface DemoCafe {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  /** Key from lib/cities.ts. */
  city: string;
  areaEn: string;
  areaAr: string;
  addressEn: string;
  addressAr: string;
  /** Approximate demo pin, not a real business. */
  latitude: number;
  longitude: number;
  taglineEn: string;
  taglineAr: string;
  hoursEn: string;
  hoursAr: string;
  hourlyRate: string;
  nightShiftRate: string;
  coverImage: string;
  /** LAN prefix; PC n gets <prefix>.<100 + n>. */
  lanPrefix: string;
  /** Spec text per PC number range, in order. */
  specs: { from: number; to: number; text: string }[];
  /** Consoles after the PCs (numbered on from the last PC). */
  consoles?: { type: 'PS5' | 'PS4' | 'XBOX'; count: number; hourlyRate: string; nightRate: string; specs: string; label?: string }[];
  /** PCs shown as out of service. */
  maintenance: number[];
  /** PCs given a demo walk-in booking, so the live grid shows red. */
  demoBusy: number[];
  sections: DemoSection[];
}

export const DEMO_CAFES: DemoCafe[] = [
  {
    // id matches the cafe created by migration 20261118000000_multi_cafe for
    // the PCs that existed before the multi-cafe upgrade.
    id: 'cafe-mezzeh-arena',
    slug: 'mezzeh-arena',
    nameEn: 'Mezzeh Arena',
    nameAr: 'ميزة أرينا',
    city: 'damascus',
    areaEn: 'Mezzeh',
    areaAr: 'المزة',
    addressEn: 'Mezzeh Autostrad, near the Al-Razi hospital',
    addressAr: 'أوتوستراد المزة، قرب مشفى الرازي',
    latitude: 33.5036,
    longitude: 36.2546,
    taglineEn: 'Twelve tuned PCs, solar backup, quiet after midnight.',
    taglineAr: 'اثنا عشر جهازاً مضبوطاً، طاقة شمسية احتياطية، وهدوء بعد منتصف الليل.',
    hoursEn: 'Every day, 10:00 to 04:00',
    hoursAr: 'يومياً من 10:00 حتى 04:00',
    hourlyRate: '100.00',
    nightShiftRate: '80.00',
    coverImage: '/cafes/cover-mezzeh.svg',
    lanPrefix: '192.168.1',
    specs: [
      { from: 1, to: 8, text: 'RTX 4060 · 165 Hz' },
      { from: 9, to: 12, text: 'RTX 4070 · 240 Hz' },
    ],
    consoles: [{ type: 'PS5', count: 2, hourlyRate: '150.00', nightRate: '120.00', specs: '55" 4K TV · 2 controllers' }],
    maintenance: [7],
    demoBusy: [2, 3, 5, 9, 10],
    sections: [
      {
        titleEn: 'Built for competitive play',
        titleAr: 'مجهّزة للعب التنافسي',
        bodyEn:
          'Eight RTX 4060 stations on 165 Hz screens, and four RTX 4070 seats at 240 Hz for Valorant and CS2 players who feel every frame. Mechanical keyboards and light mice on every desk.',
        bodyAr:
          'ثمانية أجهزة RTX 4060 بشاشات 165 هرتز، وأربعة مقاعد RTX 4070 بشاشات 240 هرتز للاعبي فالورانت و CS2. لوحات مفاتيح ميكانيكية وفأرات خفيفة على كل طاولة.',
        imageUrl: '/cafes/setup.svg',
      },
      {
        titleEn: 'The power stays on',
        titleAr: 'الكهرباء لا تنقطع',
        bodyEn:
          'Solar panels and a battery bank carry the whole room through power cuts, and a second internet line takes over if the first one drops. Your match does not end because the grid did.',
        bodyAr:
          'ألواح شمسية وبطاريات تُبقي الصالة تعمل أثناء انقطاع الكهرباء، وخط إنترنت ثانٍ يعمل إذا انقطع الأول. مباراتك لا تنتهي بسبب التقنين.',
        imageUrl: '/cafes/power.svg',
      },
      {
        titleEn: 'Snacks at your seat',
        titleAr: 'الضيافة إلى مقعدك',
        bodyEn:
          'Coffee, energy drinks and noodles brought to your desk. Add them to your booking and they are ready when you sit down.',
        bodyAr: 'قهوة ومشروبات طاقة وإندومي تصلك إلى طاولتك. أضفها إلى حجزك وتكون جاهزة عند وصولك.',
        imageUrl: '/cafes/snacks.svg',
      },
    ],
  },
  {
    id: 'cafe-old-city-lan',
    slug: 'old-city-lan',
    nameEn: 'Old City LAN House',
    nameAr: 'بيت الشبكة - الشام القديمة',
    city: 'damascus',
    areaEn: 'Bab Touma',
    areaAr: 'باب توما',
    addressEn: 'Bab Touma, off Straight Street',
    addressAr: 'باب توما، متفرع من الشارع المستقيم',
    latitude: 33.5128,
    longitude: 36.3158,
    taglineEn: 'Ten PCs under a stone arch. Small room, regular crowd.',
    taglineAr: 'عشرة أجهزة تحت قنطرة حجرية. صالة صغيرة وروّاد دائمون.',
    hoursEn: 'Every day, 12:00 to 02:00',
    hoursAr: 'يومياً من 12:00 حتى 02:00',
    hourlyRate: '80.00',
    nightShiftRate: '60.00',
    coverImage: '/cafes/cover-oldcity.svg',
    lanPrefix: '192.168.0',
    specs: [{ from: 1, to: 10, text: 'GTX 1660 Super · 144 Hz' }],
    maintenance: [],
    demoBusy: [1, 4, 6, 8, 9, 10],
    sections: [
      {
        titleEn: 'A room with a history',
        titleAr: 'صالة لها حكاية',
        bodyEn:
          'Ten desks inside an old Damascene house, with the original stone arch over the room. It is cool in summer and the regulars know each other by name.',
        bodyAr: 'عشر طاولات داخل بيت دمشقي قديم، تحت القنطرة الحجرية الأصلية. باردة صيفاً، والروّاد يعرفون بعضهم بالاسم.',
        imageUrl: '/cafes/lounge.svg',
      },
      {
        titleEn: 'Friday night tournaments',
        titleAr: 'بطولات ليلة الجمعة',
        bodyEn:
          'Every Friday from 20:00: FIFA and Tekken brackets, entry included in your hour. Winners get free hours for the next week.',
        bodyAr: 'كل جمعة من الساعة 20:00: بطولات فيفا وتيكن، الاشتراك ضمن ساعتك. والفائز يحصل على ساعات مجانية للأسبوع التالي.',
        imageUrl: '/cafes/tournament.svg',
      },
      {
        titleEn: 'Snacks from the corner shop',
        titleAr: 'ضيافة من الدكان المجاور',
        bodyEn: 'Tea, soft drinks and chips at street prices. Ask at the desk.',
        bodyAr: 'شاي ومشروبات غازية وشيبس بأسعار الحارة. اطلب من الاستقبال.',
        imageUrl: '/cafes/snacks.svg',
      },
    ],
  },
  {
    id: 'cafe-kafr-souseh-hub',
    slug: 'kafr-souseh-hub',
    nameEn: 'Kafr Souseh Esports Hub',
    nameAr: 'مركز كفرسوسة للرياضات الإلكترونية',
    city: 'damascus',
    areaEn: 'Kafr Souseh',
    areaAr: 'كفرسوسة',
    addressEn: 'Kafr Souseh, behind the Sham City Center',
    addressAr: 'كفرسوسة، خلف شام سيتي سنتر',
    latitude: 33.4985,
    longitude: 36.2772,
    taglineEn: 'Twenty seats, a stage for teams, and the fastest line in town.',
    taglineAr: 'عشرون مقعداً، منصة للفرق، وأسرع خط إنترنت في المدينة.',
    hoursEn: 'Every day, 09:00 to 06:00',
    hoursAr: 'يومياً من 09:00 حتى 06:00',
    hourlyRate: '150.00',
    nightShiftRate: '120.00',
    coverImage: '/cafes/cover-kafrsouseh.svg',
    lanPrefix: '10.0.0',
    specs: [
      { from: 1, to: 10, text: 'RTX 4070 · 240 Hz' },
      { from: 11, to: 15, text: 'RTX 4080 · 360 Hz' },
      { from: 16, to: 20, text: 'RTX 4060 · 165 Hz · team room' },
    ],
    consoles: [
      { type: 'PS5', count: 4, hourlyRate: '200.00', nightRate: '160.00', specs: '65" 4K TV · 4 controllers · private room' },
      { type: 'PS4', count: 2, hourlyRate: '120.00', nightRate: '100.00', specs: '50" TV · 2 controllers' },
    ],
    maintenance: [14],
    demoBusy: [1, 2, 3, 6, 11, 12, 16, 17, 18, 19, 22],
    sections: [
      {
        titleEn: 'Twenty seats in three zones',
        titleAr: 'عشرون مقعداً في ثلاث مناطق',
        bodyEn:
          'Ten RTX 4070 seats on the main floor, five RTX 4080 machines at 360 Hz for the serious players, and a closed room of five for teams who need to talk.',
        bodyAr:
          'عشرة مقاعد RTX 4070 في الصالة الرئيسية، وخمسة أجهزة RTX 4080 بشاشات 360 هرتز للمحترفين، وغرفة مغلقة من خمسة أجهزة للفرق التي تحتاج إلى التواصل.',
        imageUrl: '/cafes/setup.svg',
      },
      {
        titleEn: 'A stage for your team',
        titleAr: 'منصة لفريقك',
        bodyEn:
          'Book the team room for scrims, or the stage for a match with a crowd. A screen on the wall shows the game for everyone watching.',
        bodyAr: 'احجز غرفة الفرق للتدريب، أو المنصة لمباراة أمام جمهور. شاشة على الجدار تعرض اللعبة لكل المتابعين.',
        imageUrl: '/cafes/tournament.svg',
      },
      {
        titleEn: 'Never offline',
        titleAr: 'متصل دائماً',
        bodyEn:
          'Two fibre lines and a generator that starts on its own. Ping to European servers stays under 70 ms on most evenings.',
        bodyAr: 'خطا ألياف ضوئية ومولّدة تعمل تلقائياً. البينغ إلى السيرفرات الأوروبية يبقى تحت 70 ميلي ثانية في معظم الأمسيات.',
        imageUrl: '/cafes/power.svg',
      },
    ],
  },
];

/** Total PCs of a demo cafe (highest spec range end). */
export function demoPcCount(cafe: DemoCafe): number {
  return Math.max(...cafe.specs.map((s) => s.to));
}

/** Spec text for a PC number. */
export function demoSpecFor(cafe: DemoCafe, pcNumber: number): string | null {
  return cafe.specs.find((s) => pcNumber >= s.from && pcNumber <= s.to)?.text ?? null;
}

export interface DemoStation {
  pcNumber: number;
  type: 'PC' | 'PS5' | 'PS4' | 'XBOX';
  specs: string | null;
  hourlyRate: string | null;
  nightRate: string | null;
  label: string | null;
  /** PCs only: LAN address for the future in-arena agent. */
  staticIp: string | null;
}

/** All stations of a demo arena: its PCs, then its consoles. */
export function demoStations(cafe: DemoCafe): DemoStation[] {
  const pcs = demoPcCount(cafe);
  const list: DemoStation[] = Array.from({ length: pcs }, (_, i) => ({
    pcNumber: i + 1,
    type: 'PC',
    specs: demoSpecFor(cafe, i + 1),
    hourlyRate: null,
    nightRate: null,
    label: null,
    staticIp: `${cafe.lanPrefix}.${101 + i}`,
  }));
  for (const c of cafe.consoles ?? []) {
    for (let k = 0; k < c.count; k++) {
      list.push({
        pcNumber: list.length + 1,
        type: c.type,
        specs: c.specs,
        hourlyRate: c.hourlyRate,
        nightRate: c.nightRate,
        label: c.label ?? null,
        staticIp: null,
      });
    }
  }
  return list;
}

// ---------------------------------------------------------------- groups

type GroupFields = Omit<GroupView, 'id'>;

const BLANK: GroupFields = {
  type: 'PC',
  nameAr: '',
  nameEn: '',
  noteAr: '',
  noteEn: '',
  isVip: false,
  imageUrl: null,
  cpu: '',
  gpu: '',
  ram: '',
  storage: '',
  screen: '',
  refreshHz: null,
  controllers: null,
  keyboard: '',
  mouse: '',
  headset: '',
  chair: '',
};

/**
 * Zones of each demo arena. `match` is the station spec text from above: the
 * stations with that text join the zone.
 */
const DEMO_GROUPS: Record<string, { match: string; fields: Partial<GroupFields> }[]> = {
  'mezzeh-arena': [
    {
      match: 'RTX 4060 · 165 Hz',
      fields: {
        nameAr: 'القاعة الرئيسية',
        nameEn: 'Main hall',
        cpu: 'Ryzen 5 7600',
        gpu: 'RTX 4060',
        ram: '16 GB DDR5',
        storage: '1 TB NVMe',
        screen: '24" 1080p',
        refreshHz: 165,
        keyboard: 'Redragon K552',
        mouse: 'Logitech G102',
        headset: 'HyperX Cloud Stinger',
      },
    },
    {
      match: 'RTX 4070 · 240 Hz',
      fields: {
        nameAr: 'ركن المحترفين',
        nameEn: 'Pro corner',
        noteAr: 'أسرع الأجهزة عندنا، لمن يلعب تنافسي.',
        noteEn: 'Our fastest machines, for competitive play.',
        cpu: 'Ryzen 7 7800X3D',
        gpu: 'RTX 4070',
        ram: '32 GB DDR5',
        storage: '2 TB NVMe',
        screen: '27" 1440p',
        refreshHz: 240,
        keyboard: 'Logitech G Pro',
        mouse: 'Logitech G Pro X Superlight',
        headset: 'HyperX Cloud II',
        chair: 'DXRacer',
      },
    },
    {
      match: '55" 4K TV · 2 controllers',
      fields: { type: 'PS5', screen: '55" 4K', controllers: 2, chair: 'Sofa' },
    },
  ],
  'old-city-lan': [
    {
      match: 'GTX 1660 Super · 144 Hz',
      fields: { cpu: 'Core i5-10400F', gpu: 'GTX 1660 Super', ram: '16 GB', storage: '512 GB SSD', screen: '24" 1080p', refreshHz: 144 },
    },
  ],
  'kafr-souseh-hub': [
    {
      match: 'RTX 4070 · 240 Hz',
      fields: {
        nameAr: 'الصالة الرئيسية',
        nameEn: 'Main floor',
        cpu: 'Core i5-13600K',
        gpu: 'RTX 4070',
        ram: '32 GB DDR5',
        storage: '1 TB NVMe',
        screen: '27" 1440p',
        refreshHz: 240,
        mouse: 'Razer DeathAdder V3',
        headset: 'SteelSeries Arctis 5',
      },
    },
    {
      match: 'RTX 4080 · 360 Hz',
      fields: {
        nameAr: 'غرفة VIP',
        nameEn: 'VIP room',
        noteAr: 'غرفة هادئة بإضاءة خافتة، كراسي مريحة ومشروب مجاني مع كل ساعتين.',
        noteEn: 'A quiet, dim room with comfy chairs and a free drink every two hours.',
        isVip: true,
        imageUrl: '/cafes/setup.svg',
        cpu: 'Core i7-14700K',
        gpu: 'RTX 4080 Super',
        ram: '32 GB DDR5',
        storage: '2 TB NVMe',
        screen: '25" 1080p',
        refreshHz: 360,
        keyboard: 'Wooting 60HE',
        mouse: 'Logitech G Pro X Superlight 2',
        headset: 'HyperX Cloud III',
        chair: 'Secretlab Titan',
      },
    },
    {
      match: 'RTX 4060 · 165 Hz · team room',
      fields: {
        nameAr: 'غرفة الفرق',
        nameEn: 'Team room',
        noteAr: 'خمسة أجهزة في غرفة مغلقة للفرق.',
        noteEn: 'Five machines in a closed room for teams.',
        cpu: 'Ryzen 5 7600',
        gpu: 'RTX 4060',
        ram: '16 GB DDR5',
        screen: '24" 1080p',
        refreshHz: 165,
      },
    },
    {
      match: '65" 4K TV · 4 controllers · private room',
      fields: {
        type: 'PS5',
        nameAr: 'غرفة البلايستيشن',
        nameEn: 'PlayStation room',
        isVip: true,
        screen: '65" 4K',
        controllers: 4,
        headset: 'PULSE 3D',
        chair: 'Sofa',
      },
    },
    { match: '50" TV · 2 controllers', fields: { type: 'PS4', screen: '50" 1080p', controllers: 2 } },
  ],
};

/** A demo arena's zones, each with the spec text its stations carry. */
export function demoGroups(cafe: DemoCafe): { match: string; fields: GroupFields }[] {
  return (DEMO_GROUPS[cafe.slug] ?? []).map((g) => ({ match: g.match, fields: { ...BLANK, ...g.fields } }));
}
