'use client';

// Reorderable lists in the dashboard (zones, posts): tap a row to edit it,
// hold and drag it to move it. The picked row lifts (bigger, glow, shadow),
// follows the pointer and the others slide aside; the new order is saved on
// release. With a mouse the whole row drags; on a phone, the ⠿ grip does (so
// dragging never fights scrolling the page); ↑ / ↓ on the grip work too.
import { useEffect, useRef, useState } from 'react';

const HOLD_MS = 180; // press this long without moving and the row lifts

type View = { id: string; from: number; to: number; dy: number; step: number };

export function useDragOrder<T extends { id: string }>({
  items,
  onSave,
  onOpen,
  onMove,
}: {
  items: T[];
  /** The new order of every id, after a drag. */
  onSave: (ids: string[]) => void;
  /** A tap (or Enter) on a row. */
  onOpen: (item: T) => void;
  /** ↑ / ↓ from the keyboard on the grip. */
  onMove: (id: string, by: -1 | 1) => void;
}) {
  // The order on screen after a drop, until the saved order comes back.
  const [order, setOrder] = useState<string[] | null>(null);
  const saved = items.map((x) => x.id).join(',');
  useEffect(() => setOrder(null), [saved]);
  const shown = order ? order.map((id) => items.find((x) => x.id === id)).filter((x): x is T => !!x) : items;

  const [view, setView] = useState<View | null>(null);
  const [pressing, setPressing] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const justDragged = useRef(false);
  const drag = useRef<{
    id: string;
    y0: number;
    lifted: boolean;
    timer: number;
    boxes: { top: number; height: number }[];
    from: number;
    to: number;
    step: number;
  } | null>(null);
  // Latest values for the window listeners (they outlive a render).
  const latest = useRef({ saved, shown, onSave });
  latest.current = { saved, shown, onSave };

  const lift = () => {
    const d = drag.current;
    if (!d || d.lifted) return;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-drag-row]') ?? []);
    d.boxes = rows.map((r) => {
      const b = r.getBoundingClientRect();
      return { top: b.top, height: b.height };
    });
    d.from = rows.findIndex((r) => r.dataset.dragRow === d.id);
    if (d.from < 0) return;
    d.to = d.from;
    // How far a neighbour slides: the picked row's height plus the gap.
    const next = d.boxes[d.from + 1] ?? null;
    const prev = d.boxes[d.from - 1] ?? null;
    d.step = next ? next.top - d.boxes[d.from].top : prev ? d.boxes[d.from].top - prev.top : d.boxes[d.from].height;
    d.lifted = true;
    setPressing(null);
    setView({ id: d.id, from: d.from, to: d.from, dy: 0, step: d.step });
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  };

  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y0;
    if (!d.lifted) {
      if (Math.abs(dy) < 6) return; // still a press, or a tap
      window.clearTimeout(d.timer);
      lift();
      if (!drag.current?.lifted) return;
    }
    e.preventDefault();
    const centre = d.boxes[d.from].top + d.boxes[d.from].height / 2 + dy;
    let to = 0;
    d.boxes.forEach((b, k) => {
      if (k !== d.from && b.top + b.height / 2 < centre) to += 1;
    });
    d.to = to;
    setView({ id: d.id, from: d.from, to, dy, step: d.step });
  };

  const end = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    const d = drag.current;
    drag.current = null;
    setPressing(null);
    if (!d) return;
    window.clearTimeout(d.timer);
    if (!d.lifted) return; // a tap: the row's onClick opens it
    // A lift, even without moving, is not a tap.
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 0);
    setView(null);
    if (d.to === d.from) return;
    const { saved: was, shown: now, onSave: save } = latest.current;
    const ids = now.map((x) => x.id);
    const [picked] = ids.splice(d.from, 1);
    ids.splice(d.to, 0, picked);
    setOrder(ids);
    if (ids.join(',') !== was) save(ids);
  };

  const start = (e: React.PointerEvent, id: string, instant: boolean) => {
    if (e.button !== 0 || drag.current) return;
    drag.current = { id, y0: e.clientY, lifted: false, timer: 0, boxes: [], from: 0, to: 0, step: 0 };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    if (instant) return lift();
    setPressing(id); // the row sinks a little at once…
    drag.current.timer = window.setTimeout(lift, HOLD_MS); // …and lifts after a short hold
  };

  const style = (i: number, id: string): React.CSSProperties | undefined => {
    if (!view) return pressing === id ? { transform: 'scale(0.985)', transition: 'transform 150ms ease-out' } : undefined;
    if (id === view.id) {
      return {
        transform: `translateY(${view.dy}px) scale(1.025)`,
        transition: 'transform 0ms',
        zIndex: 20,
        position: 'relative',
        // On the row (not the clipped card inside), so the shadow shows.
        filter: 'drop-shadow(0 16px 22px rgba(0,0,0,0.6)) drop-shadow(0 0 14px rgba(157,92,255,0.45))',
        cursor: 'grabbing',
      };
    }
    let shift = 0;
    if (view.from < view.to && i > view.from && i <= view.to) shift = -view.step;
    if (view.to < view.from && i >= view.to && i < view.from) shift = view.step;
    return { transform: `translateY(${shift}px)`, transition: 'transform 180ms cubic-bezier(0.2, 0, 0, 1)' };
  };

  /** Props for each row (<li>). */
  const rowProps = (item: T, i: number, label: string) => ({
    'data-drag-row': item.id,
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': label,
    onClick: () => !justDragged.current && onOpen(item),
    onKeyDown: (e: React.KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
        e.preventDefault();
        onOpen(item);
      }
    },
    onPointerDown: (e: React.PointerEvent) => e.pointerType === 'mouse' && start(e, item.id, false),
    style: style(i, item.id),
    className: 'group/drag cursor-pointer select-none focus-visible:outline-none',
  });

  /** Props for the ⠿ grip inside the row. */
  const gripProps = (item: T, i: number, label: string) => ({
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': label,
    title: label,
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onKeyDown: (e: React.KeyboardEvent) => {
      e.stopPropagation();
      const by = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      if (!by) return;
      e.preventDefault();
      if (i + by >= 0 && i + by < shown.length) onMove(item.id, by);
    },
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      start(e, item.id, true); // from the grip it lifts at once
    },
  });

  /** Is this row the one being dragged (for its card's colours)? */
  const lifted = (id: string) => view?.id === id;

  return { shown, listRef, rowProps, gripProps, lifted };
}

/** The ⠿ handle. */
export function DragGrip(props: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...props}
      className="grid h-10 w-7 shrink-0 cursor-grab touch-none place-items-center text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
    >
      <svg viewBox="0 0 10 16" className="h-4 w-2.5" fill="currentColor" aria-hidden="true">
        <circle cx="2" cy="2" r="1.5" />
        <circle cx="8" cy="2" r="1.5" />
        <circle cx="2" cy="8" r="1.5" />
        <circle cx="8" cy="8" r="1.5" />
        <circle cx="2" cy="14" r="1.5" />
        <circle cx="8" cy="14" r="1.5" />
      </svg>
    </span>
  );
}

/** Card classes for a row's inner card while it is lifted / hovered / focused. */
export const dragCard = (lifted: boolean) =>
  `group-hover/drag:bg-violet/[0.06] group-focus-visible/drag:ring-2 group-focus-visible/drag:ring-cyan ${lifted ? '!bg-panel2 shadow-[inset_0_0_0_2px_#9D5CFF]' : ''}`;

/** Buttons inside a row (edit, delete) must not open or drag it. */
export const stopRow = {
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
};
