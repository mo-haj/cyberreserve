'use client';

// "Who is playing?" for a walk-in: a guest (optional name) or a player with an
// account. Names reach only players this arena knows; anyone else by phone.
import { useEffect, useState } from 'react';
import PlayerBadge from '@/components/PlayerBadge';
import type { Locale } from '@/lib/i18n';
import type { ManageText } from '@/lib/i18n-manage';
import type { PlayerPick } from '@/lib/manage/service';

export type Who = { kind: 'guest'; name: string } | { kind: 'player'; player: PlayerPick | null };

export function WhoPicker({ m, locale, slug, value, onChange }: { m: ManageText; locale: Locale; slug: string; value: Who; onChange: (w: Who) => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<PlayerPick[] | null>(null);
  const searching = value.kind === 'player' && !value.player;

  useEffect(() => {
    if (!searching) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/manage/${slug}?players=${encodeURIComponent(q)}`, { signal: ctl.signal });
        setFound(res.ok ? await res.json() : []);
      } catch {
        /* aborted */
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [q, searching, slug]);

  const tab = (k: Who['kind'], label: string) => (
    <button
      type="button"
      aria-pressed={value.kind === k}
      onClick={() => value.kind !== k && onChange(k === 'guest' ? { kind: 'guest', name: '' } : { kind: 'player', player: null })}
      className={`city-option flex-1 py-1.5 text-xs ${value.kind === k ? 'city-option-on text-ink' : 'text-muted hover:text-ink'}`}
    >
      {label}
    </button>
  );

  const input =
    'w-full bg-void/70 px-3 py-2 text-sm text-ink placeholder:text-muted/50 shadow-[inset_0_0_0_1px_rgba(157,92,255,0.35)] outline-none focus:shadow-[inset_0_0_0_1px_rgba(41,224,255,0.8)]';

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-ink">{m.whoTitle}</p>
      <div className="flex gap-1.5">
        {tab('guest', m.whoGuest)}
        {tab('player', m.whoPlayer)}
      </div>

      {value.kind === 'guest' && (
        <input
          aria-label={m.guestName}
          value={value.name}
          maxLength={40}
          placeholder={`${m.guestName}: ${m.guestPh}`}
          onChange={(e) => onChange({ kind: 'guest', name: e.target.value })}
          className={input}
        />
      )}

      {value.kind === 'player' && value.player && (
        <div className="flex items-center gap-2 bg-violet/10 px-3 py-2 shadow-[inset_0_0_0_1px_rgba(157,92,255,0.5)]">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-sm text-ink">
              <bdi>{value.player.name}</bdi>
              {value.player.badge && <PlayerBadge kind={value.player.badge} locale={locale} />}
            </p>
            <p className="text-[0.6875rem] text-muted">{m.playerNotify}</p>
          </div>
          <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => onChange({ kind: 'player', player: null })}>
            {m.playerChange}
          </button>
        </div>
      )}

      {searching && (
        <>
          <input autoFocus aria-label={m.playerSearch} value={q} placeholder={m.playerSearch} onChange={(e) => setQ(e.target.value)} className={input} />
          {found && found.length > 0 && (
            <ul className="max-h-44 space-y-1 overflow-y-auto">
              {found.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onChange({ kind: 'player', player: p })}
                    className="flex w-full items-center gap-2 bg-void/50 px-3 py-1.5 text-start hover:bg-violet/15"
                  >
                    <bdi className="truncate text-sm text-ink">{p.name}</bdi>
                    {p.badge && <PlayerBadge kind={p.badge} locale={locale} />}
                    {p.fullName && p.fullName !== p.name && <bdi className="truncate text-xs text-muted">{p.fullName}</bdi>}
                    {p.phoneEnd && (
                      <span dir="ltr" className="ms-auto shrink-0 font-hud text-[0.6875rem] text-muted">
                        ···{p.phoneEnd}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {found && found.length === 0 && <p className="text-xs text-muted">{m.playerNone}</p>}
          <p className="text-[0.6875rem] leading-relaxed text-muted/80">{m.playerHint}</p>
        </>
      )}
    </div>
  );
}

export function whoBody(w: Who): Record<string, string> {
  if (w.kind === 'player' && w.player) return { playerId: w.player.id };
  if (w.kind === 'guest' && w.name.trim()) return { guestName: w.name.trim() };
  return {};
}
