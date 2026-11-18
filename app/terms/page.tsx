import type { Metadata } from 'next';
import LegalPage from '@/components/LegalPage';
import { getCurrentUser } from '@/lib/auth/session';
import { termsDoc, supportContact } from '@/lib/legal';
import { getLocale } from '@/lib/locale';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: termsDoc(await getLocale(), '').title };
}

export default async function Page() {
  const [locale, user] = await Promise.all([getLocale(), getCurrentUser()]);
  return <LegalPage locale={locale} user={user} path="/terms" doc={termsDoc(locale, supportContact())} />;
}
