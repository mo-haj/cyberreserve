import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import ManagePanel from '@/components/manage/ManagePanel';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { getCurrentUser } from '@/lib/auth/session';
import { pick } from '@/lib/i18n';
import { manageText } from '@/lib/i18n-manage';
import { getLocale } from '@/lib/locale';
import { getManageData, getMembership } from '@/lib/manage/service';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: manageText(await getLocale()).title, robots: { index: false } };
}

export default async function ManageArena({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) notFound();
  const [locale, user] = await Promise.all([getLocale(), getCurrentUser()]);
  if (!user) redirect(`/login?next=${encodeURIComponent(`/admin/${slug}`)}`);
  const member = await getMembership(user, slug);
  // Same answer for "no such arena" and "not yours": do not reveal which.
  if (!member) notFound();
  const data = await getManageData(member.cafeId, { ...member, userId: user.id });
  const m = manageText(locale);

  return (
    <>
      <SiteHeader locale={locale} user={user} path={`/admin/${slug}`} />
      <main className="mx-auto w-full max-w-site px-4 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3 pb-5">
          <div>
            <p className="text-sm text-muted">
              <Link href="/admin" className="hover:text-ink">
                {m.title}
              </Link>{' '}
              · {member.superAdmin ? m.superAdmin : m.role[member.role]}
              {!data.isPublished && <span className="ms-2 bg-void/80 px-1.5 py-px text-xs shadow-[inset_0_0_0_1px_rgba(140,151,196,0.5)]">{m.hidden}</span>}
            </p>
            <h1 className="font-display text-3xl font-extrabold text-ink neon sm:text-4xl">
              {pick(locale, data.arena.nameEn, data.arena.nameAr)}
            </h1>
          </div>
          <Link href={`/arenas/${slug}`} className="btn-ghost text-sm">
            {m.viewPublic}
          </Link>
        </div>
        <ManagePanel locale={locale} slug={slug} role={member.role} superAdmin={member.superAdmin} initial={data} />
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
