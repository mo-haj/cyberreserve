import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import MyBookings from '@/components/MyBookings';
import ProfileForm from '@/components/ProfileForm';
import { listMyBookings } from '@/lib/booking/service';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { getCurrentUser } from '@/lib/auth/session';
import { cityByKey, cityName } from '@/lib/cities';
import { dictionary } from '@/lib/i18n';
import { getLocale } from '@/lib/locale';
import { prisma } from '@/lib/prisma';
import { safeNextPath } from '@/lib/safe-redirect';
import { formatDamascusDate } from '@/lib/time';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: dictionary(await getLocale()).profile.title, robots: { index: false } };
}

/** "+963944123456" -> "+963 9•• ••• 456": enough to recognise, not to copy. */
function maskPhone(phone: string | null): string {
  if (!phone) return '—';
  const d = phone.replace(/^\+/, '');
  const cc = d.startsWith('963') ? '963' : d.slice(0, Math.max(1, d.length - 9));
  const rest = d.slice(cc.length);
  return `+${cc} ${rest.slice(0, 1)}${'•'.repeat(Math.max(0, rest.length - 4))}${rest.slice(-3)}`;
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; welcome?: string }>;
}) {
  const [locale, user, sp] = await Promise.all([getLocale(), getCurrentUser(), searchParams]);
  if (!user) redirect(`/login?next=${encodeURIComponent('/profile')}`);
  const t = dictionary(locale);
  const next = safeNextPath(sp.next);
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { name: true, fullName: true, nickname: true, phone: true, termsAcceptedAt: true, createdAt: true, homeCity: true },
  });
  if (!me) redirect('/login');
  const welcome = !user.profileComplete;

  return (
    <>
      <SiteHeader locale={locale} user={user} path="/profile" />
      {/* Profile and bookings side by side on wide screens (profile on the reading side). */}
      <main
        className={`mx-auto grid w-full max-w-site items-start gap-6 px-4 py-4 lg:px-8 ${
          welcome ? 'max-w-xl' : 'lg:grid-cols-2'
        }`}
      >
        <section className="hud relative w-full p-5 sm:p-6">
          {/* Back to the arenas: small, at the top of the box. */}
          <Link
            href="/"
            className="absolute start-4 top-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t.profile.back}
          </Link>

          {/* Centred: names and dates can be Arabic or English. Letter + name on one row. */}
          <div className="flex flex-col items-center pt-3 text-center">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid h-11 w-11 shrink-0 place-items-center bg-violet/25 font-display text-xl font-bold text-violet-soft shadow-[inset_0_0_0_1px_rgba(157,92,255,0.7)]"
              >
                {(me.nickname ?? me.name).slice(0, 1).toUpperCase()}
              </span>
              <h1 className="font-display text-2xl font-extrabold text-ink neon sm:text-3xl">
                {welcome ? t.profile.welcomeTitle : <bdi>{me.nickname}</bdi>}
              </h1>
            </div>
            {welcome ? (
              <p className="mt-1 max-w-sm text-muted">{t.profile.welcomeIntro}</p>
            ) : (
              <p className="mt-1 text-sm text-muted">
                <bdi>{me.fullName}</bdi>
                {me.homeCity ? ` · ${cityName(me.homeCity, locale)}` : ''}
              </p>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-1 gap-3 text-center text-sm sm:grid-cols-2">
            <div className="bg-void/60 px-3 py-2.5" title={t.profile.phoneHint}>
              <dt className="text-xs text-muted">{t.profile.phone}</dt>
              <dd dir="ltr" className="mt-0.5 font-hud text-base text-ink">
                {maskPhone(me.phone)}
              </dd>
              <dd className="mt-0.5 text-[0.6875rem] leading-snug text-muted">{t.profile.phoneHint}</dd>
            </div>
            <div className="bg-void/60 px-3 py-2.5">
              <dt className="text-xs text-muted">{t.profile.telegram}</dt>
              <dd className="mt-0.5 text-base text-ink">
                <bdi>{me.name}</bdi>
              </dd>
              <dd className="mt-0.5 text-[0.6875rem] text-muted">
                {t.profile.memberSince}{' '}
                <span dir="ltr" className="font-hud">
                  {formatDamascusDate(me.createdAt)}
                </span>
              </dd>
            </div>
          </dl>

          <div className="mt-5">
            <ProfileForm
              locale={locale}
              initialFullName={me.fullName ?? ''}
              initialNickname={me.nickname ?? ''}
              initialCity={cityByKey(me.homeCity)?.key ?? ''}
              termsAcceptedOn={me.termsAcceptedAt ? formatDamascusDate(me.termsAcceptedAt) : null}
              next={welcome || sp.welcome ? next : null}
            />
          </div>
        </section>
        {!welcome && <MyBookings locale={locale} initial={await listMyBookings(user.id)} />}
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
