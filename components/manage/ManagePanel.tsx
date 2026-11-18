'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StationIcon } from '@/components/StationIcons';
import { CITIES, cityName } from '@/lib/cities';
import { dictionary, pick, type Locale } from '@/lib/i18n';
import { manageText, type ManageText } from '@/lib/i18n-manage';
import type { ManageData, ManageGroup, ManageStation } from '@/lib/manage/service';
import { fieldsFor, groupName, groupSummary, numberRanges, type SpecField } from '@/lib/groups';
import { googleMapsUrl } from '@/lib/maps';
import { parseLatLng } from '@/lib/manage/rules';
import { formatDamascusTime, toDamascusParts } from '@/lib/time';

// Owner panel: live floor with walk-in controls, station editing, arena
// details and games. Every change goes through POST /api/manage/<slug>,
// which answers with the fresh data.

type Tab = 'stations' | 'zones' | 'bookings' | 'arena' | 'games';
const TYPES = ['PC', 'PS5', 'PS4', 'XBOX'] as const;
const POLL_MS = 10_000;

function useAction(slug: string, setData: (d: ManageData) => void, m: ManageText) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (key: string, body: Record<string, unknown>): Promise<boolean> => {
      setBusy(key);
      setError(null);
      try {
        const res = await fetch(`/api/manage/${slug}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(m.errors[json.error] ?? m.errors.generic);
          return false;
        }
        setData(json.data);
        return true;
      } catch {
        setError(m.errors.generic);
        return false;
      } finally {
        setBusy(null);
      }
    },
    [slug, setData, m],
  );
  return { run, busy, error, setError };
}

export default function ManagePanel({
  locale,
  slug,
  role,
  initial,
}: {
  locale: Locale;
  slug: string;
  role: 'OWNER' | 'STAFF';
  initial: ManageData;
}) {
  const m = manageText(locale);
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<Tab>('stations');
  const owner = role === 'OWNER';
  const action = useAction(slug, setData, m);

  // Keep the floor fresh (bookings and other staff change it too).
  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.hidden) return;
      const res = await fetch(`/api/manage/${slug}`, { cache: 'no-store' }).catch(() => null);
      if (res?.ok) setData(await res.json());
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [slug]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'stations', label: m.tabs.stations },
    ...(owner ? ([{ key: 'zones', label: m.tabs.zones }] as const) : []),
    { key: 'bookings', label: `${m.tabs.bookings}${data.bookings.length ? ` (${data.bookings.length})` : ''}` },
    ...(owner
      ? ([
          { key: 'arena', label: m.tabs.arena },
          { key: 'games', label: m.tabs.games },
        ] as const)
      : []),
  ];

  return (
    <div className="space-y-5">
      <div role="tablist" className="flex flex-wrap gap-2">
        {tabs.map((x) => (
          <button
            key={x.key}
            role="tab"
            type="button"
            aria-selected={tab === x.key}
            onClick={() => {
              setTab(x.key);
              action.setError(null);
            }}
            className={`city-option px-4 py-2 text-sm ${tab === x.key ? 'city-option-on text-ink' : 'text-muted hover:text-ink'}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      {!owner && <p className="text-sm text-muted">{m.staffOnly}</p>}
      {action.error && (
        <p role="alert" className="panel-in bg-busy/10 px-4 py-3 text-sm text-busy shadow-[inset_0_0_0_1px_rgba(255,45,85,0.5)]">
          {action.error}
        </p>
      )}
      {tab === 'stations' && <Stations locale={locale} m={m} data={data} owner={owner} action={action} />}
      {tab === 'zones' && owner && <Zones locale={locale} slug={slug} m={m} data={data} setData={setData} action={action} />}
      {tab === 'bookings' && <Bookings locale={locale} m={m} data={data} action={action} />}
      {tab === 'arena' && owner && (
        <>
          <Images slug={slug} m={m} data={data} setData={setData} setError={action.setError} />
          <ArenaForm locale={locale} m={m} data={data} action={action} />
        </>
      )}
      {tab === 'games' && owner && <GamesForm m={m} data={data} action={action} />}
    </div>
  );
}

type Action = ReturnType<typeof useAction>;

// ------------------------------------------------------------------ stations

function Stations({ locale, m, data, owner, action }: { locale: Locale; m: ManageText; data: ManageData; owner: boolean; action: Action }) {
  const t = dictionary(locale);
  const [editing, setEditing] = useState<ManageStation | 'new' | null>(null);
  const counts = useMemo(() => {
    let free = 0;
    let busy = 0;
    let off = 0;
    for (const s of data.stations) {
      if (s.isMaintenance) off++;
      else if (s.busy) busy++;
      else free++;
    }
    return { free, busy, off };
  }, [data.stations]);

  const groups = TYPES.map((type) => ({ type, list: data.stations.filter((s) => s.type === type) })).filter((g) => g.list.length);
  const typeIndex = new Map<number, number>();
  for (const g of groups) g.list.forEach((s, i) => typeIndex.set(s.pcNumber, i + 1));
  const nameOf = (s: ManageStation) => t.station.name(s.type, typeIndex.get(s.pcNumber) ?? s.pcNumber);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-hud text-sm text-muted">{m.summary(counts.free, counts.busy, counts.off)}</p>
        {owner && (
          <button type="button" className="btn-neon text-sm" onClick={() => setEditing('new')}>
            + {m.add}
          </button>
        )}
      </div>

      {groups.map((g) => (
        <section key={g.type} className="hud p-4 sm:p-5">
          <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-ink">
            <StationIcon type={g.type} className="h-5 w-6 text-violet-soft" />
            {t.station.typeTitle[g.type]}
            <span className="font-hud text-sm font-normal text-muted">{g.list.length}</span>
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {g.list.map((s) => (
              <StationCard
                key={s.pcNumber}
                s={s}
                name={nameOf(s)}
                m={m}
                owner={owner}
                action={action}
                onEdit={() => setEditing(s)}
              />
            ))}
          </ul>
        </section>
      ))}

      {editing && (
        <StationEditor
          m={m}
          locale={locale}
          station={editing === 'new' ? null : editing}
          name={editing === 'new' ? '' : nameOf(editing)}
          arenaRate={data.arena.hourlyRate}
          groups={data.groups}
          action={action}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function StationCard({
  s,
  name,
  m,
  owner,
  action,
  onEdit,
}: {
  s: ManageStation;
  name: string;
  m: ManageText;
  owner: boolean;
  action: Action;
  onEdit: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const timer = setTimeout(() => setConfirm(false), 3500);
    return () => clearTimeout(timer);
  }, [confirm]);
  const key = (k: string) => `${k}-${s.pcNumber}`;
  const working = action.busy?.endsWith(`-${s.pcNumber}`);
  const state = s.isMaintenance ? 'off' : s.busy ? 'busy' : 'free';
  const tone =
    state === 'free'
      ? 'shadow-[inset_0_0_0_1px_rgba(43,255,136,0.45)] bg-free/[0.05]'
      : state === 'busy'
        ? 'shadow-[inset_0_0_0_1px_rgba(255,45,85,0.45)] bg-busy/[0.05]'
        : 'shadow-[inset_0_0_0_1px_rgba(74,82,121,0.7)] bg-panel2/40';

  return (
    <li className={`flex flex-col gap-3 p-3.5 transition-colors [clip-path:polygon(10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%,0_10px)] ${tone} ${working ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-ink">
            {name}
            {s.label && <span className="ms-2 text-xs font-normal text-muted">{s.label}</span>}
          </p>
          <p className={`text-sm ${state === 'free' ? 'text-free' : state === 'busy' ? 'text-busy' : 'text-muted'}`}>
            {state === 'free' && m.free}
            {state === 'off' && m.inMaintenance}
            {state === 'busy' && s.busy && (
              <>
                {m.busyUntil(formatDamascusTime(new Date(s.busy.until)))}
                <span className="text-xs text-muted"> · {s.busy.walkIn ? m.walkIn : m.online}</span>
              </>
            )}
          </p>
        </div>
        {owner && (
          <div className="flex shrink-0 gap-1">
            <IconButton label={m.edit} onClick={onEdit}>
              <path d="M4 20h4L19 9l-4-4L4 16v4z" strokeLinejoin="round" />
            </IconButton>
            <IconButton
              label={confirm ? m.confirmRemove : m.remove}
              danger={confirm}
              onClick={() => (confirm ? action.run(key('rm'), { action: 'removeStation', pcNumber: s.pcNumber }) : setConfirm(true))}
            >
              <path d="M5 7h14M10 11v6M14 11v6M7 7l1 13h8l1-13M9 7V4h6v3" strokeLinejoin="round" strokeLinecap="round" />
            </IconButton>
          </div>
        )}
      </div>
      {confirm && <p className="panel-in text-xs text-busy">{m.confirmRemove}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {state === 'free' && (
          <>
            <span className="text-xs text-muted">{m.walkInFor}</span>
            {[1, 2, 3].map((h) => (
              <button
                key={h}
                type="button"
                disabled={!!working}
                className="btn-ghost !min-h-[2rem] !px-2.5 text-xs"
                onClick={() => action.run(key('walk'), { action: 'walkIn', pcNumber: s.pcNumber, minutes: h * 60 })}
              >
                {m.hours(h)}
              </button>
            ))}
          </>
        )}
        {state === 'busy' && (
          <button
            type="button"
            disabled={!!working}
            className="btn-neon !min-h-[2rem] text-xs"
            onClick={() => action.run(key('free'), { action: 'freeNow', pcNumber: s.pcNumber })}
          >
            {m.freeNow}
          </button>
        )}
        <button
          type="button"
          disabled={!!working}
          className="ms-auto text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
          onClick={() => action.run(key('mt'), { action: 'maintenance', pcNumber: s.pcNumber, on: !s.isMaintenance })}
        >
          {s.isMaintenance ? m.maintenanceOff : m.maintenanceOn}
        </button>
      </div>
    </li>
  );
}

function IconButton({ label, onClick, danger = false, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 place-items-center transition-colors ${danger ? 'bg-busy/20 text-busy' : 'text-muted hover:bg-panel2 hover:text-ink'}`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

function StationEditor({
  m,
  locale,
  station,
  name,
  arenaRate,
  groups,
  action,
  onClose,
}: {
  m: ManageText;
  locale: Locale;
  station: ManageStation | null;
  name: string;
  arenaRate: string;
  groups: ManageGroup[];
  action: Action;
  onClose: () => void;
}) {
  const t = dictionary(locale);
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState({
    type: station?.type ?? 'PC',
    count: 1,
    label: station?.label ?? '',
    groupId: station?.groupId ?? '',
    hourlyRate: station?.hourlyRate ?? '',
    nightRate: station?.nightRate ?? '',
  });
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: k === 'count' ? Math.max(1, Math.min(30, Number(e.target.value) || 1)) : e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    // A zone of another type can't hold this station: send "no zone" then.
    const groupId = groups.some((g) => g.id === form.groupId && g.type === form.type) ? form.groupId : '';
    const base = { type: form.type, label: form.label, groupId, hourlyRate: form.hourlyRate, nightRate: form.nightRate };
    const ok = station
      ? await action.run('edit', { action: 'editStation', pcNumber: station.pcNumber, ...base })
      : await action.run('add', { action: 'addStations', count: form.count, ...base });
    if (ok) onClose();
  }

  return (
    <dialog ref={ref} onClose={onClose} className="cr-modal m-auto w-[calc(100%-1.5rem)] max-w-lg bg-transparent p-0 text-ink">
      <form onSubmit={save} className="panel-in hud space-y-4 p-6" style={{ background: '#0B0F24' }}>
        <h2 className="font-display text-2xl font-bold text-ink">{station ? m.editTitle(name) : m.addTitle}</h2>
        <fieldset>
          <legend className="text-sm font-semibold text-ink">{m.type}</legend>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setForm((f) => ({ ...f, type }))}
                aria-pressed={form.type === type}
                className={`city-option flex flex-col items-center gap-1 py-2 text-xs ${form.type === type ? 'city-option-on text-ink' : 'text-muted'}`}
              >
                <StationIcon type={type} className="h-5 w-6" />
                {t.station.typeShort[type]}
              </button>
            ))}
          </div>
        </fieldset>
        {!station && <Field label={m.count} type="number" value={String(form.count)} onChange={set('count')} min={1} max={30} />}
        <Field label={m.label} value={form.label} onChange={set('label')} maxLength={40} />
        {groups.some((g) => g.type === form.type) && (
          <fieldset>
            <legend className="text-sm font-semibold text-ink">{m.zone}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {[{ id: '', label: m.noZone }, ...groups.filter((g) => g.type === form.type).map((g) => ({ id: g.id, label: groupName(g, locale) || m.unnamed }))].map((o) => (
                <button
                  key={o.id || 'none'}
                  type="button"
                  aria-pressed={form.groupId === o.id}
                  onClick={() => setForm((f) => ({ ...f, groupId: o.id }))}
                  className={`city-option px-3 py-1.5 text-sm ${form.groupId === o.id ? 'city-option-on text-ink' : 'text-muted hover:text-ink'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={m.ownPrice} value={form.hourlyRate} onChange={set('hourlyRate')} inputMode="decimal" dir="ltr" />
          <Field label={m.ownNight} value={form.nightRate} onChange={set('nightRate')} inputMode="decimal" dir="ltr" />
        </div>
        <p className="text-xs text-muted">{m.priceHint(arenaRate)}</p>
        {action.error && <p className="text-sm text-busy">{action.error}</p>}
        <div className="flex gap-2 pt-2">
          <button type="submit" className="btn-neon" disabled={!!action.busy}>
            {action.busy ? m.saving : m.save}
          </button>
          <button type="button" className="btn-ghost" onClick={onClose}>
            {m.cancel}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function Field({
  label,
  hint,
  ...props
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <input
        {...props}
        className="mt-1.5 w-full bg-void/70 px-3 py-2.5 text-ink placeholder:text-muted/60 shadow-[inset_0_0_0_1px_rgba(157,92,255,0.35)] outline-none focus:shadow-[inset_0_0_0_1px_rgba(41,224,255,0.8)]"
      />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

// ------------------------------------------------------------------ arena

function ArenaForm({ locale, m, data, action }: { locale: Locale; m: ManageText; data: ManageData; action: Action }) {
  const [f, setF] = useState(data.arena);
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaved(false);
    setF((x) => ({ ...x, [k]: e.target.value }));
  };
  const pin = f.location ? parseLatLng(f.location) : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { slug: _slug, ...fields } = f;
    void _slug;
    if (await action.run('arena', { action: 'editArena', ...fields })) setSaved(true);
  }

  const pairs: [keyof typeof f, keyof typeof f, number][] = [
    ['nameAr', 'nameEn', 60],
    ['taglineAr', 'taglineEn', 160],
    ['areaAr', 'areaEn', 60],
    ['addressAr', 'addressEn', 160],
    ['hoursAr', 'hoursEn', 80],
  ];

  return (
    <form onSubmit={save} className="hud space-y-6 p-5 sm:p-7">
      {pairs.map(([a, b, max]) => (
        <div key={a} className="grid gap-4 sm:grid-cols-2">
          <Field label={m[a as 'nameAr']} value={f[a]} onChange={set(a)} maxLength={max} dir="rtl" required={!a.startsWith('tagline')} />
          <Field label={m[b as 'nameEn']} value={f[b]} onChange={set(b)} maxLength={max} dir="ltr" required={!b.startsWith('tagline')} />
        </div>
      ))}
      <fieldset>
        <legend className="text-sm font-semibold text-ink">{m.city}</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 min-[420px]:grid-cols-3 lg:grid-cols-5">
          {CITIES.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={f.city === c.key}
              onClick={() => setF((x) => ({ ...x, city: c.key }))}
              className={`city-option px-3 py-2 text-sm ${f.city === c.key ? 'city-option-on text-ink' : 'text-muted hover:text-ink'}`}
            >
              {pick(locale, c.en, c.ar)}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={m.dayRate} value={f.hourlyRate} onChange={set('hourlyRate')} inputMode="decimal" dir="ltr" required />
        <Field label={m.nightRate} value={f.nightShiftRate} onChange={set('nightShiftRate')} inputMode="decimal" dir="ltr" required />
      </div>
      <div>
        <Field label={m.location} hint={m.locationHint} value={f.location} onChange={set('location')} dir="ltr" placeholder="33.5036, 36.2546" />
        {pin && (
          <a href={googleMapsUrl(pin)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-cyan underline-offset-4 hover:underline">
            {m.locationCheck} ↗
          </a>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-neon" disabled={!!action.busy}>
          {action.busy ? m.saving : saved ? m.saved : m.save}
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ games

function GamesForm({ m, data, action }: { m: ManageText; data: ManageData; action: Action }) {
  const [selected, setSelected] = useState(new Set(data.games.selected));
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState(false);
  const shown = data.games.catalogue.filter((g) => !query || g.name.toLowerCase().includes(query.trim().toLowerCase()));

  function toggle(slug: string) {
    setSaved(false);
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(slug)) n.delete(slug);
      else n.add(slug);
      return n;
    });
  }

  return (
    <div className="hud space-y-5 p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">
          {m.gamesHint} <span className="font-hud text-cyan">{m.gamesSelected(selected.size)}</span>
        </p>
        <button
          type="button"
          className="btn-neon"
          disabled={!!action.busy}
          onClick={async () => {
            if (await action.run('games', { action: 'setGames', slugs: [...selected] })) setSaved(true);
          }}
        >
          {action.busy ? m.saving : saved ? m.saved : m.save}
        </button>
      </div>
      <label className="scan-field flex items-center gap-3 px-4">
        <span className="sr-only">{m.search}</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={m.search}
          className="min-w-0 flex-1 bg-transparent py-2.5 text-ink placeholder:text-muted/70 outline-none"
        />
      </label>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((g) => {
          const on = selected.has(g.slug);
          return (
            <li key={g.slug}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(g.slug)}
                className={`city-option flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm ${on ? 'city-option-on text-ink' : 'text-muted hover:text-ink'}`}
              >
                <span aria-hidden="true" className={`grid h-4 w-4 shrink-0 place-items-center text-[10px] ${on ? 'bg-cyan text-void' : 'shadow-[inset_0_0_0_1px_rgba(157,92,255,0.5)]'}`}>
                  {on ? '✓' : ''}
                </span>
                <span dir="ltr" className="truncate">
                  {g.name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ bookings

const WEEKDAYS = {
  ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

function Bookings({ locale, m, data, action }: { locale: Locale; m: ManageText; data: ManageData; action: Action }) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (data.bookings.length === 0) {
    return (
      <div className="hud p-6">
        <p className="text-muted">{m.bookingsEmpty}</p>
        <p className="mt-2 text-xs text-muted">{m.bookingsHint}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">{m.bookingsHint}</p>
      <ul className="grid gap-3 lg:grid-cols-2">
        {data.bookings.map((b) => {
          const s = new Date(b.start);
          const p = toDamascusParts(s);
          const working = action.busy?.endsWith(b.id);
          return (
            <li key={b.id} className={`hud p-4 ${working ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    <bdi>{b.player}</bdi>
                    {b.fullName && (
                      <span className="text-sm font-normal text-muted">
                        {' · '}
                        <bdi>{b.fullName}</bdi>
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted">
                    {b.city && cityName(b.city, locale)}
                    {b.phone && (
                      <>
                        {' · '}
                        <a href={`tel:${b.phone}`} dir="ltr" className="font-hud text-cyan hover:underline">
                          {b.phone}
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <div className="shrink-0 text-end">
                  <p className="font-semibold text-ink">{b.station}</p>
                  <p className="text-sm text-muted">
                    {WEEKDAYS[locale][p.weekday]} {p.day}/{p.month}{' '}
                    <span dir="ltr" className="inline-block whitespace-nowrap font-hud text-ink">
                      {formatDamascusTime(s)}–{formatDamascusTime(new Date(b.end))}
                    </span>
                  </p>
                  <p className="font-hud text-sm text-violet-soft">{dictionary(locale).arena.price(b.price)}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {b.arrived ? (
                  <span className="text-sm text-free">{m.hasArrived}</span>
                ) : (
                  <button type="button" className="btn-neon !min-h-[2rem] text-xs" disabled={!!working} onClick={() => action.run(`bk-${b.id}`, { action: 'markBooking', bookingId: b.id, mark: 'arrived' })}>
                    {m.arrived}
                  </button>
                )}
                {!b.arrived && b.started && (
                  <button type="button" className="btn-ghost !min-h-[2rem] text-xs" disabled={!!working} onClick={() => action.run(`bk-${b.id}`, { action: 'markBooking', bookingId: b.id, mark: 'noshow' })}>
                    {m.noShow}
                  </button>
                )}
                <button
                  type="button"
                  className={`text-xs underline-offset-4 hover:underline ${confirmId === b.id ? 'font-semibold text-busy' : 'text-muted hover:text-busy'}`}
                  disabled={!!working}
                  onClick={() => {
                    if (confirmId !== b.id) return setConfirmId(b.id);
                    setConfirmId(null);
                    void action.run(`bk-${b.id}`, { action: 'markBooking', bookingId: b.id, mark: 'cancel' });
                  }}
                >
                  {confirmId === b.id ? m.confirmCancel : m.cancelBooking}
                </button>
                {b.stillComing && !b.arrived && <span className="ms-auto text-xs text-free">{m.stillComing}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ logo + banner

function Images({
  slug,
  m,
  data,
  setData,
  setError,
}: {
  slug: string;
  m: ManageText;
  data: ManageData;
  setData: (d: ManageData) => void;
  setError: (e: string | null) => void;
}) {
  const [busy, setBusy] = useState<'logo' | 'cover' | null>(null);

  async function upload(kind: 'logo' | 'cover', file: File) {
    setBusy(kind);
    setError(null);
    const form = new FormData();
    form.set('kind', kind);
    form.set('file', file);
    try {
      const res = await fetch(`/api/manage/${slug}/image`, { method: 'POST', body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError(m.errors[json.error] ?? m.errors.generic);
      else setData(json.data);
    } catch {
      setError(m.errors.generic);
    } finally {
      setBusy(null);
    }
  }

  async function remove(kind: 'logo' | 'cover') {
    setBusy(kind);
    setError(null);
    const res = await fetch(`/api/manage/${slug}/image?kind=${kind}`, { method: 'DELETE' }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) setError(m.errors.generic);
    else setData(json.data);
    setBusy(null);
  }

  const picker = (kind: 'logo' | 'cover', label: string) => (
    <label className={`btn-ghost cursor-pointer text-sm ${busy ? 'pointer-events-none opacity-60' : ''}`}>
      {busy === kind ? m.uploading : label}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void upload(kind, f);
        }}
      />
    </label>
  );

  const isDefault = data.images.cover.endsWith('/cover-default.svg');
  return (
    <section className="hud grid gap-6 p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:p-7">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-ink">{m.logo}</p>
        <div className="grid h-28 w-28 place-items-center overflow-hidden bg-void/70 shadow-[inset_0_0_0_1px_rgba(157,92,255,0.35)]">
          {data.images.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.images.logo} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs text-muted">{m.noLogo}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {picker('logo', data.images.logo ? m.change : m.upload)}
          {data.images.logo && (
            <button type="button" className="text-xs text-muted hover:text-busy" onClick={() => remove('logo')} disabled={!!busy}>
              {m.removeImage}
            </button>
          )}
        </div>
        <p className="max-w-[14rem] text-xs text-muted">{m.logoHint}</p>
      </div>
      <div className="min-w-0 space-y-3">
        <p className="text-sm font-semibold text-ink">{m.cover}</p>
        <div className="aspect-[12/5] w-full max-w-xl overflow-hidden bg-void/70 shadow-[inset_0_0_0_1px_rgba(157,92,255,0.35)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.images.cover} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="flex flex-wrap gap-2">
          {picker('cover', isDefault ? m.upload : m.change)}
          {!isDefault && (
            <button type="button" className="text-xs text-muted hover:text-busy" onClick={() => remove('cover')} disabled={!!busy}>
              {m.removeImage}
            </button>
          )}
        </div>
        <p className="text-xs text-muted">{m.coverHint}</p>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ zones

const BLANK_ZONE = {
  type: 'PC' as (typeof TYPES)[number],
  nameAr: '',
  nameEn: '',
  noteAr: '',
  noteEn: '',
  isVip: false,
  cpu: '',
  gpu: '',
  ram: '',
  storage: '',
  screen: '',
  refreshHz: '',
  controllers: '',
  keyboard: '',
  mouse: '',
  headset: '',
  chair: '',
};

/** Example text in each empty field. */
const PLACEHOLDER: Record<string, string> = {
  cpu: 'Ryzen 5 7600',
  gpu: 'RTX 4060',
  ram: '16 GB DDR5',
  storage: '1 TB NVMe',
  screenPC: '24" 1080p',
  screenConsole: '55" 4K',
  keyboard: 'Redragon K552',
  mouse: 'Logitech G102',
  headset: 'HyperX Cloud II',
  chair: 'DXRacer',
};

function stationNames(locale: Locale, stations: ManageStation[]) {
  const t = dictionary(locale);
  const index = new Map<number, number>();
  for (const type of TYPES) stations.filter((s) => s.type === type).forEach((s, i) => index.set(s.pcNumber, i + 1));
  return { index, name: (s: ManageStation) => t.station.name(s.type, index.get(s.pcNumber) ?? s.pcNumber) };
}

function Zones({
  locale,
  slug,
  m,
  data,
  setData,
  action,
}: {
  locale: Locale;
  slug: string;
  m: ManageText;
  data: ManageData;
  setData: (d: ManageData) => void;
  action: Action;
}) {
  const t = dictionary(locale);
  const [editing, setEditing] = useState<ManageGroup | 'new' | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  // Ids before a new zone was saved: the one that appears is opened for its photo.
  const [before, setBefore] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!before) return;
    const added = data.groups.find((g) => !before.has(g.id));
    if (added) {
      setBefore(null);
      setEditing(added);
    }
  }, [before, data.groups]);
  const { index } = stationNames(locale, data.stations);
  // Keep the open editor in step with fresh data (e.g. after a photo upload).
  const current = editing && editing !== 'new' ? data.groups.find((g) => g.id === editing.id) ?? null : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted">{m.zonesHint}</p>
        <button type="button" className="btn-neon text-sm" onClick={() => setEditing('new')}>
          + {m.addZone}
        </button>
      </div>

      {data.groups.length === 0 ? (
        <p className="hud p-6 text-muted">{m.zonesEmpty}</p>
      ) : (
        <ul className="space-y-3">
          {data.groups.map((g, i) => {
            const nums = g.stations.map((n) => index.get(n) ?? n);
            const summary = groupSummary({ ...g });
            return (
              <li
                key={g.id}
                className={`hud flex flex-wrap items-center gap-4 p-4 ${g.isVip ? 'shadow-[inset_0_0_0_1px_rgba(255,201,77,0.45)]' : ''}`}
              >
                {g.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.imageUrl} alt="" className="h-16 w-24 shrink-0 object-cover" />
                ) : (
                  <span className="grid h-16 w-24 shrink-0 place-items-center bg-void/60">
                    <StationIcon type={g.type} className={`h-7 w-8 ${g.isVip ? 'text-gold' : 'text-violet-soft'}`} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                    {groupName(g, locale) || m.unnamed}
                    {g.isVip && <span className="bg-gold px-1.5 py-px font-hud text-[10px] font-bold text-void">VIP</span>}
                  </p>
                  <p className="text-sm text-muted">
                    <bdi dir="ltr" className="font-hud text-ink">
                      {t.station.typeShort[g.type]} {numberRanges(nums, locale)}
                    </bdi>
                    {' · '}
                    {m.stationCount(nums.length)}
                  </p>
                  {summary && (
                    <p className="truncate text-xs text-muted">
                      <bdi dir="ltr">{summary}</bdi>
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton label={m.moveUp} onClick={() => i > 0 && action.run(`mv-${g.id}`, { action: 'moveGroup', id: g.id, by: -1 })}>
                    <path d="M12 19V5M6 11l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </IconButton>
                  <IconButton label={m.moveDown} onClick={() => i < data.groups.length - 1 && action.run(`mv-${g.id}`, { action: 'moveGroup', id: g.id, by: 1 })}>
                    <path d="M12 5v14M6 13l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </IconButton>
                  <IconButton label={m.edit} onClick={() => setEditing(g)}>
                    <path d="M4 20h4L19 9l-4-4L4 16v4z" strokeLinejoin="round" />
                  </IconButton>
                  <IconButton
                    label={confirm === g.id ? m.confirmRemoveZone : m.removeZone}
                    danger={confirm === g.id}
                    onClick={() => {
                      if (confirm !== g.id) return setConfirm(g.id);
                      setConfirm(null);
                      void action.run(`rmz-${g.id}`, { action: 'removeGroup', id: g.id });
                    }}
                  >
                    <path d="M5 7h14M10 11v6M14 11v6M7 7l1 13h8l1-13M9 7V4h6v3" strokeLinejoin="round" strokeLinecap="round" />
                  </IconButton>
                </div>
                {confirm === g.id && <p className="panel-in w-full text-xs text-busy">{m.confirmRemoveZone}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <ZoneEditor
          key={editing === 'new' ? 'new' : editing.id}
          locale={locale}
          slug={slug}
          m={m}
          zone={editing === 'new' ? null : current}
          data={data}
          setData={setData}
          action={action}
          onClose={() => setEditing(null)}
          onCreated={() => setBefore(new Set(data.groups.map((g) => g.id)))}
        />
      )}
    </div>
  );
}

function ZoneEditor({
  locale,
  slug,
  m,
  zone,
  data,
  setData,
  action,
  onClose,
  onCreated,
}: {
  locale: Locale;
  slug: string;
  m: ManageText;
  zone: ManageGroup | null;
  onCreated: () => void;
  data: ManageData;
  setData: (d: ManageData) => void;
  action: Action;
  onClose: () => void;
}) {
  const t = dictionary(locale);
  const ref = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState(() =>
    zone
      ? {
          ...BLANK_ZONE,
          ...zone,
          refreshHz: zone.refreshHz ? String(zone.refreshHz) : '',
          controllers: zone.controllers ? String(zone.controllers) : '',
        }
      : BLANK_ZONE,
  );
  const [picked, setPicked] = useState(() => new Set(zone?.stations ?? []));
  const [photoBusy, setPhotoBusy] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const { name } = stationNames(locale, data.stations);
  const ofType = data.stations.filter((s) => s.type === f.type);
  const isConsole = f.type !== 'PC';
  const { key, more } = fieldsFor(f.type);
  const textFields = [...key, ...more].filter((x): x is Exclude<SpecField, 'controllers'> => x !== 'controllers');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const otherZone = (s: ManageStation) => (s.groupId && s.groupId !== zone?.id ? data.groups.find((g) => g.id === s.groupId) : undefined);
  const num = (v: string) => (v.trim() ? Number(v) : null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { type, nameAr, nameEn, noteAr, noteEn, isVip, cpu, gpu, ram, storage, screen, keyboard, mouse, headset, chair } = f;
    const ok = await action.run('zone', {
      action: 'saveGroup',
      ...(zone ? { id: zone.id } : {}),
      type,
      nameAr,
      nameEn,
      noteAr,
      noteEn,
      isVip,
      cpu: isConsole ? '' : cpu,
      gpu: isConsole ? '' : gpu,
      ram: isConsole ? '' : ram,
      storage: isConsole ? '' : storage,
      screen,
      refreshHz: isConsole ? null : num(f.refreshHz),
      controllers: isConsole ? num(f.controllers) : null,
      keyboard: isConsole ? '' : keyboard,
      mouse: isConsole ? '' : mouse,
      headset,
      chair,
      stations: ofType.filter((s) => picked.has(s.pcNumber)).map((s) => s.pcNumber),
    });
    if (!ok) return;
    // A new zone stays open, so its photo can be added straight away.
    if (zone) onClose();
    else onCreated();
  }

  async function photo(file: File | null) {
    if (!zone) return;
    setPhotoBusy(true);
    action.setError(null);
    try {
      let res: Response;
      if (file) {
        const form = new FormData();
        form.set('kind', 'group');
        form.set('groupId', zone.id);
        form.set('file', file);
        res = await fetch(`/api/manage/${slug}/image`, { method: 'POST', body: form });
      } else {
        res = await fetch(`/api/manage/${slug}/image?kind=group&groupId=${zone.id}`, { method: 'DELETE' });
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) action.setError(m.errors[json.error] ?? m.errors.generic);
      else setData(json.data);
    } catch {
      action.setError(m.errors.generic);
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <dialog ref={ref} onClose={onClose} className="cr-modal m-auto w-[calc(100%-1.5rem)] max-w-2xl overflow-hidden bg-transparent p-0 text-ink">
      <form onSubmit={save} className="panel-in hud flex max-h-[calc(100dvh-4rem)] flex-col" style={{ background: '#0B0F24' }}>
        <h2 className="p-6 pb-3 font-display text-2xl font-bold text-ink">{zone ? m.zoneEdit : m.zoneNew}</h2>
        <div className="cr-scroll min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pb-4">
          <fieldset>
            <legend className="text-sm font-semibold text-ink">{m.type}</legend>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setF((x) => ({ ...x, type }))}
                  aria-pressed={f.type === type}
                  className={`city-option flex flex-col items-center gap-1 py-2 text-xs ${f.type === type ? 'city-option-on text-ink' : 'text-muted'}`}
                >
                  <StationIcon type={type} className="h-5 w-6" />
                  {t.station.typeShort[type]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={m.zoneNameAr} value={f.nameAr} onChange={set('nameAr')} maxLength={40} dir="rtl" placeholder="غرفة VIP" />
            <Field label={m.zoneNameEn} value={f.nameEn} onChange={set('nameEn')} maxLength={40} dir="ltr" placeholder="VIP room" />
            <TextArea label={m.zoneNoteAr} value={f.noteAr} onChange={set('noteAr')} maxLength={300} dir="rtl" />
            <TextArea label={m.zoneNoteEn} value={f.noteEn} onChange={set('noteEn')} maxLength={300} dir="ltr" />
          </div>

          <label className="flex cursor-pointer items-center gap-3 text-sm text-ink">
            <input type="checkbox" checked={f.isVip} onChange={(e) => setF((x) => ({ ...x, isVip: e.target.checked }))} className="h-4 w-4 accent-[#FFC94D]" />
            {m.vip}
          </label>

          <fieldset>
            <legend className="text-sm font-semibold text-ink">{m.hardware}</legend>
            <p className="mt-1 text-xs text-muted">{m.hardwareHint}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {textFields.map((k) => (
                <Field
                  key={k}
                  label={t.zones.fields[k]}
                  value={f[k]}
                  onChange={set(k)}
                  maxLength={60}
                  dir="ltr"
                  placeholder={k === 'screen' ? PLACEHOLDER[isConsole ? 'screenConsole' : 'screenPC'] : PLACEHOLDER[k]}
                />
              ))}
              {isConsole ? (
                <Field label={m.controllers} value={f.controllers} onChange={set('controllers')} inputMode="numeric" dir="ltr" placeholder="2" type="number" min={1} max={16} />
              ) : (
                <Field label={m.refreshHz} value={f.refreshHz} onChange={set('refreshHz')} inputMode="numeric" dir="ltr" placeholder="165" type="number" min={30} max={1000} />
              )}
            </div>
          </fieldset>

          <fieldset>
            <legend className="flex w-full items-center justify-between text-sm font-semibold text-ink">
              {m.stationsIn}
              {ofType.length > 0 && (
                <span className="flex gap-3 text-xs font-normal">
                  <button type="button" className="text-cyan hover:underline" onClick={() => setPicked(new Set(ofType.map((s) => s.pcNumber)))}>
                    {m.selectAll}
                  </button>
                  <button type="button" className="text-muted hover:text-ink hover:underline" onClick={() => setPicked(new Set())}>
                    {m.selectNone}
                  </button>
                </span>
              )}
            </legend>
            {ofType.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{m.noStationsOfType}</p>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ofType.map((s) => {
                  const on = picked.has(s.pcNumber);
                  const other = otherZone(s);
                  return (
                    <button
                      key={s.pcNumber}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setPicked((p) => {
                          const n = new Set(p);
                          if (n.has(s.pcNumber)) n.delete(s.pcNumber);
                          else n.add(s.pcNumber);
                          return n;
                        })
                      }
                      className={`city-option flex flex-col items-start px-3 py-2 text-start text-sm ${on ? 'city-option-on text-ink' : 'text-muted hover:text-ink'}`}
                    >
                      {name(s)}
                      {other && !on && <span className="truncate text-[11px] text-muted/80">{m.inOther(groupName(other, locale) || m.unnamed)}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>

          <div>
            <p className="text-sm font-semibold text-ink">{m.photo}</p>
            {zone ? (
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <div className="aspect-[16/9] w-48 overflow-hidden bg-void/70 shadow-[inset_0_0_0_1px_rgba(157,92,255,0.35)]">
                  {zone.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={zone.imageUrl} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <label className={`btn-ghost cursor-pointer text-sm ${photoBusy ? 'pointer-events-none opacity-60' : ''}`}>
                  {photoBusy ? m.uploading : zone.imageUrl ? m.change : m.upload}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      e.target.value = '';
                      if (file) void photo(file);
                    }}
                  />
                </label>
                {zone.imageUrl && (
                  <button type="button" className="text-xs text-muted hover:text-busy" disabled={photoBusy} onClick={() => photo(null)}>
                    {m.removeImage}
                  </button>
                )}
              </div>
            ) : null}
            <p className="mt-1.5 text-xs text-muted">{zone ? m.photoHint : m.photoAfterSave}</p>
          </div>

          {action.error && <p className="text-sm text-busy">{action.error}</p>}
        </div>
        <div className="flex gap-2 border-t border-line p-4 px-6">
          <button type="submit" className="btn-neon" disabled={!!action.busy}>
            {action.busy ? m.saving : m.save}
          </button>
          <button type="button" className="btn-ghost" onClick={onClose}>
            {m.cancel}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function TextArea({ label, ...props }: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <textarea
        {...props}
        rows={2}
        className="mt-1.5 w-full resize-none bg-void/70 px-3 py-2.5 text-ink placeholder:text-muted/60 shadow-[inset_0_0_0_1px_rgba(157,92,255,0.35)] outline-none focus:shadow-[inset_0_0_0_1px_rgba(41,224,255,0.8)]"
      />
    </label>
  );
}
