#!/bin/sh
set -e

# Uses the Prisma CLI and tsx installed in the image, called directly through
# node. Deliberately NOT npx (the container must start with no access to the
# npm registry) and not node_modules/.bin (no dependence on symlinks).

PRISMA="node node_modules/prisma/build/index.js"
TSX="node node_modules/tsx/dist/cli.mjs"

if [ "$SKIP_ACCESS_CHECK" = "true" ]; then
  echo "!!! WARNING: SKIP_ACCESS_CHECK=true — /admin and /api/admin are UNPROTECTED."
  echo "!!! This must never be set in production."
fi

echo "[entrypoint] applying migrations..."
$PRISMA migrate deploy

echo "[entrypoint] seeding (idempotent)..."
$TSX prisma/seed.ts

echo "[entrypoint] starting server on port ${PORT:-3000}..."
exec node server.js
