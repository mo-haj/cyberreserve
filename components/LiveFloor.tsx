'use client';

import { useEffect, useState } from 'react';
import type { PcStatus, PcView, StatusCounts } from '@/lib/availability';
import BookingSheet from '@/components/BookingSheet';
import { StationIcon } from '@/components/StationIcons';
import { groupName, type GroupView } from '@/lib/groups';
import { dictionary, type Locale } from '@/lib/i18n';
import { formatDamascusTime } from '@/lib/time';

// The live station map: one tile per PC (green = free, red = in use, grey =
// out of service). Press a tile to see its details. Polls every 5 seconds
// (project convention: polling, no sockets) and pauses while the tab is hidden.

export { ConsoleIcon, MonitorIcon, StationIcon } from '@/components/StationIcons';

export interface LiveData {
  at: string;
  counts: StatusCounts;
  pcs: PcView[];
}

const POLL_MS = 5000;

const TILE: Record<PcStatus, string> = {
  free: 'text-free bg-free/[0.08] shadow-[inset_0_0_0_1px_rgba(43,255,136,0.55),0_0_22px_-8px_rgba(43,255,136,0.9)] hover:bg-free/[0.16]',
  busy: 'text-busy bg-busy/[0.08] shadow-[inset_0_0_0_1px_rgba(255,45,85,0.55),0_0_22px_-8px_rgba(255,45,85,0.9)] hover:bg-busy/[0.16]',
  maintenance: 'text-off bg-panel2/40 shadow-[inset_0_0_0_1px_rgba(74,82,121,0.7)] hover:bg-panel2/70',
};

export function Legend({ locale, className = '' }: { locale: Locale; className?: string }) {
  const t = dictionary(locale);
  return (
    <ul className={`flex flex-wrap gap-2 text-xs ${className}`}>
      {(['free', 'busy', 'maintenance'] as PcStatus[]).map((s) => (
        <li key={s} className={`legend-chip legend-${s} flex items-center gap-2 rounded-full px-3 py-1`}>
          <span className="legend-dot h-2 w-2 rounded-full" aria-hidden="true" />
          {t.status[s]}
        </li>
      ))}
    </ul>
  );
}

