// The super admin's daily report: every arena's previous day in one English
// PDF, sent on Telegram right after midnight (Damascus) to ADMIN_TELEGRAM_IDS
// only. Owners and staff never get it. Built with pdf-lib (pure JavaScript, no
// browser), so it stays light on Vercel; its built-in font has no Arabic, so
// every text is English and Arabic-only player names show as "***123".
import { BookingStatus, Prisma } from '@prisma/client';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { adminTelegramIds } from '@/lib/auth/admin';
import { CITIES } from '@/lib/cities';
import { prisma } from '@/lib/prisma';
import { L3IB_LOGO_PNG_BASE64 } from '@/lib/brand-logo';
import { siteUrl } from '@/lib/site';
import { subState } from '@/lib/subscription';
import { telegramConfig } from '@/lib/telegram/api';
import { formatDamascusDate, now, startOfDamascusDay, toDamascusParts } from '@/lib/time';

const DAY = 24 * 3600_000;
const PLAYED: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.COMPLETED];
/** After this hour the day's report is not sent late any more (no surprise in the afternoon). */
const LATEST_HOUR = 12;

// ------------------------------------------------------------------ data

/** Printable in the PDF's built-in font: plain ASCII only. */
const ascii = (s: string | null | undefined) => !!s && /^[\x20-\x7E]+$/.test(s.trim());

/** A player as the report shows them: the name if it is in English, else the phone's last 3 digits. */
function playerLabel(u: { nickname: string | null; fullName: string | null; name: string; phone: string | null } | null): string {
  if (!u) return 'Guest';
  for (const n of [u.nickname, u.fullName, u.name]) if (ascii(n)) return n!.trim();
  return u.phone ? `***${u.phone.slice(-3)}` : 'Player';
}

const cityEn = (key: string) => CITIES.find((c) => c.key === key)?.en ?? key;

/** Hours the arena is open in a day (24 when the hours are not set). */
function openHours(openMin: number | null, closeMin: number | null): number {
  if (openMin == null || closeMin == null || openMin === closeMin) return 24;
  return (((closeMin - openMin) % 1440) + 1440) % 1440 / 60;
}

type CafeRow = Prisma.CafeGetPayload<{
  select: {
    id: true; slug: true; nameEn: true; city: true; isPublished: true; isDemo: true; openMin: true; closeMin: true; subEndsAt: true; subPaused: true;
    devices: { select: { isMaintenance: true } };
  };
}>;

/** One arena's day. */
async function arenaDay(c: CafeRow, from: Date, to: Date, at: Date) {
  const inDay: Prisma.BookingWhereInput = { device: { cafeId: c.id }, startTime: { gte: from, lt: to } };
  const [online, walkIns, arrived, noShows, cancelled, played, reviews, followers, shifts] = await Promise.all([
    prisma.booking.count({ where: { device: { cafeId: c.id }, isWalkIn: false, createdAt: { gte: from, lt: to } } }),
    prisma.booking.count({ where: { ...inDay, isWalkIn: true } }),
    prisma.booking.count({ where: { ...inDay, isWalkIn: false, actualStart: { not: null } } }),
    prisma.booking.count({ where: { ...inDay, status: BookingStatus.NO_SHOW } }),
    prisma.booking.count({ where: { ...inDay, status: BookingStatus.CANCELLED } }),
    prisma.booking.findMany({
      where: { ...inDay, status: { in: PLAYED } },
      select: {
        startTime: true,
        endTime: true,
        user: { select: { nickname: true, fullName: true, name: true, phone: true } },
        userId: true,
      },
    }),
    prisma.arenaReview.aggregate({ where: { cafeId: c.id, createdAt: { gte: from, lt: to }, hidden: false }, _avg: { stars: true }, _count: true }),
    prisma.arenaFollow.count({ where: { cafeId: c.id, createdAt: { gte: from, lt: to } } }),
    prisma.staffShift.count({ where: { cafeId: c.id, startedAt: { gte: from, lt: to } } }),
  ]);

  let hours = 0;
  const perHour = new Map<number, number>();
  const perPlayer = new Map<string, { label: string; n: number }>();
  for (const b of played) {
    // Only the part of the session inside the day.
    const s = Math.max(b.startTime.getTime(), from.getTime());
    const e = Math.min(b.endTime.getTime(), to.getTime());
    hours += Math.max(0, e - s) / 3600_000;
    const h = toDamascusParts(b.startTime).hour;
    perHour.set(h, (perHour.get(h) ?? 0) + 1);
    if (b.userId) {
      const p = perPlayer.get(b.userId) ?? { label: playerLabel(b.user), n: 0 };
      p.n += 1;
      perPlayer.set(b.userId, p);
    }
  }
  const stations = c.devices.length;
  const outOfService = c.devices.filter((d) => d.isMaintenance).length;
  const capacity = (stations - outOfService) * openHours(c.openMin, c.closeMin);
  const busiest = [...perHour.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    name: ascii(c.nameEn) ? c.nameEn.trim() : c.slug,
    slug: c.slug,
    city: cityEn(c.city),
    visible: c.isPublished,
    demo: c.isDemo,
    sub: subState(c, at),
    subEndsAt: c.subEndsAt,
    stations,
    outOfService,
    online,
    walkIns,
    arrived,
    noShows,
    cancelled,
    hours,
    occupancy: capacity > 0 ? Math.min(100, Math.round((hours / capacity) * 100)) : 0,
    busiestHour: busiest ? busiest[0] : null,
    rating: reviews._avg.stars,
    ratings: reviews._count,
    followers,
    shifts,
    top: [...perPlayer.values()].sort((a, b) => b.n - a.n).slice(0, 3),
  };
}

