'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StationIcon } from '@/components/StationIcons';
import type { PcView } from '@/lib/availability';
import { BOOKING, bookableDays, isNight, overlaps, priceFor, reminderAt, slotsOn } from '@/lib/booking/rules';
import { fieldValue, fieldsFor, groupName, type GroupView } from '@/lib/groups';
import { dictionary, type Locale } from '@/lib/i18n';
import { formatDamascusTime, toDamascusParts } from '@/lib/time';

// The pop-up that opens when a station is pressed: details, and booking.
// On phones it is a sheet from the bottom; on wider screens a centred window.

/** One-tap lengths under the − / + control. */
const QUICK = [60, 120, 180, 300, 480, 720];
const DAYS = {
  ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

export interface Viewer {
  signedIn: boolean;
  profileComplete: boolean;
}

type Taken = { start: Date; end: Date }[];

export default function BookingSheet({
  locale,
  slug,
  station,
  group = null,
  viewer,
  loginHref,
  onClose,
}: {
  locale: Locale;
  slug: string;
  station: PcView;
  /** The station's zone, for its hardware. */
  group?: GroupView | null;
  viewer: Viewer;
  loginHref: string;
  onClose: () => void;
}) {
  const t = dictionary(locale);
  const ref = useRef<HTMLDialogElement>(null);
  const [now] = useState(() => new Date());
  const days = useMemo(() => bookableDays(now), [now]);
  const [dayIndex, setDayIndex] = useState(0);
  const freeNow = station.status === 'free';
  // "now" = start immediately; otherwise an ISO start time.
  const [start, setStart] = useState<'now' | string | null>(freeNow ? 'now' : null);
  const [minutes, setMinutes] = useState(120);
  const [taken, setTaken] = useState<Taken>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ start: string; end: string; price: string } | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/arenas/${slug}/stations/${station.pcNumber}/schedule`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { taken: [] }))
      .then((j: { taken: { start: string; end: string }[] }) => {
        if (!cancelled) setTaken(j.taken.map((x) => ({ start: new Date(x.start), end: new Date(x.end) })));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [slug, station.pcNumber]);

  const startDate = start === 'now' ? now : start ? new Date(start) : null;
  const endDate = startDate ? new Date(startDate.getTime() + minutes * 60_000) : null;
  const clash = (s: Date, len: number) => taken.some((x) => overlaps(s, new Date(s.getTime() + len * 60_000), x.start, x.end));
  const slots = slotsOn(days[dayIndex], now);
  const day = Number(station.hourlyRate ?? 0);
  const night = Number(station.nightRate ?? station.hourlyRate ?? 0);
  const price = startDate ? priceFor(startDate, minutes, day, night) : 0;
  const hasNight = startDate
    ? Array.from({ length: Math.ceil(minutes / 30) }, (_, i) => new Date(startDate.getTime() + i * 30 * 60_000)).some(isNight)
    : false;
  const selectionClashes = startDate ? clash(startDate, minutes) : false;
  const longer = minutes + BOOKING.stepMinutes;
  const canLonger = longer <= BOOKING.maxMinutes && !(startDate && clash(startDate, longer));

  function dayLabel(d: Date, i: number) {
    if (i === 0) return t.book.today;
    if (i === 1) return t.book.tomorrow;
    const p = toDamascusParts(d);
    return `${DAYS[locale][p.weekday]} ${p.day}/${p.month}`;
  }

  async function book() {
    if (!start) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, pcNumber: station.pcNumber, start, minutes }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(t.book.errors[body.error] ?? t.book.errors.generic);
        if (body.error === 'taken') setStart(null);
        return;
      }
      setDone(body);
    } catch {
      setError(t.book.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  const name = t.station.name(station.type, station.typeIndex);
  const chip = (on: boolean, disabled = false) =>
    `city-option px-2.5 py-2 text-sm ${on ? 'city-option-on text-ink' : disabled ? 'text-muted/35 line-through cursor-not-allowed' : 'text-muted hover:text-ink'}`;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      aria-label={name}
      className="cr-modal booking-sheet bg-transparent p-0 text-ink"
    >
      <div className="sheet-panel hud flex max-h-[92vh] flex-col" style={{ background: '#0B0F24' }}>
        {/* Header */}
        <div className="flex items-start gap-3 p-5 pb-3">
          <span className={`grid h-12 w-12 shrink-0 place-items-center ${station.status === 'free' ? 'text-free bg-free/10' : station.status === 'busy' ? 'text-busy bg-busy/10' : 'text-off bg-panel2'}`}>
            <StationIcon type={station.type} className="h-7 w-8" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-bold text-ink">
              {name}
              {station.label && <span className="ms-2 text-sm font-normal text-muted">{station.label}</span>}
            </h2>
            <p className={`text-sm ${station.status === 'free' ? 'text-free' : station.status === 'busy' ? 'text-busy' : 'text-muted'}`}>
              {station.status === 'busy' && station.busyUntil
                ? t.station.busyUntil(formatDamascusTime(new Date(station.busyUntil)))
                : t.status[station.status]}
              {station.hourlyRate && <span className="text-muted"> · {t.station.perHour(station.hourlyRate)}</span>}
            </p>
            {!group && station.specs && (
              <p dir="ltr" className="mt-1 text-xs text-muted rtl:text-end">
                {station.specs}
              </p>
            )}
          </div>
          <button type="button" onClick={() => ref.current?.close()} className="grid h-10 w-10 shrink-0 place-items-center text-muted hover:text-ink" aria-label={t.book.close}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Zone + its key hardware, compact: four values in two columns. */}
        {group && !done && <HardwareStrip group={group} locale={locale} />}

        <div className="cr-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {done ? (
            <div className="panel-in space-y-3 py-4 text-center">
              <p className="font-display text-3xl font-extrabold text-free drop-shadow-[0_0_14px_rgba(43,255,136,0.6)]">{t.book.doneTitle}</p>
              <p className="font-hud text-lg text-ink">
                {dayLabel(new Date(done.start), Math.floor((+new Date(done.start) - +days[0]) / 86_400_000))} ·{' '}
                <span dir="ltr" className="inline-block whitespace-nowrap">
                  {formatDamascusTime(new Date(done.start))}–{formatDamascusTime(new Date(done.end))}
                </span>
              </p>
              <p className="text-violet-soft">{t.arena.price(done.price)}</p>
              <p className="text-sm text-muted">{t.book.doneTelegram}</p>
              {(() => {
                const ask = reminderAt(new Date(), new Date(done.start));
                return ask ? <p className="text-xs text-ink/80">{t.book.doneReminder(formatDamascusTime(ask))}</p> : null;
              })()}
              <div className="flex justify-center gap-2 pt-2">
                <Link href="/profile#bookings" className="btn-neon text-sm">
                  {t.book.myBookings}
                </Link>
                <button type="button" className="btn-ghost text-sm" onClick={() => ref.current?.close()}>
                  {t.book.close}
                </button>
              </div>
            </div>
          ) : station.status === 'maintenance' ? (
            <p className="py-4 text-muted">{t.book.maintenance}</p>
          ) : !viewer.signedIn ? (
            <Link href={loginHref} className="btn-neon my-3 w-full">
              {t.book.signIn}
            </Link>
          ) : !viewer.profileComplete ? (
            <Link href={`/profile?welcome=1&next=${encodeURIComponent(`/arenas/${slug}`)}`} className="btn-neon my-3 w-full">
              {t.book.completeProfile}
            </Link>
          ) : (
            <div className="space-y-5">
              {/* Day */}
              <div>
                <p className="mb-2 text-sm font-semibold text-ink">{t.book.day}</p>
                {/* All 8 days at once: two rows of four, no sideways scrolling. */}
                <div className="grid grid-cols-4 gap-2">
                  {days.map((d, i) => {
                    const p = toDamascusParts(d);
                    return (
                      <button
                        key={d.toISOString()}
                        type="button"
                        onClick={() => {
                          setDayIndex(i);
                          setStart(i === 0 && freeNow ? 'now' : null);
                        }}
                        aria-pressed={i === dayIndex}
                        className={`${chip(i === dayIndex)} flex flex-col items-center gap-0.5 !px-1 leading-tight`}
                      >
                        <span className="truncate">{i === 0 ? t.book.today : i === 1 ? t.book.tomorrow : DAYS[locale][p.weekday]}</span>
                        <span dir="ltr" className="font-hud text-[11px] opacity-70">
                          {p.day}/{p.month}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time */}
              <div>
                <p className="mb-2 text-sm font-semibold text-ink">{t.book.time}</p>
                {slots.length === 0 && !(dayIndex === 0 && freeNow) ? (
                  <p className="text-sm text-muted">{t.book.noSlots}</p>
                ) : (
                  <div className="cr-scroll grid max-h-44 grid-cols-4 gap-2 overflow-y-auto pe-1 sm:grid-cols-6">
                    {dayIndex === 0 && freeNow && (
                      <button type="button" onClick={() => setStart('now')} className={`${chip(start === 'now')} font-semibold`}>
                        {t.book.now}
                      </button>
                    )}
                    {slots.map((s) => {
                      const iso = s.toISOString();
                      const off = clash(s, BOOKING.minMinutes);
                      return (
                        <button key={iso} type="button" disabled={off} onClick={() => setStart(iso)} dir="ltr" className={`${chip(start === iso, off)} font-hud`}>
                          {formatDamascusTime(s)}
                        </button>
                      );
                    })}
                  </div>
                )}
                {taken.length > 0 && <p className="mt-1.5 text-xs text-muted">{t.book.takenNote}</p>}
              </div>

              {/* Length: any length from 1 hour up to the maximum, in half hours. */}
              <div>
                <p className="mb-2 text-sm font-semibold text-ink">{t.book.length}</p>
                <div className="flex items-stretch gap-2">
                  <button
                    type="button"
                    aria-label={t.book.shorter}
                    disabled={minutes <= BOOKING.minMinutes}
                    onClick={() => setMinutes((m) => Math.max(BOOKING.minMinutes, m - BOOKING.stepMinutes))}
                    className={`${chip(false, minutes <= BOOKING.minMinutes)} w-12 !no-underline text-xl`}
                  >
                    −
                  </button>
                  <div className="flex flex-1 flex-col items-center justify-center bg-void/60 py-1.5 shadow-[inset_0_0_0_1px_rgba(157,92,255,0.35)]">
                    <span className="font-display text-lg font-bold text-ink">{t.book.hours(minutes)}</span>
                    {endDate && (
                      <span className="text-xs text-muted">
                        {t.book.endsAt}{' '}
                        <span dir="ltr" className="inline-block font-hud text-ink/80">
                          {formatDamascusTime(endDate)}
                        </span>
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={t.book.longer}
                    disabled={!canLonger}
                    onClick={() => setMinutes((m) => m + BOOKING.stepMinutes)}
                    className={`${chip(false, !canLonger)} w-12 !no-underline text-xl`}
                  >
                    +
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-6 gap-1.5">
                  {QUICK.filter((m) => m <= BOOKING.maxMinutes).map((m) => {
                    const off = startDate ? clash(startDate, m) : false;
                    return (
                      <button key={m} type="button" disabled={off} onClick={() => setMinutes(m)} className={`${chip(minutes === m, off)} !px-1 !py-1.5 whitespace-nowrap text-xs`}>
                        {t.book.hours(m)}
                      </button>
                    );
                  })}
                </div>
                {startDate && selectionClashes && <p className="mt-1.5 text-xs text-busy">{t.book.tooLong}</p>}
              </div>

              {/* Summary + confirm */}
              <div className="sticky bottom-0 -mx-5 space-y-3 border-t border-line bg-[#0B0F24] px-5 pt-4">
                {startDate && endDate ? (
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p dir="ltr" className="font-hud text-lg text-ink rtl:text-end">
                        {formatDamascusTime(startDate)} → {formatDamascusTime(endDate)}
                      </p>
                      <p className="text-xs text-muted">
                        {dayLabel(days[dayIndex], dayIndex)} · {t.book.hours(minutes)}
                        {hasNight && ` · ${t.book.nightNote}`}
                      </p>
                    </div>
                    <div className="text-end">
                      <p className="font-hud text-2xl font-bold text-violet-soft">{price}</p>
                      <p className="text-xs text-muted">
                        {locale === 'ar' ? 'ل.س' : 'SYP'} · {t.book.payAtArena}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted">{t.book.pickTime}</p>
                )}
                {/* Bookings made well ahead get a "still coming?" question: say so before confirming. */}
                {(() => {
                  const ask = startDate ? reminderAt(new Date(), startDate) : null;
                  return ask ? (
                    <p className="bg-violet/10 px-3 py-2 text-xs leading-relaxed text-ink/85 shadow-[inset_0_0_0_1px_rgba(157,92,255,0.35)]">
                      {t.book.ruleNote(formatDamascusTime(ask))}
                    </p>
                  ) : null;
                })()}
                {error && (
                  <p role="alert" className="text-sm text-busy">
                    {error}
                  </p>
                )}
                <button type="button" className="btn-neon w-full" disabled={!startDate || busy || selectionClashes} onClick={book}>
                  {busy ? t.book.booking : t.book.confirm}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}

function HardwareStrip({ group, locale }: { group: GroupView; locale: Locale }) {
  const t = dictionary(locale);
  const name = groupName(group, locale);
  const rows = fieldsFor(group.type)
    .key.map((f) => ({ f, v: fieldValue(group, f) }))
    .filter((r) => r.v);
  if (!name && rows.length === 0) return null;
  return (
    <div className={`mx-5 mb-3 px-3 py-2.5 ${group.isVip ? 'bg-gold/[0.06] shadow-[inset_0_0_0_1px_rgba(255,201,77,0.4)]' : 'bg-void/50 shadow-[inset_0_0_0_1px_rgba(157,92,255,0.3)]'}`}>
      {name && (
        <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-ink">
          {group.isVip && <span className="bg-gold px-1.5 py-px font-hud text-[10px] font-bold text-void">{t.zones.vip}</span>}
          {name}
        </p>
      )}
      {rows.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
          {rows.map((r) => (
            <div key={r.f} className="flex min-w-0 items-baseline gap-1.5 text-xs">
              <dt className="shrink-0 text-muted">{t.zones.fields[r.f]}</dt>
              <dd className="truncate text-ink">
                <bdi dir="ltr">{r.v}</bdi>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
