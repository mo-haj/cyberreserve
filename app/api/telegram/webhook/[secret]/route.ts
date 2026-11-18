import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { telegramConfig } from '@/lib/telegram/api';
import { handleUpdate, TelegramUpdate } from '@/lib/telegram/bot';

// Telegram -> website. Not behind Cloudflare Access (Telegram cannot sign in).
// Guarded twice, as TEAM_PROMPT.md requires:
//   1. the secret in the path, and
//   2. the X-Telegram-Bot-Api-Secret-Token header set via setWebhook.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function sameSecret(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(request: Request, { params }: { params: Promise<{ secret: string }> }) {
  const config = telegramConfig();
  const { secret } = await params;
  if (
    !config ||
    !sameSecret(secret, config.webhookSecret) ||
    !sameSecret(request.headers.get('x-telegram-bot-api-secret-token'), config.webhookSecret)
  ) {
    return new NextResponse(null, { status: 404 });
  }

  const parsed = TelegramUpdate.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // Not an update we understand: acknowledge so Telegram does not retry forever.
    console.warn(
      '[telegram/webhook] ignored update:',
      parsed.error.issues.map((i) => i.path.join('.') || '(root)').join(', '),
    );
    return NextResponse.json({ ok: true });
  }
  try {
    await handleUpdate(parsed.data);
  } catch (err) {
    console.error('[telegram/webhook] update failed:', err instanceof Error ? err.message : err);
  }
  return NextResponse.json({ ok: true });
}
