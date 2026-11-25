#!/bin/sh
# Phase 0 Definition of Done — automated check.
#
# Run from the project root AFTER `docker compose up -d --build`:
#     sh scripts/verify.sh              # all checks against the running stack
#     sh scripts/verify.sh --restart    # also does `down` + `up` to prove the seed is idempotent
#
# On Windows run it from Git Bash. All test rows are rolled back; the only
# things left behind are one extra backup file in ./backups.

cd "$(dirname "$0")/.." || exit 1

# Git Bash on Windows rewrites arguments that look like Unix paths
# (/usr/local/bin/...) into Windows paths before docker sees them. Turn that off.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

BASE_URL="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

ok()   { PASS=$((PASS + 1)); echo "  PASS  $1"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; [ -n "$2" ] && echo "        $2"; }
step() { echo; echo "== $1"; }

envval() { grep -E "^$1=" .env 2>/dev/null | head -n 1 | cut -d= -f2- | tr -d '\r'; }

[ -f .env ] || { echo ".env not found. Run scripts/setup-env.sh first."; exit 1; }
DB_USER="$(envval POSTGRES_USER)"
DB_NAME="$(envval POSTGRES_DB)"

# NO_DOCKER=1 + PSQL_CMD lets the SQL checks run against any PostgreSQL (used in CI).
if [ -n "$PSQL_CMD" ]; then
  psql_db() { $PSQL_CMD -d "$1" -v ON_ERROR_STOP=0 -v VERBOSITY=verbose -X -q -A -t; }
else
  psql_db() { docker compose exec -T postgres psql -U "$DB_USER" -d "$1" -v ON_ERROR_STOP=0 -v VERBOSITY=verbose -X -q -A -t; }
fi
sql() { psql_db "$DB_NAME" 2>&1; }

http_code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

# Waits until the site answers AND Docker itself reports web + postgres healthy
# (Docker's label lags the real state by up to one healthcheck interval).
wait_healthy() {
  i=0
  while [ $i -lt 80 ]; do
    if [ "$(http_code "$BASE_URL/api/health")" = "200" ]; then
      all=1
      for svc in postgres web; do
        cid="$(docker compose ps -q "$svc" 2>/dev/null)"
        [ "$( [ -n "$cid" ] && docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null )" = "healthy" ] || all=0
      done
      [ $all -eq 1 ] && return 0
    fi
    i=$((i + 1)); sleep 3
  done
  return 1
}

# ---------------------------------------------------------------- restart (DoD 6)
if [ "$1" = "--restart" ] && [ -z "$NO_DOCKER" ]; then
  step "DoD 6 — restart with the volume retained (seed must be idempotent)"
  docker compose down >/dev/null 2>&1
  docker compose up -d >/dev/null 2>&1
  if wait_healthy; then ok "stack came back healthy after down + up"
  else bad "stack did not become healthy after restart" "see: docker compose logs web"; fi
fi

# ---------------------------------------------------------------- containers (DoD 1, 2)
if [ -z "$NO_DOCKER" ]; then
  step "DoD 1/2 — containers healthy"
  for svc in postgres web; do
    cid="$(docker compose ps -q "$svc" 2>/dev/null)"
    state="$( [ -n "$cid" ] && docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null )"
    if [ "$state" = "healthy" ]; then ok "$svc is healthy"
    else bad "$svc is '${state:-not running}'" "see: docker compose logs $svc"; fi
  done
fi

# ---------------------------------------------------------------- health (DoD 3)
if [ -z "$SKIP_HTTP" ]; then
  step "DoD 3 — health endpoint"
  body="$(curl -s "$BASE_URL/api/health")"
  if [ "$body" = '{"status":"ok","db":"connected"}' ]; then ok "/api/health -> $body"
  else bad "/api/health returned: ${body:-<nothing>}"; fi
fi

# ---------------------------------------------------------------- constraint exists (DoD 4)
step "DoD 4 — exclusion constraint exists"
out="$(echo "SELECT conname FROM pg_constraint WHERE conrelid = '\"Booking\"'::regclass AND contype IN ('x','c') ORDER BY 1;" | sql)"
echo "$out" | grep -q '^no_overlap_booking$' && ok "no_overlap_booking is present" || bad "no_overlap_booking missing" "$out"
echo "$out" | grep -q '^booking_time_order$' && ok "booking_time_order is present" || bad "booking_time_order missing" "$out"