export async function collectReport(dayStart: Date) {
  const from = dayStart;
  const to = new Date(from.getTime() + DAY);
  const at = now();

  const cafes = await prisma.cafe.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      slug: true,
      nameEn: true,
      city: true,
      isPublished: true,
      isDemo: true,
      openMin: true,
      closeMin: true,
      subEndsAt: true,
      subPaused: true,
      devices: { where: { archivedAt: null }, select: { isMaintenance: true } },
    },
  });

  // One arena at a time: a few small queries each, never a flood on the pool.
  const arenas: Awaited<ReturnType<typeof arenaDay>>[] = [];
  for (const c of cafes) arenas.push(await arenaDay(c, from, to, at));

  const [newPlayers, pendingRequests, newRequests] = await Promise.all([
    prisma.user.count({ where: { createdAt: { gte: from, lt: to } } }),
    prisma.arenaRequest.count({ where: { status: 'PENDING' } }),
    prisma.arenaRequest.count({ where: { createdAt: { gte: from, lt: to } } }),
  ]);

  const sum = (k: 'online' | 'walkIns' | 'noShows' | 'cancelled' | 'hours' | 'followers') => arenas.reduce((n, a) => n + a[k], 0);
  return {
    day: from,
    arenas,
    totals: {
      online: sum('online'),
      walkIns: sum('walkIns'),
      noShows: sum('noShows'),
      cancelled: sum('cancelled'),
      hours: sum('hours'),
      followers: sum('followers'),
      newPlayers,
    },
    pendingRequests,
    newRequests,
  };
}

export type DailyReport = Awaited<ReturnType<typeof collectReport>>;

/** What needs the admin's attention, most urgent first. */
function attention(r: DailyReport): string[] {
  const out: string[] = [];
  if (r.pendingRequests > 0) out.push(`${r.pendingRequests} arena join request${r.pendingRequests > 1 ? 's' : ''} waiting for your answer.`);
  for (const a of r.arenas) {
    if (a.demo) continue;
    if (a.sub === 'expired') out.push(`${a.name}: subscription expired - online booking is off.`);
    else if (a.sub === 'paused') out.push(`${a.name}: subscription paused - online booking is off.`);
    else if (a.sub === 'ending' && a.subEndsAt) out.push(`${a.name}: subscription ends ${formatDamascusDate(a.subEndsAt)}.`);
  }
  for (const a of r.arenas) {
    if (a.demo || !a.visible) continue;
    const shown = a.online + a.noShows;
    if (shown >= 3 && a.noShows / shown >= 0.3) out.push(`${a.name}: high no-show rate (${a.noShows} of ${shown}).`);
    if (a.online + a.walkIns === 0) out.push(`${a.name}: no activity at all yesterday.`);
    if (a.outOfService > 0) out.push(`${a.name}: ${a.outOfService} station${a.outOfService > 1 ? 's' : ''} out of service.`);
    if (a.shifts === 0 && a.walkIns + a.online > 0) out.push(`${a.name}: bookings but no staff shift was started.`);
  }
  return out;
}