export default function LiveFloor({
  slug,
  initial,
  locale,
  signedIn,
  profileComplete = false,
  size = 'full',
  loginHref = '/login',
  groups: zones = [],
}: {
  slug: string;
  /** Data rendered on the server; null means "fetch right away". */
  initial: LiveData | null;
  locale: Locale;
  signedIn: boolean;
  profileComplete?: boolean;
  size?: 'compact' | 'full';
  loginHref?: string;
  /** Arena zones, so the booking popup can show the station's hardware. */
  groups?: GroupView[];
}) {
  const t = dictionary(locale);
  const [data, setData] = useState<LiveData | null>(initial);
  const [stale, setStale] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Switching arenas: show its server data if we have it, otherwise "loading".
    setSelected(null);
    setData(initial);
    setStale(false);
    async function poll() {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/arenas/${encodeURIComponent(slug)}/status`, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as LiveData;
        if (!cancelled) {
          setData(next);
          setStale(false);
        }
      } catch {
        if (!cancelled) setStale(true);
      }
    }
    if (!initial) void poll();
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', poll);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
    // initial only seeds the first render of a slug
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (!data) {
    return <p className="py-10 text-center text-muted">{t.live.loading}</p>;
  }

  const compact = size === 'compact';
  // Compact (home preview): small fixed-height stations, 8 per row on wide
  // screens, and room reserved for 3 rows, so switching between arenas of
  // 10, 12 or 20 PCs never changes the panel's size.
  const cols = compact
    ? 'grid-cols-7 xl:grid-cols-8 content-start'
    : data.pcs.length > 12
      ? 'grid-cols-4 sm:grid-cols-5 xl:grid-cols-10'
      : 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6';
  const pc = selected === null ? null : data.pcs.find((p) => p.pcNumber === selected) ?? null;
  // One group per zone (Main hall, VIP...) or, for stations without a zone,
  // per type (PCs, PS5...), in the order the server sends.
  // The small home preview keeps one grid (icons still show the type).
  const groups: { key: string; type: string; zone: GroupView | null; pcs: PcView[] }[] = compact
    ? [{ key: 'ALL', type: 'ALL', zone: null, pcs: data.pcs }]
    : [];
  for (const p of compact ? [] : data.pcs) {
    const zone = (p.groupId && zones.find((z) => z.id === p.groupId)) || null;
    const key = zone ? `z:${zone.id}` : `t:${p.type}`;
    const g = groups.find((x) => x.key === key);
    if (g) g.pcs.push(p);
    else groups.push({ key, type: p.type, zone, pcs: [p] });
  }
  // Keep a type's zones together, VIP after the normal ones.
  const typeOrder: string[] = [...new Set(data.pcs.map((p) => p.type as string))];
  groups.sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type) || Number(!!a.zone?.isVip) - Number(!!b.zone?.isVip));
  const order = new Map(data.pcs.map((p, i) => [p.pcNumber, i]));

  return (
    <div>
      <div className={`${compact ? 'min-h-[15rem] space-y-3' : 'space-y-5'}`} aria-label={t.station.gridLabel}>
        {groups.map((g) => (
          <section key={g.key} aria-label={g.zone ? groupName(g.zone, locale) || t.station.typeTitle[g.type] : t.station.typeTitle[g.type]}>
            {/* Group titles only when the arena has more than one kind of station. */}
            {groups.length > 1 && (
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                <StationIcon type={g.type} className="h-4 w-5 text-violet-soft" />
                {g.zone ? groupName(g.zone, locale) || t.station.typeTitle[g.type] : t.station.typeTitle[g.type]}
                {g.zone?.isVip && (
                  <span className="bg-amber-400/20 px-1.5 text-[0.65rem] font-bold leading-4 text-amber-200 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.7)]">
                    VIP
                  </span>
                )}
                <span className="font-hud text-xs font-normal text-free">
                  {g.pcs.filter((p) => p.status === 'free').length}/{g.pcs.length}
                </span>
                {!compact && g.pcs[0]?.hourlyRate && (
                  <span className="ms-auto font-normal text-muted">{t.station.perHour(g.pcs[0].hourlyRate)}</span>
                )}
              </h3>
            )}
            <ol className={`grid gap-2.5 sm:gap-3 ${cols}`}>
              {g.pcs.map((p) => {
                const i = order.get(p.pcNumber) ?? 0;
                const until = p.status === 'busy' && p.busyUntil ? formatDamascusTime(new Date(p.busyUntil)) : null;
                const name = t.station.name(p.type, p.typeIndex);
                const label = `${name}: ${until ? t.station.busyUntil(until) : t.status[p.status]}`;
                return (
                  <li key={p.pcNumber} style={{ animationDelay: `${150 + i * 40}ms` }} className="station-on">
                    <button
                      type="button"
                      onClick={() => setSelected(p.pcNumber)}
                      aria-pressed={selected === p.pcNumber}
                      aria-label={label}
                      title={label}
                      className={`relative flex w-full flex-col items-center justify-center gap-1 px-1 py-2.5 transition-[background-color,box-shadow,color] duration-700 [clip-path:polygon(8px_0,100%_0,100%_calc(100%-8px),calc(100%-8px)_100%,0_100%,0_8px)] ${compact ? 'h-[4.5rem]' : 'aspect-[4/3.4]'} ${TILE[p.status]} ${selected === p.pcNumber ? 'ring-2 ring-inset ring-cyan' : ''}`}
                    >
                      <span className={`absolute start-2 top-1.5 font-hud font-bold leading-none ${compact ? 'text-xs' : 'text-sm'}`}>
                        {String(p.typeIndex).padStart(2, '0')}
                      </span>
                      <StationIcon type={p.type} className={compact ? 'mt-2 h-7 w-8' : 'mt-3 h-9 w-10 sm:h-11 sm:w-12'} />
                      {!compact && (
                        <span className="text-[11px] leading-tight text-ink/75">{until ? t.station.until(until) : t.status[p.status]}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>

      {pc && (
        <BookingSheet
          key={pc.pcNumber}
          locale={locale}
          slug={slug}
          station={pc}
          group={zones.find((g) => g.id === pc.groupId) ?? null}
          viewer={{ signedIn, profileComplete }}
          loginHref={loginHref}
          onClose={() => setSelected(null)}
        />
      )}

      <p className="mt-3 flex items-center gap-2 text-xs text-muted" aria-live="polite">
        {stale ? (
          <>
            <span className="h-2 w-2 rounded-full bg-violet" aria-hidden="true" />
            {t.live.paused}
          </>
        ) : (
          <>
            <span className="live-dot h-2 w-2 rounded-full bg-free shadow-[0_0_8px_#2BFF88]" aria-hidden="true" />
            <span>{t.live.updated(formatDamascusTime(new Date(data.at)))}</span>
            <span className="hidden ps-3 sm:inline">{t.station.pressHint}</span>
          </>
        )}
      </p>
    </div>
  );
}
