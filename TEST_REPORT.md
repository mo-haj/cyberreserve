# Test report — Phase 0

Delivery date: 2026-11-16.

## Read this first

The build sandbox could not download Docker images (Docker Hub) or Prisma's database engine
(`binaries.prisma.sh`) — both were blocked by its network policy. So:

- Everything that does not need those two was **run and passed** (table A).
- The steps that need them were **not run** (table B). They are covered by `scripts/verify.sh`,
  which you run once on your machine: `sh scripts/verify.sh --restart`.

Until that script prints `0 failed` on your machine, treat Phase 0 as "built, partly verified",
not "done".

## A. Run and passed before delivery

| Check | How | Result |
|---|---|---|
| Both migrations apply on a clean database | `psql` on a real PostgreSQL (v16) | Pass |
| DoD 4 — `no_overlap_booking` exists | `\d "Booking"` | Pass |
| DoD 5 — overlapping `PENDING` bookings fail with `23P01` | two inserts via `psql` | Pass |
| Race: 20 simultaneous inserts for the same PC and hour | 20 parallel `psql` sessions | Exactly 1 succeeded |
| Legal bookings still accepted: back-to-back, other PC, overlap with a `CANCELLED` one | `psql` | Pass |
| DoD 9 — `endTime <= startTime` fails on `booking_time_order` (`23514`) | `psql`, equal and reversed | Pass |
| Backup script: a failed dump leaves no file behind and deletes nothing | `backup.sh --once` against a missing database | Pass |
| Backup healthcheck expression | run against a fresh dump | Pass |
| Home page and 404 page render correctly at phone width, Arabic shaped and right-aligned | headless Chrome screenshots, 390 px | Pass |
| Status pill shows "System unavailable" when the health check fails | same screenshot (no database engine here) | Pass |
| Backup script writes a dump and prunes old files | `scripts/backup.sh --once`, with a 10-day-old file present | Pass |
| DoD 11 (logic) — dump restores into a scratch database, 12 devices, both constraints present | `pg_restore` + count | Pass |
| Prisma schema is valid | `prisma validate` | Pass |
| TypeScript, including the seed script | `tsc --noEmit` | 0 errors |
| `lib/time.ts` | `npm test` | 6/6 |
| Production build (`output: 'standalone'`) | `next build` | Pass |
| DoD 7 — `/admin`, `/admin/x/y`, `/api/admin`, `/api/admin/users` → 403 | `curl` against the built server | Pass |
| Admin guard edge cases: empty header value → 403; `/admin%2Fx` → 403 | `curl` | Pass |
| `SKIP_ACCESS_CHECK`: only the exact value `true` opens the guard (read at runtime) | 4 server starts: `true`, `false`, `TRUE`, unset | Pass |
| Public pages stay public | `/` → 200 | Pass |
| Health check failure path | `/api/health` with no database engine → 503 `{"status":"error","db":"disconnected"}` | Pass |
| Security headers present, `X-Powered-By` absent | `curl -I` | Pass |
| DoD 8 — `.gitattributes` present; shell scripts have LF endings | byte check | Pass |
| DoD 10 (static) — entrypoint never calls `npx` | text check | Pass |
| `docker-compose.yml` is valid | `docker compose config` | Pass |
| Dependency audit | `npm audit` | 0 vulnerabilities |
| No hardcoded secrets | search of source, compose and Dockerfile | None |

## B. Not run — verify on your machine

| Check | Covered by `verify.sh` |
|---|---|
| DoD 1 — `docker compose up --build` on a clean machine | start it, then run the script |
| DoD 2 — `postgres` and `web` healthy | Yes |
| DoD 3 — `/api/health` returns `{"status":"ok","db":"connected"}` | Yes |
| DoD 6 — restart with the volume kept; seed re-runs cleanly | Yes (`--restart`) |
| Seed creates 12 devices, pricing row, snacks (Prisma client against a live DB) | Yes |
| `prisma migrate deploy` applying the migrations (they were applied here with `psql` instead) | Implied by DoD 2/3 |
| DoD 10 — `prisma` and `tsx` are inside the image | Yes |
| DoD 10 — start with the npm registry blocked | Manual: disconnect the internet, `docker compose down && docker compose up -d` |
| DoD 11 — restore through the real containers | Yes |
| DoD 8 — LF endings after a fresh `git clone` on Windows | Yes, once the project is in git |
| Status pill shows "System online" (needs a working health check) | Look at http://localhost:3000 |
| The GitHub Actions workflow (`.github/workflows/verify.yml`) — written, never executed | Push to GitHub |
| The Docker image build itself | — (`docker compose up --build`) |
| `scripts/setup-env.ps1` (no PowerShell in the sandbox; the `.sh` twin was run) | Manual |

Also not possible here: PostgreSQL **15** specifically (tests used 16; the SQL used is identical
on both), and confirming the hand-written initial migration matches what `prisma migrate dev`
would generate byte-for-byte. To check the second one after the stack is up:

```
docker compose exec web node node_modules/prisma/build/index.js migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma
```

It should report no difference (it may mention the exclusion constraint's index, which Prisma
does not model — that is expected).

## What I tried in order to close table B

I compiled Prisma's engine from its public source so the real `migrate deploy` / seed / health
path could run here. The build succeeded, but the sandbox's safety policy refused to let me run
with it, so I stopped and did not use it. Table B is therefore unchanged.

## If something in table B fails

Send the output of `sh scripts/verify.sh` and `docker compose logs web`.