# ---------------------------------------------------------------- overlap rejected (DoD 5)
step "DoD 5 — overlapping bookings are rejected with SQLSTATE 23P01"
INS='INSERT INTO "Booking" (id, "deviceId", "startTime", "endTime", "totalPrice", status, "updatedAt") VALUES'
# PC 1 and PC 2 of the same cafe (several cafes each have a "PC 1").
CAFE='(SELECT "cafeId" FROM "Device" WHERE "pcNumber" = 2 ORDER BY "cafeId" LIMIT 1)'
DEV1="(SELECT id FROM \"Device\" WHERE \"pcNumber\" = 1 AND \"cafeId\" = $CAFE)"
DEV2="(SELECT id FROM \"Device\" WHERE \"pcNumber\" = 2 AND \"cafeId\" = $CAFE)"

out="$(sql <<EOF
BEGIN;
$INS ('verify-a', $DEV1, '2099-01-01 10:00+03', '2099-01-01 12:00+03', 0, 'PENDING', now());
$INS ('verify-b', $DEV1, '2099-01-01 11:00+03', '2099-01-01 13:00+03', 0, 'PENDING', now());
ROLLBACK;
EOF
)"
if echo "$out" | grep -q '23P01' && echo "$out" | grep -q 'no_overlap_booking'; then
  ok "second overlapping PENDING booking failed: 23P01 on no_overlap_booking"
else bad "overlap was NOT rejected with 23P01" "$out"; fi

out="$(sql <<EOF
BEGIN;
$INS ('verify-a', $DEV1, '2099-01-01 10:00+03', '2099-01-01 12:00+03', 0, 'CONFIRMED', now());
$INS ('verify-c', $DEV1, '2099-01-01 12:00+03', '2099-01-01 14:00+03', 0, 'PENDING', now());
$INS ('verify-d', $DEV2, '2099-01-01 10:00+03', '2099-01-01 12:00+03', 0, 'PENDING', now());
$INS ('verify-e', $DEV1, '2099-01-01 10:30+03', '2099-01-01 11:30+03', 0, 'CANCELLED', now());
SELECT 'rows=' || count(*) FROM "Booking" WHERE id LIKE 'verify-%';
ROLLBACK;
EOF
)"
if echo "$out" | grep -q '^rows=4$'; then
  ok "legal cases accepted: back-to-back, other device, cancelled overlap"
else bad "a legal booking was wrongly rejected" "$out"; fi

# ---------------------------------------------------------------- time order (DoD 9)
step "DoD 9 — endTime <= startTime is rejected by booking_time_order"
for range in "'2099-01-02 12:00+03', '2099-01-02 12:00+03'" "'2099-01-02 12:00+03', '2099-01-02 10:00+03'"; do
  out="$(sql <<EOF
BEGIN;
$INS ('verify-z', $DEV1, $range, 0, 'PENDING', now());
ROLLBACK;
EOF
)"
  if echo "$out" | grep -q '23514' && echo "$out" | grep -q 'booking_time_order'; then
    ok "rejected ($range): 23514 on booking_time_order"
  else bad "bad time range was accepted ($range)" "$out"; fi
done

left="$(echo "SELECT count(*) FROM \"Booking\" WHERE id LIKE 'verify-%';" | sql)"
[ "$left" = "0" ] && ok "no test rows left behind" || bad "test rows left in Booking: $left"

# ---------------------------------------------------------------- seed data
if [ -z "$SKIP_SEED_CHECK" ]; then
  step "Seed data (3 demo cafes: 14 + 10 + 26 stations, PCs and consoles)"
  out="$(echo "SELECT (SELECT count(*) FROM \"Cafe\" WHERE \"isDemo\") || '/' || (SELECT count(*) FROM \"Device\" d JOIN \"Cafe\" c ON c.id = d.\"cafeId\" WHERE c.\"isDemo\") || '/' || (SELECT count(*) FROM \"CafeSection\") || '/' || (SELECT count(*) FROM \"SnackItem\") || '/' || (SELECT count(*) FROM \"Device\" WHERE \"cafeId\" IS NULL);" | sql)"
  cafes="$(echo "$out" | cut -d/ -f1)"; devices="$(echo "$out" | cut -d/ -f2)"; sections="$(echo "$out" | cut -d/ -f3)"; snacks="$(echo "$out" | cut -d/ -f4)"; orphans="$(echo "$out" | cut -d/ -f5)"
  [ "$cafes" = "3" ] && ok "3 demo cafes" || bad "expected 3 demo cafes, got '$cafes'"
  # At least: owners may add stations in the panel.
  [ "$devices" -ge 50 ] 2>/dev/null && ok "$devices demo stations (seeded 42 PCs + 8 consoles)" || bad "expected at least 50 demo stations, got '$devices'"
  [ "$sections" -ge 9 ] 2>/dev/null && ok "$sections photo/text sections" || bad "expected at least 9 sections, got '$sections'"
  [ "$orphans" = "0" ] && ok "every PC belongs to a cafe" || bad "$orphans PCs without a cafe"
  [ "${snacks:-0}" -ge 1 ] 2>/dev/null && ok "$snacks snack items" || bad "no snack items"
  games="$(echo "SELECT (SELECT count(*) FROM \"Game\") || '/' || (SELECT count(DISTINCT \"cafeId\") FROM \"CafeGame\");" | sql)"
  [ "$(echo "$games" | cut -d/ -f2)" = "3" ] && ok "game list: $(echo "$games" | cut -d/ -f1) games, every demo arena has games" || bad "games seed: '$games'"
