# CyberReserve

A directory of **gaming arenas** across Syria with a **live station map**: players see which PCs are
free right now (green), in use (red) or out of service (grey). The map refreshes every 5 seconds.

What works today:
- **Arabic first** (right-to-left), with an **English** switch in the header. Each page shows one language.
- **Home** (`/`): the arena list (city menu for all of Syria, search by name or area, live free
  counts) next to the selected arena's live station map. On phones a row opens the arena page and
  the header folds into a ☰ menu. "How it works" opens as a pop-up. `/?city=aleppo` links to a city.
- **Map**: each arena page shows a small map of its street (OpenStreetMap: free, no key, no account)
  with **Directions** and **Open in Google Maps** buttons (plain links, also free). Set an arena's
  `latitude`/`longitude` (right-click the spot in Google Maps to copy them). No pin = no map.
  OpenStreetMap's free map is meant for normal traffic; if the site ever gets very busy, switch the
  map to a tile provider's free plan in `lib/maps.ts`.
- **Games**: every arena has a "Games (n)" button that opens a pop-up with a search box and a box
  per game (cover + name). Covers: see `public/games/README.md`.
- **Arena pages** (`/arenas/<name>`): cover, live stations with a monitor icon each (press one for
  its details), **zones & specs** cards, prices day/night, hours, address, and photo/text sections
  that slide in.
- **Sign in with Telegram** (`/login`): no passwords; the phone number is verified by Telegram.
  Needs a bot token first — see "Telegram sign-in" below.
- **Profile** (`/profile`): after the first sign-in the player must enter a **full name** and a
  unique **player name** and accept the terms; the profile page shows and edits them.
