import ArenaMap from '@/components/ArenaMap';
import GamesDialog from '@/components/GamesDialog';
import OffersStrip from '@/components/OffersStrip';
import PlayerBadge from '@/components/PlayerBadge';
import { cityName } from '@/lib/cities';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import LiveFloor, { Legend } from '@/components/LiveFloor';
import Reveal from '@/components/Reveal';
import ZoneCards from '@/components/ZoneCards';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { getCurrentUser } from '@/lib/auth/session';
import { getCafe, playerBadgeAt } from '@/lib/cafes';
import { dictionary, pick } from '@/lib/i18n';
import { getLocale } from '@/lib/locale';
import { now } from '@/lib/time';
import { prisma } from '@/lib/prisma';
import { bookingOpen } from '@/lib/subscription';
import { indexingOn, requestHost, siteUrl } from '@/lib/site';
import { isFollowing, isWatching, recentReviews, upcomingTournaments } from '@/lib/engage';
import { FollowAndWatch, Tournaments } from '@/components/ArenaEngage';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

const SLUG = /^[a-z0-9-]{1,60}$/;

/** Shown to search engines: on the real domain, and marked "show on Google" by the site admin. */
async function listedOnGoogle(slug: string, isDemo: boolean): Promise<boolean> {
  if (isDemo || !indexingOn(await requestHost())) return false;
  const c = await prisma.cafe.findUnique({ where: { slug }, select: { searchVisible: true } });
  return !!c?.searchVisible;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const arena = SLUG.test(slug) ? await getCafe(slug) : null;
  if (!arena) return { title: dictionary(locale).arena.notFound, robots: { index: false } };
  const name = pick(locale, arena.nameEn, arena.nameAr);
  const place = `${pick(locale, arena.areaEn, arena.areaAr)}${locale === 'ar' ? '، ' : ', '}${cityName(arena.city, locale)}`;
  const title = locale === 'ar' ? `${name} — صالة ألعاب في ${place}` : `${name} — gaming arena in ${place}`;
  const tagline = pick(locale, arena.taglineEn, arena.taglineAr);
  const description =
    locale === 'ar'
      ? `${tagline ? `${tagline} ` : ''}${arena.counts.total} جهاز، الساعة من ${arena.hourlyRate} ل.س. شوف الأجهزة الفاضية الآن واحجز أونلاين.`
      : `${tagline ? `${tagline} ` : ''}${arena.counts.total} stations, from ${arena.hourlyRate} SYP an hour. See which are free now and book online.`;
  const image = arena.coverImage.startsWith('/') ? arena.coverImage : undefined;
  return {
    title,
    description,
    alternates: { canonical: `/arenas/${arena.slug}` },
    openGraph: { type: 'website', title, description, url: `/arenas/${arena.slug}`, ...(image ? { images: [{ url: image }] } : {}) },
    // Only arenas the site admin marked as real, and only on the real domain.
    ...((await listedOnGoogle(arena.slug, arena.isDemo)) ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function ArenaPage({ params }: Params) {
  const { slug } = await params;
  if (!SLUG.test(slug)) notFound();
  const [locale, arena, user] = await Promise.all([getLocale(), getCafe(slug), getCurrentUser()]);
  const myBadge = user && arena ? await playerBadgeAt(user.id, arena.slug) : '';
  if (!arena) notFound();

  const t = dictionary(locale);
  const e = t.engage;
  const path = `/arenas/${arena.slug}`;
  const cafeId = (await prisma.cafe.findUnique({ where: { slug: arena.slug }, select: { id: true } }))!.id;
  const subRow = await prisma.cafe.findUnique({ where: { id: cafeId }, select: { subEndsAt: true, subPaused: true } });
  const canBook = subRow ? bookingOpen(subRow) : true;
  const [tournaments, reviews, following, watching] = await Promise.all([
    upcomingTournaments(cafeId, user?.id),
    recentReviews(cafeId),
    user ? isFollowing(user.id, cafeId) : false,
    user ? isWatching(user.id, cafeId) : false,
  ]);
  const name = pick(locale, arena.nameEn, arena.nameAr);
  const live = { at: now().toISOString(), counts: arena.counts, pcs: arena.pcs };
  const loginHref = `/login?next=${encodeURIComponent(path)}`;

  // Structured data: Google shows the arena as a local business (address, map,
  // hours, price range, players' rating).
  const site = siteUrl();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'EntertainmentBusiness',
    additionalType: 'https://schema.org/InternetCafe',
    name: arena.nameAr,
    alternateName: arena.nameEn,
    description: arena.taglineAr || arena.taglineEn || undefined,
    ...(site ? { url: `${site}${path}` } : {}),
    ...(site && arena.coverImage.startsWith('/') ? { image: `${site}${arena.coverImage}` } : {}),
    ...(site && arena.logoImage?.startsWith('/') ? { logo: `${site}${arena.logoImage}` } : {}),
    address: {
      '@type': 'PostalAddress',
      streetAddress: arena.addressAr || arena.addressEn || undefined,
      addressLocality: cityName(arena.city, 'ar'),
      addressRegion: arena.areaAr || undefined,
      addressCountry: 'SY',
    },
    ...(arena.latitude != null && arena.longitude != null ? { geo: { '@type': 'GeoCoordinates', latitude: arena.latitude, longitude: arena.longitude } } : {}),
    ...(arena.openHours === '24h'
      ? { openingHours: 'Mo-Su 00:00-23:59' }
      : arena.openHours
        ? { openingHours: `Mo-Su ${arena.openHours.replace('–', '-')}` }
        : {}),
    priceRange: `${arena.hourlyRate} SYP / hour`,
    currenciesAccepted: 'SYP',
    paymentAccepted: 'Cash',
    ...(arena.rating && arena.rating.count > 0
      ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: arena.rating.avg, reviewCount: arena.rating.count, bestRating: 5, worstRating: 1 } }
      : {}),
  };

  return (
    <>
      {(await listedOnGoogle(arena.slug, arena.isDemo)) && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      )}
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
                      className="h-14 w-14 shrink-0 rounded-full bg-void/80 object-cover shadow-[0_0_0_2px_rgba(157,92,255,0.6),0_0_18px_-4px_rgba(157,92,255,0.8)] sm:h-20 sm:w-20"
                    />
                  )}
                  {name}
                </h1>
                <p className="mt-1 line-clamp-1 max-w-prose text-sm text-muted sm:text-base">
                  {pick(locale, arena.taglineEn, arena.taglineAr)}
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  {arena.rating ? (
                    <a href="#reviews" className="bg-void/70 px-2 py-0.5 text-amber-300 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.45)] hover:bg-void">
                      ⭐ {e.rating(arena.rating.avg, arena.rating.count)}
                    </a>
                  ) : null}
                  {arena.openNow !== null && (
                    <span
                      className={`bg-void/70 px-2 py-0.5 ${arena.openNow ? 'text-free shadow-[inset_0_0_0_1px_rgba(43,255,136,0.45)]' : 'text-busy shadow-[inset_0_0_0_1px_rgba(255,45,85,0.45)]'}`}
                    >
                      {arena.openHours === '24h' ? e.open24 : arena.openNow ? e.openNow : e.closedNow}
                      {arena.openHours && arena.openHours !== '24h' && (
                        <>
                          {' · '}
                          <bdi dir="ltr" className="font-hud text-xs text-muted">
                            {arena.openHours}
                          </bdi>
                        </>
                      )}
                    </span>
                  )}
                </p>
              </div>
            </section>

            <OffersStrip locale={locale} offers={arena.offers} />

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
                arenaName={name}
                vip={myBadge === 'vip'}
              />
            </section>

            <ZoneCards locale={locale} groups={arena.groups} pcs={arena.pcs} />

            <Tournaments locale={locale} items={tournaments} signedIn={!!user} loginHref={loginHref} />

            {(arena.rating || reviews.length > 0) && (
              <section id="reviews" className="hud scroll-mt-24 p-5 sm:p-7" aria-labelledby="reviews-title">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 id="reviews-title" className="font-display text-2xl font-bold text-ink">
                    {e.reviewsTitle}
                  </h2>
                  {arena.rating && <p className="font-hud text-lg text-amber-300">⭐ {e.rating(arena.rating.avg, arena.rating.count)}</p>}
                </div>
                <p className="mt-1 text-xs text-muted">{e.reviewsHint}</p>
                {reviews.length > 0 && (
                  <ul className="mt-4 grid gap-3 md:grid-cols-2">
                    {reviews.map((r) => (
                      <li key={r.id} className="bg-panel2/60 p-4">
                        <p className="text-sm">
                          <span className="text-amber-300">{'★'.repeat(r.stars)}</span>
                          <span className="text-muted/40">{'★'.repeat(5 - r.stars)}</span> <bdi className="ms-2 font-semibold text-ink">{r.who}</bdi>
                        </p>
                        <p className="mt-1.5 whitespace-pre-line text-sm text-muted">{r.comment}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
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
              {!canBook && (
                <p role="status" className="mt-3 bg-busy/10 px-3 py-2 text-sm text-busy shadow-[inset_0_0_0_1px_rgba(255,45,85,0.45)]">
                  {e.bookingPaused}
                </p>
              )}
              {user && !user.profileComplete ? (
                <Link href={`/profile?welcome=1&next=${encodeURIComponent(`/arenas/${arena.slug}`)}`} className="btn-neon mt-5 w-full">
                  {t.profile.incomplete}
                </Link>
              ) : user ? (
                <>
                  <p className="mt-4 text-sm text-free">{t.arena.signedInReady(user.name)}</p>
                  {myBadge && (
                    <p className="mt-3 flex items-center gap-2 text-sm text-ink">
                      <PlayerBadge kind={myBadge} locale={locale} />
                      {t.arena.yourBadge}
                    </p>
                  )}
                </>
              ) : (
                <Link href={loginHref} className="btn-neon mt-5 w-full">
                  {t.arena.signInCta}
                </Link>
              )}
              <div className="mt-5 border-t border-line pt-5">
                <FollowAndWatch
                  locale={locale}
                  slug={arena.slug}
                  signedIn={!!user}
                  loginHref={loginHref}
                  following={following}
                  watching={watching}
                  full={arena.counts.total > 0 && arena.counts.free === 0}
                />
              </div>
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
