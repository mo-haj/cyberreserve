# Security

## Production checklist

- [ ] Fresh secrets generated with `scripts/setup-env` (do not reuse the `.env` that came in the zip).
- [ ] `ADMIN_TELEGRAM_IDS` lists only the site owner's Telegram account ID(s).
- [ ] `WEB_BIND=127.0.0.1` (default). Port 3000 is not reachable from the network.
- [ ] Traffic reaches the server only through a `cloudflared` tunnel (`--profile tunnel`).
- [ ] `.env` is not in git (`git status` must not list it).
- [ ] `./backups` is copied off the machine regularly.
- [ ] `sh scripts/verify.sh` ends with `0 failed`.

## How the dashboard is protected

The dashboard (`/admin`) has no separate password: people sign in with Telegram, like players.
What they may do is decided on the server for every page and every request:

| Who | How the site knows | What they can do |
|---|---|---|
| Site owner (super admin) | Telegram account ID is in `ADMIN_TELEGRAM_IDS` | Everything, in every arena; add arenas; publish/hide; choose owners and staff |
| Arena owner | `ArenaMember` row with role OWNER | Their own arena only: stations, zones, posts, details, games, bookings, players |
| Arena staff | `ArenaMember` row with role STAFF | Their own arena's live floor and bookings only |
| Everyone else | — | Nothing: `/admin/<arena>` answers 404 (same as an arena that does not exist) |

- `middleware.ts` only sends visitors with no session cookie to sign-in; the real checks are in the
  pages and API routes (`lib/manage/service.ts`, `lib/manage/rules.ts`), so a fake cookie gets nothing.
- Publishing, hiding and owner changes are refused for owners and staff (`SUPER_ACTIONS`), even
  if they call the API directly.
- Every change is written to the audit log with who did it (`OWNER` or `ADMIN`).
- With `ADMIN_TELEGRAM_IDS` empty, nobody is super admin.
- Once the site has its own domain, `admin.<domain>` opens the dashboard; the rules are the same.

## Cloudflare setup

1. **Tunnel**: Zero Trust → Networks → Tunnels → Create (Cloudflared). Copy the token into
   `CLOUDFLARE_TUNNEL_TOKEN`. Add a public hostname pointing to service `http://web:3000`.
2. Cloudflare Access is optional: the dashboard checks Telegram sign-in and rights itself.

If you cannot use a tunnel, firewall the server so ports 80/443 accept only
[Cloudflare IP ranges](https://www.cloudflare.com/ips/), and keep port 3000 closed.

## What was checked for this delivery

- `npm audit --omit=dev` (everything in the running site): 0 known vulnerabilities (18 Nov 2026).
- Full `npm audit` reports one high advisory (GHSA-fc5q-39xc-vjpf, ReDoS in `picomatch`) reached only
  through Tailwind CSS 3 at **build time**. It processes our own file patterns, never visitor input,
  and is not in the production image. Fix: move to Tailwind 4 (a style rewrite) — planned, not urgent.
- No secrets in source, `docker-compose.yml`, or the Docker image (`.env` is in `.dockerignore`).
- PostgreSQL port is not published to the host.
- The web container runs as the non-root `node` user.
- `/api/health` never returns error details.
- Response headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Permissions-Policy`; `X-Powered-By` removed.
- Dashboard verified: signed out and fake-cookie visitors are sent to sign-in; a player cannot
  add arenas (403) or open another arena (404); an owner cannot publish or change owners (403).

## Player sign-in (Telegram)

- No passwords exist, so none can be guessed or leaked.
- Login links are useless to anyone else: the bot asks the player to tap the same number that is
  shown on the website that started the login (stops "send someone your link" phishing).
- Phone numbers come only from Telegram's contact button and only if they belong to the sender.
- The browser's login token and the session cookie are random 256-bit values; only their SHA-256
  is stored. Session cookie: `HttpOnly`, `SameSite=Lax`, `Secure` over HTTPS, 30 days.
- Login requests expire after 10 minutes and are single-use (atomic CONFIRMED -> CONSUMED).
- Rate limits: 5 sign-in starts and 90 status checks per minute per visitor (in memory; move to
  the database if the site ever runs on several servers).
- Webhook: secret path + secret header compared in constant time; anything else gets 404.
- The language switch only redirects to same-site paths.

## Not done yet (by phase)

- JWT signature verification for Cloudflare Access (before Phase 2).
- Rate limiting on public booking endpoints (Phase 1).
- A Content-Security-Policy header (with the real UI, Phase 1).
- Off-site backup copy and a "backup failed" alert (alert is Phase 4, Telegram).

## Keeping it patched

Run `npm audit` monthly and after any dependency change. Rebuild the image periodically
(`docker compose build --pull`) to pick up base-image fixes.
