import Link from 'next/link';
import { siteUrl, supportEmail } from '@/lib/site';
import HowItWorks from '@/components/HowItWorks';
import MobileMenu from '@/components/MobileMenu';
import { manageText } from '@/lib/i18n-manage';
import type { CurrentUser } from '@/lib/auth/session';
import { dictionary, type Locale } from '@/lib/i18n';

export function Logo({ label }: { label: string }) {
  // The main site's full address: on admin.<domain>, "/" is the dashboard
  // itself, so a bare "/" would never lead players and admins back home.
  return (
    <Link href={siteUrl() ?? '/'} className="group flex items-center gap-2.5" aria-label={label}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/l3ib-logo.webp"
        alt=""
        width={44}
        height={44}
        className="h-9 w-9 drop-shadow-[0_0_10px_rgba(157,92,255,0.45)] transition-transform group-hover:scale-110 min-[380px]:h-11 min-[380px]:w-11"
      />
      {/* The brand name is the same in both languages. */}
      <span dir="ltr" className="font-display text-xl font-bold tracking-tight text-ink min-[380px]:text-2xl">
        L<span className="text-violet-soft">3</span>ib
      </span>
    </Link>
  );
}

export function SiteHeader({
  locale,
  user,
  path,
}: {
  locale: Locale;
  user: CurrentUser | null;
  /** Current path, used to come back here after switching language or signing out. */
  path: string;
}) {
  const t = dictionary(locale);
  const other: Locale = locale === 'ar' ? 'en' : 'ar';
  const langHref = `/api/lang?to=${other}&next=${encodeURIComponent(path)}`;
  const loginHref = `/login?next=${encodeURIComponent(path)}`;
  const profileLabel = user ? (user.profileComplete ? user.name : t.profile.incomplete) : '';
  const signOut = (
    <form action="/api/auth/logout" method="post">
      <input type="hidden" name="next" value={path} />
      <button type="submit" className="btn-ghost w-full text-sm">
        {t.nav.signOut}
      </button>
    </form>
  );

  return (
    <header className="relative z-30">
      <div className="mx-auto flex w-full max-w-site items-center justify-between gap-2 px-3 py-4 min-[380px]:px-4 lg:px-8 lg:py-3">
        <Logo label={t.nav.home} />

        {/* Tablet and desktop */}
        <nav aria-label={t.nav.menu} className="hidden min-w-0 items-center gap-3 sm:flex">
          <HowItWorks locale={locale} />
          <a href={langHref} className="btn-ghost whitespace-nowrap text-sm" lang={other} aria-label={t.nav.switchLanguageLabel}>
            {t.nav.switchLanguage}
          </a>
          {user ? (
            <>
              {user.manages && (
                <Link href="/admin" className="btn-ghost whitespace-nowrap text-sm text-cyan">
                  {manageText(locale).nav}
                </Link>
              )}
              <Link
                href="/profile"
                className={`max-w-[12rem] truncate whitespace-nowrap text-sm ${user.profileComplete ? 'btn-ghost' : 'btn-neon'}`}
              >
                {profileLabel}
              </Link>
              {signOut}
            </>
          ) : (
            <Link href={loginHref} className="btn-neon whitespace-nowrap text-sm">
              {t.nav.signIn}
            </Link>
          )}
        </nav>

        {/* Phones: main action + ☰ menu */}
        <div className="flex items-center gap-2 sm:hidden">
          {!user && (
            <Link href={loginHref} className="btn-neon whitespace-nowrap !px-3 text-sm">
              {t.nav.signIn}
            </Link>
          )}
          {user && !user.profileComplete && (
            <Link href="/profile" className="btn-neon whitespace-nowrap !px-3 text-sm">
              {t.profile.incomplete}
            </Link>
          )}
          <MobileMenu label={t.nav.menu} closeLabel={t.nav.closeMenu}>
            <nav aria-label={t.nav.menu} className="flex flex-col gap-2">
              {user?.manages && (
                <Link href="/admin" className="btn-ghost justify-start text-sm text-cyan">
                  {manageText(locale).nav}
                </Link>
              )}
              {user && (
                <Link href="/profile" className="btn-ghost justify-start text-sm">
                  {t.nav.profile}: <span className="truncate">{user.name}</span>
                </Link>
              )}
              <HowItWorks locale={locale} block />
              <a href={langHref} className="btn-ghost justify-start text-sm" lang={other} aria-label={t.nav.switchLanguageLabel}>
                {t.nav.switchLanguage}
              </a>
              <div className="flex gap-2">
                <Link href="/terms" className="btn-ghost flex-1 text-sm">
                  {t.nav.terms}
                </Link>
                <Link href="/privacy" className="btn-ghost flex-1 text-sm">
                  {t.nav.privacy}
                </Link>
              </div>
              {user && signOut}
            </nav>
          </MobileMenu>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ locale }: { locale: Locale }) {
  const t = dictionary(locale);
  const mail = supportEmail();
  return (
    <footer className="mx-auto mt-auto w-full max-w-site px-4 pb-4 pt-6 text-sm text-muted lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
        <Logo label={t.nav.home} />
        <nav aria-label={t.nav.terms} className="flex flex-wrap items-center gap-5">
          <Link href="/join" className="text-cyan hover:text-ink">
            {t.join.footerLink}
          </Link>
          <Link href="/terms" className="hover:text-ink">
            {t.profile.termsLink}
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            {t.profile.privacyLink}
          </Link>
          {mail && (
            <a href={`mailto:${mail}`} className="hover:text-ink">
              {t.join.contact}:{' '}
              <bdi dir="ltr" className="text-cyan">
                {mail}
              </bdi>
            </a>
          )}
          <span>{t.footer.line}</span>
        </nav>
      </div>
    </footer>
  );
}
