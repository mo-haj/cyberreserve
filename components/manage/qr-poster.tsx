'use client';

// «QR الصالة»: a printable A4 poster (arena logo, name, a QR code to the
// arena page) drawn on a canvas, shown in a popup before downloading.
import { useEffect, useState } from 'react';
import qrcode from 'qrcode-generator';
import { CITIES } from '@/lib/cities';
import type { Locale } from '@/lib/i18n';
import { Shell } from '@/components/manage/moderation';

// A4 at 150 dpi: sharp enough to print, small enough to download on a phone.
const W = 1240;
const H = 1754;
const C = {
  ink: '#10132B',
  muted: '#5B6488',
  violet: '#7B3FF2',
  violetSoft: '#EFE7FF',
  band: '#0F1430',
  cyan: '#29E0FF',
};

const T = {
  ar: {
    open: 'QR الصالة',
    title: 'بوستر QR للطباعة',
    hint: 'اطبعه وعلّقه في الصالة: من يمسح الكود يفتح صفحة صالتك مباشرةً ويحجز أو يتابع عروضك.',
    headline: 'امسح الكود واحجز جهازك',
    sub: ['شوف الأجهزة الفاضية الآن، احجز بثوانٍ،', 'وتابع عروض الصالة وبطولاتها.'],
    or: 'أو افتح الرابط:',
    footer: 'احجز أونلاين عبر',
    making: 'جارٍ تجهيز البوستر…',
    download: 'تنزيل الصورة (PNG)',
    print: 'طباعة / حفظ PDF',
    close: 'إغلاق',
    failed: 'تعذّر تجهيز البوستر. أعد المحاولة.',
  },
  en: {
    open: 'Arena QR',
    title: 'Printable QR poster',
    hint: 'Print it and put it up in the arena: scanning opens your arena page to book or follow your offers.',
    headline: 'Scan to book your station',
    sub: ['See free stations right now, book in seconds,', 'and follow the arena’s offers and tournaments.'],
    or: 'Or open:',
    footer: 'Book online with',
    making: 'Preparing the poster…',
    download: 'Download image (PNG)',
    print: 'Print / save PDF',
    close: 'Close',
    failed: 'Could not prepare the poster. Try again.',
  },
} as const;

type Arena = { slug: string; nameAr: string; nameEn: string; city: string; logo: string | null };

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** The site's own font stacks (next/font names), so the poster matches the site. */
function fontVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || getComputedStyle(document.body).getPropertyValue(name).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Shrinks the font until the text fits the width. */
function fitText(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, start: number, maxW: number) {
  let px = start;
  ctx.font = font(px);
  while (px > 28 && ctx.measureText(text).width > maxW) {
    px -= 2;
    ctx.font = font(px);
  }
}

