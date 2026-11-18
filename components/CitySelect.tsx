"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CITIES } from "@/lib/cities";
import { pick, type Locale } from "@/lib/i18n";

// A dropdown in the site's style (the browser's own <select> list cannot be
// styled). The list is drawn on top of the page (a portal with fixed
// position), so the angled corners of the panel around it can't cut it off. Keyboard: arrows, Home/End, Enter/Space, Escape; type a letter to jump.

export default function CitySelect({
  locale,
  value,
  onChange,
  label,
  invalid = false,
  describedBy,
}: {
  locale: Locale;
  value: string;
  onChange: (key: string) => void;
  label: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  // Where the list goes: under the button, or above it when there is more
  // room there; its height fits the room (all 14 cities when they fit).
  const [place, setPlace] = useState<{ cols: number; left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [active, setActive] = useState(
    Math.max(
      0,
      CITIES.findIndex((c) => c.key === value),
    ),
  );
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const current = CITIES.find((c) => c.key === value);
  const name = (i: number) => pick(locale, CITIES[i].en, CITIES[i].ar);

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const r = button.current?.getBoundingClientRect();
      if (!r) return;
      const gap = 6;
      const margin = 12;
      const below = window.innerHeight - r.bottom - gap - margin;
      const above = r.top - gap - margin;
      // Two columns when the box is wide enough: all 14 cities without scrolling.
      const cols = r.width >= 320 ? 2 : 1;
      const want = Math.ceil(CITIES.length / cols) * 38 + 10;
      const down = below >= Math.min(want, 240) || below >= above;
      setPlace({
        cols,
        left: r.left,
        width: r.width,
        ...(down ? { top: r.bottom + gap } : { bottom: window.innerHeight - r.top + gap }),
        maxH: Math.max(140, Math.min(want, down ? below : above)),
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!root.current?.contains(t) && !list.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  useEffect(() => {
    if (open)
      list.current
        ?.querySelector<HTMLElement>(`[data-i="${active}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function choose(i: number) {
    onChange(CITIES[i].key);
    setActive(i);
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent) {
    const last = CITIES.length - 1;
    if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    // Up/down move a row (two cities in two columns); left/right move one,
    // in reading order (so ← is "next" in Arabic).
    const cols = place?.cols ?? 1;
    const next = locale === "ar" ? "ArrowLeft" : "ArrowRight";
    const prev = locale === "ar" ? "ArrowRight" : "ArrowLeft";
    const move = {
      ArrowDown: active + cols,
      ArrowUp: active - cols,
      [next]: active + 1,
      [prev]: active - 1,
      Home: 0,
      End: last,
    }[e.key];
    if (move !== undefined) {
      e.preventDefault();
      setActive(Math.min(last, Math.max(0, move)));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
    } else if (e.key.length === 1) {
      const i = CITIES.findIndex((_, k) =>
        name(k).toLowerCase().startsWith(e.key.toLowerCase()),
      );
      if (i >= 0) setActive(i);
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={label}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        ref={button}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
        className={`flex w-full items-center justify-center gap-2 bg-void/70 px-4 py-2 text-ink outline-none transition-shadow ${
          invalid
            ? "shadow-[inset_0_0_0_1px_rgba(255,45,85,0.9)]"
            : open
              ? "shadow-[inset_0_0_0_1px_rgba(41,224,255,0.8)]"
              : "shadow-[inset_0_0_0_1px_rgba(157,92,255,0.35)] focus-visible:shadow-[inset_0_0_0_1px_rgba(41,224,255,0.8)]"
        }`}
      >
        <span className="flex-1 text-center">
          {current ? pick(locale, current.en, current.ar) : "—"}
        </span>
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 shrink-0 text-violet-soft transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && place && createPortal(
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          dir={locale === "ar" ? "rtl" : "ltr"}
          className={`panel-in cr-scroll fixed z-[60] grid content-start gap-0.5 overflow-y-auto p-1 ${place.cols === 2 ? "grid-cols-2" : "grid-cols-1"} shadow-[inset_0_0_0_1px_rgba(41,224,255,0.5),0_18px_40px_-12px_rgba(0,0,0,0.9)]`}
          style={{ background: "#0B0F24", left: place.left, width: place.width, top: place.top, bottom: place.bottom, maxHeight: place.maxH }}
        >
          {CITIES.map((c, i) => {
            const selected = c.key === value;
            return (
              <li
                key={c.key}
                id={`${id}-${i}`}
                data-i={i}
                role="option"
                aria-selected={selected}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={`flex cursor-pointer items-center justify-center gap-2 h-9 px-3 text-center text-sm transition-colors ${
                  i === active ? "bg-violet/25 text-ink" : "text-muted"
                } ${selected ? "font-semibold text-cyan" : ""}`}
              >
                {selected && <span aria-hidden="true">✓</span>}
                {name(i)}
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </div>
  );
}
