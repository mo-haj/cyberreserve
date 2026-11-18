'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

// Phone menu: the ☰ button opens a panel under the header. Closes with the
// button, Escape, a tap outside, or after following a link in it.

export default function MobileMenu({
  label,
  closeLabel,
  children,
}: {
  label: string;
  closeLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => {
      // Taps inside an open pop-up window (How it works) do not count as "outside".
      const target = e.target as Element | null;
      if (target?.closest('dialog')) return;
      if (root.current && !root.current.contains(target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <div ref={root} className="sm:hidden">
      <button
        type="button"
        className="btn-ghost grid h-10 w-10 place-items-center !p-0"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? closeLabel : label}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      <div
        id="mobile-menu"
        hidden={!open}
        onClick={(e) => {
          if ((e.target as Element).closest('a')) setOpen(false);
        }}
        className="panel-in absolute inset-x-3 top-full z-40 p-4 shadow-[inset_0_0_0_1px_rgba(157,92,255,0.5),0_20px_40px_-10px_rgba(0,0,0,0.8)]"
        style={{ background: '#0B0F24' }}
      >
        {children}
      </div>
    </div>
  );
}
