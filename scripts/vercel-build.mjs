// Vercel runs this instead of "npm run build" (package.json "vercel-build").
//
// With a database (DATABASE_URL set, PREVIEW_MODE not 1):
//   1. applies the database migrations (through DIRECT_URL when set: Neon's
//      pooled address cannot run migrations),
//   2. adds the demo arenas and games (same seed as the Docker setup; it never
//      overwrites what arena owners changed),
//   3. builds the site,
//   4. on the production deployment, points the Telegram bot at this site
//      (setWebhook), so the bot works without the helper on the owner's PC.
// In preview mode it only builds.
import { execSync } from 'node:child_process';

const env = process.env;
const preview = env.PREVIEW_MODE === '1' || env.DEV_FIXTURE_DATA === '1';
const hasDb = !!env.DATABASE_URL && !preview;
// On Vercel only the production deployment changes the database. Preview
// deployments (other branches) may share its settings and must not migrate it.
const onVercelPreview = !!env.VERCEL && env.VERCEL_ENV !== 'production';

function run(cmd, extraEnv = {}) {
  console.log(`\n[vercel-build] ${cmd}`);
  execSync(cmd, { stdio: 'inherit', env: { ...env, ...extraEnv } });
}

run('node node_modules/prisma/build/index.js generate');

if (hasDb && !onVercelPreview) {
  const direct = env.DIRECT_URL || env.DATABASE_URL;
  run('node node_modules/prisma/build/index.js migrate deploy', { DATABASE_URL: direct });
  run('node node_modules/tsx/dist/cli.mjs prisma/seed.ts', { DATABASE_URL: direct });
} else {
  console.log(`[vercel-build] ${onVercelPreview ? 'preview deployment' : preview ? 'PREVIEW_MODE=1' : 'no DATABASE_URL'}: database steps skipped`);
}

run('node node_modules/next/dist/bin/next build');

await setWebhook();

async function setWebhook() {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const secret = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const host = (env.PUBLIC_URL || env.VERCEL_PROJECT_PRODUCTION_URL || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!hasDb || env.VERCEL_ENV !== 'production' || !token || !secret || !host) {
    console.log('[vercel-build] Telegram webhook not changed (needs the production deployment, a database and the bot settings)');
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: `https://${host}/api/telegram/webhook/${encodeURIComponent(secret)}`,
        secret_token: secret,
        allowed_updates: ['message', 'callback_query'],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => ({}));
    // Only the host is printed, never the token or the secret.
    console.log(body.ok ? `[vercel-build] Telegram bot now sends its messages to https://${host}` : `[vercel-build] setWebhook failed: ${body.description ?? res.status}`);
  } catch (err) {
    // A Telegram hiccup must not fail the deployment; the next deploy retries.
    console.log('[vercel-build] setWebhook failed:', err instanceof Error ? err.message : err);
  }
}
