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
  telegramId,
  arenas,
}: {
  locale: Locale;
  superAdmin: boolean;
  telegramId: string | null;
  arenas: AdminArena[];
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
          <p className="mt-1 text-muted">{superAdmin ? m.allArenas : m.myArenas}</p>
        </div>
        {superAdmin && (
          <button type="button" className="btn-neon" onClick={() => setAdding(true)}>
            + {m.addArena}
          </button>
        )}
      </div>

      {arenas.length === 0 ? (
        <section className="hud max-w-2xl p-6">
          <p className="text-muted">{m.none}</p>
          {telegramId && (
            <p className="mt-4 text-xs text-muted/80">
              {m.telegramId(telegramId)}
              <br />
              {m.telegramIdHint}
            </p>
          )}
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
                    <img src={a.logoImage} alt="" className="h-11 w-11 shrink-0 object-cover" />
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
    <dialog ref={ref} onClose={onClose} className="cr-modal m-auto w-[calc(100%-1.5rem)] max-w-xl overflow-hidden bg-transparent p-0 text-ink">
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
            <CitySelect locale={locale} label={m.city} value={f.city} onChange={(city) => setF((x) => ({ ...x, city }))} />
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