export async function drawPoster(arena: Arena, locale: Locale, url: string): Promise<string> {
  const t = T[locale];
  const display = fontVar('--font-display', 'Tahoma, sans-serif');
  const sans = fontVar('--font-sans', 'Tahoma, sans-serif');
  await document.fonts.ready;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.direction = locale === 'ar' ? 'rtl' : 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // Paper.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  // A thin brand line on top.
  ctx.fillStyle = C.violet;
  ctx.fillRect(0, 0, W, 18);

  // Arena logo (or its initial) in a ring.
  const name = locale === 'ar' ? arena.nameAr : arena.nameEn;
  const cx = W / 2;
  const cy = 230;
  const r = 128;
  ctx.fillStyle = C.violetSoft;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 14, 0, Math.PI * 2);
  ctx.fill();
  const logo = arena.logo ? await loadImage(arena.logo) : null;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (logo) {
    // Cover the circle, centred.
    const s = Math.max((2 * r) / logo.width, (2 * r) / logo.height);
    ctx.drawImage(logo, cx - (logo.width * s) / 2, cy - (logo.height * s) / 2, logo.width * s, logo.height * s);
  } else {
    ctx.fillStyle = C.band;
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 150px ${display}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(Array.from(name.trim())[0] ?? '?', cx, cy + 8);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();

  // Name and city.
  ctx.fillStyle = C.ink;
  fitText(ctx, name, (px) => `800 ${px}px ${display}`, 92, W - 160);
  ctx.fillText(name, cx, 478);
  const city = CITIES.find((c) => c.key === arena.city)?.[locale] ?? '';
  if (city) {
    ctx.fillStyle = C.muted;
    ctx.font = `500 38px ${sans}`;
    ctx.fillText(`📍 ${city}`, cx, 546);
  }

  // Headline and the two lines under it.
  ctx.fillStyle = C.violet;
  fitText(ctx, t.headline, (px) => `800 ${px}px ${display}`, 70, W - 160);
  ctx.fillText(t.headline, cx, 662);
  ctx.fillStyle = C.muted;
  ctx.font = `500 34px ${sans}`;
  ctx.fillText(t.sub[0], cx, 718);
  ctx.fillText(t.sub[1], cx, 762);

  // The QR code, dark on white with its quiet zone, in a violet frame.
  const box = 600;
  const bx = (W - box) / 2;
  const by = 818;
  roundRect(ctx, bx - 22, by - 22, box + 44, box + 44, 36);
  ctx.fillStyle = C.violet;
  ctx.fill();
  roundRect(ctx, bx - 10, by - 10, box + 20, box + 20, 28);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  const qr = qrcode(0, 'Q');
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 3;
  const cell = Math.floor(box / (n + quiet * 2));
  const off = Math.round((box - cell * n) / 2);
  ctx.fillStyle = C.ink;
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (qr.isDark(row, col)) ctx.fillRect(bx + off + col * cell, by + off + row * cell, cell, cell);
    }
  }

  // The address for those who type it.
  ctx.fillStyle = C.muted;
  ctx.font = `500 32px ${sans}`;
  ctx.fillText(t.or, cx, by + box + 96);
  const shown = url.replace(/^https?:\/\//, '').replace(/\?.*$/, '');
  ctx.fillStyle = C.ink;
  ctx.direction = 'ltr';
  fitText(ctx, shown, (px) => `700 ${px}px ${sans}`, 42, W - 160);
  ctx.fillText(shown, cx, by + box + 150);
  ctx.direction = locale === 'ar' ? 'rtl' : 'ltr';

  // Footer band: "Book online with [L3ib]".
  const fh = 150;
  ctx.fillStyle = C.band;
  ctx.fillRect(0, H - fh, W, fh);
  ctx.fillStyle = C.cyan;
  ctx.fillRect(0, H - fh, W, 4);
  const brand = await loadImage('/brand/l3ib-logo.webp');
  const footer = t.footer;
  ctx.font = `600 40px ${sans}`;
  const fw = ctx.measureText(footer).width;
  ctx.font = `800 52px ${display}`;
  const lw = ctx.measureText('L3ib').width;
  const icon = brand ? 84 : 0;
  const gap = 22;
  const total = fw + gap + icon + (icon ? 14 : 0) + lw;
  const fy = H - fh / 2;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.direction = 'ltr';
  // Arabic reads right to left: [text] on the right, [logo L3ib] on the left.
  const startX = (W - total) / 2;
  if (locale === 'ar') {
    let x = startX;
    if (brand) {
      ctx.drawImage(brand, x, fy - icon / 2, icon, icon);
      x += icon + 14;
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 52px ${display}`;
    ctx.fillText('L3ib', x, fy + 2);
    x += lw + gap;
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#C9D0F0';
    ctx.font = `600 40px ${sans}`;
    ctx.fillText(footer, x + fw, fy);
  } else {
    let x = startX;
    ctx.fillStyle = '#C9D0F0';
    ctx.font = `600 40px ${sans}`;
    ctx.fillText(footer, x, fy);
    x += fw + gap;
    if (brand) {
      ctx.drawImage(brand, x, fy - icon / 2, icon, icon);
      x += icon + 14;
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 52px ${display}`;
    ctx.fillText('L3ib', x, fy + 2);
  }

  return canvas.toDataURL('image/png');
}

export function QrPosterButton({ arena, locale }: { arena: Arena; locale: Locale }) {
  const t = T[locale];
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-ghost px-4 py-2 text-sm" onClick={() => setOpen(true)}>
        ▦ {t.open}
      </button>
      {open && <QrPoster arena={arena} locale={locale} onClose={() => setOpen(false)} />}
    </>
  );
}

function QrPoster({ arena, locale, onClose }: { arena: Arena; locale: Locale; onClose: () => void }) {
  const t = T[locale];
  const [png, setPng] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // ?from=qr tells the arena's visits from the poster apart.
    const url = `${window.location.origin}/arenas/${arena.slug}?from=qr`;
    drawPoster(arena, locale, url).then(setPng, () => setFailed(true));
  }, [arena, locale]);

  const file = `l3ib-${arena.slug}-qr.png`;
  const print = () => {
    if (!png) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(
      `<!doctype html><title>${file}</title><style>@page{size:A4;margin:0}html,body{margin:0}img{display:block;width:100vw;height:auto}</style><img src="${png}" onload="setTimeout(()=>{print()},150)">`,
    );
    w.document.close();
  };

  return (
    <Shell title={t.title} onClose={onClose}>
      <div className="space-y-4 overflow-y-auto px-6 pb-2">
        <p className="text-sm text-muted">{t.hint}</p>
        <div className="flex min-h-[18rem] items-center justify-center bg-void/60 p-3">
          {png ? (
            <img src={png} alt={t.title} className="max-h-[55dvh] w-auto shadow-[0_0_0_1px_rgba(157,92,255,0.4)]" />
          ) : (
            <p className="text-sm text-muted">{failed ? t.failed : t.making}</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 p-6 pt-4">
        <button type="button" className="text-sm text-muted hover:text-ink" onClick={onClose}>
          {t.close}
        </button>
        <button type="button" className="btn-ghost px-4 py-2 text-sm" disabled={!png} onClick={print}>
          {t.print}
        </button>
        <a
          href={png ?? undefined}
          download={file}
          aria-disabled={!png}
          className={`btn-neon text-sm ${png ? '' : 'pointer-events-none opacity-50'}`}
        >
          {t.download}
        </a>
      </div>
    </Shell>
  );
}