// ------------------------------------------------------------------ PDF

const COL = {
  band: rgb(0.059, 0.078, 0.188), // #0F1430
  violet: rgb(0.482, 0.247, 0.949), // #7B3FF2
  violetSoft: rgb(0.937, 0.906, 1), // #EFE7FF
  ink: rgb(0.063, 0.075, 0.169), // #10132B
  muted: rgb(0.357, 0.392, 0.533), // #5B6488
  line: rgb(0.88, 0.89, 0.94),
  zebra: rgb(0.965, 0.969, 0.985),
  red: rgb(0.85, 0.13, 0.27),
  amber: rgb(0.8, 0.52, 0.0),
  white: rgb(1, 1, 1),
};
const A4: [number, number] = [595.28, 841.89];
const M = 40; // page margin

const fmtDay = (d: Date) => {
  const p = toDamascusParts(d);
  const wd = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][p.weekday];
  const mo = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][p.month - 1];
  return `${wd}, ${p.day} ${mo} ${p.year}`;
};
const h1 = (n: number) => (Math.round(n * 10) / 10).toString();

export async function buildReportPdf(r: DailyReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`L3ib daily report ${formatDamascusDate(r.day)}`);
  doc.setAuthor('L3ib');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(Buffer.from(L3IB_LOGO_PNG_BASE64, 'base64'));
  const W = A4[0];
  const inner = W - 2 * M; // usable width

  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - M;

  const text = (s: string, x: number, yy: number, size = 10, f: PDFFont = font, color: RGB = COL.ink) =>
    page.drawText(s, { x, y: yy, size, font: f, color });
  const right = (s: string, xRight: number, yy: number, size = 10, f: PDFFont = font, color: RGB = COL.ink) =>
    text(s, xRight - f.widthOfTextAtSize(s, size), yy, size, f, color);
  const fit = (s: string, w: number, size: number, f: PDFFont = font) => {
    if (f.widthOfTextAtSize(s, size) <= w) return s;
    let t = s;
    while (t.length > 1 && f.widthOfTextAtSize(`${t}...`, size) > w) t = t.slice(0, -1);
    return `${t}...`;
  };
  const heading = (s: string) => {
    if (y < M + 80) {
      page = doc.addPage(A4);
      y = A4[1] - M;
    }
    text(s, M, y, 12.5, bold);
    page.drawRectangle({ x: M, y: y - 7, width: 30, height: 2.5, color: COL.violet });
    y -= 24;
  };

  // --- header band: logo, title, day
  const bandH = 86;
  page.drawRectangle({ x: 0, y: A4[1] - bandH, width: W, height: bandH, color: COL.band });
  page.drawRectangle({ x: 0, y: A4[1] - bandH, width: W, height: 3, color: rgb(0.161, 0.878, 1) });
  const ls = 50;
  page.drawImage(logo, { x: M, y: A4[1] - bandH / 2 - ls / 2, width: ls, height: ls });
  text('Daily report', M + ls + 14, A4[1] - 40, 20, bold, COL.white);
  text(fmtDay(r.day), M + ls + 14, A4[1] - 60, 10, font, rgb(0.79, 0.82, 0.94));
  const site = siteUrl()?.replace(/^https?:\/\//, '');
  if (site) right(site, W - M, A4[1] - 40, 10, bold, rgb(0.765, 0.631, 1));
  right('Damascus time, 00:00-24:00', W - M, A4[1] - 60, 8.5, font, rgb(0.6, 0.64, 0.8));
  y = A4[1] - bandH - 26;

  // --- 4 boxes: the day in four numbers
  const t = r.totals;
  const boxes: [string, string, string][] = [
    ['Bookings', String(t.online + t.walkIns), `${t.online} online, ${t.walkIns} walk-in`],
    ['Hours played', h1(t.hours), 'across all arenas'],
    ['No-shows', String(t.noShows), `${t.cancelled} cancelled`],
    ['New players', String(t.newPlayers), `${t.followers} new follows`],
  ];
  const gap = 10;
  const bw = (inner - gap * 3) / 4;
  const bh = 64;
  boxes.forEach(([label, value, sub], i) => {
    const bx = M + i * (bw + gap);
    const by = y - bh;
    page.drawRectangle({ x: bx, y: by, width: bw, height: bh, color: COL.violetSoft });
    page.drawRectangle({ x: bx, y: by + bh - 3, width: bw, height: 3, color: COL.violet });
    text(label, bx + 10, by + bh - 18, 8.5, bold, COL.muted);
    text(value, bx + 10, by + 22, 22, bold);
    text(fit(sub, bw - 20, 7.5), bx + 10, by + 9, 7.5, font, COL.muted);
  });
  y -= bh + 30;

  // --- needs attention (only what asks for an action)
  heading('Needs your attention');
  const notes = attention(r);
  if (notes.length === 0) {
    page.drawCircle({ x: M + 4, y: y + 3.5, size: 2.6, color: rgb(0.17, 0.7, 0.42) });
    text('Nothing today - all good.', M + 14, y, 10, font, COL.muted);
    y -= 15;
  }
  const shownNotes = notes.slice(0, 10);
  for (const n of shownNotes) {
    const urgent = /expired|paused|waiting/.test(n);
    page.drawCircle({ x: M + 4, y: y + 3.5, size: 2.6, color: urgent ? COL.red : COL.amber });
    text(fit(n, inner - 16, 10), M + 14, y, 10);
    y -= 15;
  }
  if (notes.length > shownNotes.length) {
    text(`+ ${notes.length - shownNotes.length} more`, M + 14, y, 9, font, COL.muted);
    y -= 15;
  }
  y -= 14;

  // --- one table: every arena on one row
  heading('Arenas');
  const plan = (a: DailyReport['arenas'][number]) =>
    a.sub === 'expired' ? 'EXPIRED' : a.sub === 'paused' ? 'PAUSED' : a.sub === 'free' ? 'free' : a.subEndsAt ? `to ${formatDamascusDate(a.subEndsAt).slice(5)}` : '-';
  // Widths add up to the page's usable width (no column runs off the page).
  const cols: { title: string; w: number; get: (a: DailyReport['arenas'][number]) => string; left?: boolean }[] = [
    { title: 'Arena', w: 150, left: true, get: (a) => a.name + (a.visible ? '' : ' (hidden)') },
    { title: 'Online', w: 48, get: (a) => String(a.online) },
    { title: 'Walk-in', w: 50, get: (a) => String(a.walkIns) },
    { title: 'Hours', w: 46, get: (a) => h1(a.hours) },
    { title: 'Busy', w: 44, get: (a) => `${a.occupancy}%` },
    { title: 'No-show', w: 52, get: (a) => String(a.noShows) },
    { title: 'Rating', w: 48, get: (a) => (a.rating ? a.rating.toFixed(1) : '-') },
    { title: 'Plan', w: inner - (150 + 48 + 50 + 46 + 44 + 52 + 48), get: plan },
  ];
  const rowH = 20;
  const head = () => {
    page.drawRectangle({ x: M, y: y - 6, width: inner, height: rowH, color: COL.band });
    let x = M;
    for (const c of cols) {
      if (c.left) text(c.title, x + 8, y, 8.5, bold, COL.white);
      else right(c.title, x + c.w - 8, y, 8.5, bold, COL.white);
      x += c.w;
    }
    y -= rowH;
  };
  head();
  const sorted = [...r.arenas].sort((a, b) => b.online + b.walkIns - (a.online + a.walkIns) || b.hours - a.hours);
  sorted.forEach((a, i) => {
    if (y - rowH < M + 24) {
      page = doc.addPage(A4);
      y = A4[1] - M;
      head();
    }
    if (i % 2 === 0) page.drawRectangle({ x: M, y: y - 6, width: inner, height: rowH, color: COL.zebra });
    let x = M;
    for (const c of cols) {
      const v = c.get(a);
      if (c.left) {
        text(fit(v, c.w - 14, 9, bold), x + 8, y, 9, bold, a.visible ? COL.ink : COL.muted);
      } else {
        const red = c.title === 'Plan' && (v === 'EXPIRED' || v === 'PAUSED');
        right(v, x + c.w - 8, y, 9, red ? bold : font, red ? COL.red : v === '0' || v === '0%' || v === '-' ? COL.muted : COL.ink);
      }
      x += c.w;
    }
    y -= rowH;
  });
  // Totals row
  page.drawRectangle({ x: M, y: y - 6, width: inner, height: rowH, color: COL.violetSoft });
  {
    let x = M;
    const totals: Record<string, string> = {
      Arena: 'Total',
      Online: String(t.online),
      'Walk-in': String(t.walkIns),
      Hours: h1(t.hours),
      'No-show': String(t.noShows),
    };
    for (const c of cols) {
      const v = totals[c.title];
      if (v) {
        if (c.left) text(v, x + 8, y, 9, bold);
        else right(v, x + c.w - 8, y, 9, bold);
      }
      x += c.w;
    }
    y -= rowH;
  }
  y -= 4;
  text('Busy = hours played / (working stations x opening hours).  Plan = subscription end (MM-DD).', M, y, 7.5, font, COL.muted);

  // --- footer on every page
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 34 }, end: { x: W - M, y: 34 }, thickness: 0.6, color: COL.line });
    p.drawText(`L3ib daily report  |  ${formatDamascusDate(r.day)}`, { x: M, y: 22, size: 7.5, font, color: COL.muted });
    const pn = `${i + 1} / ${pages.length}`;
    p.drawText(pn, { x: W - M - font.widthOfTextAtSize(pn, 7.5), y: 22, size: 7.5, font, color: COL.muted });
  });

  return doc.save();
}

