import type { Metadata } from 'next';
import Link from 'next/link';
import JoinForm from '@/components/JoinForm';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { getCurrentUser } from '@/lib/auth/session';
import { dictionary } from '@/lib/i18n';
import { myRequest } from '@/lib/join';
import { getLocale } from '@/lib/locale';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = dictionary(await getLocale()).join;
  return { title: t.title, description: t.lead, alternates: { canonical: '/join' } };
}

// For arena owners: what the site gives them, and a request to join.
export default async function JoinPage({ searchParams }: { searchParams: Promise<{ again?: string }> }) {
  const [locale, user, sp] = await Promise.all([getLocale(), getCurrentUser(), searchParams]);
  const t = dictionary(locale).join;
  const last = user ? await myRequest(user.id) : null;
  const showForm = user?.profileComplete && (!last || (last.status === 'DECLINED' && sp.again === '1') || (last.status === 'APPROVED' && sp.again === '1'));

  return (
    <>
      <SiteHeader locale={locale} user={user} path="/join" />
      <main className="mx-auto grid w-full max-w-site gap-6 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:px-8">
        <section className="space-y-5 py-4">
          <h1 className="font-display text-4xl font-extrabold leading-tight text-ink neon sm:text-5xl">{t.title}</h1>
          <p className="max-w-prose text-lg leading-relaxed text-muted">{t.lead}</p>
          <ul className="space-y-3">
            {t.perks.map((p) => (
              <li key={p} className="flex items-start gap-3 text-ink">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 bg-free shadow-[0_0_8px_#2BFF88]" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
        </section>
        <section className="hud p-5 sm:p-7">
          <h2 className="mb-5 font-display text-2xl font-bold text-ink">{t.formTitle}</h2>
          {!user ? (
            <Link href={`/login?next=${encodeURIComponent('/join')}`} className="btn-neon w-full">
              {t.signIn}
            </Link>
          ) : !user.profileComplete ? (
            <Link href={`/profile?welcome=1&next=${encodeURIComponent('/join')}`} className="btn-neon w-full">
              {t.completeProfile}
            </Link>
          ) : showForm ? (
            <JoinForm locale={locale} />
          ) : last?.status === 'PENDING' ? (
            <p className="bg-violet/10 p-4 text-ink shadow-[inset_0_0_0_1px_rgba(157,92,255,0.5)]">
              {t.pending}
              <span className="mt-1 block text-sm text-muted">
                {last.nameAr} · {last.stations}
              </span>
            </p>
          ) : last?.status === 'APPROVED' ? (
            <div className="space-y-3">
              <p className="text-free">{t.approved}</p>
              {last.cafeSlug && (
                <Link href={`/admin/${last.cafeSlug}`} className="btn-neon">
                  {t.openDashboard}
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-busy">{t.declined}</p>
              {last?.reply && <p className="text-sm text-muted">{last.reply}</p>}
              <Link href="/join?again=1" className="btn-ghost">
                {t.again}
              </Link>
            </div>
          )}
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
