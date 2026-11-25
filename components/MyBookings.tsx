'use client';

import Link from 'next/link';
import ShareBooking from '@/components/ShareBooking';
import { useState } from 'react';
import type { MyBooking } from '@/lib/booking/service';
import { dictionary, pick, type Locale } from '@/lib/i18n';
import { formatDamascusTime, toDamascusParts } from '@/lib/time';

// "My bookings" on the profile page: upcoming first, cancel before the start.

const DAYS = {
  ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

export default function MyBookings({ locale, initial }: { locale: Locale; initial: MyBooking[] }) {
  const t = dictionary(locale);
  const [list, setList] = useState(initial);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cancel(id: string) {
    setError(null);
    const res = await fetch(`/api/bookings/${id}/cancel`, { method: 'POST' }).catch(() => null);
    if (!res?.ok) {
      setError(t.bookings.tooLate);
      return;
    }
    setList((l) => l.map((b) => (b.id === id ? { ...b, status: 'CANCELLED', canCancel: false } : b)));
    setConfirm(null);
  }

  // Upcoming (soonest first), then the rest (latest first).
  const upcoming = list.filter((b) => b.canCancel || b.live).sort((a, b) => a.start.localeCompare(b.start));
  const past = list.filter((b) => !b.canCancel && !b.live);

  return (
    <section id="bookings" className="hud flex w-full scroll-mt-6 flex-col p-5 sm:p-7 lg:sticky lg:top-6 lg:max-h-[calc(100vh-7.5rem)]">
      <h2 className="text-center font-display text-2xl font-bold text-ink">{t.bookings.title}</h2>
      {error && <p className="mt-3 text-sm text-busy">{error}</p>}
      {list.length === 0 ? (
        <p className="mt-3 text-muted">
          {t.bookings.empty}{' '}
          <Link href="/" className="text-cyan underline-offset-4 hover:underline">
            {t.nav.arenas}
          </Link>
        </p>
      ) : (
        <ul className="cr-scroll -mx-1 mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto px-1">
          {[...upcoming, ...past].map((b) => {
            const s = new Date(b.start);
            const p = toDamascusParts(s);
            const active = b.canCancel || b.live;
            return (
              <li
                key={b.id}
                className={`p-4 [clip-path:polygon(10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%,0_10px)] ${
                  active ? 'bg-free/[0.06] shadow-[inset_0_0_0_1px_rgba(43,255,136,0.4)]' : 'bg-panel2/40 opacity-75'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/arenas/${b.arenaSlug}`} className="font-semibold text-ink hover:text-cyan">
                      {pick(locale, b.arenaEn, b.arenaAr)}
                    </Link>
                    <p className="text-sm text-muted">
                      {b.station} · {DAYS[locale][p.weekday]} {p.day}/{p.month} ·{' '}
                      <span dir="ltr" className="inline-block whitespace-nowrap font-hud">
                        {formatDamascusTime(s)}–{formatDamascusTime(new Date(b.end))}
                      </span>
                    </p>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="font-hud text-violet-soft">{t.arena.price(b.price)}</p>
                    <p className={`text-xs ${b.live ? 'text-free' : 'text-muted'}`}>{b.live ? t.bookings.live : t.bookings.status[b.status]}</p>
                  </div>
                </div>
                {active && (
                  <ShareBooking
                    locale={locale}
                    arena={pick(locale, b.arenaEn, b.arenaAr)}
                    station={b.station}
                    when={`${DAYS[locale][p.weekday]} ${p.day}/${p.month} · ${formatDamascusTime(s)}–${formatDamascusTime(new Date(b.end))}`}
                    slug={b.arenaSlug}
                    className="mt-3"
                  />
                )}
                {b.canCancel && (
                  <button
                    type="button"
                    onClick={() => (confirm === b.id ? cancel(b.id) : setConfirm(b.id))}
                    className={`mt-3 text-sm underline-offset-4 hover:underline ${confirm === b.id ? 'font-semibold text-busy' : 'text-muted'}`}
                  >
                    {confirm === b.id ? t.bookings.confirmCancel : t.bookings.cancel}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
