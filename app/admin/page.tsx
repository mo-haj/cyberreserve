import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import AdminHome from '@/components/admin/AdminHome';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { getCurrentUser } from '@/lib/auth/session';
import { manageText } from '@/lib/i18n-manage';
import { getLocale } from '@/lib/locale';
import { listMyArenas } from '@/lib/manage/service';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: manageText(await getLocale()).title, robots: { index: false } };
}

// The dashboard: arena owners and staff see their arenas; the site owner
// (super admin) sees every arena, can add arenas and open any of them.
export default async function AdminPage() {
  const [locale, user] = await Promise.all([getLocale(), getCurrentUser()]);
  if (!user) redirect('/login?next=%2Fadmin');
  const arenas = await listMyArenas(user);
  // One arena and nothing else to do here: go straight to it.
  if (!user.superAdmin && arenas.length === 1) redirect(`/admin/${arenas[0].slug}`);

  return (
    <>
      <SiteHeader locale={locale} user={user} path="/admin" />
      <main className="mx-auto w-full max-w-site px-4 pb-10 lg:px-8">
        <AdminHome locale={locale} superAdmin={user.superAdmin} telegramId={user.telegramId} arenas={arenas} />
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
