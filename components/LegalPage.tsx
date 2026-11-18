import Link from 'next/link';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import type { CurrentUser } from '@/lib/auth/session';
import { dictionary, type Locale } from '@/lib/i18n';
import type { LegalDoc } from '@/lib/legal';

export default function LegalPage({
  locale,
  user,
  path,
  doc,
}: {
  locale: Locale;
  user: CurrentUser | null;
  path: string;
  doc: LegalDoc;
}) {
  const t = dictionary(locale);
  return (
    <>
      <SiteHeader locale={locale} user={user} path={path} />
      <main className="mx-auto w-full max-w-site px-4 py-10 lg:px-8">
        <article className="hud mx-auto max-w-3xl p-6 sm:p-10">
          <h1 className="font-display text-3xl font-extrabold text-ink neon sm:text-4xl">{doc.title}</h1>
          <p className="mt-2 text-sm text-muted">{doc.updated}</p>
          <p className="mt-6 text-lg text-ink">{doc.intro}</p>
          {doc.sections.map((s) => (
            <section key={s.title} className="mt-8">
              <h2 className="font-display text-xl font-bold text-violet-soft">{s.title}</h2>
              {s.body.map((p) => (
                <p key={p} className="mt-3 leading-relaxed text-muted">
                  {p}
                </p>
              ))}
            </section>
          ))}
          <p className="mt-10 border-t border-line pt-5 text-sm">
            <Link href={path === '/terms' ? '/privacy' : '/terms'} className="text-cyan underline-offset-4 hover:underline">
              {path === '/terms' ? t.profile.privacyLink : t.profile.termsLink}
            </Link>
          </p>
        </article>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
