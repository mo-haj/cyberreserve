# Security

## Production checklist

- [ ] Fresh secrets generated with `scripts/setup-env` (do not reuse the `.env` that came in the zip).
- [ ] `SKIP_ACCESS_CHECK=false`.
- [ ] `WEB_BIND=127.0.0.1` (default). Port 3000 is not reachable from the network.
- [ ] Traffic reaches the server only through a `cloudflared` tunnel (`--profile tunnel`).
- [ ] Cloudflare Access application covers `/admin*` and `/api/admin*` — and nothing else.
- [ ] `.env` is not in git (`git status` must not list it).
- [ ] `./backups` is copied off the machine regularly.
- [ ] `sh scripts/verify.sh` ends with `0 failed`.

## How admin protection works

Two layers, both required:

1. **Cloudflare Access** (edge): email one-time code for `/admin*` and `/api/admin*`.
2. **`middleware.ts`** (app): rejects those paths with `403` unless the `Cf-Access-Jwt-Assertion`
   header is present.

### Known limitation in Phase 0 — read this

The middleware checks that the header **exists**. It does not verify the token's signature yet
(the Phase 0 spec defers that). Anyone who can reach the server *directly* can send a fake header
and pass layer 2. So in Phase 0 the real protection is: **the origin is unreachable except through
Cloudflare.** That is why `WEB_BIND=127.0.0.1` and the tunnel matter.

There is nothing behind `/admin` yet, so nothing is exposed today. **Signature verification
against the team's JWKS (`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, checking
`aud` and `iss`) must be added before the Phase 2 admin panel ships.**

## Cloudflare setup

1. **Tunnel**: Zero Trust → Networks → Tunnels → Create (Cloudflared). Copy the token into
   `CLOUDFLARE_TUNNEL_TOKEN`. Add a public hostname pointing to service `http://web:3000`.
2. **Access**: Zero Trust → Access → Applications → Add self-hosted. Add two paths on your
   hostname: `admin` and `api/admin`. Policy: Allow → Emails → the owner's email.
3. Do **not** put Access on the whole hostname. It must match this table exactly:

| Path | Access |
|---|---|
| `/` and player routes, `/api/devices`, `/api/bookings` | Public |
| `/admin*`, `/api/admin/*` | Cloudflare Access |
| `/api/agent/ping-sync` | Not behind Access — guarded by `X-Agent-Key` (Phase 3) |
| `/api/telegram/webhook/...` | Not behind Access — secret path + header (Phase 4) |
| `/api/health` | Public |

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
- Admin guard verified on `/admin`, `/admin/...`, `/api/admin`, `/api/admin/...`, including an
  empty header value and an encoded slash.

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
