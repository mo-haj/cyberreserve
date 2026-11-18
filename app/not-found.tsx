import Link from 'next/link';
import { dictionary } from '@/lib/i18n';
import { getLocale } from '@/lib/locale';

export default async function NotFound() {
  const t = dictionary(await getLocale());
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-5 text-center">
      <p className="font-hud text-7xl font-bold text-violet-soft neon">404</p>
      <h1 className="mt-4 font-display text-2xl font-bold text-ink">{t.notFound.title}</h1>
      <Link href="/" className="btn-neon mt-8">
        {t.notFound.home}
      </Link>
    </main>
  );
}
