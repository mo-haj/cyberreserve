#!/bin/sh
# Creates .env from .env.example with freshly generated random secrets.
# Usage: sh scripts/setup-env.sh          (refuses to overwrite an existing .env)
#        sh scripts/setup-env.sh --force  (overwrites — changing the DB password
#                                          on an existing database will lock you out)
set -e
cd "$(dirname "$0")/.."

if [ -f .env ] && [ "$1" != "--force" ]; then
  echo ".env already exists. Not overwriting. Use --force to replace it." >&2
  exit 1
fi

rand() { od -An -N"$1" -tx1 /dev/urandom | tr -d ' \n'; }

DB_PASS="$(rand 24)"
AGENT_KEY="$(rand 32)"
TG_SECRET="$(rand 32)"

sed \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${DB_PASS}|" \
  -e "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://cyberreserve:${DB_PASS}@postgres:5432/cyberreserve?schema=public|" \
  -e "s|^AGENT_KEY=.*|AGENT_KEY=${AGENT_KEY}|" \
  -e "s|^TELEGRAM_WEBHOOK_SECRET=.*|TELEGRAM_WEBHOOK_SECRET=${TG_SECRET}|" \
  .env.example > .env

chmod 600 .env 2>/dev/null || true
echo ".env created with new random secrets."
