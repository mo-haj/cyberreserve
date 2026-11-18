import { NextResponse } from 'next/server';
import { isPreview } from '@/lib/preview';
import { createLoginRequest } from '@/lib/auth/session';
import { getLocale } from '@/lib/locale';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { telegramConfig } from '@/lib/telegram/api';
import { now } from '@/lib/time';

// Public: starts "Sign in with Telegram". Returns the secret token (kept by
// this browser only), the number to show, and the bot deep link.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  if (isPreview()) return NextResponse.json({ error: 'preview' }, { status: 503, headers: NO_STORE });
  const config = telegramConfig();
  if (!config) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503, headers: NO_STORE });
  }
  if (!rateLimit(`login-start:${clientIp(request.headers)}`, 5, 60_000, now().getTime())) {
    return NextResponse.json({ error: 'too_many' }, { status: 429, headers: NO_STORE });
  }
  try {
    // The bot speaks the language the visitor uses on the site.
    const { token, shortId, code, expiresAt } = await createLoginRequest(await getLocale());
    const payload = `login_${shortId}`;
    return NextResponse.json(
      {
        token,
        code,
        // Three ways to reach the bot: the app (t.me), Telegram Web, or by
        // sending the start command by hand. All carry the same payload.
        botUrl: `https://t.me/${config.username}?start=${payload}`,
        webUrl: `https://web.telegram.org/k/#?tgaddr=${encodeURIComponent(
          `tg://resolve?domain=${config.username}&start=${payload}`,
        )}`,
        botUsername: config.username,
        startCommand: `/start ${payload}`,
        expiresAt: expiresAt.toISOString(),
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error('[auth/start] failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE });
  }
}
