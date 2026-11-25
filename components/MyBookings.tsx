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

const PAGER_BTN =
  'grid h-9 w-9 place-items-center text-ink shadow-[inset_0_0_0_1px_rgba(157,92,255,0.5)] hover:bg-violet/20 disabled:opacity-30 disabled:hover:bg-transparent';

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
  const all = [...upcoming, ...past];
  // Four at a time, with back / forward arrows (the box stays about the profile's height).
  const PAGE = 4;
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(all.length / PAGE));
  const at = Math.min(page, pages - 1);
  const shown = all.slice(at * PAGE, at * PAGE + PAGE);

  return (
    <section id="bookings" className="hud flex w-full scroll-mt-6 flex-col p-5 sm:p-7">
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
        <>
          <ul className="mt-4 space-y-3">
            {shown.map((b) => {
              const s = new Date(b.start);
              const p = toDamascusParts(s);
              const active = b.canCancel || b.live;
              return (
                <li
                  key={b.id}
                  className={`px-4 py-3 [clip-path:polygon(10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%,0_10px)] ${
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
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <ShareBooking
                        locale={locale}
                        arena={pick(locale, b.arenaEn, b.arenaAr)}
                        station={b.station}
                        when={`${DAYS[locale][p.weekday]} ${p.day}/${p.month} · ${formatDamascusTime(s)}–${formatDamascusTime(new Date(b.end))}`}
                        slug={b.arenaSlug}
                      />
                      {b.canCancel && (
                        <button
                          type="button"
                          onClick={() => (confirm === b.id ? cancel(b.id) : setConfirm(b.id))}
                          className={`text-sm underline-offset-4 hover:underline ${confirm === b.id ? 'font-semibold text-busy' : 'text-muted'}`}
                        >
                          {confirm === b.id ? t.bookings.confirmCancel : t.bookings.cancel}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {pages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button type="button" className={PAGER_BTN} onClick={() => setPage(at - 1)} disabled={at === 0} aria-label={t.bookings.prev}>
                <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:rotate-180" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span className="font-hud text-sm text-muted">{t.bookings.pageOf(at + 1, pages)}</span>
              <button type="button" className={PAGER_BTN} onClick={() => setPage(at + 1)} disabled={at >= pages - 1} aria-label={t.bookings.next}>
                <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:rotate-180" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
