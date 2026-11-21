// The arena's offers as bright gold "tickets", placed where players look
// first: under the arena cover, and in the home page's arena panel.
import type { OfferView } from '@/lib/cafes';
import { dictionary, pick, type Locale } from '@/lib/i18n';
import { offerLabel } from '@/lib/offers';

export default function OffersStrip({
  locale,
  offers,
  compact = false,
  className = '',
}: {
  locale: Locale;
  offers: OfferView[];
  /** Home panel: one row, no notes. */
  compact?: boolean;
  className?: string;
}) {
  if (offers.length === 0) return null;
  const t = dictionary(locale);
  const shown = compact ? offers.slice(0, 3) : offers;
  return (
    <section className={className} aria-label={t.arena.offers}>
      {!compact && (
        <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-bold text-amber-200">
          <TagIcon />
          {t.arena.offers}
        </h2>
      )}
      <ul className={compact ? 'flex flex-wrap gap-2' : 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3'}>
        {shown.map((o, i) => {
          const { deal, when } = offerLabel(o, locale);
          const note = pick(locale, o.noteEn || o.noteAr, o.noteAr || o.noteEn);
          const who = o.stationType ? t.station.typeShort[o.stationType as keyof typeof t.station.typeShort] : t.arena.allStations;
          return (
            <li
              key={i}
              className={`offer-ticket relative overflow-hidden ${compact ? 'flex items-center gap-2 px-3 py-1.5' : 'px-4 py-3.5'}`}
            >
              {compact ? (
                <>
                  <TagIcon small />
                  <span className="text-sm font-bold text-amber-100">{deal}</span>
                  <span className="text-xs text-amber-200/70">{when}</span>
                </>
              ) : (
                <>
                  <p className="font-display text-xl font-extrabold leading-tight text-amber-100">{deal}</p>
                  <p className="mt-1 text-sm text-amber-200/80">
                    {when} · {who}
                  </p>
                  {note && <p className="mt-1.5 text-sm text-ink/85">{note}</p>}
                </>
              )}
            </li>
          );
        })}
        {compact && offers.length > shown.length && <li className="self-center text-xs text-amber-200/70">+{offers.length - shown.length}</li>}
      </ul>
    </section>
  );
}

function TagIcon({ small = false }: { small?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`${small ? 'h-4 w-4' : 'h-5 w-5'} shrink-0 text-amber-300`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" strokeLinejoin="round" />
      <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" />
    </svg>
  );
}
