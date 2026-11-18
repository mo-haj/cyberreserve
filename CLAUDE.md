# CLAUDE.md — CyberReserve Engineering Standard

## Stack
- **Framework**: Next.js 15.5 App Router, React 19 (TypeScript, Tailwind CSS). Originally specified as 14; moved because 14.x is end-of-life with unpatched critical advisories. Do not downgrade.
- **Database**: PostgreSQL 15 + Prisma ORM
- **Deployment**: Docker Compose (`web`, `postgres`, `db-backup`)
- **Local agent**: Python (asyncio) compiled to `.exe` with PyInstaller

## Product scope
CyberReserve is a **directory of many gaming arenas** (decided 18 Nov 2026). Every arena-specific
record (PCs, prices, sections) hangs off the `Cafe` model. Never assume a single arena.
In the interface they are "arenas" (صالات), never "cafes".

## Language
Arabic is the default and right-to-left; English is a switch. All interface text lives in
`lib/i18n.ts`. A page never mixes Arabic and English (brand name and hardware specs excepted).

## Security Model

### Admin protection (two layers — both required)
1. **Edge**: Cloudflare Access (Zero Trust, email OTP) protects `/admin*` and `/api/admin*`.
2. **Application**: `middleware.ts` verifies the `Cf-Access-Jwt-Assertion` header is present on every
   request to those paths. Never rely on the edge alone — a Cloudflare misconfiguration must not
   expose the admin panel.

### Path access matrix — the Cloudflare Access policy MUST match this exactly
| Path | Access | Reason |
|---|---|---|
| `/` and all player routes | **Public** | Players must book without an OTP prompt |
| `/api/devices`, `/api/bookings` | **Public** (app-level auth) | Player-facing |
| `/admin*`, `/api/admin/*` | **Cloudflare Access** | Owner only |
| `/api/agent/ping-sync` | **Excluded from Access**, guarded by `X-Agent-Key` | The Python agent cannot complete an email OTP |
| `/api/telegram/webhook/<secret>` | **Excluded from Access**, guarded by the secret path AND the `X-Telegram-Bot-Api-Secret-Token` header | Telegram cannot authenticate |
| `/login`, `/api/auth/*` | **Public**, rate-limited | Players sign in with Telegram |
| `/api/lang`, `/arenas/*`, `/api/arenas/*` | **Public** | Language switch, arena pages and live status |
| `/api/health` | **Public** | Docker + uptime checks |

### Origin hardening (mandatory)
Cloudflare Access only protects traffic that passes through Cloudflare. The origin server MUST NOT be
reachable directly. Use a `cloudflared` tunnel (preferred — no inbound ports), or firewall the origin
to Cloudflare IP ranges only. Without this, `/admin` is fully open to anyone who finds the origin IP.

### Secrets
All secrets live in `.env` (git-ignored). A committed `.env.example` documents every key with
placeholder values. Never hardcode secrets in `docker-compose.yml` or source.

## Core Rules

### Time
- All timestamps stored in **UTC**, typed `@db.Timestamptz(3)` on every booking time field.
- Display and business calculations use **`Asia/Damascus`** (UTC+3, no DST).
- Never use bare `new Date()` for business logic — always go through a single `lib/time.ts` helper.

### Money
- All currency values use `Decimal @db.Decimal(12, 2)`. **Never** use binary floats.
- Prices are read from the `PricingSetting` singleton row, never hardcoded.
- `BookingSnack.unitPrice` snapshots the price at order time — menu prices change.

### Night shift pricing
Hours between **00:00 and 08:00 Asia/Damascus** bill at `nightShiftRate`. Sessions that span the
boundary are billed **pro-rata per hour** at whichever rate applies to each hour.

### Concurrency
Overlap prevention is enforced **at the database level** by a PostgreSQL GiST exclusion constraint —
never by an application-level "is it free?" check, which races. Any insert or update that touches a
booking's time range must catch the violation.

### Error mapping
| Condition | Response |
|---|---|
| PostgreSQL `23P01` (exclusion_violation) | `409 Conflict` — `"هذا الجهاز محجوز بالفعل في هذا التوقيت"` |
| Banned user attempts booking | `403 Forbidden` — `"الحساب محظور مؤقتاً"` |
| Cancel requested < 30 min before start | `400 Bad Request` — instruct user to call the cafe |
| Missing/invalid Cloudflare Access JWT on admin path | `403 Forbidden` |
| Missing/invalid `X-Agent-Key` | `401 Unauthorized` |

## UI Conventions
- Mobile-first. Most players book from a phone.
- Bilingual Arabic/English is acceptable for MVP; full RTL polish is deferred.
- **Always use Tailwind logical properties**: `ms-`/`me-`/`ps-`/`pe-`/`text-start`/`text-end`, never
  `ml-`/`mr-`/`pl-`/`pr-`/`text-left`/`text-right`. This makes a future RTL switch a one-line change
  instead of a full rewrite.
- Live state via **5-second polling** or SSE. Do **not** introduce Socket.io — reconnection storms on
  unreliable networks cost more than they buy at this scale (12 PCs, a handful of clients).

## Printing & Export
Reports and receipts are HTML with a `@media print` stylesheet, printed via the browser's native
dialog. **Do not use server-side PDF generators** — Node PDF libraries break Arabic glyph shaping and
produce disconnected, reversed text.

## Status Derivation
- `Device.powerStatus` is a **physical fact** (does it answer on the LAN).
- Availability/busy/reserved is a **business fact** derived from bookings at read time.
- Never store the two in one field. `powerStatus == ONLINE` with no booking is an admin *alert*, not
  a device state.
- **Staleness is derived at read time**, never written: if `lastPingAt` is null or older than 60s,
  report `UNKNOWN`. A dead agent must never leave stale statuses looking live.

## Build Discipline
- Work strictly phase by phase. Do not implement a later phase's features early.
- Each phase ends with its Definition of Done demonstrably passing before moving on.
- Validate every API input with Zod.
- Prefer explicit, boring code over cleverness — this system runs unattended in a shop.
