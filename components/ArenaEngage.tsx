'use client';

// Arena page: follow the arena, "tell me when a station frees up", and the
// arena's tournaments with sign-up.
import Link from 'next/link';
import { useState } from 'react';
import { dictionary, pick, type Locale } from '@/lib/i18n';
import type { TournamentView } from '@/lib/engage';
import { whenText } from '@/lib/engage-texts';
import { ConfirmDialog } from '@/components/manage/moderation';

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: j.error ?? 'error' };
  } catch {
    return { ok: false, error: 'error' };
  }
}

const Star = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8z" strokeLinejoin="round" />
  </svg>
);

export function FollowAndWatch({
  locale,
  slug,
  signedIn,
  loginHref,
  following: initialFollowing,
  watching: initialWatching,
  full,
}: {
  locale: Locale;
  slug: string;
  signedIn: boolean;
  loginHref: string;
  following: boolean;
  watching: boolean;
  /** No free station right now. */
  full: boolean;
}) {
  const t = dictionary(locale).engage;
  const [following, setFollowing] = useState(initialFollowing);
  const [watching, setWatching] = useState(initialWatching);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function follow() {
    setBusy(true);
    const r = await post(`/api/arenas/${slug}/engage`, { what: 'follow', on: !following });
    setBusy(false);
    if (r.ok) setFollowing(!following);
    else setMsg(t.error);
  }
  async function watch() {
    setBusy(true);
    const r = await post(`/api/arenas/${slug}/engage`, { what: 'watch', on: !watching });
    setBusy(false);
    if (r.ok) setWatching(!watching);
    else setMsg(r.error === 'has_free' ? t.hasFree : r.error === 'no_telegram' ? t.needTelegram : t.error);
  }

  if (!signedIn) {
    return (
      <div className="space-y-2">
        <Link href={loginHref} className="btn-ghost flex w-full items-center justify-center gap-2 text-sm">
          <Star on={false} /> {t.follow}
        </Link>
        <p className="text-xs text-muted">{t.followHint}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={follow}
        disabled={busy}
        aria-pressed={following}
        className={`flex w-full items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
          following ? 'bg-amber-400/10 text-amber-300 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.6)] hover:bg-amber-400/20' : 'btn-ghost'
        }`}
      >
        <Star on={following} />
        {following ? t.following : t.follow}
      </button>
      {!following && <p className="text-xs text-muted">{t.followHint}</p>}
      {(full || watching) && (
        <div className="bg-busy/5 p-3 shadow-[inset_0_0_0_1px_rgba(255,45,85,0.35)]">
          {!watching && <p className="mb-2 text-xs text-muted">{t.watchFull}</p>}
          {watching && <p className="mb-2 text-xs text-free">{t.watching}</p>}
          <button type="button" onClick={watch} disabled={busy} className={watching ? 'btn-ghost w-full text-sm' : 'btn-neon w-full text-sm'}>
            🔔 {watching ? t.unwatch : t.watch}
          </button>
        </div>
      )}
      {msg && (
        <p role="alert" className="text-xs text-busy">
          {msg}
        </p>
      )}
    </div>
  );
}

export function Tournaments({
  locale,
  items,
  signedIn,
  loginHref,
}: {
  locale: Locale;
  items: TournamentView[];
  signedIn: boolean;
  loginHref: string;
}) {
  const t = dictionary(locale).engage;
  const [list, setList] = useState(items);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; text: string } | null>(null);
  const [asking, setAsking] = useState<TournamentView | null>(null);
  if (list.length === 0) return null;

  async function toggle(x: TournamentView) {
    setAsking(null);
    setBusy(x.id);
    setMsg(null);
    const r = await post(`/api/tournaments/${x.id}/join`, { on: !x.joined });
    setBusy(null);
    if (r.ok) setList((l) => l.map((y) => (y.id === x.id ? { ...y, joined: !x.joined, entries: y.entries + (x.joined ? -1 : 1) } : y)));
    else
      setMsg({
        id: x.id,
        text:
          r.error === 'full' ? t.full : r.error === 'banned' ? t.banned : r.error === 'profile' ? t.completeProfile : r.error === 'started' ? t.started : t.error,
      });
  }

  return (
    <section className="hud p-5 sm:p-7" aria-labelledby="tournaments-title">
      <h2 id="tournaments-title" className="font-display text-2xl font-bold text-ink">
        🏆 {t.tournaments}
      </h2>
      {/* Centered, up to three side by side; a fourth starts a new row. */}
      <ul className="mt-5 flex flex-wrap justify-center gap-4">
        {list.map((x) => {
          const started = new Date(x.startsAt) <= new Date();
          const full = x.entries >= x.maxPlayers;
          const prize = pick(locale, x.prizeEn, x.prizeAr);
          const note = pick(locale, x.noteEn, x.noteAr);
          return (
            <li
              key={x.id}
              className="flex w-full flex-col gap-2 bg-panel2/60 p-4 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.35)] sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.7rem)] lg:max-w-[24rem]"
            >
              <p className="font-display text-lg font-bold text-ink">{pick(locale, x.titleEn, x.titleAr)}</p>
              <p className="text-sm text-muted">
                🎮 {x.game} · 🗓 <bdi>{whenText(locale, x.startsAt)}</bdi>
              </p>
              <p className="text-sm text-muted">
                {t.fee(x.fee)} · <span className={full ? 'text-busy' : 'text-free'}>{t.seats(x.entries, x.maxPlayers)}</span>
              </p>
              {prize && (
                <p className="text-sm text-amber-300">
                  🎁 {t.prize}: {prize}
                </p>
              )}
              {note && <p className="whitespace-pre-line text-sm text-muted">{note}</p>}
              <div className="mt-auto pt-2">
                {started ? (
                  <span className="text-sm text-muted">{t.started}</span>
                ) : !signedIn ? (
                  <Link href={loginHref} className="btn-neon w-full text-sm">
                    {t.join}
                  </Link>
                ) : x.joined ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-free">{t.joined}</span>
                    <button type="button" className="text-xs text-muted hover:text-busy" disabled={busy === x.id} onClick={() => toggle(x)}>
                      {t.leave}
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn-neon w-full text-sm" disabled={busy === x.id || full} onClick={() => setAsking(x)}>
                    {full ? t.full : t.join}
                  </button>
                )}
                {msg?.id === x.id && <p className="mt-1 text-xs text-busy">{msg.text}</p>}
              </div>
            </li>
          );
        })}
      </ul>
      {asking && (
        <ConfirmDialog
          title={t.joinTitle(pick(locale, asking.titleEn, asking.titleAr))}
          body={`${whenText(locale, asking.startsAt)}\n\n${asking.fee === '0' ? t.joinFree : t.joinPay(asking.fee)}\n\n${t.joinTelegram}`}
          confirmLabel={t.joinConfirm}
          cancelLabel={t.joinCancel}
          onConfirm={() => toggle(asking)}
          onClose={() => setAsking(null)}
        />
      )}
    </section>
  );
}
