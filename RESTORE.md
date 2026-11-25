# Restoring a backup

Backups are in `./backups`, named `cyberreserve_YYYYMMDD_HHMMSS.dump` (UTC, PostgreSQL custom
format). One is taken when the stack starts and then every 24 hours; files older than
`BACKUP_RETENTION_DAYS` (default 7) are deleted.

Replace `FILE` below with the dump you want. Run commands from the project folder.
On Windows use **Git Bash** or **cmd** — PowerShell's `<` redirect does not work for binary files.

## A. Test restore into a scratch database (safe — do this regularly)

```
docker compose exec -T postgres psql -U cyberreserve -d postgres -c "CREATE DATABASE restore_test;"
docker compose exec -T postgres pg_restore -U cyberreserve -d restore_test --no-owner < backups/FILE
docker compose exec -T postgres psql -U cyberreserve -d restore_test -c "SELECT count(*) FROM \"Device\";"
docker compose exec -T postgres psql -U cyberreserve -d postgres -c "DROP DATABASE restore_test;"
```

The count must be `12`. `sh scripts/verify.sh` does exactly this automatically.

## B. Real restore (replaces the live database)

```
docker compose stop web
docker compose exec -T postgres pg_restore -U cyberreserve -d cyberreserve --clean --if-exists --no-owner < backups/FILE
docker compose start web
curl http://localhost:3000/api/health
```

`--clean --if-exists` drops the current tables first, so everything after the backup is lost.
Take a fresh backup before you do this:

```
docker compose exec db-backup sh /usr/local/bin/backup.sh --once
```

## C. Restore onto a brand-new server

1. Copy the project folder, your `.env`, and the dump file to the new machine.
2. `docker compose up -d postgres`
3. Run the `pg_restore` line from section B.
4. `docker compose up -d --build`

## Notes

- If you changed `POSTGRES_USER` / `POSTGRES_DB` in `.env`, use those names instead of `cyberreserve`.
- `./backups` is on the same disk as the database. Copy it somewhere else (another machine, a USB
  drive, cloud storage) — a dead disk takes both.
- The dump includes the double-booking lock (`no_overlap_booking`), so a restored database is
  still protected.

## D. Live site (Vercel + Neon): the daily GitHub backup

The `backup` workflow (`.github/workflows/backup.yml`) dumps the Neon database every night at
03:17 Damascus time and keeps each dump for 30 days, **encrypted** with `BACKUP_PASSPHRASE`.

**Set up once** — GitHub → the repo → Settings → Secrets and variables → Actions → New repository secret:
- `NEON_DATABASE_URL` = the same value as `DATABASE_URL` in Vercel
- `BACKUP_PASSPHRASE` = a long random passphrase. Save it in your password manager as well:
  without it the backups cannot be opened by anyone, you included.

Then Actions → **backup** → **Run workflow** once, and check it turns green.

**Get a backup** — Actions → backup → pick a run → Artifacts → download `db-backup-…` (a zip) and unzip it.

**Open it** (Git Bash on Windows, or any Linux/Mac terminal):

```
openssl enc -d -aes-256-cbc -pbkdf2 -iter 300000 -in cyberreserve_YYYYMMDD_HHMM.dump.enc -out cyberreserve.dump
```

It asks for the passphrase.

**Restore into Neon** — safest is a NEW Neon branch or database first, check it, then switch
`DATABASE_URL` in Vercel to it:

```
docker run --rm -i postgres:17-alpine pg_restore -d "<NEW_DATABASE_URL>" --no-owner --no-privileges < cyberreserve.dump
```

Or into the local Docker stack: section B, with this file.

Notes:
- GitHub stops scheduled jobs in a repo with no commits for 60 days; a push or one manual run restarts them.
- Neon's own history (point-in-time restore) also exists, but on the free plan it only reaches back a short time.
