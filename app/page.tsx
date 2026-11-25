import ArenaBrowser from '@/components/ArenaBrowser';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { getCurrentUser } from '@/lib/auth/session';
import { getCafeLive, listCafes } from '@/lib/cafes';
import { cookies } from 'next/headers';
import { CITY_COOKIE, resolveStartCity } from '@/lib/cities';
import { dictionary } from '@/lib/i18n';
import { getLocale } from '@/lib/locale';

// Reads live data on every request.
export const dynamic = 'force-dynamic';

export default async function HomePage({ searchParams }: { searchParams: Promise<{ city?: string | string[]; open?: string }> }) {
  const locale = await getLocale();
  const t = dictionary(locale);
  const cityParam = (await searchParams).city;
  const openOnly = (await searchParams).open === '1';
  const [arenas, user, jar] = await Promise.all([listCafes(), getCurrentUser(), cookies()]);
  const city = resolveStartCity(cityParam, jar.get(CITY_COOKIE)?.value, user?.homeCity);
  const first = arenas.find((a) => !city || a.city === city) ?? null;
  const firstLive = first ? await getCafeLive(first.slug) : null;
  const totals = arenas.reduce(
    (acc, a) => ({ stations: acc.stations + a.counts.total, free: acc.free + a.counts.free }),
    { stations: 0, free: 0 },
  );

  return (
    <>
      <SiteHeader locale={locale} user={user} path="/" />

      <main className="mx-auto w-full max-w-site px-4 lg:px-8">
        {/* Intro: short, so the arena list is visible without scrolling. */}
        <section className="grid grid-cols-1 items-end gap-5 pb-5 pt-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:pt-1">
          <div>
            <h1 className="font-display text-4xl font-extrabold leading-[1.1] text-ink neon sm:text-5xl lg:text-[3.4rem]">
              {t.home.title}
            </h1>
            <p className="mt-2 max-w-prose text-base text-muted lg:text-lg">{t.home.lead}</p>
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center sm:gap-3">
            {[
              { n: arenas.length, label: t.home.statArenas, tone: 'text-violet-soft' },
              { n: totals.stations, label: t.home.statStations, tone: 'text-cyan' },
              { n: totals.free, label: t.home.statFree, tone: 'text-free' },
            ].map((s) => (
              <div key={s.label} className="hud min-w-0 px-2 py-2 sm:min-w-[6.5rem] sm:px-4">
                <dt className="sr-only">{s.label}</dt>
                <dd className={`font-hud text-3xl font-bold ${s.tone}`}>{s.n}</dd>
                <dd className="text-xs text-muted">{s.label}</dd>
              </div>
            ))}
          </dl>
        </section>

        <ArenaBrowser
          locale={locale}
          initial={arenas}
          initialCity={openOnly ? null : city}
          initialOpen={openOnly}
          initialLive={firstLive}
          signedIn={!!user}
          profileComplete={!!user?.profileComplete}
        />
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}
