// Development helper: receives Telegram updates WITHOUT a public website
// address, by long-polling Telegram and forwarding each update to the site's
// own webhook route. Production uses the real webhook instead (see README).
//
// Started with: docker compose --profile telegram up -d
// Self-contained on purpose (no project imports) so it runs with plain tsx.

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const target = process.env.TELEGRAM_POLLER_TARGET?.trim() || 'http://web:3000';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Hands one update to the site. While the site is down or restarting (e.g.
 * during run-build.bat) it waits and tries again, so no message is lost and
 * the bot answers as soon as the site is back. A site that answers but keeps
 * failing (5xx/404) gets 5 tries, then the update is skipped so the bot does
 * not stay stuck on one bad message.
 */
async function deliver(update: { update_id: number }, kind: string) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${target}/api/telegram/webhook/${encodeURIComponent(secret!)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret! },
      body: JSON.stringify(update),
      signal: AbortSignal.timeout(20_000),
    }).catch((err) => {
      console.error(`[poller] update ${update.update_id} (${kind}): site not reachable, retrying:`, err instanceof Error ? err.message : err);
      return null;
    });
    if (res && res.status < 500 && res.status !== 404) {
      console.log(`[poller] update ${update.update_id} (${kind}) -> site ${res.status}${attempt > 1 ? ` (after ${attempt} tries)` : ''}`);
      return;
    }
    if (res && attempt >= 5) {
      console.error(`[poller] update ${update.update_id} (${kind}) skipped: site answered ${res.status} 5 times`);
      return;
    }
    if (res) console.error(`[poller] update ${update.update_id} (${kind}) -> site ${res.status}, retrying`);
    await sleep(Math.min(2_000 * attempt, 15_000));
  }
}

async function main() {
  if (!token || !secret) {
    console.log('[poller] TELEGRAM_BOT_TOKEN or TELEGRAM_WEBHOOK_SECRET is empty in .env; nothing to do.');
    // Stay alive quietly so "restart: unless-stopped" does not loop.
    for (;;) await sleep(3_600_000);
  }

  console.log(`[poller] forwarding Telegram updates to ${target}`);
  let offset = 0;
  let failures = 0;
  for (;;) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ offset, timeout: 30, allowed_updates: ['message', 'callback_query'] }),
        signal: AbortSignal.timeout(40_000),
      });
      const body = (await res.json()) as { ok: boolean; result?: { update_id: number }[]; description?: string };
      if (res.status === 409) {
        // Either a webhook is set, or ANOTHER copy of this helper (another
        // folder, another PC) is reading the same bot and taking the messages.
        console.error(`[poller] Telegram refused polling (409): ${body.description ?? ''}`);
        console.error('[poller] Fix: stop the other copy, or remove the webhook with deleteWebhook (see README).');
        await sleep(15_000);
        continue;
      }
      if (!body.ok) {
        console.error(`[poller] getUpdates failed: ${body.description ?? res.status}`);
        await sleep(10_000);
        continue;
      }
      if (failures > 0) console.log('[poller] connected to Telegram again');
      failures = 0;
      for (const update of body.result ?? []) {
        // Kind only, never content: enough to follow a sign-in in the logs.
        const kind = Object.keys(update).filter((k) => k !== 'update_id').join(',');
        await deliver(update, kind);
        // Only now is it safe to tell Telegram we have it (next getUpdates).
        offset = update.update_id + 1;
      }
    } catch (err) {
      failures += 1;
      const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : '';
      // First failure right after start is normal while the network settles.
      console.error(`[poller] cannot reach Telegram, retry ${failures}:`, err instanceof Error ? err.message : err, cause);
      await sleep(Math.min(5_000 * failures, 30_000));
    }
  }
}

void main();
