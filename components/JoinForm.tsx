'use client';

import { useState } from 'react';
import { Field, TextArea } from '@/components/manage/fields';
import { CITIES } from '@/lib/cities';
import { dictionary, pick, type Locale } from '@/lib/i18n';

export default function JoinForm({ locale }: { locale: Locale }) {
  const t = dictionary(locale).join;
  const [f, setF] = useState({ nameAr: '', nameEn: '', city: 'damascus', area: '', address: '', stations: '10', software: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...f, stations: Number(f.stations) }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) setSent(true);
      else setError(t.errors[j.error] ?? t.errors.generic);
    } catch {
      setError(t.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  if (sent) return <p className="bg-free/10 p-4 text-free shadow-[inset_0_0_0_1px_rgba(43,255,136,0.5)]">{t.sent}</p>;
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.nameAr} value={f.nameAr} onChange={set('nameAr')} maxLength={80} dir="rtl" required />
        <Field label={t.nameEn} value={f.nameEn} onChange={set('nameEn')} maxLength={80} dir="ltr" required />
        <label className="block">
          <span className="text-sm font-semibold text-ink">{t.city}</span>
          <select
            value={f.city}
            onChange={set('city')}
            className="mt-1.5 w-full bg-void/70 px-3 py-2.5 text-ink shadow-[inset_0_0_0_1px_rgba(157,92,255,0.35)] outline-none focus:shadow-[inset_0_0_0_1px_rgba(41,224,255,0.8)]"
          >
            {CITIES.map((c) => (
              <option key={c.key} value={c.key}>
                {pick(locale, c.en, c.ar)}
              </option>
            ))}
          </select>
        </label>
        <Field label={t.area} value={f.area} onChange={set('area')} maxLength={80} required />
        <Field label={t.address} value={f.address} onChange={set('address')} maxLength={160} required />
        <Field label={t.stations} type="number" min={1} max={300} value={f.stations} onChange={set('stations')} dir="ltr" required />
        {/* "Current arena software" (CafePro, PanCafe…) is hidden for now: a later plan
            (linking with those programs). The server still accepts it, empty by default. */}
      </div>
      <TextArea label={t.note} value={f.note} onChange={set('note')} maxLength={500} rows={3} />
      {error && (
        <p role="alert" className="text-sm text-busy">
          {error}
        </p>
      )}
      <button type="submit" className="btn-neon w-full sm:w-auto" disabled={busy}>
        {busy ? t.sending : t.send}
      </button>
    </form>
  );
}