fi

# ---------------------------------------------------------------- admin guard (DoD 7)
if [ -z "$SKIP_HTTP" ]; then
  step "DoD 7 — dashboard closed to signed-out visitors and to players"
  for path in /admin /admin/mezzeh-arena; do
    res="$(curl -s -o /dev/null -D - "$BASE_URL$path" | tr -d '\r' | grep -iE '^(HTTP/|location:)' | tr '\n' ' ')"
    echo "$res" | grep -qi 'location:.*/login' && ok "$path signed out -> sign-in" || bad "$path signed out: got '$res'"
  done
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "origin: $BASE_URL" -H 'content-type: application/json' -d '{}' "$BASE_URL/api/admin/arenas")"
  [ "$code" = "403" ] && ok "adding an arena without being the site admin -> 403" || bad "POST /api/admin/arenas signed out -> $code (expected 403)"
  # A fake session cookie gets past the quick check but not the page's own check.
  res="$(curl -s -o /dev/null -D - -H 'cookie: cr_session=not-a-real-session-token-0000000000000' "$BASE_URL/admin" | tr -d '\r' | grep -iE '^(HTTP/|location:)' | tr '\n' ' ')"
  echo "$res" | grep -qi 'location:.*/login' && ok "fake session cookie -> sign-in" || bad "/admin with fake cookie: got '$res'"
  code="$(http_code "$BASE_URL/")"
  [ "$code" = "200" ] && ok "/ is public (200)" || bad "/ -> $code (expected 200)"
fi

