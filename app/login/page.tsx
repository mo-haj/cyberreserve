import type { Metadata } from 'next';
import Link from 'next/link';
import LoginFlow from '@/components/LoginFlow';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { getCurrentUser } from '@/lib/auth/session';
import { dictionary } from '@/lib/i18n';
import { getLocale } from '@/lib/locale';
import { safeNextPath } from '@/lib/safe-redirect';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: dictionary(await getLocale()).login.title };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [locale, user, sp] = await Promise.all([getLocale(), getCurrentUser(), searchParams]);
  const t = dictionary(locale);
  const next = safeNextPath(sp.next);
  const path = `/login?next=${encodeURIComponent(next)}`;

  return (
    <>
      <SiteHeader locale={locale} user={user} path={path} />
      <main className="mx-auto grid w-full max-w-site place-items-center px-4 py-4 lg:px-8 lg:py-6">
        <section className="hud w-full max-w-3xl p-6 sm:p-8">
          <h1 className="font-display text-3xl font-extrabold text-ink neon sm:text-4xl">{t.login.title}</h1>
          {user ? (
            <p className="mt-6 text-free">{t.login.signedInAs(user.name)}</p>
          ) : (
            <>
              <p className="mt-2 text-muted">{t.login.intro}</p>
              <div className="mt-6">
                <LoginFlow locale={locale} next={next} />
              </div>
              <p className="mt-6 border-t border-line pt-4 text-xs text-muted">
                {t.login.why}{' '}
                {t.login.agreeNote}{' '}
                <Link href="/terms" className="text-cyan underline-offset-4 hover:underline">
                  {t.profile.termsLink}
                </Link>{' '}
                {t.profile.and}{' '}
                <Link href="/privacy" className="text-cyan underline-offset-4 hover:underline">
                  {t.profile.privacyLink}
                </Link>
                .
              </p>
            </>
          )}
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
