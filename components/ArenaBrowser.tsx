'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import CityRail from '@/components/CityRail';
import GamesDialog from '@/components/GamesDialog';
import OffersStrip from '@/components/OffersStrip';
import LiveFloor, { Legend, type LiveData } from '@/components/LiveFloor';
import type { CafeSummary } from '@/lib/cafes';
import { CITIES, CITY_COOKIE, CITY_COOKIE_MAX_AGE, cityName } from '@/lib/cities';
import { dictionary, pick, type Locale } from '@/lib/i18n';
import { distanceKm, formatKm } from '@/lib/geo';

// Home page "server browser": arena list on one side, the selected arena's
// live station map on the other (desktop). On phones a row opens the arena page.

const POLL_MS = 5000;

function Occupancy({ free, busy, total }: { free: number; busy: number; total: number }) {
  const t = total || 1;
  return (
    <div className="flex h-1.5 w-full overflow-hidden bg-line" aria-hidden="true">
      <div className="bg-free shadow-[0_0_8px_#2BFF88] transition-[width] duration-700" style={{ width: `${(free / t) * 100}%` }} />
      <div className="bg-busy transition-[width] duration-700" style={{ width: `${(busy / t) * 100}%` }} />
    </div>
  );
}

export default function ArenaBrowser({
  locale,
  initial,
  initialCity,
  initialLive,
  signedIn,
  profileComplete = false,
  initialOpen = false,
}: {
  locale: Locale;
  initial: CafeSummary[];
  /** City key from ?city=, or null for all of Syria. */
  initialCity: string | null;
  /** Live grid of the first arena, rendered on the server. */
  initialLive: LiveData | null;
  signedIn: boolean;
  profileComplete?: boolean;
  /** Start with "open now" on (/?open=1). */
  initialOpen?: boolean;
}) {
  const t = dictionary(locale);
  const [arenas, setArenas] = useState(initial);
  const [city, setCity] = useState<string | null>(initialCity);
  const [selected, setSelected] = useState(
    initial.find((a) => !initialCity || a.city === initialCity)?.slug ?? null,
  );
  const [query, setQuery] = useState('');
  // "Nearest to me": the visitor's position stays in this tab only (never sent to the server).
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState<'idle' | 'wait' | 'denied'>('idle');
  const [openOnly, setOpenOnly] = useState(initialOpen);
  // The arena whose live grid the server already rendered.
  const [serverLiveSlug] = useState(selected);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/arenas?live=1', { cache: 'no-store' });
        if (!res.ok) return;
        const body = (await res.json()) as { arenas: Pick<CafeSummary, 'slug' | 'counts'>[] };
        if (cancelled) return;
        // Only the counts change; names, photos and games stay from the page load.
        const counts = new Map(body.arenas.map((a) => [a.slug, a.counts]));
        setArenas((prev) => prev.map((a) => (counts.has(a.slug) ? { ...a, counts: counts.get(a.slug)! } : a)));
      } catch {
        // Keep the last known numbers; the next poll retries.
      }
    }
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Arenas per city, for the city menu.
  const perCity = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of arenas) m.set(a.city, (m.get(a.city) ?? 0) + 1);
    return m;
  }, [arenas]);

  const inCity = useMemo(() => (city ? arenas.filter((a) => a.city === city) : arenas), [arenas, city]);

  const kmOf = useMemo(() => {
    const m = new Map<string, number>();
    if (here) for (const a of arenas) if (a.latitude != null && a.longitude != null) m.set(a.slug, distanceKm(here, { lat: a.latitude, lng: a.longitude }));
    return m;
  }, [arenas, here]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (!q ? inCity : searchIn(inCity, q)).filter((a) => !openOnly || a.openNow !== false);
    if (!here) return list;
    // Closest first; arenas without a map pin go last.
    return [...list].sort((x, y) => (kmOf.get(x.slug) ?? Infinity) - (kmOf.get(y.slug) ?? Infinity));
  }, [inCity, query, here, kmOf, openOnly]);

  function locate() {
    if (here) {
      setHere(null);
      return;
    }
    if (!('geolocation' in navigator)) {
      setLocating('denied');
      return;
    }
    setLocating('wait');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setHere({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating('idle');
        chooseCity(null); // the nearest arena may be in another city
      },
      () => setLocating('denied'),
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 5 * 60_000 },
    );
  }

  function searchIn(list: CafeSummary[], q: string) {
    return list.filter((a) =>
      [
        a.nameEn,
        a.nameAr,
        a.areaEn,
        a.areaAr,
        cityName(a.city, 'en'),
        cityName(a.city, 'ar'),
        // "ps5", "xbox", "playstation" find arenas with those consoles.
        ...a.types.flatMap((x) => [x.type, x.type.startsWith('PS') ? 'playstation' : x.type, x.type.startsWith('PS') ? 'بلايستيشن' : '']),
      ].some((v) =>
        v.toLowerCase().includes(q),
      ),
    );
  }

  // Keep the preview on an arena that is in the list.
  const current = shown.find((a) => a.slug === selected) ?? shown[0] ?? null;

  function chooseCity(next: string | null) {
    setCity(next);
    // Shareable link (?city=aleppo) without reloading the page.
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('city', next);
    else url.searchParams.delete('city');
    window.history.replaceState(null, '', url);
    // Remember the pick for the next visit ("all" keeps All Syria chosen).
    document.cookie = `${CITY_COOKIE}=${next ?? 'all'}; path=/; max-age=${CITY_COOKIE_MAX_AGE}; samesite=lax`;
  }

  if (arenas.length === 0) {
    return <p className="hud p-8 text-muted">{t.home.empty}</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:h-[clamp(32rem,calc(100dvh-15rem),46rem)] lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
      {/* Arena list */}
      <section className="hud flex min-h-0 min-w-0 flex-col p-4 sm:p-5" aria-labelledby="arena-list-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="arena-list-title" className="font-display text-2xl font-bold text-ink">
            {t.home.listTitle}
          </h2>
          <span className="font-hud text-sm text-muted">{shown.length}</span>
        </div>
        <div className="mt-4">
          <CityRail
            label={t.home.city}
            prevLabel={t.home.railPrev}
            nextLabel={t.home.railNext}
            value={city ?? ''}
            onChange={(k) => chooseCity(k || null)}
            items={[
              { key: '', label: t.home.allCities, count: arenas.length },
              // Cities with arenas first, then the rest, each group in list order.
              ...[...CITIES]
                .sort((x, y) => Number((perCity.get(y.key) ?? 0) > 0) - Number((perCity.get(x.key) ?? 0) > 0))
                .map((c) => ({ key: c.key, label: pick(locale, c.en, c.ar), count: perCity.get(c.key) ?? 0 })),
            ]}
          />
        </div>
        <label className="scan-field mt-3 flex items-center gap-3 px-4">
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-violet-soft" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M20 20l-4.2-4.2" strokeLinecap="round" />
          </svg>
          <span className="sr-only">{t.home.search}</span>
          <input
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder={t.home.search}
            className="min-w-0 flex-1 bg-transparent py-3 text-ink placeholder:text-muted/70 outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t.home.clearSearch}
              className="panel-in grid h-7 w-7 shrink-0 place-items-center text-muted hover:text-ink"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={locate}
            aria-pressed={!!here}
            disabled={locating === 'wait'}
            className={`city-option flex items-center gap-2 px-3 py-1.5 text-sm ${here ? 'city-option-on text-ink' : 'text-muted hover:text-ink'}`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 21s-6.5-6.1-6.5-11A6.5 6.5 0 0 1 18.5 10c0 4.9-6.5 11-6.5 11z" />
              <circle cx="12" cy="10" r="2.3" />
            </svg>
            {locating === 'wait' ? t.home.nearMeWait : here ? t.home.nearMeOff : t.home.nearMe}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !openOnly;
              setOpenOnly(next);
              const url = new URL(window.location.href);
              if (next) url.searchParams.set('open', '1');
              else url.searchParams.delete('open');
              window.history.replaceState(null, '', url);
            }}
            aria-pressed={openOnly}
            className={`city-option flex items-center gap-2 px-3 py-1.5 text-sm ${openOnly ? 'city-option-on text-ink' : 'text-muted hover:text-ink'}`}
          >
            <span className={`h-2 w-2 rounded-full ${openOnly ? 'bg-free shadow-[0_0_6px_#2BFF88]' : 'bg-muted'}`} aria-hidden="true" />
            {t.home.openOnly}
          </button>
          {here && <span className="text-xs text-free">{t.home.nearMeOn}</span>}
          {locating === 'denied' && !here && <span className="text-xs text-busy">{t.home.nearMeDenied}</span>}
        </div>

        {/* Re-keyed per city, so the rows "deal in" again when the city changes. */}
        {/* Desktop: the list scrolls inside its box, the page keeps one height. */}
        <ul
          key={city ?? 'all'}
          className="cr-scroll mt-4 flex flex-col gap-2 lg:-me-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pe-2 lg:[mask-image:linear-gradient(to_bottom,#000_calc(100%-2.5rem),transparent)] lg:pb-8"
        >
          {shown.map((a, i) => {
            const active = a.slug === current?.slug;
            return (
              <li key={a.slug} className="deal-in" style={{ animationDelay: `${Math.min(i, 8) * 55}ms` }}>
                <Link
                  href={`/arenas/${a.slug}`}
                  onClick={(e) => {
                    // Desktop: the first click previews the arena beside the
                    // list, a click on the one already shown opens its page.
                    // Phones: open the arena page at once.
                    if (window.matchMedia('(min-width: 1024px)').matches && !active) {
                      e.preventDefault();
                      setSelected(a.slug);
                    }
                  }}
                  title={active ? t.home.openArena : undefined}
                  aria-current={a.slug === current?.slug ? 'true' : undefined}
                  className={`group flex gap-3 p-2.5 transition-colors [clip-path:polygon(10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%,0_10px)] ${
                    active
                      ? 'bg-violet/20 shadow-[inset_0_0_0_1px_rgba(157,92,255,0.8)]'
                      : 'bg-panel2/50 hover:bg-panel2'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.logoImage ?? a.coverImage}
                    alt=""
                    className={`h-16 shrink-0 object-cover ${a.logoImage ? 'w-16 rounded-full shadow-[0_0_0_2px_rgba(157,92,255,0.5)]' : 'w-24'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate font-display text-base font-semibold text-ink">{pick(locale, a.nameEn, a.nameAr)}</p>
                      <p className="shrink-0 font-hud text-lg font-bold text-free">
                        {a.counts.free}
                        <span className="text-xs font-semibold text-muted">/{a.counts.total}</span>
                      </p>
                    </div>
                    <p className="truncate text-xs text-muted">
                      {a.rating && <span className="me-1.5 text-amber-300">★ {a.rating.avg.toFixed(1)}</span>}
                      {a.openNow === false && <span className="me-1.5 text-busy">{t.engage.closedNow}</span>}
                      {kmOf.has(a.slug) && <span className="me-1.5 font-hud text-cyan">{t.home.km(formatKm(kmOf.get(a.slug)!))}</span>}
                      {pick(locale, a.areaEn, a.areaAr)}
                      {locale === 'ar' ? '، ' : ', '}
                      {cityName(a.city, locale)}
                    </p>
                    <div className="mt-2">
                      <Occupancy free={a.counts.free} busy={a.counts.busy} total={a.counts.total} />
                    </div>
                    {(a.offers.length > 0 || a.types.some((x) => x.type !== 'PC')) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {a.offers.length > 0 && (
                          <span className="bg-amber-400/20 px-1.5 text-[0.65rem] font-bold leading-4 text-amber-200 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.6)]">
                            {t.arena.offers}
                          </span>
                        )}
                        {a.types
                          .filter((x) => x.type !== 'PC')
                          .map((x) => (
                            <span key={x.type} dir="ltr" className="bg-cyan/10 px-1.5 font-hud text-[0.65rem] leading-4 text-cyan">
                              {t.station.typeShort[x.type]} ×{x.total}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
        {shown.length === 0 && (
          <div className="panel-in mt-4 flex flex-col items-center gap-4 px-2 py-8 text-center">
            <Radar />
            <p className="max-w-xs text-sm text-muted">
              {inCity.length === 0 && city ? t.home.noneInCity(cityName(city, locale)) : t.home.noResults}
            </p>
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => {
                setQuery('');
                chooseCity(null);
              }}
            >
              {t.home.allCities} ({arenas.length})
            </button>
          </div>
        )}
      </section>

      {/* Nothing to preview (empty city or no match): keep the layout, show the scanner. */}
      {!current && (
        <section className="hud hidden min-h-[28rem] flex-col items-center justify-center gap-5 p-8 text-center lg:flex">
          <Radar large />
          <p className="max-w-sm text-muted">
            {inCity.length === 0 && city ? t.home.noneInCity(cityName(city, locale)) : t.home.noResults}
          </p>
        </section>
      )}

      {/* Selected arena, live (desktop) */}
      {current && (
        <section className="hud hidden min-h-0 min-w-0 flex-col overflow-y-auto p-5 cr-scroll lg:flex" aria-live="polite">
          {/* The whole header (photo, logo, name) opens the arena page. */}
          <Link
            href={`/arenas/${current.slug}`}
            title={t.home.openArena}
            className="group/cover relative -mx-5 -mt-5 mb-5 block h-44 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.coverImage} alt="" className="h-full w-full object-cover object-top transition-transform duration-500 group-hover/cover:scale-[1.03]" />
            <div className="absolute inset-0 bg-gradient-to-t from-panel via-panel/70 to-panel/10" />
            <div className="absolute inset-x-5 bottom-3 flex items-end justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-3 font-display text-3xl font-bold text-ink neon">
                  {current.logoImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={current.logoImage} alt="" className="h-14 w-14 shrink-0 rounded-full bg-void/80 object-cover shadow-[0_0_0_2px_rgba(157,92,255,0.6)]" />
                  )}
                  <span className="decoration-violet-soft decoration-2 underline-offset-8 group-hover/cover:underline">{pick(locale, current.nameEn, current.nameAr)}</span>
                  <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-violet-soft opacity-60 transition-opacity group-hover/cover:opacity-100 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                    <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </h2>
                <p className="text-sm text-muted">
                  {pick(locale, current.areaEn, current.areaAr)}
                  {locale === 'ar' ? '، ' : ', '}
                  {cityName(current.city, locale)} — {t.arena.perHour(current.hourlyRate)}
                </p>
              </div>
              <p className="text-end">
                <span className="font-hud text-4xl font-bold text-free drop-shadow-[0_0_12px_rgba(43,255,136,0.7)]">
                  {current.counts.free}
                </span>
                <span className="block text-xs text-muted">{t.arena.freeOf(current.counts.free, current.counts.total)}</span>
              </p>
            </div>
          </Link>
          <OffersStrip locale={locale} offers={current.offers} compact className="mt-3" />
          <LiveFloor
            key={current.slug}
            slug={current.slug}
            initial={current.slug === serverLiveSlug ? initialLive : null}
            locale={locale}
            signedIn={signedIn}
            profileComplete={profileComplete}
            size="compact"
            arenaName={pick(locale, current.nameEn, current.nameAr)}
            loginHref={`/login?next=${encodeURIComponent(`/arenas/${current.slug}`)}`}
          />
          <div className="mt-auto flex flex-wrap items-center justify-end gap-3 pt-5">
            <Legend locale={locale} className="me-auto" />
            <GamesDialog key={current.slug} locale={locale} arenaName={pick(locale, current.nameEn, current.nameAr)} games={current.games} />
            <Link href={`/arenas/${current.slug}`} className="btn-neon">
              {t.arena.open}
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

/** Small radar sweep for empty results (CSS animation, transform only). */
function Radar({ large = false }: { large?: boolean }) {
  const size = large ? 'h-40 w-40' : 'h-24 w-24';
  return (
    <div aria-hidden="true" className={`radar relative ${size} rounded-full`}>
      <span className="radar-sweep absolute inset-0 rounded-full" />
      <span className="absolute inset-[22%] rounded-full shadow-[inset_0_0_0_1px_rgba(41,224,255,0.25)]" />
      <span className="absolute inset-[44%] rounded-full bg-cyan/60 shadow-[0_0_12px_#29E0FF]" />
    </div>
  );
}