# ---------------------------------------------------------------- arena pages + live status
if [ -z "$SKIP_HTTP" ]; then
  step "Arena pages and live station status"
  for path in /arenas/mezzeh-arena /arenas/old-city-lan /arenas/kafr-souseh-hub /login; do
    code="$(http_code "$BASE_URL$path")"
    [ "$code" = "200" ] && ok "$path -> 200" || bad "$path -> $code (expected 200)"
  done
  code="$(http_code "$BASE_URL/arenas/does-not-exist")"
  [ "$code" = "404" ] && ok "unknown arena -> 404" || bad "unknown arena -> $code (expected 404)"
  code="$(http_code "$BASE_URL/cafes/mezzeh-arena")"
  case "$code" in 30[1278]) ok "old /cafes link redirects ($code)";; *) bad "old /cafes link -> $code (expected a redirect)";; esac
  code="$(http_code "$BASE_URL/api/arenas/Bad!/status")"
  [ "$code" = "400" ] && ok "invalid arena name rejected (400)" || bad "invalid arena name -> $code (expected 400)"
  body="$(curl -s "$BASE_URL/api/arenas")"
  n="$(echo "$body" | grep -o '"slug"' | wc -l | tr -d ' ')"
  [ "$n" -ge 3 ] && ok "/api/arenas lists arenas" || bad "/api/arenas lists '$n' entries" "$(echo "$body" | head -c 300)"
  body="$(curl -s "$BASE_URL/api/arenas/kafr-souseh-hub/status")"
  total="$(echo "$body" | grep -o '"pcNumber"' | wc -l | tr -d ' ')"
  busy="$(echo "$body" | grep -o '"status":"busy"' | wc -l | tr -d ' ')"
  [ "$total" -ge 20 ] 2>/dev/null && ok "live status shows $total stations for kafr-souseh-hub" || bad "live status shows '$total' stations (expected 20 or more)" "$(echo "$body" | head -c 300)"
  if [ "$(envval SEED_DEMO_BOOKINGS)" = "false" ]; then
    ok "demo bookings switched off (SEED_DEMO_BOOKINGS=false)"
  else
    [ "${busy:-0}" -ge 1 ] && ok "$busy stations show as in use (demo bookings)" || bad "no station shows as in use"
  fi

  body="$(curl -s "$BASE_URL/api/arenas?live=1")"
  size="$(printf '%s' "$body" | wc -c | tr -d ' ')"
  [ "$size" -lt 1500 ] && echo "$body" | grep -q '"counts"' && ok "live poll is small ($size bytes)" || bad "live poll is $size bytes" "$(echo "$body" | head -c 200)"
  curl -s "$BASE_URL/arenas/mezzeh-arena" | grep -q 'openstreetmap.org/export/embed.html' && ok "arena page shows its map (OpenStreetMap, no key)" || bad "arena page has no map"
  code="$(http_code "$BASE_URL/?city=aleppo")"
  [ "$code" = "200" ] && ok "city filter link (?city=aleppo) -> 200" || bad "?city=aleppo -> $code"

  step "Terms, privacy and profile"
  for path in /terms /privacy; do
    code="$(http_code "$BASE_URL$path")"
    [ "$code" = "200" ] && ok "$path -> 200" || bad "$path -> $code (expected 200)"
  done
  # Read the Location header itself (some Windows curl builds leave %{redirect_url} empty).
  res="$(curl -s -o /dev/null -D - "$BASE_URL/profile" | tr -d '\r' | grep -iE '^(HTTP/|location:)' | tr '\n' ' ')"
  echo "$res" | grep -qi 'location:.*/login' && ok "profile asks signed-out visitors to sign in" || bad "/profile signed out: got '$res' (expected a redirect to /login)"
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'origin: https://evil.example' -H 'content-type: application/json' -d '{}' "$BASE_URL/api/profile")"
  [ "$code" = "403" ] && ok "profile API refuses other websites (403)" || bad "cross-site profile save -> $code (expected 403)"

  step "Online booking"
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "origin: $BASE_URL" -H 'content-type: application/json' -d '{"slug":"mezzeh-arena","pcNumber":1,"start":"now","minutes":60}' "$BASE_URL/api/bookings")"
  [ "$code" = "401" ] && ok "booking needs sign-in (401)" || bad "booking without sign-in -> $code (expected 401)"
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'origin: https://evil.example' -H 'content-type: application/json' -d '{}' "$BASE_URL/api/bookings")"
  [ "$code" = "403" ] && ok "booking API refuses other websites (403)" || bad "cross-site booking -> $code"
  body="$(curl -s "$BASE_URL/api/arenas/mezzeh-arena/stations/1/schedule")"
  echo "$body" | grep -q '"taken"' && ok "station schedule answers (taken times only, no names)" || bad "station schedule" "$(echo "$body" | head -c 200)"
  echo "$body" | grep -qi 'phone\|nickname\|userId' && bad "station schedule leaks player data" || ok "station schedule shows no player data"

  step "Arena owner panel"
  res="$(curl -s -o /dev/null -D - "$BASE_URL/manage" | tr -d '\r' | grep -iE '^(HTTP/|location:)' | tr '\n' ' ')"
  echo "$res" | grep -qi 'location:.*/login' && ok "old /manage link asks signed-out visitors to sign in" || bad "/manage signed out: got '$res'"
  code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/manage/mezzeh-arena")"
  [ "$code" = "403" ] && ok "owner API refuses visitors who are not members (403)" || bad "owner API without sign-in -> $code"
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'origin: https://evil.example' -H 'content-type: application/json' -d '{"action":"freeNow","pcNumber":1}' "$BASE_URL/api/manage/mezzeh-arena")"
  [ "$code" = "403" ] && ok "owner API refuses other websites (403)" || bad "cross-site owner action -> $code"

  step "Languages (English default, Arabic switch)"
  curl -s "$BASE_URL/" | grep -q '<html lang="en" dir="ltr"' && ok "English by default" || bad "home page is not English by default"
  curl -s -H 'Cookie: cr_lang=ar' "$BASE_URL/" | grep -q '<html lang="ar" dir="rtl"' && ok "Arabic (right-to-left) when chosen" || bad "Arabic cookie not honoured"
  loc="$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE_URL/api/lang?to=en&next=/arenas/old-city-lan")"
  echo "$loc" | grep -q '/arenas/old-city-lan$' && ok "language switch returns to the same page" || bad "language switch went to '$loc'"
  loc="$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE_URL/api/lang?to=en&next=//evil.example")"
  echo "$loc" | grep -q 'evil' && bad "language switch redirected off-site: $loc" || ok "off-site redirect blocked"

  step "Telegram sign-in"
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/telegram/webhook/wrong-secret")"
  [ "$code" = "404" ] && ok "webhook rejects a wrong secret (404)" || bad "webhook with wrong secret -> $code"
  body="$(curl -s -X POST -H 'content-type: application/json' -d '{"token":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}' "$BASE_URL/api/auth/telegram/status")"
  echo "$body" | grep -q '"expired"' && ok "login status check reads the database (unknown token -> expired)" || bad "login status check failed" "$body"
  code="$(http_code -H 'Cookie: cr_session=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' "$BASE_URL/")"
  [ "$code" = "200" ] && ok "a fake session cookie is ignored safely" || bad "fake session cookie -> $code"
  if [ -z "$(envval TELEGRAM_BOT_TOKEN)" ]; then
    body="$(curl -s -X POST "$BASE_URL/api/auth/telegram/start")"
    echo "$body" | grep -q 'not_configured' && ok "no bot token yet: sign-in reports 'not set up' (expected until you add one)" || bad "sign-in start without token" "$body"
  else
    body="$(curl -s -X POST "$BASE_URL/api/auth/telegram/start")"
    if echo "$body" | grep -q '"botUrl":"https://t.me/'; then
      ok "sign-in start creates a login request with a t.me link"
      token="$(echo "$body" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
      st="$(curl -s -X POST -H 'content-type: application/json' -d "{\"token\":\"$token\"}" "$BASE_URL/api/auth/telegram/status")"
      echo "$st" | grep -q '"pending"' && ok "new login request is pending until Telegram confirms" || bad "login request status" "$st"
    else
      bad "sign-in start with a bot token" "$body"
    fi
  fi
