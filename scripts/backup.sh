#!/bin/sh
# Daily PostgreSQL backup loop. Runs inside the db-backup container.
# Writes custom-format dumps to /backups and deletes dumps older than
# BACKUP_RETENTION_DAYS (default 7). Restore instructions: RESTORE.md

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"
PGHOST="${PGHOST:-postgres}"

export PGHOST
export PGPASSWORD="$POSTGRES_PASSWORD"

mkdir -p "$BACKUP_DIR"

run_backup() {
  stamp="$(date -u +%Y%m%d_%H%M%S)"
  final="$BACKUP_DIR/cyberreserve_${stamp}.dump"
  tmp="$final.partial"

  # Dump to a temp name first so a half-written file is never mistaken for a backup.
  # The dump must also be readable by pg_restore before it counts as a backup.
  if pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$tmp" \
     && pg_restore --list "$tmp" >/dev/null; then
    mv "$tmp" "$final"
    echo "[backup] $(date -u +%FT%TZ) ok: $final ($(wc -c < "$final") bytes)"
    # Prune only after a successful dump, so a broken database never erases good backups.
    find "$BACKUP_DIR" -maxdepth 1 -name 'cyberreserve_*.dump' -mtime +"$RETENTION_DAYS" -exec rm -f {} \;
  else
    rm -f "$tmp"
    echo "[backup] $(date -u +%FT%TZ) FAILED" >&2
    return 1
  fi
}

if [ "$1" = "--once" ]; then
  run_backup
  exit $?
fi

# Wait before the first dump, so it runs after the web container has applied
# migrations and seeded — otherwise the first backup is of an empty database.
START_DELAY="${BACKUP_START_DELAY_SECONDS:-120}"
echo "[backup] started: first dump in ${START_DELAY}s, then every ${INTERVAL_SECONDS}s, keeping ${RETENTION_DAYS} days"
sleep "$START_DELAY"
while true; do
  run_backup || true
  sleep "$INTERVAL_SECONDS"
done
