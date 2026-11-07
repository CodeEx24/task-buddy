#!/usr/bin/env bash
# TB-23 local integration check (https://stratyge.atlassian.net/browse/TB-23): a real Supabase Auth
# JWT against `supabase functions serve ai-gateway` (provider = scripts/ai-gateway/mock-anthropic.mjs).
#
# Needs (from `supabase status -o env`, exported in your shell, never committed):
#   API_URL, ANON_KEY, SERVICE_ROLE_KEY
# Optional: CALLS (default 31), ROUTE (default parse), LABEL (shown in the transcript), FN_URL.
# Prints status, Retry-After and body per call with every key and token replaced by a placeholder.
# Each run leaves one `tb23-check-<timestamp>@example.test` user in the local Auth database, and
# prints its user id so its ai_usage_ledger rows can be queried with psql.
set -euo pipefail

: "${API_URL:?}" "${ANON_KEY:?}" "${SERVICE_ROLE_KEY:?}"
CALLS="${CALLS:-31}"
ROUTE="${ROUTE:-parse}"
# FN_URL: the function's base URL when it runs in its own edge-runtime container instead of
# `functions serve` (e.g. http://127.0.0.1:54393/ai-gateway).
FN="${FN_URL:-$API_URL/functions/v1/ai-gateway}"
EMAIL="tb23-check-$(date +%s)-$RANDOM@example.test"
PASSWORD="pw-$(openssl rand -hex 12)"
TMP="$(mktemp -d)"

redact() {
  sed -e "s#${ANON_KEY}#<ANON_KEY>#g" -e "s#${SERVICE_ROLE_KEY}#<SERVICE_ROLE_KEY>#g" \
    -e "s#${USER_JWT:-__none__}#<USER_JWT>#g" -e "s#${PASSWORD}#<PASSWORD>#g"
}

json_field() {
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s)[process.argv[1]];process.stdout.write(typeof v==="string"?v:"")})' "$1"
}

echo "# ${LABEL:-TB-23 limits check}"
echo "# setup: create a confirmed local test user via the Auth admin API, then sign in"
USER_ID=$(curl -sS -X POST "$API_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"email_confirm\":true}" | json_field id)
[ -n "$USER_ID" ] || { echo "create user failed"; exit 1; }
USER_JWT=$(curl -sS -X POST "$API_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | json_field access_token)
[ -n "$USER_JWT" ] || { echo "sign-in failed"; exit 1; }
echo "test user id: $USER_ID"
echo "sign in: got an access token (${#USER_JWT} chars, role authenticated)"
echo
echo "\$ for i in \$(seq 1 $CALLS); do curl -i -X POST $FN/$ROUTE -H 'Authorization: Bearer <USER_JWT>' -d '{\"input\":\"buy milk tomorrow at 9\"}'; done"
if [ "${PARALLEL:-}" = "1" ]; then
  # All calls at once: the limit must hold under concurrency (atomic check-and-increment).
  echo "(all $CALLS calls sent concurrently)"
  for i in $(seq 1 "$CALLS"); do
    curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$FN/$ROUTE" \
      -H "Authorization: Bearer $USER_JWT" -H 'Content-Type: application/json' \
      -d '{"input":"buy milk tomorrow at 9"}' >"$TMP/status-$i" &
  done
  wait
  echo "status counts:"
  cat "$TMP"/status-* | sort | uniq -c
  rm -rf "$TMP"
  exit 0
fi

for i in $(seq 1 "$CALLS"); do
  curl -sS -D "$TMP/headers" -o "$TMP/body" -X POST "$FN/$ROUTE" \
    -H "Authorization: Bearer $USER_JWT" -H 'Content-Type: application/json' \
    -d '{"input":"buy milk tomorrow at 9"}' >/dev/null || true
  status=$(head -1 "$TMP/headers" | awk '{print $2}')
  retry=$(grep -i '^retry-after:' "$TMP/headers" | tr -d '\r' | awk '{print $2}' || true)
  printf 'call %2d: HTTP %s%s  %s\n' "$i" "$status" "${retry:+  Retry-After: $retry}" "$(redact <"$TMP/body")"
done
rm -rf "$TMP"