- **Online booking:** press a station → a pop-up (a sheet from the bottom on phones) to book it
  **now or up to 7 days ahead**, 1–12 hours (− / + in half hours), price worked out live from the day/night (and the
  station's own) prices; paid at the arena. Confirmed instantly; the database makes double booking
  impossible. One active booking per player. The player gets a Telegram message with a cancel
  button; the arena's owners and staff get one with **Arrived / No-show / Cancel** buttons.
  The bot asks **"still coming?"** 1 h before the start (or 30 min before, for bookings made
  45–70 min ahead; bookings made less than 45 min ahead are not asked). No answer 15 min before
  the start → the booking is cancelled and the station freed. The exact time of the question is
  shown before confirming and in the bot's confirmation. 3 no-shows pause booking for
  7 days. Players see and cancel their bookings on their profile ("حجوزاتي"). The reminder job runs
  inside the website every minute (turn it off with `BOOKING_JOBS=off`).
- **Arena owner panel** (`/manage`): arena owners sign in with Telegram like players and manage
  only their own arena: start a walk-in on a station (1/2/3 h) or free it, set stations out of
  service, add/edit/remove stations (PC, PS5, PS4, Xbox, own prices), edit the arena's details,
  prices, city and map pin, and pick its games. **Staff** can only start/free stations.
  To give someone access: they sign in once, then double-click **`add-owner.bat`** and enter the
  arena and their phone number (or REMOVE to take access away). Every change is in the audit log.
  The panel also lists upcoming bookings with the player's name, phone and city, and the same
  Arrived / No-show / Cancel buttons.
- **Zones** (owner panel → "الأقسام"): group stations of one type into zones (Main hall, VIP room…)
  with their hardware: CPU, graphics, memory, screen + Hz up front, and storage, keyboard, mouse,
  headset, chair behind "All specs" (consoles: TV and controllers). Mark a zone **VIP** for a gold
  frame, and add an optional photo (PNG/JPG/WebP ≤ 2 MB, stored like the logo): a zone with a photo
  shows as a wide "post" card. Empty fields are not shown. The booking pop-up shows the station's
  zone and its 4 key specs. Stations not in a zone still show their old one-line specs.
- **Terms** (`/terms`) and **Privacy** (`/privacy`), Arabic and English. Set `SUPPORT_CONTACT`
  in `.env` to the email/phone/@username players should contact. Have a lawyer read them before launch.
- **3 demo arenas** (12, 10 and 20 PCs), marked as demo, until real arenas join.

Not built yet: the site admin panel (arenas are added by the site owner), the in-arena PC agent
(see `PLAN.md`). Old `/cafes/...` links redirect to `/arenas/...`.

**Stack:** Next.js 15 (React 19, TypeScript, Tailwind) · PostgreSQL 15 · Prisma · Docker Compose

---

## Setup (3 steps)

You need only **Docker Desktop** (Windows/Mac) or Docker Engine + Compose (Linux). Nothing else.

### 1. Unzip and open a terminal in the folder

```
cd cyberreserve
```

### 2. Check the `.env` file

The zip already contains a `.env` with random passwords, so it works as is.

To make your own fresh secrets (do this before production):

| System | Command |
|---|---|
| Windows (PowerShell) | `powershell -ExecutionPolicy Bypass -File scripts\setup-env.ps1 -Force` |
| Linux / Mac / Git Bash | `sh scripts/setup-env.sh --force` |

> Only regenerate **before the first start**. After the database exists, a new password locks you
> out (fix: `docker compose down -v`, which deletes the database, then start again).

### 3. Start

```
docker compose up -d --build
```

First build takes a few minutes. Then open **http://localhost:3000**

Check it is healthy:

```
docker compose ps
curl http://localhost:3000/api/health
```

Expected: `postgres` and `web` show **healthy**, and the curl prints
`{"status":"ok","db":"connected"}`.

---

## Test everything

One script runs the whole Phase 0 checklist (database lock, admin protection, backup restore…):

```
sh scripts/verify.sh --restart
```

On Windows run it in **Git Bash**. It should end with `0 failed`.

If you push the project to GitHub, the same checks run automatically on every push
(`.github/workflows/verify.yml`) — look for the green tick on the commit. Details of each check and what
was already tested before delivery: `TEST_REPORT.md`.

---

## Daily commands

| What | Command |
|---|---|
| Start | `docker compose up -d` |
| Stop (data kept) | `docker compose down` |
| Logs | `docker compose logs -f web` |
| Rebuild after code change | `docker compose up -d --build` |
| Database shell | `docker compose exec postgres psql -U cyberreserve -d cyberreserve` |
| Backup now | `docker compose exec db-backup sh /usr/local/bin/backup.sh --once` |
| Restore a backup | see `RESTORE.md` |
| **Delete everything** (database too) | `docker compose down -v` |

Backups are written to `./backups` once a day and kept for 7 days. Each dump is checked for
readability before it is kept. `docker compose ps` shows `db-backup` as **unhealthy** if a daily
backup was missed. Container logs rotate automatically (30 MB per service at most).

---

## Telegram sign-in

Players sign in with Telegram. Until a bot is set up, the Sign in page says so; nothing breaks.

**1. Create the bot (2 minutes).** In Telegram, open **@BotFather**, send `/newbot`, choose a
name and a username ending in `bot`. BotFather replies with a **token**.

**2. Put it in `.env`:**
```
TELEGRAM_BOT_TOKEN=123456789:AA...      (the token from BotFather)
TELEGRAM_BOT_USERNAME=YourBotName       (without @)
```
`TELEGRAM_WEBHOOK_SECRET` is already filled in by `setup-env`. Never share the token.

**3a. Try it on your own computer** (no domain needed): just run `run-build.bat`. When it finds
`TELEGRAM_BOT_TOKEN` in `.env` it also starts a small helper (`telegram-poller`) that fetches
messages from Telegram for the site, and puts the helper's log at the end of `run-report.log`.
(By hand: `docker compose --profile telegram up -d telegram-poller` after the site is running.)
Open http://localhost:3000/login, press **Sign in with Telegram**, and follow the steps.

**3b. In production** (site online through the Cloudflare tunnel), Telegram calls the site
directly. Stop the helper if it runs (`docker compose stop telegram-poller`), then once:
```
curl.exe "https://api.telegram.org/bot<TOKEN>/setWebhook" -d "url=https://<your-domain>/api/telegram/webhook/<SECRET>" -d "secret_token=<SECRET>"
```
(`<SECRET>` = `TELEGRAM_WEBHOOK_SECRET` from `.env`. On Linux/Mac write `curl` instead of `curl.exe`.)
To go back to the helper later: `curl.exe "https://api.telegram.org/bot<TOKEN>/deleteWebhook"`.

How it stays safe: the website shows a 6-digit code that the player types in the bot chat (so a
login link sent by someone else is useless; 3 wrong codes cancel the request). The phone number is
accepted only through Telegram's own "📱 Share my number" button, for the player's own account —
Telegram sends it with the country code, so Syrian (+963) and visitors' foreign numbers both work
and nobody types a number. Typed numbers are refused with an explanation. The bot answers every
message, so the chat never goes silent.

## Going to production

Read `SECURITY.md` first — it is short. The essentials:

1. Generate fresh secrets (step 2 above) and keep `SKIP_ACCESS_CHECK=false`.
2. Put the tunnel token in `.env` (`CLOUDFLARE_TUNNEL_TOKEN=`) and start with the tunnel:
   ```
   docker compose --profile tunnel up -d --build
   ```
3. In Cloudflare Zero Trust, protect `/admin*` and `/api/admin*` with an Access policy.
4. Leave `WEB_BIND=127.0.0.1`. The server must not be reachable except through Cloudflare.

---

## Develop without Docker (optional)

Needs Node 20+ and a PostgreSQL you can reach.

```
npm install
# point DATABASE_URL in .env at your database (host localhost instead of postgres)
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

Other checks: `npm run typecheck`, `npm test`, `npm audit`.

---

## What is in the box

```
app/page.tsx             home page (arena browser)
app/arenas/[slug]/       arena page
app/login/               Telegram sign-in page
app/api/arenas/          public JSON: arena list, live station status per arena
app/api/auth/            sign-in start/status, sign-out
app/api/telegram/        Telegram webhook (secret path + secret header)
app/api/lang/            language switch (Arabic / English)
app/fonts/               bundled fonts (no Google Fonts download)
components/              ArenaBrowser, LiveFloor (station map), HowItWorks, LoginFlow, Reveal, header/footer
lib/i18n.ts              every interface text, Arabic and English
lib/availability.ts      free / in use / out of service rules (unit-tested)
lib/cafes.ts             all reads for the arena pages
lib/auth/, lib/telegram/ sign-in: sessions, tokens, bot logic (logic unit-tested)
prisma/demo-data.ts      the 3 demo arenas (edit here to change demo content)
public/cafes/            placeholder artwork; replace with real photos
scripts/telegram-poller.ts  local helper for Telegram without a domain
lib/prisma.ts            the single database client
lib/time.ts              the ONLY place that reads the clock / does Damascus time math
middleware.ts            blocks /admin and /api/admin without a Cloudflare Access header
prisma/schema.prisma     database models
prisma/migrations/       table creation + the double-booking lock (raw SQL)
prisma/seed.ts           12 PCs, default prices, sample snack menu (safe to re-run)
Dockerfile, docker-compose.yml, docker-entrypoint.sh
scripts/                 setup-env, backup, verify
.github/workflows/       CI: builds the real Docker stack and runs verify.sh on every push
CLAUDE.md, docs/         engineering standard and the original phase prompts
```

## Problems

| Symptom | Fix |
|---|---|
| `exec ./docker-entrypoint.sh: no such file or directory` | The file got Windows line endings. Run `git add --renormalize .` or re-clone; `.gitattributes` prevents it. |
| `web` keeps restarting | `docker compose logs web`. Usually the password in `DATABASE_URL` does not match `POSTGRES_PASSWORD`. |
| `P1000 authentication failed` after changing `.env` | The database was created with the old password. `docker compose down -v` and start again (deletes data). |
| Port 3000 busy | Stop the other program, or change the left `3000` in `docker-compose.yml`. |
| `/admin` gives 403 locally | Correct — it is protected. For local work only, set `SKIP_ACCESS_CHECK=true` and restart. |

## Preview on Vercel (show the design, no database)

Set **`PREVIEW_MODE=1`** and the site runs without a database: the 3 demo arenas
(stations, zones, maps, games) come from `prisma/demo-data.ts`, sign-in and booking
show "preview only", and the minute job is off. Good for showing the idea; the real
site runs with Docker (above).

1. Double-click **`push-github.bat`**: uploads this folder to the private repository
   `cyberreserve` under your GitHub account (never `.env`, backups or `PLAN.md`). Run it again
   to upload changes. `push-github.bat mo-haj public` makes a public repository instead.
2. On [vercel.com](https://vercel.com) sign in with GitHub → **Add New → Project** →
   import `cyberreserve` → under **Environment Variables** add `PREVIEW_MODE` = `1`
   → **Deploy**. Every later upload redeploys by itself.
