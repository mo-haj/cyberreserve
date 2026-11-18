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

export function sendText(chatId: number, text: string, replyMarkup?: unknown) {
  return tg('sendMessage', { chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
}
