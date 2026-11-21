'use client';

// Dashboard tabs: Players (who booked here), Posts (photo + text on the arena
// page) and Access (super admin: publish/hide, owners and staff).
import { useEffect, useMemo, useRef, useState } from 'react';
import { shrinkImage } from '@/lib/manage/shrink';
import { Field, IconButton, TextArea } from '@/components/manage/fields';
import type { Action } from '@/components/manage/ManagePanel';
import { cityName } from '@/lib/cities';
import { dictionary, pick, type Locale } from '@/lib/i18n';
import { money, offerLabel } from '@/lib/offers';
import PlayerBadge, { badgeName } from '@/components/PlayerBadge';
import type { ManageText } from '@/lib/i18n-manage';
import type { ManageData } from '@/lib/manage/service';
import { formatDamascusDate } from '@/lib/time';

// ------------------------------------------------------------------ players

export function Players({ locale, m, data, action }: { locale: Locale; m: ManageText; data: ManageData; action: Action }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'' | 'vip' | 'loyal' | 'new'>('');
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
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-start text-xs text-muted">
                {[m.colPlayer, m.colBadge, m.colPhone, m.colCity, m.colBookings, m.colNoShows, m.colLast].map((h) => (
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
                <span className="grid h-16 w-24 shrink-0 place-items-center bg-void/60 text-[11px] text-muted">{m.noPhoto}</span>
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
                    accept="image/png,image/jpeg,image/webp"
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
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'OWNER' | 'STAFF'>('OWNER');
  const [confirm, setConfirm] = useState<string | null>(null);

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
      </section>

      <section className="hud space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="font-display text-xl font-bold text-ink">{m.members}</h2>
          <p className="mt-1 text-sm text-muted">{m.membersHint}</p>
        </div>
        {data.members.length === 0 ? (
          <p className="text-sm text-muted">{m.membersEmpty}</p>
        ) : (
          <ul className="space-y-2">
            {data.members.map((x) => (
              <li key={x.userId} className="flex flex-wrap items-center gap-3 bg-void/50 px-3 py-2">
                <span className={`px-1.5 py-px text-[11px] font-semibold ${x.role === 'OWNER' ? 'bg-violet/30 text-violet-soft' : 'bg-cyan/15 text-cyan'}`}>
                  {m.role[x.role]}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink">
                  <bdi>{x.name}</bdi>
                </span>
                <span dir="ltr" className="font-hud text-xs text-muted">
                  {x.phone}
                </span>
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
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await action.run('member', { action: 'setMember', phone, role })) setPhone('');
          }}
        >
          <div className="min-w-[12rem] flex-1">
            <Field label={m.memberPhone} value={phone} onChange={(e) => setPhone(e.target.value)} required dir="ltr" inputMode="tel" placeholder="09XX XXX XXX" />
          </div>
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
          <button type="submit" className="btn-neon" disabled={!!action.busy}>
            {m.addMember}
          </button>
        </form>
      </section>
    </div>
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
