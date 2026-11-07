#!/usr/bin/env bash
# TB-24 golden run against a local gateway (https://stratyge.atlassian.net/browse/TB-24).
# Creates a confirmed local test user, signs in, and runs evals/run-golden.ts with that user's token.
#
# Needs (from `supabase status -o env`, exported in your shell, never committed):
#   API_URL, ANON_KEY, SERVICE_ROLE_KEY
# Optional: FN_URL (default $API_URL/functions/v1/ai-gateway). Extra arguments go to the runner,
# e.g. --mock-stats-url http://127.0.0.1:8794/stats --mock-mix valid=90,repair=8,fail=2
# Output has every key and token replaced by a placeholder. Each run leaves one
# `tb24-golden-<timestamp>@example.test` user in the local Auth database (local data only).
set -euo pipefail

: "${API_URL:?}" "${ANON_KEY:?}" "${SERVICE_ROLE_KEY:?}"
FN_URL="${FN_URL:-$API_URL/functions/v1/ai-gateway}"
EMAIL="tb24-golden-$(date +%s)@example.test"
PASSWORD="pw-$(openssl rand -hex 12)"

curl -sS -o /dev/null -w 'create local test user: HTTP %{http_code}\n' -X POST "$API_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"email_confirm\":true}"
USER_JWT=$(curl -sS -X POST "$API_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" |
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).access_token??""))')
[ -n "$USER_JWT" ] || { echo "sign-in failed"; exit 1; }
echo "sign in: got an access token (${#USER_JWT} chars)"
export USER_JWT

set +e
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON evals/run-golden.ts --url "$FN_URL" "$@" 2>&1 |
  sed -e "s#${ANON_KEY}#<ANON_KEY>#g" -e "s#${SERVICE_ROLE_KEY}#<SERVICE_ROLE_KEY>#g" \
    -e "s#${USER_JWT}#<USER_JWT>#g" -e "s#${PASSWORD}#<PASSWORD>#g"
status=${PIPESTATUS[0]}
echo "runner exit code: $status"
exit "$status"
