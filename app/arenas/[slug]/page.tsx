import ArenaMap from '@/components/ArenaMap';
import GamesDialog from '@/components/GamesDialog';
import { cityName } from '@/lib/cities';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import LiveFloor, { Legend } from '@/components/LiveFloor';
import Reveal from '@/components/Reveal';
import ZoneCards from '@/components/ZoneCards';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { getCurrentUser } from '@/lib/auth/session';
import { getCafe } from '@/lib/cafes';
import { dictionary, pick } from '@/lib/i18n';
import { getLocale } from '@/lib/locale';
import { now } from '@/lib/time';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

const SLUG = /^[a-z0-9-]{1,60}$/;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const arena = SLUG.test(slug) ? await getCafe(slug) : null;
  if (!arena) return { title: dictionary(locale).arena.notFound };
  return {
    title: pick(locale, arena.nameEn, arena.nameAr),
    description: pick(locale, arena.taglineEn, arena.taglineAr),
  };
}

export default async function ArenaPage({ params }: Params) {
  const { slug } = await params;
  if (!SLUG.test(slug)) notFound();
  const [locale, arena, user] = await Promise.all([getLocale(), getCafe(slug), getCurrentUser()]);
  if (!arena) notFound();

  const t = dictionary(locale);
  const path = `/arenas/${arena.slug}`;
  const name = pick(locale, arena.nameEn, arena.nameAr);
  const live = { at: now().toISOString(), counts: arena.counts, pcs: arena.pcs };
  const loginHref = `/login?next=${encodeURIComponent(path)}`;

  return (
    <>
      <SiteHeader locale={locale} user={user} path={path} />

      <main className="mx-auto w-full max-w-site px-4 lg:px-8">
        <Link href="/" className="text-sm text-muted hover:text-ink">
          {t.arena.back}
        </Link>

        {/* Phones: cover + stations, then prices/booking, then the photo sections.
            Desktop: the side panel spans both rows on the end side and stays in view. */}
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
            {/* Cover: a short banner, so the stations are visible as soon as the page opens. */}
            <section className="hud relative overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={arena.coverImage} alt="" className="h-36 w-full object-cover object-[center_70%] sm:h-44" />
              <div className="absolute inset-0 bg-gradient-to-t from-panel via-panel/60 to-panel/5" />
              <div className="absolute inset-x-0 bottom-0 px-5 pb-4 sm:px-7">
                <h1 className="flex items-center gap-3 font-display text-3xl font-extrabold leading-tight text-ink neon sm:text-5xl">
                  {arena.logoImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={arena.logoImage}
                      alt=""
                      className="h-12 w-12 shrink-0 bg-void/80 object-contain p-1 shadow-[inset_0_0_0_1px_rgba(157,92,255,0.5)] sm:h-16 sm:w-16"
                    />
                  )}
                  {name}
                </h1>
                <p className="mt-1 line-clamp-1 max-w-prose text-sm text-muted sm:text-base">
                  {pick(locale, arena.taglineEn, arena.taglineAr)}
                </p>
              </div>
            </section>

            {/* Live stations */}
            <section id="stations" className="hud p-5 sm:p-7" aria-labelledby="stations-title">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 id="stations-title" className="font-display text-2xl font-bold text-ink sm:text-3xl">
                    {t.arena.stationsNow}
                  </h2>
                  <p className="font-hud text-lg text-free">{t.arena.freeOf(arena.counts.free, arena.counts.total)}</p>
                </div>
                <Legend locale={locale} />
              </div>
              <LiveFloor
                slug={arena.slug}
                initial={live}
                locale={locale}
                signedIn={!!user}
                profileComplete={!!user?.profileComplete}
                loginHref={loginHref}
                groups={arena.groups}
              />
            </section>

            <ZoneCards locale={locale} groups={arena.groups} pcs={arena.pcs} />
          </div>

          {/* Side panel */}
          <aside className="space-y-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
            <ArenaMap
              locale={locale}
              lat={arena.latitude}
              lng={arena.longitude}
              name={pick(locale, arena.nameEn, arena.nameAr)}
            />

            <section className="hud p-5">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                <Fact label={t.arena.dayRate}>
                  <span className="font-hud text-2xl font-bold text-violet-soft">{arena.hourlyRate}</span>{' '}
                  <span className="text-sm text-muted">{locale === 'ar' ? 'ل.س' : 'SYP'}</span>
                </Fact>
                <Fact label={t.arena.nightRate}>
                  <span className="font-hud text-2xl font-bold text-cyan">{arena.nightShiftRate}</span>{' '}
                  <span className="text-sm text-muted">{locale === 'ar' ? 'ل.س' : 'SYP'}</span>
                </Fact>
                <Fact label={t.arena.hours}>{pick(locale, arena.hoursEn, arena.hoursAr)}</Fact>
                <Fact label={t.arena.stations}>
                  <span className="font-hud text-xl font-bold text-ink">{arena.counts.total}</span>
                </Fact>
                <div className="col-span-2">
                  <Fact label={t.arena.address}>
                    {pick(locale, arena.addressEn, arena.addressAr)}
                    {' — '}
                    {pick(locale, arena.areaEn, arena.areaAr)}
                    {locale === 'ar' ? '، ' : ', '}
                    {cityName(arena.city, locale)}
                  </Fact>
                </div>
              </dl>
              <GamesDialog
                locale={locale}
                arenaName={pick(locale, arena.nameEn, arena.nameAr)}
                games={arena.games}
                className="mt-5 w-full justify-center"
              />
            </section>

            <section className="hud p-6">
              <h2 className="font-display text-xl font-bold text-ink">{t.arena.booking}</h2>
              <p className="mt-2 text-sm text-muted">{t.arena.bookingSoon}</p>
              {user && !user.profileComplete ? (
                <Link href={`/profile?welcome=1&next=${encodeURIComponent(`/arenas/${arena.slug}`)}`} className="btn-neon mt-5 w-full">
                  {t.profile.incomplete}
                </Link>
              ) : user ? (
                <p className="mt-4 text-sm text-free">{t.arena.signedInReady(user.name)}</p>
              ) : (
                <Link href={loginHref} className="btn-neon mt-5 w-full">
                  {t.arena.signInCta}
                </Link>
              )}
            </section>
          </aside>

          {/* Alternating photo / text */}
          <div className="min-w-0 lg:col-start-1 lg:row-start-2">
            <div className="space-y-16 pt-10 sm:space-y-24">
              {arena.sections.map((s, i) => {
                const title = pick(locale, s.titleEn, s.titleAr);
                const body = pick(locale, s.bodyEn, s.bodyAr);
                // A post without a photo: the text alone, in a framed block.
                if (!s.imageUrl) {
                  return (
                    <Reveal key={i} from="end">
                      <section className="hud max-w-3xl p-6 sm:p-8">
                        {title && <h2 className="font-display text-3xl font-bold leading-tight text-ink">{title}</h2>}
                        {body && <p className="mt-4 whitespace-pre-line text-lg leading-relaxed text-muted">{body}</p>}
                      </section>
                    </Reveal>
                  );
                }
                const imageFirst = i % 2 === 0;
                return (
                  <section key={i} className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
                    <Reveal from={imageFirst ? 'start' : 'end'} className={imageFirst ? '' : 'md:order-2'}>
                      <div className="hud overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.imageUrl} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                      </div>
                    </Reveal>
                    <Reveal from={imageFirst ? 'end' : 'start'} className={imageFirst ? '' : 'md:order-1'}>
                      {title && <h2 className="font-display text-3xl font-bold leading-tight text-ink">{title}</h2>}
                      {body && <p className="mt-4 max-w-prose whitespace-pre-line text-lg leading-relaxed text-muted">{body}</p>}
                    </Reveal>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-s-2 border-violet/60 ps-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{children}</dd>
    </div>
  );
}
