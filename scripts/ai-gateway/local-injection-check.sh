#!/usr/bin/env bash
# TB-25 local integration check (https://stratyge.atlassian.net/browse/TB-25): a real Supabase Auth
# JWT against the ai-gateway, provider = scripts/ai-gateway/mock-anthropic-leaky.mjs (or the real
# model, see docs/actions/ai-injection-corpus-real-model.md).
#
# Needs (from `supabase status -o env`, exported in your shell, never committed):
#   API_URL, ANON_KEY, SERVICE_ROLE_KEY
# Optional: FN_URL (function base URL, default $API_URL/functions/v1/ai-gateway), ROUTE (default parse),
#   SKIP_LENGTH=1 to run only the corpus.
# Prints status and body per call with every key and token replaced by a placeholder. Each run leaves
# one `tb25-check-<timestamp>@example.test` user in the local Auth database and prints its id.
set -euo pipefail

: "${API_URL:?}" "${ANON_KEY:?}" "${SERVICE_ROLE_KEY:?}"
FN="${FN_URL:-$API_URL/functions/v1/ai-gateway}"
ROUTE="${ROUTE:-parse}"
EMAIL="tb25-check-$(date +%s)-$RANDOM@example.test"
PASSWORD="pw-$(openssl rand -hex 12)"
HERE="$(cd "$(dirname "$0")" && pwd)"

redact() {
  sed -e "s#${ANON_KEY}#<ANON_KEY>#g" -e "s#${SERVICE_ROLE_KEY}#<SERVICE_ROLE_KEY>#g" \
    -e "s#${USER_JWT:-__none__}#<USER_JWT>#g" -e "s#${PASSWORD}#<PASSWORD>#g"
}

json_field() {
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s)[process.argv[1]];process.stdout.write(typeof v==="string"?v:"")})' "$1"
}

echo "# TB-25 input hardening check"
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
USER_JWT="$USER_JWT" FN_URL="$FN" ROUTE="$ROUTE" node "$HERE/injection-check.mjs" | redact
