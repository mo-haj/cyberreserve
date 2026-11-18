'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { dictionary, type Locale } from '@/lib/i18n';

// "How it works" as a pop-up window: three illustrated steps. Opens from the
// header button; closes with the X, "Start browsing", a click outside the
// window, or the Escape key (native <dialog> behaviour, focus stays inside).

export default function HowItWorks({ locale, block = false }: { locale: Locale; /** Full-width, start-aligned (phone menu). */ block?: boolean }) {
  const t = dictionary(locale);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  // Two instances can exist (header + phone menu): ids must differ.
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const art = [<StepPickArena key="1" />, <StepFreeStations key="2" />, <StepTelegram key="3" />];

  return (
    <>
      <button type="button" className={`btn-ghost whitespace-nowrap text-sm ${block ? 'w-full justify-start' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {t.nav.how}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          // A click on the dimmed area outside the window closes it.
          if (e.target === dialogRef.current) setOpen(false);
        }}
        className="how-dialog m-auto max-h-[92vh] w-[calc(100%-1.5rem)] max-w-5xl overflow-y-auto cr-scroll bg-transparent p-0 text-ink"
      >
        {open && (
          <div className="panel-in hud p-5 sm:p-8" style={{ background: '#0B0F24' }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id={titleId} className="font-display text-2xl font-extrabold text-ink neon sm:text-3xl">
                  {t.how.title}
                </h2>
                <p className="mt-1 text-muted">{t.how.intro}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-11 w-11 shrink-0 place-items-center text-muted hover:text-ink"
                aria-label={t.how.close}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <ol className="mt-6 grid gap-5 md:grid-cols-3">
              {t.how.steps.map((s, i) => (
                <li key={s.title} className="flex flex-col bg-panel2/60 shadow-[inset_0_0_0_1px_rgba(157,92,255,0.25)]">
                  <div className="relative border-b border-line bg-void/60">
                    {art[i]}
                    <span className="absolute start-3 top-3 bg-violet px-2 py-0.5 font-display text-xs font-bold text-white">
                      {t.how.step(i + 1)}
                    </span>
                  </div>
                  <div className="p-4">
                    <h3 className="font-display text-xl font-bold text-ink">{s.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-6 flex justify-end">
              <button type="button" className="btn-neon" onClick={() => setOpen(false)}>
                {t.how.start}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

// ---- Step illustrations (drawn in code, same palette as the site) ----

const V = '#9D5CFF';
const C = '#29E0FF';
const G = '#2BFF88';
const R = '#FF2D55';
const L = '#232C5C';

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 240 140" className="block h-auto w-full" aria-hidden="true">
      <defs>
        <pattern id="how-grid" width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M16 0H0V16" fill="none" stroke="#151B3D" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="240" height="140" fill="url(#how-grid)" />
      {children}
    </svg>
  );
}

function StepPickArena() {
  const rows = [
    { y: 26, w: 0.7, active: true },
    { y: 62, w: 0.45, active: false },
    { y: 98, w: 0.6, active: false },
  ];
  return (
    <Frame>
      {rows.map((r) => (
        <g key={r.y}>
          <rect x="34" y={r.y} width="150" height="28" fill={r.active ? 'rgba(157,92,255,0.25)' : '#151B3D'} stroke={r.active ? V : L} />
          <rect x="40" y={r.y + 5} width="26" height="18" fill="#232C5C" />
          <rect x="72" y={r.y + 7} width="60" height="5" fill="#E9EEFF" opacity="0.8" />
          <rect x="72" y={r.y + 17} width="80" height="3" fill={L} />
          <rect x="72" y={r.y + 17} width={80 * r.w} height="3" fill={G} />
          <text x="176" y={r.y + 18} textAnchor="end" fontSize="11" fontWeight="700" fill={G} fontFamily="monospace">
            {Math.round(12 * r.w)}
          </text>
        </g>
      ))}
      <g transform="translate(200 40)">
        <path d="M0 18c-10-12-14-18-14-24a14 14 0 0 1 28 0c0 6-4 12-14 24z" fill="none" stroke={C} strokeWidth="2.5" />
        <circle cx="0" cy="-6" r="5" fill={C} />
      </g>
      <path d="M186 40 L200 58" stroke={C} strokeWidth="1.5" strokeDasharray="3 3" />
    </Frame>
  );
}

function StepFreeStations() {
  const states = ['f', 'b', 'f', 'f', 'b', 'f', 'b', 'b', 'f', 'm', 'f', 'b'];
  return (
    <Frame>
      {states.map((s, i) => {
        const x = 30 + (i % 6) * 31;
        const y = 22 + Math.floor(i / 6) * 50;
        const color = s === 'f' ? G : s === 'b' ? R : '#4A5279';
        const picked = i === 3;
        return (
          <g key={i}>
            <rect x={x} y={y} width="26" height="40" fill={color} fillOpacity="0.1" stroke={color} strokeOpacity="0.8" />
            <rect x={x + 5} y={y + 13} width="16" height="11" rx="1.5" fill="none" stroke={color} strokeWidth="1.8" />
            <path d={`M${x + 10} ${y + 30}h6M${x + 13} ${y + 24}v6`} stroke={color} strokeWidth="1.8" />
            {picked && <rect x={x - 3} y={y - 3} width="32" height="46" fill="none" stroke={C} strokeWidth="2" />}
          </g>
        );
      })}
      <g transform="translate(140 74)">
        <path d="M0 0 L0 22 L6 16 L10 26 L14 24 L10 14 L18 14 Z" fill="#E9EEFF" stroke="#05060F" strokeWidth="1.5" />
      </g>
    </Frame>
  );
}

function StepTelegram() {
  return (
    <Frame>
      <rect x="78" y="10" width="84" height="122" rx="10" fill="#0A0D1C" stroke={L} strokeWidth="2" />
      <rect x="86" y="24" width="68" height="20" rx="4" fill="#151B3D" />
      <path d="M92 34l14-6-3 13-4-4-3 3 1-5 6-5-8 4z" fill={C} />
      <rect x="110" y="30" width="38" height="4" fill="#E9EEFF" opacity="0.6" />
      {[27, 42, 63].map((n, i) => (
        <g key={n}>
          <rect x={88 + i * 22} y="56" width="18" height="16" fill={n === 42 ? 'rgba(41,224,255,0.25)' : '#151B3D'} stroke={n === 42 ? C : L} />
          <text x={97 + i * 22} y="68" textAnchor="middle" fontSize="9" fontWeight="700" fill={n === 42 ? C : '#8C97C4'} fontFamily="monospace">
            {n}
          </text>
        </g>
      ))}
      <circle cx="120" cy="100" r="14" fill="none" stroke={G} strokeWidth="2.5" />
      <path d="M113 100l5 5 9-10" fill="none" stroke={G} strokeWidth="2.5" strokeLinecap="round" />
      <g transform="translate(196 52)">
        <rect x="-22" y="-14" width="44" height="28" fill="#0A0D1C" stroke={V} />
        <text x="0" y="6" textAnchor="middle" fontSize="16" fontWeight="700" fill={C} fontFamily="monospace">
          42
        </text>
      </g>
      <path d="M174 52 H156" stroke={V} strokeWidth="1.5" strokeDasharray="3 3" />
    </Frame>
  );
}
