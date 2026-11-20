'use client';

// The live floor of the dashboard: every station is a tile (icon, number,
// status, time left). Tapping a tile opens the station panel, which holds
// everything for that station: start a session of any length, extend it, end
// it, and (owners) its settings: name, zone, special price, out of service,
// delete.
import { useEffect, useRef, useState } from 'react';
import { StationIcon } from '@/components/StationIcons';
import { Field } from '@/components/manage/fields';
import type { Action } from '@/components/manage/ManagePanel';
import { groupName } from '@/lib/groups';
import { dictionary, type Locale } from '@/lib/i18n';
import type { ManageText } from '@/lib/i18n-manage';
import type { ManageGroup, ManageStation } from '@/lib/manage/service';
import { formatDamascusTime } from '@/lib/time';

type State = 'free' | 'busy' | 'off';
const stateOf = (s: ManageStation): State => (s.isMaintenance ? 'off' : s.busy ? 'busy' : 'free');

const LOOK: Record<State, { tile: string; icon: string; text: string; dot: string }> = {
  free: {
    tile: 'bg-free/[0.06] shadow-[inset_0_0_0_1px_rgba(43,255,136,0.4)] hover:shadow-[inset_0_0_0_1px_rgba(43,255,136,0.9),0_0_24px_-8px_rgba(43,255,136,0.7)]',
    icon: 'text-free',
    text: 'text-free',
    dot: 'bg-free',
  },
  busy: {
    tile: 'bg-busy/[0.06] shadow-[inset_0_0_0_1px_rgba(255,45,85,0.4)] hover:shadow-[inset_0_0_0_1px_rgba(255,45,85,0.9),0_0_24px_-8px_rgba(255,45,85,0.7)]',
    icon: 'text-busy',
    text: 'text-busy',
    dot: 'bg-busy',
  },
  off: {
    tile: 'bg-panel2/40 shadow-[inset_0_0_0_1px_rgba(74,82,121,0.7)] hover:shadow-[inset_0_0_0_1px_rgba(140,151,196,0.8)]',
    icon: 'text-off',
    text: 'text-muted',
    dot: 'bg-off',
  },
};

