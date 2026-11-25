'use client';

// New-booking alerts for the dashboard: a short, clear chime, a card on the
// page, a system notification (also when the tab is in the background) and a
// blinking tab title, so whoever is at the desk notices.
import { useCallback, useEffect, useRef, useState } from 'react';
import PlayerBadge from '@/components/PlayerBadge';
import type { Locale } from '@/lib/i18n';
import type { ManageText } from '@/lib/i18n-manage';
import type { ArenaBooking } from '@/lib/booking/service';
import { formatDamascusTime } from '@/lib/time';

const PREF = 'cr-booking-alerts';

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Two bright bell notes (E6 then A6), soft attack, clean decay: ~0.9 s. */
export function playChime() {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + 0.02;
  const master = a.createGain();
  master.gain.value = 0.55;
  master.connect(a.destination);
  [
    { f: 1318.5, at: 0 },
    { f: 1760, at: 0.16 },
  ].forEach(({ f, at }) => {
    // Bell = sine + a quiet octave above, both fading out.
    [
      { mult: 1, vol: 0.9, type: 'sine' as OscillatorType },
      { mult: 2, vol: 0.18, type: 'triangle' as OscillatorType },
    ].forEach((p) => {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = p.type;
      o.frequency.value = f * p.mult;
      const s = t0 + at;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(p.vol, s + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.75);
      o.connect(g).connect(master);
      o.start(s);
      o.stop(s + 0.8);
    });
  });
}

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF) !== 'off';
  } catch {
    return true;
  }
}

export function useBookingAlerts(bookings: ArenaBooking[], m: ManageText, arenaName: string) {
  const [on, setOn] = useState(true);
  const [fresh, setFresh] = useState<ArenaBooking[]>([]);
  const seen = useRef(new Set(bookings.map((b) => b.id)));
  // New bookings highlighted in the list: id -> when someone saw the list (null = not yet).
  const [marks, setMarks] = useState<Map<string, number | null>>(new Map());

  useEffect(() => setOn(readPref()), []);

  // Browsers only allow sound after the first click/tap on the page.
  useEffect(() => {
    const unlock = () => audio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    const added = bookings.filter((b) => !seen.current.has(b.id));
    for (const b of bookings) seen.current.add(b.id);
    if (added.length === 0) return;
    setMarks((x) => {
      const next = new Map(x);
      for (const b of added) next.set(b.id, null);
      return next;
    });
    if (!on) return;
    setFresh((f) => [...added, ...f].slice(0, 5));
    playChime();
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        for (const b of added) {
          new Notification(m.alertTitle(arenaName), {
            body: `${b.player} · ${b.station} · ${formatDamascusTime(new Date(b.start))}`,
            tag: `booking-${b.id}`,
            icon: '/favicon.ico',
          });
        }
      }
    } catch {
      /* some browsers refuse notifications from pages: the card still shows */
    }
  }, [bookings, on, m, arenaName]);

  // Keep ringing until someone presses View / Close or opens the bookings list:
  // every 4 s for the first 2 minutes, then every 15 s.
  useEffect(() => {
    if (fresh.length === 0 || !on) return;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const ring = () => {
      timer = setTimeout(
        () => {
          playChime();
          ring();
        },
        Date.now() - started < 120_000 ? 4000 : 15_000,
      );
    };
    ring();
    return () => clearTimeout(timer);
  }, [fresh.length, on]);

  // Highlights fade 30 s after the list was seen.
  useEffect(() => {
    const seenAt = [...marks.values()].filter((v): v is number => v !== null);
    if (seenAt.length === 0) return;
    const due = Math.min(...seenAt) + 30_000 - Date.now();
    const timer = setTimeout(
      () =>
        setMarks((x) => {
          const next = new Map(x);
          for (const [id, at] of next) if (at !== null && at + 30_000 <= Date.now()) next.delete(id);
          return next;
        }),
      Math.max(0, due),
    );
    return () => clearTimeout(timer);
  }, [marks]);

  /** The bookings list is on screen: stop the sound and start the 30 s fade. */
  const sawList = useCallback(() => {
    setFresh([]);
    setMarks((x) => {
      if (![...x.values()].some((v) => v === null)) return x;
      const next = new Map(x);
      for (const [id, at] of next) if (at === null) next.set(id, Date.now());
      return next;
    });
  }, []);

  // Blink the tab title until someone looks at the page.
  useEffect(() => {
    if (fresh.length === 0) return;
    const base = document.title;
    let flip = false;
    const timer = setInterval(() => {
      flip = !flip;
      document.title = flip ? `🔔 ${m.alertTab(fresh.length)}` : base;
    }, 1000);
    const stop = () => {
      if (!document.hidden) {
        clearInterval(timer);
        document.title = base;
      }
    };
    document.addEventListener('visibilitychange', stop);
    if (!document.hidden) setTimeout(stop, 6000);
    return () => {
      clearInterval(timer);
      document.title = base;
      document.removeEventListener('visibilitychange', stop);
    };
  }, [fresh.length, m]);

  const toggle = useCallback(async () => {
    const next = !on;
    setOn(next);
    try {
      localStorage.setItem(PREF, next ? 'on' : 'off');
    } catch {
      /* private mode */
    }
    if (next) {
      playChime();
      try {
        if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
      } catch {
        /* ignore */
      }
    }
  }, [on]);

  const askSystem = useCallback(async () => {
    playChime();
    try {
      if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
    } catch {
      /* ignore */
    }
  }, []);

  return {
    on,
    toggle,
    fresh,
    dismiss: (id: string) => setFresh((f) => f.filter((b) => b.id !== id)),
    clear: () => setFresh([]),
    askSystem,
    highlighted: marks,
    sawList,
  };
}

