# Multi-stage build: deps -> builder -> runner (+ prod-deps for the runtime node_modules).

FROM node:22-alpine AS base
# Prisma's query engine needs OpenSSL.
RUN apk add --no-cache openssl
WORKDIR /app

# ---- deps: the ONE place packages are downloaded ----
# Built for slow or unstable connections:
#  - the npm cache is kept between builds (cache mount), so a failed build
#    resumes from what was already downloaded instead of starting from zero;
#  - a stalled download is abandoned after 5 minutes and retried; few parallel
#    connections, so a slow line is not split too thin.
#  - Docker on Windows cannot download while Mullvad VPN is connected (it blocks
#    Docker's DNS). Build with the VPN disconnected.
FROM base AS deps
# Only the package files: changing the database schema must NOT re-run this
# step (it would re-download Prisma's engines, ~35 MB). The engine check below
# uses a tiny throwaway schema instead of the real one.
COPY package.json package-lock.json ./
# The install checks itself. On some networks npm ci "succeeds" but leaves a
# package half-extracted (seen on the owner's PC: an empty node_modules/prisma),
# and Docker then caches that broken result forever. Here a bad install is
# detected and npm ci runs again (max 3 tries). The download cache is only
# verified, never cleared: clearing it forces a full re-download, which took
# ~10 minutes per try on the owner's line. A failed check fails the step, so a
# broken install is never cached.
# The check schema lives INSIDE the project (.install-check/), because Prisma
# looks for package.json next to the schema; in /tmp it tries to reinstall itself.
# Two persistent caches: npm packages and Prisma's engine downloads, so a
# rebuild never downloads either again (unless package versions change).
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/root/.cache/prisma \
    mkdir -p .install-check; \
    printf 'datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}\ngenerator client {\n  provider = "prisma-client-js"\n}\nmodel InstallCheck {\n  id Int @id\n}\n' > .install-check/schema.prisma; \
    check() { \
      for f in \
        node_modules/prisma/build/index.js \
        node_modules/prisma/package.json \
        node_modules/next/dist/bin/next \
        node_modules/tsx/dist/cli.mjs \
        node_modules/@prisma/client/package.json \
        node_modules/typescript/package.json \
        node_modules/tailwindcss/package.json; do \
        [ -f "$f" ] || { echo "INSTALL-CHECK: missing $f"; ls -la "$(dirname "$f")" 2>&1 | head -10; return 1; }; \
      done; \
      npm ls --all >/dev/null 2>&1 || { echo "INSTALL-CHECK: npm ls reports problems:"; npm ls --all 2>&1 | grep -iE "missing|invalid|ERR" | head -20; return 1; }; \
      DATABASE_URL=postgresql://b:b@localhost:5432/b node node_modules/prisma/build/index.js generate --schema .install-check/schema.prisma >/tmp/generate.log 2>&1 \
        || { echo "INSTALL-CHECK: prisma generate failed (Prisma engine download from binaries.prisma.sh?)"; tail -n 15 /tmp/generate.log; return 1; }; \
      ls node_modules/.prisma/client/libquery_engine-*.node >/dev/null 2>&1 \
        || { echo "INSTALL-CHECK: Prisma query engine is missing (download from binaries.prisma.sh failed)"; return 1; }; \
      DATABASE_URL=postgresql://b:b@localhost:5432/b node node_modules/prisma/build/index.js migrate diff \
          --from-empty --to-schema-datamodel .install-check/schema.prisma --script >/dev/null 2>/tmp/schema-engine.log \
        || { echo "INSTALL-CHECK: Prisma schema engine does not run (download from binaries.prisma.sh failed?)"; tail -n 15 /tmp/schema-engine.log; return 1; }; \
      echo "INSTALL-CHECK: ok"; \
    }; \
    attempt=1; \
    while [ "$attempt" -le 3 ]; do \
      echo "==== npm ci attempt $attempt of 3 ===="; \
      if [ "$attempt" -eq 2 ]; then echo "verifying npm cache"; npm cache verify; fi; \
      rm -rf node_modules; \
      npm ci --no-audit --no-fund \
        --fetch-retries=5 \
        --fetch-retry-mintimeout=10000 \
        --fetch-retry-maxtimeout=60000 \
        --fetch-timeout=300000 \
        --maxsockets=4 \
      ; echo "npm ci exit code: $?"; \
      if check; then rm -rf .install-check; exit 0; fi; \
      attempt=$((attempt + 1)); sleep 15; \
    done; \
    echo "INSTALL FAILED after 3 attempts - see the INSTALL-CHECK lines above"; exit 1

# ---- prod-deps: production-only node_modules for the runner ----
# Made by removing devDependencies from the install above — no second download.
# Contains the Prisma CLI, tsx, @prisma/client and the generated client
# (node_modules/.prisma), so the container never needs the npm registry at start.
FROM deps AS prod-deps
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm prune --omit=dev --no-audit --no-fund \
 && node node_modules/prisma/build/index.js generate

# ---- builder ----
FROM base AS builder
# Placeholder so the build never needs a real database. Not used at runtime.
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY . .
# Whatever came from the host (a Windows node_modules or .next that slipped past
# .dockerignore) is thrown away; only the Linux install from the deps stage is used.
RUN rm -rf node_modules .next
COPY --from=deps /app/node_modules ./node_modules
# Tools are called through `node <file>` rather than node_modules/.bin links,
# so the build does not depend on symlinks surviving.
RUN if [ ! -f node_modules/prisma/build/index.js ] || [ ! -f node_modules/next/dist/bin/next ]; then \
      echo "DIAG: expected packages are missing from node_modules"; \
      echo "DIAG: package count: $(ls node_modules | wc -l)"; \
      echo "DIAG: prisma dir:"; ls -la node_modules/prisma 2>&1 | head -20; \
      echo "DIAG: package.json dependencies:"; grep -A12 '"dependencies"' package.json; \
      exit 1; \
    fi
RUN node node_modules/prisma/build/index.js generate \
 && node node_modules/next/dist/bin/next build \
 && rm -rf .next/standalone/node_modules

# ---- runner ----
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=UTC \
    PATH=/app/node_modules/.bin:$PATH \
    npm_config_update_notifier=false \
    CHECKPOINT_DISABLE=1

# Standalone server (server.js). Its traced node_modules was removed in the
# builder; the full production node_modules below replaces it. That is a
# superset and guarantees node_modules/.prisma, node_modules/@prisma/client,
# the prisma CLI and tsx are all present (standalone tracing misses them).
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/prisma ./prisma
# Development helper for Telegram sign-in without a public address (compose profile "telegram").
COPY --from=builder --chown=node:node /app/scripts/telegram-poller.ts ./scripts/telegram-poller.ts
COPY --from=builder --chown=node:node /app/scripts/add-owner.ts ./scripts/add-owner.ts
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --chown=node:node --chmod=755 docker-entrypoint.sh ./

USER node
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
