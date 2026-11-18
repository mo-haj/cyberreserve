'use client';

import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useRef, useState } from 'react';
import { dictionary, type Locale } from '@/lib/i18n';
import { formatCode } from '@/lib/telegram/logic';

// "Sign in with Telegram": start -> open the bot + type the code -> poll until
// Telegram confirms -> the server sets the session cookie -> go back.

type State =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | {
      kind: 'waiting';
      token: string;
      code: number;
      botUrl: string;
      webUrl: string;
      botUsername: string;
      startCommand: string;
    }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

const POLL_MS = 2000;

export default function LoginFlow({ locale, next }: { locale: Locale; next: string }) {
  const t = dictionary(locale);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  async function start() {
    setState({ kind: 'starting' });
    try {
      const res = await fetch('/api/auth/telegram/start', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (res.status === 503 && body.error === 'not_configured') return setState({ kind: 'error', message: t.login.notConfigured });
      if (res.status === 503 && body.error === 'preview') return setState({ kind: 'error', message: t.login.preview });
      if (res.status === 429) return setState({ kind: 'error', message: t.login.tooMany });
      if (!res.ok) return setState({ kind: 'error', message: t.login.error });
      setState({
        kind: 'waiting',
        token: body.token,
        code: body.code,
        botUrl: body.botUrl,
        webUrl: body.webUrl,
        botUsername: body.botUsername,
        startCommand: body.startCommand,
      });
      poll(body.token);
    } catch {
      setState({ kind: 'error', message: t.login.error });
    }
  }

  function poll(token: string) {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      try {
        const res = await fetch('/api/auth/telegram/status', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const body = await res.json().catch(() => ({}));
        if (body.status === 'signed_in') {
          if (timer.current) clearInterval(timer.current);
          setState({ kind: 'done' });
          // First sign-in: name + player name + terms before anything else.
          window.location.assign(body.needsProfile ? `/profile?welcome=1&next=${encodeURIComponent(next)}` : next);
        } else if (body.status === 'expired') {
          if (timer.current) clearInterval(timer.current);
          setState({ kind: 'error', message: t.login.expired });
        } else if (body.status === 'failed') {
          if (timer.current) clearInterval(timer.current);
          setState({ kind: 'error', message: t.login.failed });
        }
      } catch {
        // Network blip: keep polling.
      }
    }, POLL_MS);
  }

  if (state.kind === 'idle' || state.kind === 'starting') {
    return (
      <button type="button" className="btn-neon w-full text-lg" onClick={start} disabled={state.kind === 'starting'}>
        <TelegramIcon />
        {t.login.start}
      </button>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="space-y-4" role="alert">
        <p className="text-busy">{state.message}</p>
        <button type="button" className="btn-ghost" onClick={() => setState({ kind: 'idle' })}>
          {t.login.retry}
        </button>
      </div>
    );
  }

  if (state.kind === 'done') {
    return <p className="text-free" role="status">{t.login.success}</p>;
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
        {/* Phone camera -> Telegram app on the phone. Most useful on a computer. */}
        <div className="hidden sm:block">
          <QrCode text={state.botUrl} />
          <p className="mt-2 max-w-[11rem] text-xs text-muted">{t.login.scan}</p>
        </div>

        <ol className="min-w-0 space-y-5">
          <li className="flex gap-3">
            <Step n={1} />
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-ink">{t.login.step1}</p>
              <div className="flex flex-wrap gap-2">
                <a href={state.botUrl} target="_blank" rel="noopener noreferrer" className="btn-neon whitespace-nowrap text-sm">
                  <TelegramIcon />
                  {t.login.openApp}
                </a>
                <a href={state.webUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost whitespace-nowrap text-sm">
                  {t.login.openWeb}
                </a>
              </div>
              <details className="group text-sm">
                <summary className="cursor-pointer list-none text-muted underline-offset-4 hover:text-ink hover:underline [&::-webkit-details-marker]:hidden">
                  {t.login.noButton}
                </summary>
                <div className="panel-in mt-2">
                  <ManualCommand
                    label={t.login.manual(state.botUsername)}
                    command={state.startCommand}
                    copyLabel={t.login.copy}
                    copiedLabel={t.login.copied}
                  />
                </div>
              </details>
            </div>
          </li>
          <li className="flex gap-3">
            <Step n={2} />
            <div className="min-w-0">
              <p className="text-ink">{t.login.step2}</p>
              <p
                dir="ltr"
                className="mt-2 inline-block select-all whitespace-nowrap px-4 py-1.5 font-hud text-4xl font-bold tracking-[0.2em] text-cyan shadow-[inset_0_0_0_1px_rgba(41,224,255,0.6),0_0_30px_-8px_rgba(41,224,255,0.9)]"
                aria-live="polite"
              >
                {formatCode(state.code)}
              </p>
              <p className="mt-1.5 text-xs text-muted">{t.login.codeNote}</p>
            </div>
          </li>
          <li className="flex gap-3">
            <Step n={3} />
            <p className="text-ink">{t.login.step3}</p>
          </li>
        </ol>
      </div>
      <p className="flex items-center gap-2 text-sm text-muted" role="status">
        <span className="live-dot h-2 w-2 rounded-full bg-cyan" aria-hidden="true" />
        {t.login.waiting}
      </p>
    </div>
  );
}

function QrCode({ text }: { text: string }) {
  // Generated in the browser from our own link; dark on white so every phone camera reads it.
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    // margin = 4 modules of white "quiet zone": without it cameras do not find the code.
    return qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
  }, [text]);
  return (
    <div
      className="h-44 w-44 bg-white [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
      role="img"
      aria-label="QR"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function ManualCommand({
  label,
  command,
  copyLabel,
  copiedLabel,
}: {
  label: string;
  command: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="text-sm">
      <p className="text-muted">{label}</p>
      <div className="mt-2 flex items-stretch gap-2">
        <code dir="ltr" className="min-w-0 flex-1 select-all truncate bg-void/80 px-3 py-2 font-mono text-cyan shadow-[inset_0_0_0_1px_rgba(41,224,255,0.35)]">
          {command}
        </code>
        <button
          type="button"
          className="btn-ghost shrink-0"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(command);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Clipboard blocked: the text is selectable, the player can copy it by hand.
            }
          }}
        >
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center font-hud font-bold text-violet-soft shadow-[inset_0_0_0_1px_rgba(157,92,255,0.6)]">
      {n}
    </span>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.8.8l-4.8-3.6-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.4 13.1 1.7 11.6c-1-.3-1-1 .2-1.5L20.6 3c.9-.3 1.6.2 1.3 1.3z" />
    </svg>
  );
}