// ------------------------------------------------------------------ send

async function sendPdf(chatId: string, bytes: Uint8Array, filename: string, caption: string): Promise<boolean> {
  const config = telegramConfig();
  if (!config) return false;
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', caption);
  form.append('document', new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), filename);
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.token}/sendDocument`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.error(`[telegram] sendDocument failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[telegram] sendDocument failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * From the minute job. Right after 00:00 Damascus (and until noon, if a tick
 * was missed): yesterday's report, once, to every super admin.
 */
export async function adminDailyReport(at = now()): Promise<void> {
  const admins = [...adminTelegramIds()];
  if (admins.length === 0 || !telegramConfig()) return;
  if (toDamascusParts(at).hour >= LATEST_HOUR) return;
  const day = new Date(startOfDamascusDay(at).getTime() - DAY);
  const key = `admin-report:${formatDamascusDate(day)}`;
  // Already sent (the usual case for every tick after the first): stop quietly.
  if (await prisma.jobRun.findUnique({ where: { key }, select: { key: true } })) return;
  // Claim the day first, so two ticks never send it twice.
  try {
    await prisma.jobRun.create({ data: { key } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
    throw err;
  }
  try {
    const r = await collectReport(day);
    const pdf = await buildReportPdf(r);
    const t = r.totals;
    const caption = `L3ib daily report - ${fmtDay(day)}\n${t.online} online, ${t.walkIns} walk-ins, ${h1(t.hours)} h played, ${t.noShows} no-shows.`;
    let sent = 0;
    for (const id of admins) if (await sendPdf(id, pdf, `l3ib-report-${formatDamascusDate(day)}.pdf`, caption)) sent += 1;
    // Nobody got it (Telegram down?): free the day so the next tick tries again.
    if (sent === 0) await prisma.jobRun.delete({ where: { key } }).catch(() => undefined);
  } catch (err) {
    await prisma.jobRun.delete({ where: { key } }).catch(() => undefined);
    throw err;
  }
}
