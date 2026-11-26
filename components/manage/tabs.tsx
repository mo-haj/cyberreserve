'use client';

// Dashboard tabs: Players (who booked here), Posts (photo + text on the arena
// page) and Access (super admin: publish/hide, owners and staff).
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { shrinkImage } from '@/lib/manage/shrink';
import { Field, IconButton, TextArea } from '@/components/manage/fields';
import type { Action } from '@/components/manage/ManagePanel';
import { cityName } from '@/lib/cities';
import { dictionary, pick, type Locale } from '@/lib/i18n';
import { money, offerLabel } from '@/lib/offers';
import PlayerBadge, { badgeName } from '@/components/PlayerBadge';
import { BanDialog, ConfirmDialog } from '@/components/manage/moderation';
import type { ManageText } from '@/lib/i18n-manage';
import type { ManageData } from '@/lib/manage/service';
import type { ActivityRow, ShiftRow } from '@/lib/activity';
import { formatDamascusDate, formatDamascusTime } from '@/lib/time';
import { reasonText } from '@/lib/booking/texts';

// ------------------------------------------------------------------ players

export function Players({ locale, m, data, action }: { locale: Locale; m: ManageText; data: ManageData; action: Action }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'' | 'vip' | 'loyal' | 'new'>('');
  const [banning, setBanning] = useState<{ id: string; name: string } | null>(null);
  const [lifting, setLifting] = useState<string | null>(null);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/\s+/g, '');
    return data.players.filter(
      (p) =>
        (!filter || (filter === 'new' ? !p.badge && p.bookings <= 1 : p.badge === filter)) &&
        (!needle || `${p.fullName}${p.nickname}${p.phone}`.toLowerCase().replace(/\s+/g, '').includes(needle)),
    );
  }, [q, filter, data.players]);
  const count = (k: string) => data.players.filter((p) => (k === 'new' ? !p.badge && p.bookings <= 1 : p.badge === k)).length;

  return (
    <section className="hud space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted">{m.playersHint}</p>
        {data.players.length > 0 && (
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={m.playersSearch}
            className="w-full bg-void/70 px-3 py-2 text-sm text-ink placeholder:text-muted/60 shadow-[inset_0_0_0_1px_rgba(157,92,255,0.35)] outline-none focus:shadow-[inset_0_0_0_1px_rgba(41,224,255,0.8)] sm:w-64"
          />
        )}
      </div>
      {data.players.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(['', 'vip', 'loyal', 'new'] as const).map((k) => (
            <button
              key={k || 'all'}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={`city-option flex items-center gap-2 px-3 py-1.5 text-sm ${filter === k ? 'city-option-on text-ink' : 'text-muted hover:text-ink'}`}
            >
              {k ? <PlayerBadge kind={k} locale={locale} /> : m.allPlayers}
              <span className="font-hud text-xs opacity-70">{k ? count(k) : data.players.length}</span>
            </button>
          ))}
        </div>
      )}
      {data.players.length === 0 ? (
        <p className="text-muted">{m.playersEmpty}</p>
      ) : (
        <div className="cr-scroll overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-line text-start text-xs text-muted">
                {[m.colPlayer, m.colBadge, m.colBan, m.colPhone, m.colCity, m.colBookings, m.colNoShows, m.colLast].map((h) => (
                  <th key={h} className="px-2 py-2 text-start font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="border-b border-line/50 hover:bg-panel2/40">
                  <td className="px-2 py-2.5">
                    <p className="flex items-center gap-2 font-semibold text-ink">
                      <bdi>{p.nickname || p.fullName}</bdi>
                      {p.badge ? <PlayerBadge kind={p.badge} locale={locale} /> : p.bookings <= 1 && <PlayerBadge kind="new" locale={locale} />}
                    </p>
                    {p.nickname && (
                      <p className="text-xs text-muted">
                        <bdi>{p.fullName}</bdi>
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    <BadgePicker m={m} locale={locale} value={p.badge} busy={action.busy === `badge-${p.id}`} onPick={(b) => action.run(`badge-${p.id}`, { action: 'setBadge', userId: p.id, badge: b })} />
                  </td>
                  <td className="px-2 py-2.5">
                    {p.ban ? (
                      <div className="flex flex-col items-start gap-1">
                        <span className="bg-busy/15 px-2 py-0.5 text-xs font-semibold text-busy shadow-[inset_0_0_0_1px_rgba(255,45,85,0.5)]" title={p.ban.reason}>
                          {p.ban.until ? m.bannedUntil(formatDamascusDate(new Date(p.ban.until))) : m.bannedForever}
                        </span>
                        <button
                          type="button"
                          disabled={!!action.busy}
                          onClick={async () => {
                            if (lifting !== p.id) return setLifting(p.id);
                            setLifting(null);
                            await action.run(`unban-${p.id}`, { action: 'unbanPlayer', userId: p.id });
                          }}
                          className={`text-xs ${lifting === p.id ? 'font-semibold text-free' : 'text-cyan hover:underline'}`}
                        >
                          {lifting === p.id ? `${m.unbanButton}?` : m.unbanButton}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-free">{m.canBook}</span>
                        <button
                          type="button"
                          onClick={() => {
                            action.setError(null);
                            setBanning({ id: p.id, name: p.nickname || p.fullName });
                          }}
                          className="px-2 py-0.5 text-xs text-busy shadow-[inset_0_0_0_1px_rgba(255,45,85,0.4)] transition-colors hover:bg-busy/15 hover:shadow-[inset_0_0_0_1px_rgba(255,45,85,0.85)]"
                        >
                          {m.banButton}
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    {p.phone && (
                      <a href={`tel:${p.phone}`} dir="ltr" className="font-hud text-cyan hover:underline">
                        {p.phone}
                      </a>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-muted">{p.city ? cityName(p.city, locale) : '—'}</td>
                  <td className="px-2 py-2.5 font-hud text-ink">{p.bookings}</td>
                  <td className={`px-2 py-2.5 font-hud ${p.noShows > 0 ? 'text-busy' : 'text-muted'}`}>{p.noShows}</td>
                  <td dir="ltr" className="px-2 py-2.5 text-end font-hud text-muted rtl:text-start">
                    {formatDamascusDate(new Date(p.last))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {banning && <BanDialog m={m} player={banning} action={action} onClose={() => setBanning(null)} />}
    </section>
  );
}

/** None / Loyal / VIP: one tap. */
function BadgePicker({ m, locale, value, busy, onPick }: { m: ManageText; locale: Locale; value: string; busy: boolean; onPick: (b: string) => void }) {
  const opts = [
    { k: '', label: m.noBadge, on: 'bg-panel2 text-ink shadow-[inset_0_0_0_1px_rgba(140,151,196,0.7)]' },
    { k: 'loyal', label: badgeName('loyal', locale), on: 'bg-violet/30 text-ink shadow-[inset_0_0_0_1px_rgba(157,92,255,0.9)]' },
    { k: 'vip', label: 'VIP', on: 'bg-amber-400/25 text-amber-100 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.9)]' },
  ];
  return (
    <div className={`inline-flex gap-1 ${busy ? 'opacity-50' : ''}`} role="group" aria-label={m.colBadge}>
      {opts.map((o) => (
        <button
          key={o.k || 'none'}
          type="button"
          disabled={busy}
          aria-pressed={value === o.k}
          onClick={() => value !== o.k && onPick(o.k)}
          className={`whitespace-nowrap px-2 py-1 text-xs transition-colors ${value === o.k ? o.on : 'text-muted shadow-[inset_0_0_0_1px_rgba(74,82,121,0.6)] hover:text-ink hover:shadow-[inset_0_0_0_1px_rgba(157,92,255,0.6)]'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ posts

type Post = ManageData['posts'][number];

export function Posts({
  locale,
  slug,
  m,
  data,
  setData,
  action,
}: {
  locale: Locale;
  slug: string;
  m: ManageText;
  data: ManageData;
  setData: (d: ManageData) => void;
  action: Action;
}) {
  const [editing, setEditing] = useState<Post | 'new' | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  // Ids before a new post was saved: the new one opens for its photo.
  const [before, setBefore] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!before) return;
    const added = data.posts.find((p) => !before.has(p.id));
    if (added) {
      setBefore(null);
      setEditing(added);
    }
  }, [before, data.posts]);
  const current = editing && editing !== 'new' ? data.posts.find((p) => p.id === editing.id) ?? null : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted">{m.postsHint}</p>
        <button type="button" className="btn-neon text-sm" onClick={() => setEditing('new')}>
          + {m.addPost}
        </button>
      </div>
      {data.posts.length === 0 ? (
        <p className="hud p-6 text-muted">{m.postsEmpty}</p>
      ) : (
        <ul className="space-y-3">
          {data.posts.map((p, i) => (
            <li key={p.id} className="hud flex flex-wrap items-center gap-4 p-4">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt="" className="h-16 w-24 shrink-0 object-cover" />
              ) : (
                <span className="grid h-16 w-24 shrink-0 place-items-center bg-void/60 text-[0.6875rem] text-muted">{m.noPhoto}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">{pick(locale, p.titleEn, p.titleAr) || '—'}</p>
                <p className="line-clamp-2 text-sm text-muted">{pick(locale, p.bodyEn, p.bodyAr)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <IconButton label={m.moveUp} onClick={() => i > 0 && action.run(`mvp-${p.id}`, { action: 'movePost', id: p.id, by: -1 })}>
                  <path d="M12 19V5M6 11l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                </IconButton>
                <IconButton label={m.moveDown} onClick={() => i < data.posts.length - 1 && action.run(`mvp-${p.id}`, { action: 'movePost', id: p.id, by: 1 })}>
                  <path d="M12 5v14M6 13l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </IconButton>
                <IconButton label={m.edit} onClick={() => setEditing(p)}>
                  <path d="M4 20h4L19 9l-4-4L4 16v4z" strokeLinejoin="round" />
                </IconButton>
                <IconButton
                  label={confirm === p.id ? m.confirmRemovePost : m.removePost}
                  danger={confirm === p.id}
                  onClick={() => {
                    if (confirm !== p.id) return setConfirm(p.id);
                    setConfirm(null);
                    void action.run(`rmp-${p.id}`, { action: 'removePost', id: p.id });
                  }}
                >
                  <path d="M5 7h14M10 11v6M14 11v6M7 7l1 13h8l1-13M9 7V4h6v3" strokeLinejoin="round" strokeLinecap="round" />
                </IconButton>
              </div>
              {confirm === p.id && <p className="panel-in w-full text-xs text-busy">{m.confirmRemovePost}</p>}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <PostEditor
          key={editing === 'new' ? 'new' : editing.id}
          slug={slug}
          m={m}
          post={editing === 'new' ? null : current}
          setData={setData}
          action={action}
          onClose={() => setEditing(null)}
          onCreated={() => setBefore(new Set(data.posts.map((p) => p.id)))}
        />
      )}
    </div>
  );
}

function PostEditor({
  slug,
  m,
  post,
  setData,
  action,
  onClose,
  onCreated,
}: {
  slug: string;
  m: ManageText;
  post: Post | null;
  setData: (d: ManageData) => void;
  action: Action;
  onClose: () => void;
  onCreated: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState({
    titleAr: post?.titleAr ?? '',
    titleEn: post?.titleEn ?? '',
    bodyAr: post?.bodyAr ?? '',
    bodyEn: post?.bodyEn ?? '',
  });
  const [photoBusy, setPhotoBusy] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const ok = await action.run('post', { action: 'savePost', ...(post ? { id: post.id } : {}), ...f });
    if (!ok) return;
    if (post) onClose();
    else onCreated();
  }

  async function photo(file: File | null) {
    if (!post) return;
    setPhotoBusy(true);
    action.setError(null);
    try {
      let res: Response;
      if (file) {
        const form = new FormData();
        form.set('kind', 'post');
        form.set('itemId', post.id);
        form.set('file', await shrinkImage(file, 'post'), 'photo');
        res = await fetch(`/api/manage/${slug}/image`, { method: 'POST', body: form, signal: AbortSignal.timeout(45_000) });
      } else {
        res = await fetch(`/api/manage/${slug}/image?kind=post&itemId=${post.id}`, { method: 'DELETE' });
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) action.setError(m.errors[json.error] ?? m.errors.generic);
      else setData(json.data);
    } catch {
      action.setError(m.errors.generic);
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <dialog ref={ref} onClose={onClose} className="cr-modal m-auto w-[calc(100%-1.5rem)] max-w-2xl overflow-clip bg-transparent p-0 text-ink">
      <form onSubmit={save} className="panel-in hud flex max-h-[calc(100dvh-4rem)] flex-col" style={{ background: '#0B0F24' }}>
        <h2 className="p-6 pb-3 font-display text-2xl font-bold text-ink">{post ? m.editPost : m.addPost}</h2>
        <div className="cr-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={m.titleAr} value={f.titleAr} onChange={set('titleAr')} maxLength={80} dir="rtl" />
            <Field label={m.titleEn} value={f.titleEn} onChange={set('titleEn')} maxLength={80} dir="ltr" />
            <TextArea label={m.bodyAr} value={f.bodyAr} onChange={set('bodyAr')} maxLength={5000} dir="rtl" rows={10} />
            <TextArea label={m.bodyEn} value={f.bodyEn} onChange={set('bodyEn')} maxLength={5000} dir="ltr" rows={10} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">{m.postPhoto}</p>
            {post && (
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <div className="aspect-[4/3] w-40 overflow-hidden bg-void/70 shadow-[inset_0_0_0_1px_rgba(157,92,255,0.35)]">
                  {post.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.imageUrl} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <label className={`btn-ghost relative cursor-pointer text-sm ${photoBusy ? 'pointer-events-none opacity-60' : ''}`}>
                  {photoBusy ? m.uploading : post.imageUrl ? m.change : m.upload}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      e.target.value = '';
                      if (file) void photo(file);
                    }}
                  />
                </label>
                {post.imageUrl && (
                  <button type="button" className="text-xs text-muted hover:text-busy" disabled={photoBusy} onClick={() => photo(null)}>
                    {m.removeImage}
                  </button>
                )}
              </div>
            )}
            <p className="mt-1.5 text-xs text-muted">{post ? m.postPhotoHint : m.photoAfterSavePost}</p>
          </div>
          {action.error && <p className="text-sm text-busy">{action.error}</p>}
        </div>
        <div className="flex gap-2 border-t border-line p-4 px-6">
          <button type="submit" className="btn-neon" disabled={!!action.busy}>
            {action.busy ? m.saving : m.save}
          </button>
          <button type="button" className="btn-ghost" onClick={onClose}>
            {m.cancel}
          </button>
        </div>
      </form>
    </dialog>
  );
}

// ------------------------------------------------------------------ access (super admin)

export function Access({ m, data, action }: { m: ManageText; data: ManageData; action: Action }) {
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
      <section className="hud space-y-3 p-5 sm:p-6">
        <h2 className="font-display text-xl font-bold text-ink">{m.visibility}</h2>
        <p className={`flex items-center gap-2 text-sm ${data.isPublished ? 'text-free' : 'text-muted'}`}>
          <span className={`h-2.5 w-2.5 ${data.isPublished ? 'bg-free' : 'bg-off'}`} aria-hidden="true" />
          {data.isPublished ? m.visibleOn : m.visibleOff}
        </p>
        <button
          type="button"
          className={data.isPublished ? 'btn-ghost' : 'btn-neon'}
          disabled={!!action.busy}
          onClick={() => action.run('publish', { action: 'setPublished', on: !data.isPublished })}
        >
          {data.isPublished ? m.hide : m.publish}
        </button>
        <div className="border-t border-line pt-4">
          <h3 className="font-display text-base font-bold text-ink">{m.subTitle}</h3>
          <p className="mt-1 text-xs text-muted">{m.subHint}</p>
          <p className={`mt-2 text-sm ${SUB_TONE[data.sub.state]}`}>
            {m.subState[data.sub.state]}
            {data.sub.endsAt && (
              <>
                {' · '}
                {m.subUntil}{' '}
                <bdi dir="ltr" className="font-hud">
                  {formatDamascusDate(new Date(data.sub.endsAt))}
                </bdi>
              </>
            )}
            {data.sub.plan && <span className="text-muted"> · {m.subPlan[data.sub.plan] ?? data.sub.plan}</span>}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-neon text-sm" disabled={!!action.busy} onClick={() => action.run('sub', { action: 'subscription', op: 'MONTH' })}>
              + {m.subMonth}
            </button>
            <button type="button" className="btn-neon text-sm" disabled={!!action.busy} onClick={() => action.run('sub', { action: 'subscription', op: 'YEAR' })}>
              + {m.subYear}
            </button>
            {data.sub.state === 'paused' ? (
              <button type="button" className="btn-ghost text-sm" disabled={!!action.busy} onClick={() => action.run('sub', { action: 'subscription', op: 'resume' })}>
                {m.subResume}
              </button>
            ) : (
              <button
                type="button"
                className="px-4 py-2 text-sm font-semibold text-busy shadow-[inset_0_0_0_1px_rgba(255,45,85,0.6)] hover:bg-busy hover:text-white"
                disabled={!!action.busy}
                onClick={() => action.run('sub', { action: 'subscription', op: 'pause' })}
              >
                {m.subPause}
              </button>
            )}
            {data.sub.state !== 'free' && (
              <button type="button" className="text-xs text-muted hover:text-ink" disabled={!!action.busy} onClick={() => action.run('sub', { action: 'subscription', op: 'free' })}>
                {m.subFree}
              </button>
            )}
          </div>
        </div>
        <div className="border-t border-line pt-4">
          <h3 className="font-display text-base font-bold text-ink">{m.googleTitle}</h3>
          <p className="mt-1 text-xs text-muted">{m.googleHint}</p>
          <p className={`mt-2 flex items-center gap-2 text-sm ${data.searchVisible ? 'text-free' : 'text-muted'}`}>
            <span className={`h-2.5 w-2.5 ${data.searchVisible ? 'bg-free' : 'bg-off'}`} aria-hidden="true" />
            {data.searchVisible ? m.googleOn : m.googleOff}
          </p>
          <button
            type="button"
            className={`mt-2 ${data.searchVisible ? 'btn-ghost' : 'btn-neon'}`}
            disabled={!!action.busy}
            onClick={() => action.run('google', { action: 'setSearchVisible', on: !data.searchVisible })}
          >
            {data.searchVisible ? m.googleHide : m.googleShow}
          </button>
        </div>
        <div className="border-t border-busy/40 pt-4">
          <h3 className="font-display text-base font-bold text-busy">{m.deleteTitle}</h3>
          <p className="mt-1 text-xs text-muted">{m.deleteHint}</p>
          <button
            type="button"
            className="mt-3 px-4 py-2 text-sm font-semibold text-busy shadow-[inset_0_0_0_1px_rgba(255,45,85,0.6)] hover:bg-busy hover:text-white"
            disabled={!!action.busy}
            onClick={() => setDeleting(true)}
          >
            {m.deleteBtn}
          </button>
        </div>
      </section>
      {deleting && (
        <ConfirmDialog
          title={m.deleteAsk(data.arena.nameAr || data.arena.nameEn)}
          body={m.deleteHint}
          input={{ label: m.deleteType, required: true, maxLength: 120, single: true, placeholder: data.arena.nameAr || data.arena.nameEn, match: data.arena.nameAr || data.arena.nameEn }}
          danger
          confirmLabel={m.deleteBtn}
          cancelLabel={m.cancel}
          onClose={() => setDeleting(false)}
          onConfirm={async (typed) => {
            if (!(await action.run('delete', { action: 'deleteArena', confirm: typed }))) return false;
            window.location.assign('/admin');
            return false; // stay open (busy) while the page changes
          }}
        />
      )}

      <Team m={m} data={data} action={action} admin />
    </div>
  );
}

// ------------------------------------------------------------------ team

/** The arena's people. Super admin (admin): owners and staff. Owner: adds and removes staff. */
export function Team({ m, data, action, admin = false }: { m: ManageText; data: ManageData; action: Action; admin?: boolean }) {
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'OWNER' | 'STAFF'>(admin ? 'OWNER' : 'STAFF');
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <section className="hud space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="font-display text-xl font-bold text-ink">{admin ? m.members : m.team}</h2>
          <p className="mt-1 text-sm text-muted">{admin ? m.membersHint : m.teamHint}</p>
        </div>
        {data.members.length === 0 ? (
          <p className="text-sm text-muted">{admin ? m.membersEmpty : m.teamEmpty}</p>
        ) : (
          <ul className="space-y-2">
            {data.members.map((x) => (
              <li key={x.userId} className="flex flex-wrap items-center gap-3 bg-void/50 px-3 py-2">
                <span className={`px-1.5 py-px text-[0.6875rem] font-semibold ${x.role === 'OWNER' ? 'bg-violet/30 text-violet-soft' : 'bg-cyan/15 text-cyan'}`}>
                  {m.role[x.role]}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink">
                  <bdi>{x.name}</bdi>
                </span>
                <span dir="ltr" className="font-hud text-xs text-muted">
                  {x.phone}
                </span>
                {(admin || x.role === 'STAFF') && (
                <button
                  type="button"
                  className={`text-xs ${confirm === x.userId ? 'text-busy' : 'text-muted hover:text-busy'}`}
                  onClick={() => {
                    if (confirm !== x.userId) return setConfirm(x.userId);
                    setConfirm(null);
                    void action.run(`rmm-${x.userId}`, { action: 'removeMember', userId: x.userId });
                  }}
                >
                  {confirm === x.userId ? m.confirmRemoveMember : m.removeMember}
                </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await action.run('member', { action: 'setMember', phone, role: admin ? role : 'STAFF' })) setPhone('');
          }}
        >
          <div className="min-w-[12rem] flex-1">
            <Field label={m.memberPhone} value={phone} onChange={(e) => setPhone(e.target.value)} required dir="ltr" inputMode="tel" placeholder="09XX XXX XXX" />
          </div>
          {/* An owner adds staff only; owners are added by the super admin. */}
          {admin && (
          <div className="flex gap-2">
            {(['OWNER', 'STAFF'] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={role === r}
                onClick={() => setRole(r)}
                className={`city-option px-3 py-2.5 text-sm ${role === r ? 'city-option-on text-ink' : 'text-muted hover:text-ink'}`}
              >
                {m.role[r]}
              </button>
            ))}
          </div>
          )}
          <button type="submit" className="btn-neon" disabled={!!action.busy}>
            {admin ? m.addMember : m.addStaff}
          </button>
        </form>
      </section>
  );
}

// ------------------------------------------------------------------ offers

const OFFER_TYPES = ['', 'PC', 'PS5', 'PS4', 'XBOX'] as const;
type OfferRow = ManageData['offers'][number];
const OFFER_KIND_LIST = ['package', 'rate', 'percent'] as const;
type Kind = (typeof OFFER_KIND_LIST)[number];
const blankOffer = { kind: 'package' as Kind, hours: 5, price: '', stationType: '' as string, noteAr: '', noteEn: '' };

export function Offers({ locale, m, data, action }: { locale: Locale; m: ManageText; data: ManageData; action: Action }) {
  const [editing, setEditing] = useState<OfferRow | 'new' | null>(null);
  const t = dictionary(locale);
  return (
    <div className="hud space-y-5 p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">{m.offersHint}</p>
        <button type="button" className="btn-neon text-sm" onClick={() => setEditing('new')}>
          + {m.newOffer}
        </button>
      </div>
      {data.offers.length === 0 && editing !== 'new' && <p className="py-6 text-center text-muted">{m.noOffers}</p>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {editing === 'new' && (
          <OfferForm locale={locale} m={m} data={data} offer={null} action={action} onDone={() => setEditing(null)} />
        )}
        {data.offers.map((o) =>
          editing !== 'new' && editing?.id === o.id ? (
            <OfferForm key={o.id} locale={locale} m={m} data={data} offer={o} action={action} onDone={() => setEditing(null)} />
          ) : (
            <li key={o.id} className="offer-ticket flex items-center gap-4 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-display text-lg font-bold text-amber-100">{offerLabel(o, locale).deal}</span>
                <span className="block text-xs text-amber-200/75">
                  {offerLabel(o, locale).when} · {o.stationType ? t.station.typeShort[o.stationType as keyof typeof t.station.typeShort] : m.allStations}
                </span>
                {(o.noteAr || o.noteEn) && <span className="block truncate text-xs text-ink/80">{pick(locale, o.noteEn || o.noteAr, o.noteAr || o.noteEn)}</span>}
              </span>
              <IconButton label={m.edit} onClick={() => setEditing(o)}>
                <path d="M4 20h4L19 9l-4-4L4 16v4z" strokeLinejoin="round" />
              </IconButton>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function OfferForm({
  locale,
  m,
  data,
  offer,
  action,
  onDone,
}: {
  locale: Locale;
  m: ManageText;
  data: ManageData;
  offer: OfferRow | null;
  action: Action;
  onDone: () => void;
}) {
  const t = dictionary(locale);
  const [f, setF] = useState(
    offer
      ? { kind: offer.kind as Kind, hours: offer.hours, price: offer.price, stationType: offer.stationType, noteAr: offer.noteAr, noteEn: offer.noteEn }
      : blankOffer,
  );
  const [confirm, setConfirm] = useState(false);
  const rate = Number(data.arena.hourlyRate) || 0;
  const normal = Math.round(rate * f.hours);
  const value = Number(f.price);
  const notCheaper =
    f.price !== '' &&
    rate > 0 &&
    (f.kind === 'package' ? value >= normal : f.kind === 'rate' ? value >= rate : value < 1 || value > 90);
  const priceLabel = f.kind === 'package' ? m.offerPrice : f.kind === 'rate' ? m.offerRate : m.offerPercent;
  const priceHint = notCheaper
    ? f.kind === 'percent'
      ? m.errors.bad_percent
      : m.offerNotCheaper
    : rate > 0 && f.kind === 'package'
      ? m.offerNormal(money(normal))
      : rate > 0 && f.kind === 'rate'
        ? m.offerNormalRate(money(rate))
        : '';

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const ok = await action.run('offer', { action: 'saveOffer', ...(offer ? { id: offer.id } : {}), ...f });
    if (ok) onDone();
  }

  return (
    <li className="panel-in sm:col-span-2">
      <form onSubmit={save} className="space-y-4 bg-void/60 p-4 shadow-[inset_0_0_0_1px_rgba(41,224,255,0.45)]">
        <fieldset>
          <legend className="text-sm font-semibold text-ink">{m.offerKind}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {OFFER_KIND_LIST.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={f.kind === k}
                onClick={() => setF((x) => ({ ...x, kind: k, price: '' }))}
                className={`city-option px-3 py-2.5 text-start ${f.kind === k ? 'city-option-on text-ink' : 'text-muted hover:text-ink'}`}
              >
                <span className="block text-sm font-semibold">{m.offerKinds[k].name}</span>
                <span className="block text-xs opacity-80">{m.offerKinds[k].hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className="text-sm font-semibold text-ink">{f.kind === 'package' ? m.offerHours : m.offerFrom}</legend>
            <div className="mt-1.5 flex items-stretch gap-2">
              <button type="button" className="city-option w-11 text-lg text-ink disabled:opacity-30" disabled={f.hours <= 1} onClick={() => setF((x) => ({ ...x, hours: x.hours - 1 }))}>
                −
              </button>
              <span className="flex flex-1 items-center justify-center bg-void/60 font-display text-lg font-bold text-ink shadow-[inset_0_0_0_1px_rgba(157,92,255,0.35)]">
                {t.book.hours(f.hours * 60)}
              </span>
              <button type="button" className="city-option w-11 text-lg text-ink disabled:opacity-30" disabled={f.hours >= 24} onClick={() => setF((x) => ({ ...x, hours: x.hours + 1 }))}>
                +
              </button>
            </div>
          </fieldset>
          <div>
            <Field label={priceLabel} value={f.price} onChange={(e) => setF((x) => ({ ...x, price: e.target.value }))} inputMode="decimal" dir="ltr" required />
            <p className={`mt-1 text-xs ${notCheaper ? 'text-busy' : 'text-muted'}`}>{priceHint}</p>
          </div>
        </div>
        <fieldset>
          <legend className="text-sm font-semibold text-ink">{m.offerFor}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {OFFER_TYPES.map((k) => (
              <button
                key={k || 'all'}
                type="button"
                aria-pressed={f.stationType === k}
                onClick={() => setF((x) => ({ ...x, stationType: k }))}
                className={`city-option px-3 py-1.5 text-sm ${f.stationType === k ? 'city-option-on text-ink' : 'text-muted hover:text-ink'}`}
              >
                {k ? t.station.typeShort[k] : m.allStations}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={m.offerNoteAr} value={f.noteAr} onChange={(e) => setF((x) => ({ ...x, noteAr: e.target.value }))} maxLength={120} dir="rtl" />
          <Field label={m.offerNoteEn} value={f.noteEn} onChange={(e) => setF((x) => ({ ...x, noteEn: e.target.value }))} maxLength={120} dir="ltr" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-neon" disabled={!!action.busy || !f.price}>
            {m.saveOffer}
          </button>
          <button type="button" className="btn-ghost" onClick={onDone}>
            {m.cancel}
          </button>
          {offer && (
            <button
              type="button"
              className={`ms-auto text-sm ${confirm ? 'font-semibold text-busy' : 'text-muted hover:text-busy'}`}
              disabled={!!action.busy}
              onClick={async () => {
                if (!confirm) return setConfirm(true);
                if (await action.run('rmoffer', { action: 'removeOffer', id: offer.id })) onDone();
              }}
            >
              {confirm ? m.confirmRemove : m.remove}
            </button>
          )}
        </div>
      </form>
    </li>
  );
}

const SUB_TONE: Record<string, string> = { free: 'text-muted', active: 'text-free', ending: 'text-amber-300', expired: 'text-busy', paused: 'text-busy' };

/** The owner's notice when the platform subscription is ending, ended or paused. */
export function SubscriptionNotice({ m, data }: { m: ManageText; data: ManageData }) {
  const { state, endsAt, contact } = data.sub;
  if (state !== 'ending' && state !== 'expired' && state !== 'paused') return null;
  const warn = state === 'ending';
  return (
    <div
      role="status"
      className={`px-4 py-3 text-sm ${warn ? 'bg-amber-400/10 text-amber-200 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.5)]' : 'bg-busy/10 text-ink shadow-[inset_0_0_0_1px_rgba(255,45,85,0.55)]'}`}
    >
      <p className="font-semibold">
        {warn ? '⏳ ' : '⛔ '}
        {warn && endsAt ? m.subEndingOwner(formatDamascusDate(new Date(endsAt))) : state === 'paused' ? m.subPausedOwner : m.subExpiredOwner}
      </p>
      <p className="mt-1 text-xs opacity-80">
        {m.subRenew}
        {contact && (
          <>
            {' '}
            <a href={`mailto:${contact}`} dir="ltr" className="font-semibold text-cyan hover:underline">
              {contact}
            </a>
          </>
        )}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ activity

type Row = ActivityRow;
type ShiftRowT = ShiftRow;

const tone = (a: string) =>
  a === 'booking.noshow' || a === 'arena.ban' || a === 'booking.cancel'
    ? 'busy'
    : a === 'booking.arrived' || a === 'booking.create'
      ? 'free'
      : a.startsWith('shift.')
        ? 'cyan'
        : 'muted';
const DOT: Record<string, string> = { busy: 'bg-busy', free: 'bg-free', cyan: 'bg-cyan', muted: 'bg-muted' };
const TEXT: Record<string, string> = { busy: 'text-busy', free: 'text-free', cyan: 'text-cyan', muted: 'text-ink' };

// Table-style rows: the same columns line up on wide screens, and fold into
// a small card on phones.
const LOG_COLS = 'md:grid md:grid-cols-[4.5rem_minmax(0,1.2fr)_minmax(0,1.6fr)_5rem_minmax(0,1.2fr)_minmax(0,1.4fr)] md:items-center md:gap-4';
const SHIFT_COLS = 'md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_6rem_repeat(5,4.5rem)_5rem] md:items-center md:gap-3';
const head = 'hidden px-4 pb-2 text-xs text-muted md:grid';

function LogHead({ m }: { m: ManageText }) {
  return (
    <div className={`${head} ${LOG_COLS}`}>
      <span>{m.colTime}</span>
      <span>{m.colWho}</span>
      <span>{m.colWhat}</span>
      <span>{m.colStation}</span>
      <span>{m.colPlayer}</span>
      <span>{m.colNote}</span>
    </div>
  );
}

function LogRow({ m, r, locale }: { m: ManageText; r: Row; locale: Locale }) {
  const t = tone(r.action);
  // Ready-made cancel reasons are stored as keys ("k:taken"): show their words.
  const reason = r.reason ? reasonText(r.reason, locale) : '';
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm odd:bg-white/[0.025] ${LOG_COLS}`}>
      <span className="font-hud text-muted" dir="ltr">
        {formatDamascusTime(new Date(r.at))}
      </span>
      <span className="min-w-0 truncate">
        <bdi className="font-semibold text-ink">{r.who || m.actorRole[r.actor]}</bdi> <span className="text-xs text-muted">{m.actorRole[r.actor]}</span>
      </span>
      <span className={`flex min-w-0 items-center gap-2 ${TEXT[t]}`}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[t]}`} aria-hidden="true" />
        <span className="truncate">{r.auto ? m.shiftAutoStart : (m.act[r.action] ?? m.actOther)}</span>
      </span>
      <span className="text-muted">{r.pcNumber != null ? m.pcShort(r.pcNumber) : <span className="hidden md:inline">—</span>}</span>
      <span className="min-w-0 truncate text-muted">{r.player && r.actor !== 'PLAYER' ? <bdi>{r.player}</bdi> : <span className="hidden md:inline">—</span>}</span>
      <span className="min-w-0 truncate text-muted">
        {[r.minutes != null ? m.minShort(r.minutes) : '', reason ? `«${reason}»` : ''].filter(Boolean).join(' · ') || <span className="hidden md:inline">—</span>}
      </span>
    </li>
  );
}

/** Rows grouped under a heading per day. */
function DayGroups({ m, rows, locale }: { m: ManageText; rows: Row[]; locale: Locale }) {
  const days: [string, Row[]][] = [];
  for (const r of rows) {
    const d = formatDamascusDate(new Date(r.at));
    const last = days[days.length - 1];
    if (last && last[0] === d) last[1].push(r);
    else days.push([d, [r]]);
  }
  return (
    <div className="space-y-4">
      <LogHead m={m} />
      {days.map(([d, list]) => (
        <div key={d}>
          <h4 className="bg-violet/10 px-4 py-1.5 text-xs font-semibold text-violet-soft">{dayOf(m, list[0].at, true)}</h4>
          <ol>
            {list.map((r) => (
              <LogRow key={r.id} m={m} r={r} locale={locale} />
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

/** Page through a long list, `size` at a time, with back / forward arrows. */
function usePages<T>(items: T[], size: number) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const at = Math.min(page, pages - 1);
  return { slice: items.slice(at * size, at * size + size), page: at, pages, setPage };
}

function Pager({ m, page, pages, setPage }: { m: ManageText; page: number; pages: number; setPage: (n: number) => void }) {
  if (pages <= 1) return null;
  const btn = 'grid h-9 w-9 place-items-center text-ink shadow-[inset_0_0_0_1px_rgba(157,92,255,0.5)] hover:bg-violet/20 disabled:opacity-30 disabled:hover:bg-transparent';
  return (
    <div className="flex items-center justify-center gap-3 pt-3">
      <button type="button" className={btn} onClick={() => setPage(page - 1)} disabled={page === 0} aria-label={m.pagePrev}>
        <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:rotate-180" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <span className="font-hud text-sm text-muted">{m.pageOf(page + 1, pages)}</span>
      <button type="button" className={btn} onClick={() => setPage(page + 1)} disabled={page >= pages - 1} aria-label={m.pageNext}>
        <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:rotate-180" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

/** "Today" / "Yesterday" / "11-23" (or the full date). */
function dayOf(m: ManageText, iso: string, full = false) {
  const d = formatDamascusDate(new Date(iso));
  if (d === formatDamascusDate(new Date())) return m.today;
  if (d === formatDamascusDate(new Date(Date.now() - 86400_000))) return m.yesterday;
  return full ? d : d.slice(5);
}

function duration(m: ManageText, from: string, to: string | null) {
  const mins = Math.max(0, Math.round(((to ? +new Date(to) : Date.now()) - +new Date(from)) / 60_000));
  return m.lasted(Math.floor(mins / 60), mins % 60);
}

function ShiftLog({ m, rows, locale }: { m: ManageText; rows: Row[]; locale: Locale }) {
  const p = usePages(rows, 15);
  if (rows.length === 0) return <p className="py-3 text-sm text-muted">{m.logEmpty}</p>;
  return (
    <>
      <DayGroups m={m} rows={p.slice} locale={locale} />
      <Pager m={m} {...p} />
    </>
  );
}

function ShiftHead({ m }: { m: ManageText }) {
  return (
    <div className={`${head} ${SHIFT_COLS}`}>
      <span>{m.colWho}</span>
      <span>{m.colWhen}</span>
      <span>{m.colLength}</span>
      <span className="text-center">{m.chipBooked}</span>
      <span className="text-center">{m.chipArrived}</span>
      <span className="text-center">{m.chipNoShow}</span>
      <span className="text-center">{m.chipCancel}</span>
      <span className="text-center">{m.chipWalkIn}</span>
      <span />
    </div>
  );
}

/** Who pressed what, in which shift (owners and the site admin). */
export function Activity({ m, slug, locale }: { m: ManageText; slug: string; locale: Locale }) {
  const [loaded, setLoaded] = useState<{ rows: ActivityRow[]; shifts: ShiftRow[] } | null>(null);
  // Loaded when the tab opens, refreshed every 30 s while it stays open.
  useEffect(() => {
    let stop = false;
    const load = async () => {
      const res = await fetch(`/api/manage/${slug}?activity=1`, { cache: 'no-store' }).catch(() => null);
      if (!stop && res?.ok) setLoaded(await res.json());
    };
    void load();
    const timer = setInterval(() => !document.hidden && load(), 30_000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [slug]);
  const { rows, shifts } = loaded ?? { rows: [], shifts: [] };
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const onNow = shifts.filter((s) => !s.endedAt);
  const past = shifts.filter((s) => s.endedAt);
  const pastPages = usePages(past, 10);
  const logPages = usePages(rows, 15);

  const rowsOf = (s: ShiftRowT) => {
    const from = +new Date(s.startedAt);
    const to = s.endedAt ? +new Date(s.endedAt) : Infinity;
    return rows.filter((r) => r.shiftId === s.id || (r.action === 'booking.create' && +new Date(r.at) >= from && +new Date(r.at) < to));
  };

  const ShiftItem = ({ s }: { s: ShiftRowT }) => {
    const isOpen = open === s.id;
    const cells = [
      [s.booked, 'text-free', m.chipBooked],
      [s.arrived, 'text-free', m.chipArrived],
      [s.noShows, 'text-busy', m.chipNoShow],
      [s.cancels, 'text-busy', m.chipCancel],
      [s.walkIns, 'text-cyan', m.chipWalkIn],
    ] as const;
    return (
      <li className={`${isOpen ? 'bg-cyan/[0.06] shadow-[inset_0_0_0_1px_rgba(41,224,255,0.55)]' : 'odd:bg-white/[0.025]'}`}>
        <button
          type="button"
          onClick={() => setOpen(isOpen ? null : s.id)}
          aria-expanded={isOpen}
          className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 text-start text-sm hover:bg-white/5 ${SHIFT_COLS}`}
        >
          <span className="min-w-0 basis-full truncate md:basis-auto">
            <bdi className="font-semibold text-ink">{s.who}</bdi> <span className="text-xs text-muted">{m.actorRole[s.role]}</span>
            {s.autoStarted && (
              <span title={m.shiftAutoHint} className="ms-2 bg-amber-400/10 px-1.5 py-px text-xs text-amber-300 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.4)]">
                {m.shiftAuto}
              </span>
            )}
          </span>
          <span className="font-hud text-muted" dir="ltr">
            {dayOf(m, s.startedAt)} {formatDamascusTime(new Date(s.startedAt))} → {s.endedAt ? formatDamascusTime(new Date(s.endedAt)) : <span className="text-free">{m.shiftNow}</span>}
          </span>
          <span className="text-muted">{duration(m, s.startedAt, s.endedAt)}</span>
          {cells.map(([n, color, label]) => (
            <span key={label} className={`md:text-center ${n ? '' : 'hidden md:inline'}`}>
              <b className={`font-hud ${n ? color : 'text-muted/50'}`}>{n}</b> <span className="text-xs text-muted md:hidden">{label}</span>
            </span>
          ))}
          <span className="text-xs text-cyan md:text-end">{isOpen ? m.hideDetails : m.showDetails}</span>
        </button>
        {isOpen && (
          <div className="border-t border-line/60 px-2 pb-3 pt-3 md:px-4">
            <ShiftLog m={m} rows={rowsOf(s)} locale={locale} />
          </div>
        )}
      </li>
    );
  };

  if (!loaded) return <p className="hud p-6 text-muted">{m.loading}</p>;

  return (
    <div className="space-y-5">
      <section className="hud p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-ink">{m.onShiftNow}</h2>
          <p className="max-w-prose text-xs text-muted">{m.shiftsHint}</p>
        </div>
        {onNow.length === 0 ? (
          <p className="px-4 text-sm text-muted">{m.nobodyOnShift}</p>
        ) : (
          <>
            <ShiftHead m={m} />
            <ul>
              {onNow.map((s) => (
                <ShiftItem key={s.id} s={s} />
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="hud p-4 sm:p-6">
        <h2 className="mb-4 font-display text-lg font-bold text-ink">{m.pastShifts}</h2>
        {past.length === 0 ? (
          <p className="px-4 text-sm text-muted">{m.shiftsEmpty}</p>
        ) : (
          <>
            <ShiftHead m={m} />
            <ul>
              {pastPages.slice.map((s) => (
                <ShiftItem key={s.id} s={s} />
              ))}
            </ul>
            <Pager m={m} {...pastPages} />
          </>
        )}
      </section>

      <section className="hud p-4 sm:p-6">
        <button type="button" onClick={() => setShowAll(!showAll)} aria-expanded={showAll} className="flex w-full items-center justify-between text-start">
          <span className="font-display text-lg font-bold text-ink">{m.logTitle}</span>
          <span className="text-sm text-cyan">{showAll ? m.hideDetails : m.showDetails}</span>
        </button>
        {showAll && (
          <div className="mt-4">
            {rows.length ? (
              <>
                <DayGroups m={m} rows={logPages.slice} locale={locale} />
                <Pager m={m} {...logPages} />
              </>
            ) : (
              <p className="text-muted">{m.logEmpty}</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