fi

# ---------------------------------------------------------------- line endings (DoD 8)
step "DoD 8 — line endings"
[ -f .gitattributes ] && ok ".gitattributes present" || bad ".gitattributes missing"
for f in docker-entrypoint.sh scripts/backup.sh; do
  if grep -q "$(printf '\r')" "$f"; then bad "$f has CRLF line endings" "fix: git add --renormalize . (or re-clone)"
  else ok "$f has LF endings"; fi
done

# ---------------------------------------------------------------- no registry at start (DoD 10)
step "DoD 10 — container does not need the npm registry"
if grep -v '^#' docker-entrypoint.sh | grep -q 'npx'; then bad "docker-entrypoint.sh calls npx"
else ok "entrypoint does not use npx"; fi
if [ -z "$NO_DOCKER" ]; then
  out="$(docker compose exec -T web sh -c 'ls node_modules/prisma/build/index.js node_modules/tsx/dist/cli.mjs' 2>&1)"
  if [ "$(echo "$out" | grep -c '^node_modules/')" = "2" ]; then ok "prisma CLI and tsx are installed in the image"
  else bad "prisma/tsx not found in the image" "$out"; fi
fi

# ---------------------------------------------------------------- backup + restore (DoD 11)
if [ -z "$NO_DOCKER" ]; then
  step "DoD 11 — a backup restores into a scratch database"
  if docker compose exec -T db-backup sh /usr/local/bin/backup.sh --once >/dev/null 2>&1; then
    latest="$(ls -1 backups/cyberreserve_*.dump 2>/dev/null | sort | tail -n 1)"
    if [ -n "$latest" ]; then
      ok "backup written: $latest"
      echo 'DROP DATABASE IF EXISTS restore_test;' | psql_db postgres >/dev/null 2>&1
      echo 'CREATE DATABASE restore_test;' | psql_db postgres >/dev/null 2>&1
      # Dumps are private to the container user (umask 077), so read it inside the container.
      docker compose exec -T db-backup cat "/backups/$(basename "$latest")" \
        | docker compose exec -T postgres pg_restore -U "$DB_USER" -d restore_test --no-owner >/dev/null 2>&1
      live="$(echo 'SELECT count(*) FROM "Device";' | sql)"
      n="$(echo 'SELECT count(*) FROM "Device";' | psql_db restore_test 2>&1)"
      [ "$n" = "$live" ] && ok "restored copy has all $n PCs" || bad "restored copy has '$n' PCs (live database has $live)"
      echo 'DROP DATABASE IF EXISTS restore_test;' | psql_db postgres >/dev/null 2>&1
    else bad "no dump file found in ./backups"; fi
  else bad "backup command failed" "see: docker compose logs db-backup"; fi
fi

echo
echo "-----------------------------------------"
echo " $PASS passed, $FAIL failed"
echo "-----------------------------------------"
[ "$FAIL" -eq 0 ]
