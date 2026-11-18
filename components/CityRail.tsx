'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// Sliding city picker: a horizontal rail of chips with a neon "puck" that
// glides to the chosen city. Swipe on phones, arrows on mouse devices.
// Only transform/opacity animate, so it stays smooth on weak devices.

export interface RailItem {
  key: string;
  label: string;
  count: number;
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export default function CityRail({
  items,
  value,
  onChange,
  label,
  prevLabel,
  nextLabel,
}: {
  /** First item is "All Syria" (key ""). */
  items: RailItem[];
  value: string;
  onChange: (key: string) => void;
  label: string;
  prevLabel: string;
  nextLabel: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const chips = useRef(new Map<string, HTMLButtonElement>());
  const [puck, setPuck] = useState<{ x: number; w: number } | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = chips.current.get(value);
    if (el) setPuck({ x: el.offsetLeft, w: el.offsetWidth });
    const s = scroller.current;
    if (s) {
      // scrollLeft is negative in RTL in modern browsers: use its size.
      const pos = Math.abs(s.scrollLeft);
      const max = s.scrollWidth - s.clientWidth;
      setEdges({ start: pos > 4, end: pos < max - 4 });
    }
  }, [value]);

  useIsoLayoutEffect(() => {
    measure();
  }, [measure, items]);

  useEffect(() => {
    const s = scroller.current;
    if (!s) return;
    const ro = new ResizeObserver(measure);
    ro.observe(s);
    s.addEventListener('scroll', measure, { passive: true });
    return () => {
      ro.disconnect();
      s.removeEventListener('scroll', measure);
    };
  }, [measure]);

  const first = useRef(true);
  useEffect(() => {
    // Centre the chosen chip in the rail (also when it came from the URL or
    // the saved city). Scrolls the rail only, never the page.
    const s = scroller.current;
    const el = chips.current.get(value);
    if (!s || !el) return;
    const sr = s.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const delta = er.left + er.width / 2 - (sr.left + sr.width / 2);
    s.scrollBy({ left: delta, behavior: first.current ? 'auto' : 'smooth' });
    first.current = false;
  }, [value]);

  function nudge(dir: 1 | -1) {
    const s = scroller.current;
    if (!s) return;
    const rtl = getComputedStyle(s).direction === 'rtl';
    s.scrollBy({ left: dir * (rtl ? -1 : 1) * s.clientWidth * 0.7, behavior: 'smooth' });
  }

  function onKey(e: React.KeyboardEvent) {
    const i = items.findIndex((it) => it.key === value);
    const rtl = scroller.current && getComputedStyle(scroller.current).direction === 'rtl';
    const fwd = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    let next = -1;
    if (e.key === fwd) next = Math.min(items.length - 1, i + 1);
    if (e.key === back) next = Math.max(0, i - 1);
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(items[next].key);
    chips.current.get(items[next].key)?.focus();
  }

  return (
    <div className="city-rail relative" data-start={edges.start} data-end={edges.end}>
      <div
        ref={scroller}
        role="radiogroup"
        aria-label={label}
        onKeyDown={onKey}
        className="city-rail-track relative flex gap-1.5 overflow-x-auto scroll-smooth py-1.5"
      >
        {/* The puck: one element that glides between chips. */}
        {puck && (
          <span
            aria-hidden="true"
            className="city-puck pointer-events-none absolute left-0 top-1.5 bottom-1.5"
            style={{ width: puck.w, transform: `translateX(${puck.x}px)` }}
          />
        )}
        {items.map((it) => {
          const active = it.key === value;
          return (
            <button
              key={it.key || 'all'}
              ref={(el) => {
                if (el) chips.current.set(it.key, el);
                else chips.current.delete(it.key);
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(it.key)}
              className={`city-chip relative z-10 flex shrink-0 items-center gap-2 whitespace-nowrap px-3.5 py-2 text-sm transition-colors duration-300 ${
                active ? 'text-ink' : it.count > 0 ? 'text-muted hover:text-ink' : 'text-muted/45 hover:text-muted'
              }`}
            >
              {it.label}
              <span
                className={`min-w-[1.4rem] px-1 text-center font-hud text-xs leading-5 transition-colors duration-300 ${
                  active ? 'bg-cyan/20 text-cyan' : it.count > 0 ? 'bg-free/10 text-free' : 'bg-line/60 text-muted/50'
                }`}
              >
                {it.count}
              </span>
            </button>
          );
        })}
      </div>
      <button type="button" tabIndex={-1} aria-label={prevLabel} onClick={() => nudge(-1)} className="rail-arrow rail-arrow-start">
        <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button type="button" tabIndex={-1} aria-label={nextLabel} onClick={() => nudge(1)} className="rail-arrow rail-arrow-end">
        <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
