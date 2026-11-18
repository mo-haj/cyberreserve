import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { getCurrentUser } from '@/lib/auth/session';
import { manageText } from '@/lib/i18n-manage';
import { pick } from '@/lib/i18n';
import { getLocale } from '@/lib/locale';
import { listMyArenas } from '@/lib/manage/service';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: manageText(await getLocale()).title, robots: { index: false } };
}

export default async function ManageHome() {
  const [locale, user] = await Promise.all([getLocale(), getCurrentUser()]);
  if (!user) redirect('/login?next=%2Fmanage');
  const m = manageText(locale);
  const arenas = await listMyArenas(user.id);
  if (arenas.length === 1) redirect(`/manage/${arenas[0].slug}`);

  return (
    <>
      <SiteHeader locale={locale} user={user} path="/manage" />
      <main className="mx-auto w-full max-w-site px-4 py-10 lg:px-8">
        <section className="hud mx-auto max-w-2xl p-6 sm:p-8">
          <h1 className="font-display text-3xl font-extrabold text-ink neon">{m.title}</h1>
          {arenas.length === 0 ? (
            <p className="mt-4 text-muted">{m.none}</p>
          ) : (
            <>
              <p className="mt-3 text-muted">{m.pick}</p>
              <ul className="mt-5 space-y-2">
                {arenas.map((a) => (
                  <li key={a.slug}>
                    <Link href={`/manage/${a.slug}`} className="flex items-center gap-3 bg-panel2/60 p-3 hover:bg-panel2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.coverImage} alt="" className="h-12 w-20 object-cover" />
                      <span className="flex-1 font-semibold text-ink">{pick(locale, a.nameEn, a.nameAr)}</span>
                      <span className="text-xs text-muted">{m.role[a.role]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
