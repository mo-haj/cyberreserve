'use client';

// Cancelling a booking with a reason (sent to the player), and stopping a
// player from booking at this arena: for some hours/days, or for good.
import { useEffect, useRef, useState } from 'react';
import type { Action } from '@/components/manage/ManagePanel';
import type { ManageText } from '@/lib/i18n-manage';
import { formatDamascusTime, toDamascusParts } from '@/lib/time';

const UNITS = [
  { key: 'hours', minutes: 60 },
  { key: 'days', minutes: 24 * 60 },
  { key: 'weeks', minutes: 7 * 24 * 60 },
  { key: 'months', minutes: 30 * 24 * 60 },
] as const;
type Unit = (typeof UNITS)[number]['key'];

export interface BanChoice {
  /** null = for good. */
  minutes: number | null;
  reason: string;
}

/** Duration (any number of hours/days/weeks/months, or for good) + reason. */
function BanFields({ m, value, onChange }: { m: ManageText; value: { forever: boolean; amount: string; unit: Unit; reason: string }; onChange: (v: typeof value) => void }) {
  const set = (p: Partial<typeof value>) => onChange({ ...value, ...p });
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="text-sm font-semibold text-ink">{m.banFor}</legend>
        <p className="text-xs text-muted">{m.banForHint}</p>
        <div className="mt-2 flex flex-wrap items-stretch gap-2">
          <input
            type="number"
            min={1}
            max={999}
            inputMode="numeric"
            dir="ltr"
            value={value.amount}
            disabled={value.forever}
            onChange={(e) => set({ amount: e.target.value })}
            className="w-20 bg-void/70 px-3 py-2 text-center font-hud text-ink shadow-[inset_0_0_0_1px_rgba(157,92,255,0.45)] outline-none focus:shadow-[inset_0_0_0_1px_rgba(41,224,255,0.8)] disabled:opacity-40"
            aria-label={m.banAmount}
          />
          {UNITS.map((u) => (
            <button
              key={u.key}
              type="button"
              disabled={value.forever}
              aria-pressed={!value.forever && value.unit === u.key}
              onClick={() => set({ unit: u.key })}
              className={`city-option px-3 py-2 text-sm disabled:opacity-40 ${!value.forever && value.unit === u.key ? 'city-option-on text-ink' : 'text-muted hover:text-ink'}`}
            >
              {m.banUnits[u.key]}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={value.forever}
            onClick={() => set({ forever: !value.forever })}
            className={`px-3 py-2 text-sm font-semibold transition-colors ${
              value.forever
                ? 'bg-busy text-white'
                : 'bg-busy/10 text-busy shadow-[inset_0_0_0_1px_rgba(255,45,85,0.5)] hover:bg-busy/20'
            }`}
          >
            {m.banForever}
          </button>
        </div>
        <BanPreview m={m} value={value} />
      </fieldset>
      <label className="block">
        <span className="text-sm font-semibold text-ink">{m.banReason}</span>
        <span className="block text-xs text-muted">{m.banReasonHint}</span>
        <textarea
          value={value.reason}
          onChange={(e) => set({ reason: e.target.value })}
          maxLength={300}
          rows={3}
          dir="auto"
          className="mt-1.5 w-full resize-none bg-void/70 px-3 py-2 text-ink shadow-[inset_0_0_0_1px_rgba(157,92,255,0.45)] outline-none focus:shadow-[inset_0_0_0_1px_rgba(41,224,255,0.8)]"
        />
      </label>
    </div>
  );
}

/** "Cannot book with you until Mon 23/11, 20:50", worked out live. */
function BanPreview({ m, value }: { m: ManageText; value: { forever: boolean; amount: string; unit: Unit } }) {
  const n = Number(value.amount);
  if (value.forever) {
    return <p className="mt-2 bg-busy/10 px-3 py-2 text-sm text-busy shadow-[inset_0_0_0_1px_rgba(255,45,85,0.4)]">{m.banPreviewForever}</p>;
  }
  if (!Number.isInteger(n) || n < 1) return <p className="mt-2 text-sm text-busy">{m.banPreviewBad}</p>;
  const unit = UNITS.find((u) => u.key === value.unit)!;
  const end = new Date(Date.now() + n * unit.minutes * 60_000);
  const p = toDamascusParts(end);
  const when = `${m.weekdays[p.weekday]} ${p.day}/${p.month} · ${formatDamascusTime(end)}`;
  return (
    <p className="mt-2 bg-violet/10 px-3 py-2 text-sm text-ink shadow-[inset_0_0_0_1px_rgba(157,92,255,0.4)]">
      {m.banPreview(`${n} ${m.banUnits[value.unit]}`)} <bdi className="font-semibold text-cyan">{when}</bdi>
    </p>
  );
}

const blankBan = { forever: false, amount: '1', unit: 'days' as Unit, reason: '' };
function toChoice(v: typeof blankBan): BanChoice | null {
  const n = Number(v.amount);
  if (v.reason.trim().length < 3) return null;
  if (v.forever) return { minutes: null, reason: v.reason.trim() };
  if (!Number.isInteger(n) || n < 1) return null;
  const unit = UNITS.find((u) => u.key === v.unit)!;
  return { minutes: Math.min(n * unit.minutes, 5 * 365 * 24 * 60), reason: v.reason.trim() };
}

export function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onClose={onClose} className="cr-modal m-auto w-[calc(100%-1.5rem)] max-w-lg overflow-clip bg-transparent p-0 text-ink">
      <div className="panel-in hud flex max-h-[calc(100dvh-3rem)] flex-col" style={{ background: '#0B0F24' }}>
        <h2 className="p-6 pb-2 font-display text-xl font-bold text-ink">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

export function CancelDialog({
  m,
  booking,
  canBan,
  action,
  onClose,
}: {
  m: ManageText;
  booking: { id: string; userId: string; player: string; station: string };
  canBan: boolean;
  action: Action;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<string>('');
  const [own, setOwn] = useState('');
  const [ban, setBan] = useState(false);
  const [banValue, setBanValue] = useState(blankBan);
  const choice = toChoice(banValue);
  const final = reason === 'own' ? own.trim() : reason;

  async function submit() {
    const ok = await action.run(`bk-${booking.id}`, {
      action: 'markBooking',
      bookingId: booking.id,
      mark: 'cancel',
      ...(final ? { reason: final } : {}),
      ...(ban && choice ? { ban: choice } : {}),
    });
    if (ok) onClose();
  }

  return (
    <Shell title={m.cancelTitle(booking.player, booking.station)} onClose={onClose}>
      <div className="cr-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-4">
        <fieldset>
          <legend className="text-sm font-semibold text-ink">{m.cancelWhy}</legend>
          <p className="text-xs text-muted">{m.cancelWhyHint}</p>
          <div className="mt-2 grid gap-2">
            {(['k:maintenance', 'k:taken', 'k:closed', 'own'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={reason === k}
                onClick={() => setReason((r) => (r === k ? '' : k))}
                className={`city-option px-3 py-2.5 text-start text-sm ${reason === k ? 'city-option-on text-ink' : 'text-muted hover:text-ink'}`}
              >
                {k === 'own' ? m.reasonOwn : m.reasons[k.slice(2) as keyof ManageText['reasons']]}
              </button>
            ))}
          </div>
          {reason === 'own' && (
            <textarea
              value={own}
              onChange={(e) => setOwn(e.target.value)}
              maxLength={300}
              rows={3}
              dir="auto"
              autoFocus
              placeholder={m.reasonOwnPlaceholder}
              className="mt-2 w-full resize-none bg-void/70 px-3 py-2 text-ink placeholder:text-muted/50 shadow-[inset_0_0_0_1px_rgba(157,92,255,0.45)] outline-none focus:shadow-[inset_0_0_0_1px_rgba(41,224,255,0.8)]"
            />
          )}
        </fieldset>

        {canBan && booking.userId && (
          <div className="space-y-4 border-t border-line pt-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={ban} onChange={(e) => setBan(e.target.checked)} className="mt-1 h-4 w-4 accent-[#ff2d55]" />
              <span>
                <span className="block text-sm font-semibold text-ink">{m.alsoBan}</span>
                <span className="block text-xs text-muted">{m.alsoBanHint}</span>
              </span>
            </label>
            {ban && <BanFields m={m} value={banValue} onChange={setBanValue} />}
          </div>
        )}
        {action.error && <p className="text-sm text-busy">{action.error}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-6 py-4">
        <button
          type="button"
          onClick={submit}
          disabled={!!action.busy || (reason === 'own' && !own.trim()) || (ban && !choice)}
          className="bg-busy px-5 py-2.5 text-sm font-semibold text-white transition-shadow hover:shadow-[0_0_18px_-4px_rgba(255,45,85,0.9)] disabled:opacity-40"
        >
          {ban ? m.cancelAndBan : m.cancelSend}
        </button>
        <button type="button" className="btn-ghost text-sm" onClick={onClose}>
          {m.keepBooking}
        </button>
      </div>
    </Shell>
  );
}

export function BanDialog({
  m,
  player,
  action,
  onClose,
}: {
  m: ManageText;
  player: { id: string; name: string };
  action: Action;
  onClose: () => void;
}) {
  const [value, setValue] = useState(blankBan);
  const choice = toChoice(value);
  async function submit() {
    if (!choice) return;
    const ok = await action.run(`ban-${player.id}`, { action: 'banPlayer', userId: player.id, ...choice });
    if (ok) onClose();
  }
  return (
    <Shell title={m.banTitle(player.name)} onClose={onClose}>
      <div className="cr-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4">
        <p className="text-sm text-muted">{m.banHint}</p>
        <BanFields m={m} value={value} onChange={setValue} />
        {action.error && <p className="text-sm text-busy">{action.error}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-6 py-4">
        <button
          type="button"
          onClick={submit}
          disabled={!!action.busy || !choice}
          className="bg-busy px-5 py-2.5 text-sm font-semibold text-white transition-shadow hover:shadow-[0_0_18px_-4px_rgba(255,45,85,0.9)] disabled:opacity-40"
        >
          {m.banSend}
        </button>
        <button type="button" className="btn-ghost text-sm" onClick={onClose}>
          {m.cancel}
        </button>
      </div>
    </Shell>
  );
}

/**
 * A confirm box in the site's style (instead of the browser's confirm/prompt).
 * With `input`, asks for a short text too (optional unless `required`).
 */
export function ConfirmDialog({
  title,
  body,
  input,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  body?: string;
  input?: { label: string; placeholder?: string; required?: boolean; maxLength?: number };
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: (text: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = !input?.required || text.trim().length > 0;
  return (
    <Shell title={title} onClose={onClose}>
      <form
        className="space-y-4 p-6 pt-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ok) return;
          setBusy(true);
          await onConfirm(text.trim());
          setBusy(false);
          onClose();
        }}
      >
        {body && <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{body}</p>}
        {input && (
          <label className="block">
            <span className="text-sm font-semibold text-ink">{input.label}</span>
            <textarea
              autoFocus
              rows={3}
              value={text}
              maxLength={input.maxLength ?? 300}
              placeholder={input.placeholder}
              onChange={(e) => setText(e.target.value)}
              className="mt-1.5 w-full resize-none bg-void/70 px-3 py-2.5 text-ink placeholder:text-muted/60 shadow-[inset_0_0_0_1px_rgba(157,92,255,0.35)] outline-none focus:shadow-[inset_0_0_0_1px_rgba(41,224,255,0.8)]"
            />
          </label>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" className="btn-ghost text-sm" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            type="submit"
            disabled={!ok || busy}
            className={
              danger
                ? 'px-5 py-2.5 text-sm font-semibold text-busy shadow-[inset_0_0_0_1px_rgba(255,45,85,0.7)] transition-colors hover:bg-busy hover:text-white disabled:opacity-40'
                : 'btn-neon text-sm'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </Shell>
  );
}
