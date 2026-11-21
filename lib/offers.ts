// How an arena offer reads, the same everywhere (arena page, home, dashboard).
import type { OfferKind } from '@/lib/booking/rules';
import type { Locale } from '@/lib/i18n';

export interface OfferLike {
  hours: number;
  kind: OfferKind;
  price: string | number;
}

/** 15000 -> "15,000". */
export function money(v: string | number): string {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : String(v);
}

function hoursText(h: number, locale: Locale): string {
  if (locale === 'ar') return h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : h <= 10 ? `${h} ساعات` : `${h} ساعة`;
  return h === 1 ? '1 hour' : `${h} hours`;
}

/** Big line (the deal) and small line (when it applies). */
export function offerLabel(o: OfferLike, locale: Locale): { deal: string; when: string } {
  const cur = locale === 'ar' ? 'ل.س' : 'SYP';
  const h = hoursText(o.hours, locale);
  switch (o.kind) {
    case 'rate':
      return locale === 'ar'
        ? { deal: `الساعة بـ ${money(o.price)} ${cur}`, when: `إذا لعبت ${h} أو أكثر` }
        : { deal: `${money(o.price)} ${cur} / hour`, when: `when you play ${h} or more` };
    case 'percent':
      return locale === 'ar'
        ? { deal: `خصم ${o.price}%`, when: `إذا لعبت ${h} أو أكثر` }
        : { deal: `${o.price}% off`, when: `when you play ${h} or more` };
    default:
      return locale === 'ar'
        ? { deal: `${h} بـ ${money(o.price)} ${cur}`, when: 'باقة' }
        : { deal: `${h} for ${money(o.price)} ${cur}`, when: 'package' };
  }
}
