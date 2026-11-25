'use client';

// Dashboard tabs: Tournaments (owner creates, sees who signed up) and Stats
// (last 30 days: busiest hours and days, regulars, ratings).
import { useEffect, useState } from 'react';
import { Field, IconButton, TextArea } from '@/components/manage/fields';
import type { Action } from '@/components/manage/ManagePanel';
import { pick, type Locale } from '@/lib/i18n';
import type { ManageText } from '@/lib/i18n-manage';
import type { ManageData } from '@/lib/manage/service';
import type { ArenaStats } from '@/lib/engage';
import { whenText } from '@/lib/engage-texts';
import { toDamascusParts } from '@/lib/time';

type T = ManageData['tournaments'][number];

/** ISO -> "YYYY-MM-DDTHH:MM" in Damascus, for <input type="datetime-local">. */
function localInput(iso: string): string {
  const p = toDamascusParts(new Date(iso));
  const z = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}`;
}

// ------------------------------------------------------------------ tournaments

export function TournamentsTab({ locale, m, data, action }: { locale: Locale; m: ManageText; data: ManageData; action: Action }) {
  const [editing, setEditing] = useState<T | 'new' | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="hud space-y-5 p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">{m.tourHint}</p>
        <button type="button" className="btn-neon text-sm" onClick={() => setEditing('new')}>
          + {m.tourNew}
        </button>
      </div>
      {editing && <TournamentForm m={m} t={editing === 'new' ? null : editing} action={action} onDone={() => setEditing(null)} />}
      {data.tournaments.length === 0 && !editing && <p className="py-6 text-center text-muted">{m.tourEmpty}</p>}
      <ul className="space-y-2">
        {data.tournaments.map((t) => {
          const past = new Date(t.startsAt) <= new Date();
          const isOpen = open === t.id;
          return (
            <li key={t.id} className={`bg-panel2/50 ${past ? 'opacity-60' : ''} shadow-[inset_0_0_0_1px_rgba(251,191,36,0.3)]`}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="min-w-0 flex-1 basis-full sm:basis-0">
                  <span className="block font-display text-base font-bold text-ink">🏆 {pick(locale, t.titleEn, t.titleAr)}</span>
                  <span className="block text-sm text-muted">
                    🎮 {t.game} · <bdi>{whenText(locale, t.startsAt)}</bdi>
                  </span>
                </span>
                <button type="button" className="text-sm text-cyan hover:underline" onClick={() => setOpen(isOpen ? null : t.id)} aria-expanded={isOpen}>
                  {m.tourPlayers(t.entries, t.maxPlayers)}
                </button>
                {!past && (
                  <IconButton label={m.edit} onClick={() => setEditing(t)}>
                    <path d="M4 20h4L19 9l-4-4L4 16v4z" strokeLinejoin="round" />
                  </IconButton>
                )}
                <IconButton
                  label={m.remove}
                  onClick={() => {
                    if (window.confirm(m.tourRemoveConfirm)) void action.run(`t-${t.id}`, { action: 'removeTournament', id: t.id });
                  }}
                >
                  <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" strokeLinejoin="round" />
                </IconButton>
              </div>
              {isOpen && (
                <div className="border-t border-line/60 px-4 py-3">
                  {t.players.length === 0 ? (
                    <p className="text-sm text-muted">{m.tourNoPlayers}</p>
                  ) : (
                    <ol className="space-y-1.5 text-sm">
                      {t.players.map((p, i) => (
                        <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 odd:bg-white/[0.025]">
                          <span className="w-6 font-hud text-muted">{i + 1}</span>
                          <bdi className="font-semibold text-ink">{p.name}</bdi>
                          {p.fullName && p.fullName !== p.name && <span className="text-muted">{p.fullName}</span>}
                          <bdi dir="ltr" className="font-hud text-muted">
                            {p.phone}
                          </bdi>
                          <button
                            type="button"
                            className="ms-auto text-xs text-muted hover:text-busy"
                            onClick={() => action.run(`e-${t.id}`, { action: 'removeEntry', id: t.id, userId: p.id })}
                          >
                            {m.remove}
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TournamentForm({ m, t, action, onDone }: { m: ManageText; t: T | null; action: Action; onDone: () => void }) {
  const [f, setF] = useState({
    titleAr: t?.titleAr ?? '',
    titleEn: t?.titleEn ?? '',
    game: t?.game ?? '',
    startsAt: t ? localInput(t.startsAt) : '',
    maxPlayers: String(t?.maxPlayers ?? 16),
    fee: t?.fee ?? '0',
    prizeAr: t?.prizeAr ?? '',
    prizeEn: t?.prizeEn ?? '',
    noteAr: t?.noteAr ?? '',
    noteEn: t?.noteEn ?? '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const ok = await action.run('tournament', {
      action: 'saveTournament',
      ...(t ? { id: t.id } : {}),
      ...f,
      maxPlayers: Number(f.maxPlayers),
      fee: f.fee.replace(/\D/g, '') || '0',
    });
    if (ok) onDone();
  }
  return (
    <form onSubmit={save} className="space-y-4 bg-panel2/60 p-4 shadow-[inset_0_0_0_1px_rgba(41,224,255,0.45)]">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={m.tourTitleAr} value={f.titleAr} onChange={set('titleAr')} maxLength={80} dir="rtl" required placeholder="بطولة FIFA الأسبوعية" />
        <Field label={m.tourTitleEn} value={f.titleEn} onChange={set('titleEn')} maxLength={80} dir="ltr" required placeholder="Weekly FIFA cup" />
        <Field label={m.tourGame} value={f.game} onChange={set('game')} maxLength={60} dir="ltr" required placeholder="EA FC 26" />
        <Field label={m.tourWhen} type="datetime-local" value={f.startsAt} onChange={set('startsAt')} dir="ltr" required />
        <Field label={m.tourMax} type="number" min={2} max={256} value={f.maxPlayers} onChange={set('maxPlayers')} dir="ltr" required />
        <Field label={m.tourFee} inputMode="numeric" value={f.fee} onChange={set('fee')} dir="ltr" hint={m.tourFeeHint} />
        <Field label={m.tourPrizeAr} value={f.prizeAr} onChange={set('prizeAr')} maxLength={160} dir="rtl" />
        <Field label={m.tourPrizeEn} value={f.prizeEn} onChange={set('prizeEn')} maxLength={160} dir="ltr" />
        <TextArea label={m.tourNoteAr} value={f.noteAr} onChange={set('noteAr')} maxLength={400} dir="rtl" rows={3} />
        <TextArea label={m.tourNoteEn} value={f.noteEn} onChange={set('noteEn')} maxLength={400} dir="ltr" rows={3} />
      </div>
      {!t && <p className="text-xs text-muted">{m.tourFollowersNote}</p>}
      <div className="flex gap-3">
        <button type="submit" className="btn-neon" disabled={!!action.busy}>
          {action.busy ? m.saving : m.save}
        </button>
        <button type="button" className="btn-ghost" onClick={onDone}>
          {m.cancel}
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ stats

/** Single-series bars: one hue, thin, rounded data end, hover shows the value. */
function Bars({ values, labels, title, unit, ltr = true }: { values: number[]; labels: string[]; title: string; unit: (n: number) => string; ltr?: boolean }) {
  const max = Math.max(1, ...values);
  const peak = values.indexOf(Math.max(...values));
  return (
    <figure>
      <figcaption className="mb-3 text-sm font-semibold text-ink">{title}</figcaption>
      <div className="flex h-40 items-end gap-[2px]" dir={ltr ? 'ltr' : undefined} role="img" aria-label={title}>
        {values.map((v, i) => (
          <div key={i} className="group relative flex h-full flex-1 flex-col justify-end">
            <div
              className={`rounded-t-[4px] transition-colors ${i === peak && v > 0 ? 'bg-violet' : 'bg-violet/45 group-hover:bg-violet/75'}`}
              style={{ height: `${v ? Math.max(3, (v / max) * 100) : 0}%` }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap bg-[#0B0F24] px-2 py-1 text-xs text-ink shadow-[inset_0_0_0_1px_rgba(157,92,255,0.6)] group-hover:block">
              {labels[i]} · {unit(v)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] border-t border-line pt-1 text-[0.625rem] text-muted" dir={ltr ? 'ltr' : undefined}>
        {labels.map((l, i) => (
          <span key={i} className="flex-1 text-center">
            {values.length > 12 ? (i % 3 === 0 ? l : '') : l}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <tbody>
          {values.map((v, i) => (
            <tr key={i}>
              <th>{labels[i]}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function StatsTab({ m, slug, superAdmin, action }: { m: ManageText; slug: string; superAdmin: boolean; action: Action }) {
  const [s, setS] = useState<ArenaStats | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    let stop = false;
    void fetch(`/api/manage/${slug}?stats=1`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => !stop && j && setS(j))
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [slug, round]);
  if (!s) return <p className="hud p-6 text-muted">{m.loading}</p>;

  const tiles: [string, string][] = [
    [m.stOnline, String(s.online)],
    [m.stWalkIns, String(s.walkIns)],
    [m.stHours, String(s.hoursPlayed)],
    [m.stPlayers, String(s.uniquePlayers)],
    [m.stNoShowRate, `${s.noShowRate}%`],
    [m.stFollowers, String(s.followers)],
    [m.stRating, s.rating ? `${s.rating.avg.toFixed(1)} ★ (${s.rating.count})` : '—'],
  ];
  return (
    <div className="space-y-5">
      <section className="hud p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-ink">{m.stTitle(s.days)}</h2>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
          {tiles.map(([k, v]) => (
            <div key={k} className="bg-panel2/60 p-3">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="mt-1 font-hud text-2xl font-bold text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="hud grid gap-8 p-5 sm:p-6 lg:grid-cols-[2fr_1fr]">
        <Bars values={s.byHour} labels={s.byHour.map((_, h) => `${String(h).padStart(2, '0')}:00`)} title={m.stByHour} unit={m.stSessions} />
        <Bars values={s.byDay} labels={m.stDays} title={m.stByDay} unit={m.stSessions} ltr={false} />
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="hud p-5 sm:p-6">
          <h3 className="font-display text-base font-bold text-ink">{m.stRegulars}</h3>
          {s.regulars.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{m.stNone}</p>
          ) : (
            <ol className="mt-3 text-sm">
              {s.regulars.map((r, i) => (
                <li key={i} className="flex items-center gap-3 px-2 py-1.5 odd:bg-white/[0.025]">
                  <span className="w-5 font-hud text-muted">{i + 1}</span>
                  <bdi className="flex-1 text-ink">{r.name}</bdi>
                  <span className="font-hud text-muted">{m.stVisits(r.visits)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="hud p-5 sm:p-6">
          <h3 className="font-display text-base font-bold text-ink">{m.stReviews}</h3>
          {s.reviews.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{m.stNone}</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {s.reviews.map((r) => (
                <li key={r.id} className={`px-2 py-1.5 odd:bg-white/[0.025] ${r.hidden ? 'opacity-50' : ''}`}>
                  <span className="text-amber-300">{'★'.repeat(r.stars)}</span>
                  <span className="text-muted/40">{'★'.repeat(5 - r.stars)}</span> <bdi className="ms-1 text-ink">{r.who}</bdi>
                  {superAdmin && (
                    <button
                      type="button"
                      className="ms-3 text-xs text-muted hover:text-busy"
                      onClick={async () => {
                        if (await action.run(`rv-${r.id}`, { action: 'hideReview', id: r.id, hidden: !r.hidden })) setRound((x) => x + 1);
                      }}
                    >
                      {r.hidden ? m.stShow : m.stHide}
                    </button>
                  )}
                  {r.comment && <p className="mt-0.5 text-muted">{r.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
