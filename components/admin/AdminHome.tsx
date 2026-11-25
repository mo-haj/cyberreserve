'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import CitySelect from '@/components/CitySelect';
import { Field } from '@/components/manage/fields';
import { cityName } from '@/lib/cities';
import { pick, type Locale } from '@/lib/i18n';
import { manageText, type ManageText } from '@/lib/i18n-manage';
import { slugify } from '@/lib/manage/rules';
import type { JoinView } from '@/lib/join';
import { ConfirmDialog } from '@/components/manage/moderation';

type JoinRow = JoinView & { who: string; phone: string };

/**
 * Join requests behind a bell: a small button with the number waiting; it
 * opens a panel where each request is approved or declined. Opens by itself
 * when the page is reached from the Telegram alert (/admin#requests).
 */
function RequestsBell({ locale, m, initial }: { locale: Locale; m: ManageText; initial: JoinRow[] }) {
  const router = useRouter();
  const [list, setList] = useState(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [declining, setDeclining] = useState<JoinRow | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const pending = list.filter((r) => r.status === 'PENDING').length;

  useEffect(() => {
    if (window.location.hash === '#requests') setOpen(true);
  }, []);
  // Click outside or Escape closes the panel (not while the decline box is open).
  useEffect(() => {
    if (!open || declining) return;
    const out = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', out);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', out);
      document.removeEventListener('keydown', esc);
    };
  }, [open, declining]);

  async function decide(r: JoinRow, decision: 'approve' | 'decline', reason = '') {
    setBusy(r.id);
    const res = await fetch(`/api/admin/requests/${r.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(decision === 'approve' ? { decision } : { decision, reason }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return;
    const j = await res.json().catch(() => ({}));
    setList((l) => l.map((x) => (x.id === r.id ? { ...x, status: decision === 'approve' ? 'APPROVED' : 'DECLINED', cafeSlug: j.slug ?? null } : x)));
    router.refresh();
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={m.reqTitle}
        title={m.reqTitle}
        className={`relative grid h-11 w-11 place-items-center transition-colors ${
          open ? 'bg-violet/25 text-ink' : 'text-muted hover:bg-violet/15 hover:text-ink'
        } shadow-[inset_0_0_0_1px_rgba(157,92,255,0.45)]`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" strokeLinejoin="round" />
          <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" strokeLinecap="round" />
        </svg>
        {pending > 0 && (
          <span className="absolute -end-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-busy px-1 font-hud text-xs font-bold text-white shadow-[0_0_10px_rgba(255,45,85,0.7)]">
            {pending}
          </span>
        )}
      </button>

      {open && (
        <div className="panel-in fixed inset-x-4 top-20 z-40 sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-2 sm:w-[26rem] bg-[#0B0F24] shadow-[inset_0_0_0_1px_rgba(157,92,255,0.55),0_18px_40px_-12px_rgba(0,0,0,0.8)]">
          <p className="border-b border-line px-4 py-3 font-display text-base font-bold text-ink">{m.reqTitle}</p>
          {list.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">{m.reqEmpty}</p>
          ) : (
            <ul className="cr-scroll max-h-[60vh] divide-y divide-line/60 overflow-y-auto">
              {list.map((r) => (
                <li key={r.id} className={`space-y-2 px-4 py-3 text-sm ${r.status === 'PENDING' ? '' : 'opacity-55'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0">
                      <span className="block font-semibold text-ink">
                        {r.nameAr} <span className="font-normal text-muted">({r.nameEn})</span>
                      </span>
                      <span className="block text-xs text-muted">
                        {r.area}، {cityName(r.city, locale)} · {m.reqStations(r.stations)}
                        {r.software && ` · ${r.software}`}
                      </span>
                    </p>
                    {r.status === 'APPROVED' ? (
                      r.cafeSlug ? (
                        <Link href={`/admin/${r.cafeSlug}`} className="shrink-0 text-xs text-free hover:underline">
                          {m.reqApproved} ›
                        </Link>
                      ) : (
                        <span className="shrink-0 text-xs text-free">{m.reqApproved}</span>
                      )
                    ) : r.status === 'DECLINED' ? (
                      <span className="shrink-0 text-xs text-busy">{m.reqDeclined}</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted">
                    📍 {r.address}
                    <br />
                    👤 <bdi className="text-ink">{r.who}</bdi>{' '}
                    <bdi dir="ltr" className="font-hud">
                      {r.phone}
                    </bdi>
                  </p>
                  {r.note && <p className="text-xs text-muted">«{r.note}»</p>}
                  {r.status === 'PENDING' && (
                    <div className="flex gap-2 pt-1">
                      <button type="button" className="btn-neon flex-1 py-1.5 text-sm" disabled={busy === r.id} onClick={() => decide(r, 'approve')}>
                        {m.reqApprove}
                      </button>
                      <button type="button" className="btn-ghost flex-1 py-1.5 text-sm" disabled={busy === r.id} onClick={() => setDeclining(r)}>
                        {m.reqDecline}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {declining && (
        <ConfirmDialog
          title={m.reqDeclineTitle(declining.nameAr)}
          body={m.reqDeclineBody}
          input={{ label: m.reqReason, placeholder: m.reqReasonPlaceholder }}
          confirmLabel={m.reqDecline}
          cancelLabel={m.cancel}
          danger
          onConfirm={(reason) => decide(declining, 'decline', reason)}
          onClose={() => setDeclining(null)}
        />
      )}
    </div>
  );
}

export interface AdminArena {
  slug: string;
  nameAr: string;
  nameEn: string;
  coverImage: string;
  logoImage: string | null;
  city: string;
  isPublished: boolean;
  role: string;
  stations: number;
  upcoming: number;
}

export default function AdminHome({
  locale,
  superAdmin,
  arenas,
  requests = [],
}: {
  locale: Locale;
  superAdmin: boolean;
  arenas: AdminArena[];
  /** Site admin: arena owners asking to join (/join). */
  requests?: JoinRow[];
}) {
  const m = manageText(locale);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          {superAdmin && (
            <p className="mb-1 inline-block bg-gold px-2 py-0.5 font-hud text-xs font-bold text-void">{m.superAdmin}</p>
          )}
          <h1 className="font-display text-3xl font-extrabold text-ink neon sm:text-4xl">{m.title}</h1>
          {(superAdmin || arenas.length > 0) && <p className="mt-1 text-muted">{superAdmin ? m.allArenas : m.myArenas}</p>}
        </div>
        {superAdmin && (
          <div className="flex items-center gap-3">
            <RequestsBell locale={locale} m={m} initial={requests} />
            <button type="button" className="btn-neon" onClick={() => setAdding(true)}>
              + {m.addArena}
            </button>
          </div>
        )}
      </div>

      {arenas.length === 0 ? (
        <section className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center text-center">
          <span
            aria-hidden="true"
            className="grid h-16 w-16 place-items-center bg-violet/15 text-violet-soft shadow-[inset_0_0_0_1px_rgba(157,92,255,0.5)]"
          >
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="4" width="18" height="12" rx="1" />
              <path d="M8 20h8M12 16v4" strokeLinecap="round" />
            </svg>
          </span>
          <h2 className="mt-5 font-display text-2xl font-bold text-ink sm:text-3xl">{m.noneTitle}</h2>
          <p className="mt-2 text-muted">{m.none}</p>
        </section>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {arenas.map((a) => (
            <li key={a.slug}>
              <Link
                href={`/admin/${a.slug}`}
                className="group block overflow-hidden bg-panel/80 shadow-[inset_0_0_0_1px_rgba(157,92,255,0.3)] transition-shadow [clip-path:polygon(14px_0,100%_0,100%_calc(100%-14px),calc(100%-14px)_100%,0_100%,0_14px)] hover:shadow-[inset_0_0_0_1px_rgba(41,224,255,0.7)]"
              >
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.coverImage} alt="" className="aspect-[16/7] w-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
                  <span
                    className={`absolute end-3 top-3 px-2 py-0.5 text-xs font-semibold ${a.isPublished ? 'bg-free/20 text-free' : 'bg-void/80 text-muted shadow-[inset_0_0_0_1px_rgba(140,151,196,0.5)]'}`}
                  >
                    {a.isPublished ? m.published : m.hidden}
                  </span>
                </div>
                <div className="flex items-center gap-3 p-4">
                  {a.logoImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.logoImage} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="grid h-11 w-11 shrink-0 place-items-center bg-violet/25 font-display text-lg font-bold text-violet-soft">
                      {pick(locale, a.nameEn, a.nameAr).slice(0, 1)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{pick(locale, a.nameEn, a.nameAr)}</p>
                    <p className="truncate text-xs text-muted">
                      {cityName(a.city, locale)} · {m.stationsN(a.stations)} · {m.upcomingN(a.upcoming)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-cyan">
                    {superAdmin ? m.open : m.role[a.role]} <span className="inline-block rtl:-scale-x-100">›</span>
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {adding && <NewArenaDialog locale={locale} m={m} onClose={() => setAdding(false)} />}
    </div>
  );
}

function NewArenaDialog({ locale, m, onClose }: { locale: Locale; m: ManageText; onClose: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState({ nameAr: '', nameEn: '', slug: '', city: 'damascus', areaAr: '', areaEn: '', hourlyRate: '' });
  // The address follows the English name until the admin edits it by hand.
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setF((x) => ({ ...x, [k]: v, ...(k === 'nameEn' && !slugTouched ? { slug: slugify(v) } : {}) }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/arenas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(f) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error === 'slug_taken' ? m.slugTaken : json.error === 'invalid' ? m.errors.invalid : m.errors.generic);
        return;
      }
      router.push(`/admin/${json.slug}`);
    } catch {
      setError(m.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} onClose={onClose} className="cr-modal m-auto w-[calc(100%-1.5rem)] max-w-xl overflow-clip bg-transparent p-0 text-ink">
      <form onSubmit={submit} className="panel-in hud flex max-h-[calc(100dvh-4rem)] flex-col" style={{ background: '#0B0F24' }}>
        <div className="p-6 pb-3">
          <h2 className="font-display text-2xl font-bold">{m.newArenaTitle}</h2>
          <p className="mt-1 text-sm text-muted">{m.newArenaHint}</p>
        </div>
        <div className="cr-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={m.nameAr} value={f.nameAr} onChange={set('nameAr')} required minLength={2} maxLength={80} dir="rtl" />
            <Field label={m.nameEn} value={f.nameEn} onChange={set('nameEn')} required minLength={2} maxLength={80} dir="ltr" />
          </div>
          <Field
            label={m.slug}
            hint={m.slugHint(`/arenas/${f.slug || '…'}`)}
            value={f.slug}
            onChange={(e) => {
              setSlugTouched(true);
              setF((x) => ({ ...x, slug: e.target.value.toLowerCase() }));
            }}
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxLength={60}
            dir="ltr"
          />
          <div>
            <span className="text-sm font-semibold text-ink">{m.city}</span>
            <div className="mt-1.5">
              <CitySelect locale={locale} label={m.city} value={f.city} onChange={(city) => setF((x) => ({ ...x, city }))} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={m.areaAr} value={f.areaAr} onChange={set('areaAr')} maxLength={80} dir="rtl" />
            <Field label={m.areaEn} value={f.areaEn} onChange={set('areaEn')} maxLength={80} dir="ltr" />
          </div>
          <Field label={m.hourlyRate} value={f.hourlyRate} onChange={set('hourlyRate')} required inputMode="numeric" dir="ltr" placeholder="100" />
          {error && <p className="text-sm text-busy">{error}</p>}
        </div>
        <div className="flex gap-2 border-t border-line p-4 px-6">
          <button type="submit" className="btn-neon" disabled={busy}>
            {busy ? m.saving : m.create}
          </button>
          <button type="button" className="btn-ghost" onClick={onClose}>
            {m.cancel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
