// A player's badge at one arena: VIP (gold crown), Loyal (violet star), or
// New (cyan, automatic for a first booking).
import type { Locale } from '@/lib/i18n';

const LOOK = {
  vip: {
    ar: 'VIP',
    en: 'VIP',
    cls: 'bg-amber-400/20 text-amber-200 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.75),0_0_12px_-4px_rgba(251,191,36,0.9)]',
    icon: <path d="M3 18h18l-1.5-10-5 4L12 5l-2.5 7-5-4L3 18z" fill="currentColor" />,
  },
  loyal: {
    ar: 'زبون دائم',
    en: 'Loyal',
    cls: 'bg-violet/20 text-violet-soft shadow-[inset_0_0_0_1px_rgba(157,92,255,0.7)]',
    icon: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z" fill="currentColor" />,
  },
  new: {
    ar: 'جديد',
    en: 'New',
    cls: 'bg-cyan/10 text-cyan shadow-[inset_0_0_0_1px_rgba(41,224,255,0.55)]',
    icon: <circle cx="12" cy="12" r="5" fill="currentColor" />,
  },
} as const;

export type BadgeKind = keyof typeof LOOK;

export function badgeName(kind: BadgeKind, locale: Locale) {
  return LOOK[kind][locale];
}

export default function PlayerBadge({ kind, locale, className = '' }: { kind: string; locale: Locale; className?: string }) {
  if (!(kind in LOOK)) return null;
  const look = LOOK[kind as BadgeKind];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 px-1.5 py-px text-[0.7rem] font-bold leading-4 ${look.cls} ${className}`}>
      <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden="true">
        {look.icon}
      </svg>
      {look[locale]}
    </span>
  );
}