/** "1:25" (hours:minutes) until `until`, never negative. */
function left(until: string, now: number): string {
  const min = Math.max(0, Math.ceil((new Date(until).getTime() - now) / 60_000));
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

/** Re-render every 30 s so "time left" moves between server updates. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function StationTile({
  s,
  num,
  name,
  index,
  m,
  onOpen,
}: {
  s: ManageStation;
  num: number;
  name: string;
  index: number;
  m: ManageText;
  onOpen: () => void;
}) {
  const now = useNow();
  const state = stateOf(s);
  const look = LOOK[state];
  return (
    <li className="station-on" style={{ animationDelay: `${Math.min(index, 24) * 30}ms` }}>
      <button
        type="button"
        onClick={onOpen}
        className={`group relative flex w-full flex-col items-center gap-1.5 px-2 pb-3 pt-4 text-center transition-shadow duration-200 [clip-path:polygon(10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%,0_10px)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan ${look.tile}`}
      >
        <span dir="ltr" className={`absolute end-2 top-1.5 font-hud text-xs font-bold ${look.text}`}>
          {String(num).padStart(2, '0')}
        </span>
        <StationIcon type={s.type} className={`h-9 w-10 transition-transform duration-200 group-hover:scale-110 ${look.icon}`} />
        <span className="max-w-full truncate text-sm font-semibold text-ink">{s.label || name}</span>
        <span className={`flex items-center gap-1.5 text-xs ${look.text}`}>
          <span className={`h-1.5 w-1.5 ${look.dot} ${state !== 'off' ? 'live-dot' : ''}`} aria-hidden="true" />
          {state === 'free' && m.free}
          {state === 'off' && m.inMaintenance}
          {state === 'busy' && s.busy && (
            <bdi dir="ltr" className="font-hud">
              {left(s.busy.until, now)}
            </bdi>
          )}
        </span>
      </button>
    </li>
  );
}

const STEP = 30;
const QUICK = [60, 120, 180, 300];

export function StationPanel({
  locale,
  m,
  s,
  name,
  owner,
  groups,
  arenaRate,
  action,
  onClose,
}: {
  locale: Locale;
  m: ManageText;
  s: ManageStation;
  name: string;
  owner: boolean;
  groups: ManageGroup[];
  arenaRate: string;
  action: Action;
  onClose: () => void;
}) {
  const t = dictionary(locale);
  const ref = useRef<HTMLDialogElement>(null);
  const now = useNow();
  const [minutes, setMinutes] = useState(60);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [saved, setSaved] = useState(false);
  const [f, setF] = useState({ label: s.label, groupId: s.groupId, hourlyRate: s.hourlyRate, nightRate: s.nightRate });
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    if (!confirmEnd && !confirmDelete) return;
    const timer = setTimeout(() => {
      setConfirmEnd(false);
      setConfirmDelete(false);
    }, 3500);
    return () => clearTimeout(timer);
  }, [confirmEnd, confirmDelete]);

  const state = stateOf(s);
  const look = LOOK[state];
  const key = (k: string) => `${k}-${s.pcNumber}`;
  const working = !!action.busy;
  const zones = groups.filter((g) => g.type === s.type);
  const endsAt = formatDamascusTime(new Date(now + minutes * 60_000));
  const run = async (k: string, body: Record<string, unknown>, close = false) => {
    const ok = await action.run(key(k), { pcNumber: s.pcNumber, ...body });
    if (ok && close) onClose();
    return ok;
  };

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run('edit', { action: 'editStation', type: s.type, label: f.label, groupId: f.groupId, hourlyRate: f.hourlyRate, nightRate: f.nightRate });
    if (ok) setSaved(true);
  }

  return (
    <dialog ref={ref} onClose={onClose} className="cr-modal m-auto w-[calc(100%-1.5rem)] max-w-md overflow-hidden bg-transparent p-0 text-ink">
      <div className="panel-in hud flex max-h-[calc(100dvh-3rem)] flex-col" style={{ background: '#0B0F24' }}>
        {/* Header: the station, its zone and what it is doing now. */}
        <div className="flex items-start gap-4 p-5 pb-4">
          <div className={`relative grid h-16 w-16 shrink-0 place-items-center ${look.tile}`}>
            <StationIcon type={s.type} className={`h-9 w-10 ${look.icon}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-xl font-bold text-ink">{s.label ? `${name} · ${s.label}` : name}</h2>
            {s.groupId && <p className="text-xs text-muted">{groupName(groups.find((g) => g.id === s.groupId) ?? { nameAr: '', nameEn: '' }, locale)}</p>}
            <p className={`mt-1 flex items-center gap-1.5 text-sm ${look.text}`}>
              <span className={`h-2 w-2 ${look.dot}`} aria-hidden="true" />
              {state === 'free' && m.free}
              {state === 'off' && m.inMaintenance}
              {state === 'busy' && s.busy && (
                <>
                  {m.busyUntil(formatDamascusTime(new Date(s.busy.until)))} · {m.timeLeft(left(s.busy.until, now))}
                </>
              )}
            </p>
            {state === 'busy' && s.busy && <p className="text-xs text-muted">{s.busy.walkIn ? m.walkIn : m.online}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={m.cancel} className="grid h-9 w-9 shrink-0 place-items-center text-muted hover:text-ink">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="cr-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5">
          {/* Free: start a session of any length. */}
          {state === 'free' && (
            <section className="space-y-3">
              <p className="text-sm font-semibold text-ink">{m.sessionLength}</p>
              <div className="flex items-stretch gap-2">
                <button
                  type="button"
                  className="city-option w-12 text-xl text-ink disabled:opacity-30"
                  disabled={minutes <= STEP}
                  onClick={() => setMinutes((x) => Math.max(STEP, x - STEP))}
                  aria-label="−30"
                >
                  −
                </button>
                <div className="flex flex-1 flex-col items-center justify-center bg-void/60 py-1.5 shadow-[inset_0_0_0_1px_rgba(157,92,255,0.35)]">
                  <span className="font-display text-lg font-bold text-ink">{t.book.hours(minutes)}</span>
                  <span className="text-xs text-muted">
                    {m.endsAt('')}
                    <bdi dir="ltr" className="font-hud text-ink/80">
                      {endsAt}
                    </bdi>
                  </span>
                </div>
                <button
                  type="button"
                  className="city-option w-12 text-xl text-ink disabled:opacity-30"
                  disabled={minutes >= 12 * 60}
                  onClick={() => setMinutes((x) => Math.min(12 * 60, x + STEP))}
                  aria-label="+30"
                >
                  +
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {QUICK.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setMinutes(q)}
                    className={`city-option py-1.5 text-xs ${minutes === q ? 'city-option-on text-ink' : 'text-muted hover:text-ink'}`}
                  >
                    {t.book.hours(q)}
                  </button>
                ))}
              </div>
              <button type="button" className="btn-neon w-full" disabled={working} onClick={() => run('walk', { action: 'walkIn', minutes }, true)}>
                {m.startNow}
              </button>
            </section>
          )}

          {/* Busy: extend or end. */}
          {state === 'busy' && (
            <section className="space-y-3">
              <p className="text-sm font-semibold text-ink">{m.extendBy}</p>
              <div className="grid grid-cols-3 gap-2">
                {[30, 60, 120].map((q) => (
                  <button key={q} type="button" className="btn-ghost" disabled={working} onClick={() => run('ext', { action: 'extend', minutes: q })}>
                    {m.plus(t.book.hours(q))}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={`w-full py-2.5 text-sm font-semibold transition-colors ${confirmEnd ? 'bg-busy text-white' : 'bg-busy/15 text-busy hover:bg-busy/25'}`}
                disabled={working}
                onClick={() => (confirmEnd ? run('free', { action: 'freeNow' }, true) : setConfirmEnd(true))}
              >
                {confirmEnd ? m.confirmEnd : m.endNow}
              </button>
            </section>
          )}

          {/* Out of service: one button back. */}
          {state === 'off' && (
            <button type="button" className="btn-neon w-full" disabled={working} onClick={() => run('mt', { action: 'maintenance', on: false }, true)}>
              {m.maintenanceOff}
            </button>
          )}

          {action.error && <p className="text-sm text-busy">{action.error}</p>}

          {/* Settings: owners only, folded away so the daily buttons stay simple. */}
          {owner && (
            <section className="border-t border-line pt-4">
              <button
                type="button"
                onClick={() => setShowSettings((x) => !x)}
                aria-expanded={showSettings}
                className="flex w-full items-center justify-between text-sm font-semibold text-ink"
              >
                {m.stationSettings}
                <span className="text-muted">{showSettings ? '▴' : '▾'}</span>
              </button>
              {showSettings && (
                <form onSubmit={saveSettings} className="panel-in mt-4 space-y-4" onChange={() => setSaved(false)}>
                  <Field label={m.label} value={f.label} onChange={(e) => setF((x) => ({ ...x, label: e.target.value }))} maxLength={40} />
                  {zones.length > 0 && (
                    <fieldset>
                      <legend className="text-sm font-semibold text-ink">{m.zone}</legend>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {[{ id: '', label: m.noZone }, ...zones.map((g) => ({ id: g.id, label: groupName(g, locale) || m.unnamed }))].map((o) => (
                          <button
                            key={o.id || 'none'}
                            type="button"
                            aria-pressed={f.groupId === o.id}
                            onClick={() => {
                              setSaved(false);
                              setF((x) => ({ ...x, groupId: o.id }));
                            }}
                            className={`city-option px-3 py-1.5 text-sm ${f.groupId === o.id ? 'city-option-on text-ink' : 'text-muted hover:text-ink'}`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  <fieldset>
                    <legend className="text-sm font-semibold text-ink">{m.specialPrice}</legend>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{m.specialPriceHint(arenaRate)}</p>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <Field label={m.hourPrice} value={f.hourlyRate} onChange={(e) => setF((x) => ({ ...x, hourlyRate: e.target.value }))} inputMode="decimal" dir="ltr" placeholder={arenaRate} />
                      <Field label={m.nightPrice} value={f.nightRate} onChange={(e) => setF((x) => ({ ...x, nightRate: e.target.value }))} inputMode="decimal" dir="ltr" />
                    </div>
                  </fieldset>
                  <div className="flex items-center gap-3">
                    <button type="submit" className="btn-neon" disabled={working}>
                      {m.saveSettings}
                    </button>
                    {saved && <span className="text-sm text-free">{m.saved}</span>}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                    {state !== 'off' && (
                      <button type="button" className="text-sm text-muted hover:text-ink" disabled={working} onClick={() => run('mt', { action: 'maintenance', on: true }, true)}>
                        {m.takeOut}
                      </button>
                    )}
                    <button
                      type="button"
                      className={`text-sm ${confirmDelete ? 'font-semibold text-busy' : 'text-muted hover:text-busy'}`}
                      disabled={working}
                      onClick={() => (confirmDelete ? run('rm', { action: 'removeStation' }, true) : setConfirmDelete(true))}
                    >
                      {confirmDelete ? m.confirmRemove : m.deleteStation}
                    </button>
                  </div>
                </form>
              )}
            </section>
          )}
          {/* Staff: out of service is a daily action too. */}
          {!owner && state !== 'off' && (
            <button type="button" className="text-sm text-muted hover:text-ink" disabled={working} onClick={() => run('mt', { action: 'maintenance', on: true }, true)}>
              {m.takeOut}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