/** The bell toggle shown in the dashboard header. */
export function AlertsToggle({ m, on, onToggle, onTest }: { m: ManageText; on: boolean; onToggle: () => void; onTest: () => void }) {
  const [perm, setPerm] = useState<string>('default');
  useEffect(() => {
    try {
      if ('Notification' in window) setPerm(Notification.permission);
    } catch {
      /* ignore */
    }
  }, [on]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold transition-colors ${
          on
            ? 'bg-free/10 text-free shadow-[inset_0_0_0_1px_rgba(43,255,136,0.55)] hover:bg-free/20'
            : 'bg-panel2/60 text-muted shadow-[inset_0_0_0_1px_rgba(74,82,121,0.7)] hover:text-ink'
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" strokeLinejoin="round" />
          <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" strokeLinecap="round" />
          {!on && <path d="M3 3l18 18" strokeLinecap="round" />}
        </svg>
        {on ? m.alertsOn : m.alertsOff}
      </button>
      {on && (
        <button type="button" onClick={onTest} className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
          {perm === 'granted' ? m.alertTest : m.alertAllow}
        </button>
      )}
    </div>
  );
}

/** Cards for bookings that just arrived, until dismissed. */
export function AlertCards({
  locale,
  m,
  items,
  onDismiss,
  onOpen,
}: {
  locale: Locale;
  m: ManageText;
  items: ArenaBooking[];
  onDismiss: (id: string) => void;
  onOpen: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="fixed inset-x-3 bottom-4 z-50 ms-auto flex max-w-sm flex-col gap-2 sm:end-6 sm:start-auto" role="status" aria-live="assertive">
      {items.map((b) => (
        <div key={b.id} className="alert-pop flex items-start gap-3 bg-[#0B0F24] p-4 shadow-[inset_0_0_0_1px_rgba(43,255,136,0.7),0_0_32px_-8px_rgba(43,255,136,0.7)]">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center bg-free/15 text-free">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" strokeLinejoin="round" />
              <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" strokeLinecap="round" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-bold text-free">{m.alertNew}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-ink">
              <bdi className="font-semibold">{b.player}</bdi>
              {b.badge && <PlayerBadge kind={b.badge} locale={locale} />}
            </p>
            <p className="text-sm text-muted">
              {b.station} ·{' '}
              <bdi dir="ltr" className="font-hud">
                {formatDamascusTime(new Date(b.start))}–{formatDamascusTime(new Date(b.end))}
              </bdi>
            </p>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                className="text-sm font-semibold text-cyan hover:underline"
                onClick={() => {
                  onOpen();
                  onDismiss(b.id);
                }}
              >
                {m.alertView}
              </button>
              <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => onDismiss(b.id)}>
                {m.alertClose}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
