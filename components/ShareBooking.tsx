'use client';

// Send your booking to friends: phone share sheet, WhatsApp, Telegram, or copy.
import { useEffect, useState } from 'react';
import { dictionary, type Locale } from '@/lib/i18n';

export default function ShareBooking({
  locale,
  arena,
  station,
  when,
  slug,
  className = '',
}: {
  locale: Locale;
  arena: string;
  station: string;
  /** Already formatted, e.g. "Wed 25/11 · 20:00–22:00". */
  when: string;
  slug: string;
  className?: string;
}) {
  const t = dictionary(locale).engage;
  const [copied, setCopied] = useState(false);
  // Phones have a share sheet; known only in the browser (after hydration).
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === 'function'), []);
  const link = () => `${window.location.origin}/arenas/${slug}`;
  const text = () => t.shareText(arena, station, when, link());

  async function native() {
    try {
      await navigator.share({ text: text() });
    } catch {
      /* closed or not allowed */
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }
  const btn = 'px-3 py-1.5 text-xs font-semibold shadow-[inset_0_0_0_1px_rgba(157,92,255,0.45)] hover:bg-violet/15';
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-xs text-muted">{t.share}:</span>
      {canShare && (
        <button type="button" className={`${btn} text-ink`} onClick={native}>
          ↗
        </button>
      )}
      <a
        className={`${btn} text-[#25D366]`}
        href="https://wa.me/"
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.currentTarget.href = `https://wa.me/?text=${encodeURIComponent(text())}`;
        }}
      >
        {t.shareWhatsApp}
      </a>
      <a
        className={`${btn} text-[#29A9EB]`}
        href="https://t.me/share/url"
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.currentTarget.href = `https://t.me/share/url?url=${encodeURIComponent(link())}&text=${encodeURIComponent(t.shareText(arena, station, when, ''))}`;
        }}
      >
        {t.shareTelegram}
      </a>
      <button type="button" className={`${btn} text-muted`} onClick={copy}>
        {copied ? t.copied : t.shareCopy}
      </button>
    </div>
  );
}
