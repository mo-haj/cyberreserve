// Minimal Telegram Bot API client. Failures are logged and returned as false:
// a Telegram problem must never break the website (see TEAM_PROMPT.md).

export interface TelegramConfig {
  token: string;
  username: string;
  webhookSecret: string;
}

/** Null when the bot is not set up in .env; sign-in then shows "not set up yet". */
export function telegramConfig(): TelegramConfig | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '');
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!token || !username || !webhookSecret) return null;
  return { token, username, webhookSecret };
}

export async function tg(method: string, body: Record<string, unknown>): Promise<boolean> {
  const config = telegramConfig();
  if (!config) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[telegram] ${method} failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[telegram] ${method} failed:`, err instanceof Error ? err.message : err);
    return false;
  }
}

/** Like tg(), but returns Telegram's `result` (e.g. the sent message), or null. */
export async function tgResult<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
  const config = telegramConfig();
  if (!config) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
    if (!res.ok || !json?.ok) {
      console.error(`[telegram] ${method} failed: HTTP ${res.status} ${(json?.description ?? '').slice(0, 200)}`);
      return null;
    }
    return json.result ?? null;
  } catch (err) {
    console.error(`[telegram] ${method} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Text for Telegram's HTML mode. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** A message in Telegram's HTML mode (escape user text with escapeHtml). */
export function sendHtml(chatId: number, html: string, replyMarkup?: unknown) {
  return tg('sendMessage', {
    chat_id: chatId,
    text: html,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export function sendText(chatId: number, text: string, replyMarkup?: unknown) {
  return tg('sendMessage', { chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
}
