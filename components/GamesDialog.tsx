'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { GameView } from '@/lib/cafes';
import { dictionary, type Locale } from '@/lib/i18n';

// "Games (n)" button -> pop-up window with a search box and a grid of game
// boxes (cover + name). Without a cover, a tile is drawn from the name and
// genre, so no publisher artwork is needed.

const GENRE_HUES: Record<string, number> = {
  Shooter: 350,
  MOBA: 265,
  'Battle royale': 25,
  Sports: 140,
  Racing: 195,
  Fighting: 5,
  'Open world': 45,
  Strategy: 225,
  'Co-op': 300,
};

function hueFor(g: GameView): number {
  if (g.genreEn in GENRE_HUES) return GENRE_HUES[g.genreEn];
  let h = 0;
  for (const ch of g.slug) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => (/^\d+$/.test(w) ? w : w[0]))
    .join('')
    .toUpperCase();
}

function GameTile({
  game,
  leaving,
  tileRef,
}: {
  game: GameView;
  leaving: boolean;
  tileRef: (el: HTMLLIElement | null) => void;
}) {
  const hue = hueFor(game);
  return (
    <li ref={tileRef} className={`game-tile group flex min-w-0 flex-col ${leaving ? 'game-leave' : ''}`}>
      <div
        className="relative aspect-[3/4] overflow-hidden shadow-[inset_0_0_0_1px_rgba(157,92,255,0.35)] transition-transform duration-200 group-hover:-translate-y-0.5"
        style={{
          background: `linear-gradient(160deg, hsl(${hue} 80% 30%), hsl(${(hue + 40) % 360} 70% 12%) 70%)`,
        }}
      >
        {game.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={game.imageUrl} alt="" loading="lazy" className="h-full w-full object-contain p-[12%]" />
        ) : (
          <>
            {/* Grid lines, matching the site's floor. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)',
                backgroundSize: '14px 14px',
              }}
            />
            <span
              aria-hidden="true"
              dir="ltr"
              className="absolute inset-0 grid place-items-center font-hud text-xl font-bold tracking-wider text-white/90 sm:text-3xl drop-shadow-[0_0_14px_rgba(255,255,255,0.35)]"
            >
              {initials(game.name)}
            </span>
          </>
        )}
      </div>
      <p dir="ltr" className="mt-2 line-clamp-2 text-center text-xs font-semibold leading-tight text-ink sm:text-sm">
        {game.name}
      </p>
    </li>
  );
}

export default function GamesDialog({
  locale,
  arenaName,
  games,
  className = '',
}: {
  locale: Locale;
  arenaName: string;
  games: GameView[];
  className?: string;
}) {
  const t = dictionary(locale);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  // Lock the window's height to its size with every game showing, so it does
  // not shrink and jump while searching. Released when it closes.

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Lock the window's height to its size with every game showing, so it
      // does not shrink and jump while searching. Released when it closes
      // (the panel is rebuilt on every open).
      const panel = panelRef.current;
      if (panel) panel.style.height = `${panel.getBoundingClientRect().height}px`;
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return games;
    return games.filter((g) => [g.name, g.genreEn, g.genreAr].some((v) => v.toLowerCase().includes(q)));
  }, [games, query]);

  return (
    <>
      <button
        type="button"
        className={`btn-ghost whitespace-nowrap text-sm ${className}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-cyan" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M7 9h4M9 7v4M15.5 10h.01M17.5 12h.01" strokeLinecap="round" />
          <path d="M6.5 5h11A4.5 4.5 0 0 1 22 9.5v5a3.5 3.5 0 0 1-6.3 2.1L14.5 15h-5l-1.2 1.6A3.5 3.5 0 0 1 2 14.5v-5A4.5 4.5 0 0 1 6.5 5z" />
        </svg>
        {t.games.button(games.length)}
      </button>
      <dialog
        ref={dialogRef}
        aria-label={t.games.title(arenaName)}
        onClose={() => {
          setOpen(false);
          setQuery('');
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
        className="cr-modal m-auto max-h-[92vh] w-[calc(100%-1.5rem)] max-w-4xl overflow-clip bg-transparent p-0 text-ink"
      >
        {open && (
          <div ref={panelRef} className="panel-in hud flex max-h-[92vh] flex-col p-5 sm:p-7" style={{ background: '#0B0F24' }}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-display text-2xl font-extrabold text-ink neon sm:text-3xl">{t.games.title(arenaName)}</h2>
                <p className="mt-1 text-sm text-muted">{t.games.count(games.length)}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-11 w-11 shrink-0 place-items-center text-muted hover:text-ink"
                aria-label={t.games.close}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {games.length > 0 && (
              <label className="scan-field mt-4 flex items-center gap-3 px-4">
                <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-violet-soft" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="M20 20l-4.2-4.2" strokeLinecap="round" />
                </svg>
                <span className="sr-only">{t.games.search}</span>
                <input
                  type="text"
                  inputMode="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    // Escape clears first; a second Escape closes the window.
                    if (e.key === 'Escape' && query) {
                      e.preventDefault();
                      setQuery('');
                    }
                  }}
                  placeholder={t.games.search}
                  className="min-w-0 flex-1 bg-transparent py-2.5 text-ink placeholder:text-muted/70 outline-none"
                />
                <span className="shrink-0 font-hud text-xs text-muted" aria-live="polite">
                  {shown.length}/{games.length}
                </span>
              </label>
            )}
            <div className="-mx-1 mt-5 min-h-0 flex-1 overflow-y-auto px-1 pb-1 cr-scroll">
              {games.length === 0 ? (
                <p className="py-8 text-muted">{t.games.empty}</p>
              ) : (
                <GameGrid games={shown} noneText={t.games.none} />
              )}
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

const LEAVE_MS = 170;
const MOVE_MS = 360;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/**
 * Grid that animates filtering: tiles that drop out fade and shrink first,
 * the rest glide to their new places (FLIP), and new ones pop in.
 * Only transform and opacity animate.
 */
function GameGrid({ games, noneText }: { games: GameView[]; noneText: string }) {
  const [display, setDisplay] = useState(games);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const tiles = useRef(new Map<string, HTMLLIElement>());
  const lastRects = useRef(new Map<string, DOMRect>());
  const grid = useRef<HTMLUListElement>(null);
  const firstPaint = useRef(true);

  useEffect(() => {
    const keep = new Set(games.map((g) => g.slug));
    const out = display.filter((g) => !keep.has(g.slug)).map((g) => g.slug);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (out.length === 0 || reduce) {
      setLeaving(new Set());
      setDisplay(games);
      return;
    }
    setLeaving(new Set(out));
    const timer = setTimeout(() => {
      setLeaving(new Set());
      setDisplay(games);
    }, LEAVE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games]);

  useLayoutEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const origin = grid.current?.getBoundingClientRect();
    const next = new Map<string, DOMRect>();
    let entering = 0;
    for (const g of display) {
      const el = tiles.current.get(g.slug);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const rel = new DOMRect(r.left - (origin?.left ?? 0), r.top - (origin?.top ?? 0), r.width, r.height);
      next.set(g.slug, rel);
      if (reduce) continue;
      const before = lastRects.current.get(g.slug);
      if (before) {
        const dx = before.left - rel.left;
        const dy = before.top - rel.top;
        if (dx || dy) {
          el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
            duration: MOVE_MS,
            easing: EASE,
          });
        }
      } else if (!firstPaint.current) {
        el.animate(
          [
            { opacity: 0, transform: 'scale(0.85) translateY(8px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 300, easing: EASE, delay: Math.min(entering++, 10) * 25, fill: 'backwards' },
        );
      }
    }
    lastRects.current = next;
    firstPaint.current = false;
  }, [display]);

  if (display.length === 0) {
    return <p className="panel-in py-8 text-muted">{noneText}</p>;
  }
  return (
    <ul ref={grid} className="relative grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-5">
      {display.map((g) => (
        <GameTile
          key={g.slug}
          game={g}
          leaving={leaving.has(g.slug)}
          tileRef={(el) => {
            if (el) tiles.current.set(g.slug, el);
            else tiles.current.delete(g.slug);
          }}
        />
      ))}
    </ul>
  );
}
