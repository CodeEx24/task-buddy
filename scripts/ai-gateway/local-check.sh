#!/usr/bin/env bash
# TB-22 local integration check: real Supabase Auth JWTs against `supabase functions serve ai-gateway`
# with the provider pointed at scripts/ai-gateway/mock-anthropic.mjs.
#
# Needs (from `supabase status -o env`, exported in your shell, never committed):
#   API_URL, ANON_KEY, SERVICE_ROLE_KEY
# Prints a transcript with every token and key replaced by a placeholder. Each run leaves one
# `tb22-check-<timestamp>@example.test` user in the local Auth database (local data only).
set -euo pipefail

: "${API_URL:?}" "${ANON_KEY:?}" "${SERVICE_ROLE_KEY:?}"
FN="$API_URL/functions/v1/ai-gateway"
EMAIL="tb22-check-$(date +%s)@example.test"
PASSWORD="pw-$(openssl rand -hex 12)"

redact() {
  sed -e "s#${ANON_KEY}#<ANON_KEY>#g" -e "s#${SERVICE_ROLE_KEY}#<SERVICE_ROLE_KEY>#g" \
    -e "s#${USER_JWT:-__none__}#<USER_JWT>#g" -e "s#${PASSWORD}#<PASSWORD>#g"
}

# Shows the command with placeholders, then status + body.
call() {
  local label="$1" shown="$2"
  shift 2
  echo "### $label"
  echo "\$ $shown"
  curl -sS -o /tmp/tb22-body -w '%{http_code}' "$@" >/tmp/tb22-status || true
  echo "HTTP $(cat /tmp/tb22-status)"
  redact </tmp/tb22-body
  echo
  echo
}

echo "# setup: create a confirmed local test user via the Auth admin API, then sign in"
curl -sS -o /dev/null -w 'create user: HTTP %{http_code}\n' -X POST "$API_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"email_confirm\":true}"
USER_JWT=$(curl -sS -X POST "$API_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" |
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).access_token??""))')
[ -n "$USER_JWT" ] || { echo "sign-in failed"; exit 1; }
echo "sign in: got an access token (${#USER_JWT} chars, role authenticated)"
echo

BODY='{"input":"buy milk tomorrow at 9"}'

call "AC1: no token -> 401" \
  "curl -X POST $FN/parse -d '$BODY'" \
  -X POST "$FN/parse" -H 'Content-Type: application/json' -d "$BODY"

call "AC1: garbage token -> 401" \
  "curl -X POST $FN/parse -H 'Authorization: Bearer not-a-jwt' -d '$BODY'" \
  -X POST "$FN/parse" -H 'Authorization: Bearer not-a-jwt' -H 'Content-Type: application/json' -d "$BODY"

call "AC1: anon key as bearer (valid JWT, no user) -> 401" \
  "curl -X POST $FN/plan -H 'Authorization: Bearer <ANON_KEY>' -d '$BODY'" \
  -X POST "$FN/plan" -H "Authorization: Bearer $ANON_KEY" -H 'Content-Type: application/json' -d "$BODY"

call "AC1: service-role key as bearer (a JWT, but not a user) -> 401"   "curl -X POST $FN/plan -H 'Authorization: Bearer <SERVICE_ROLE_KEY>' -d '$BODY'"   -X POST "$FN/plan" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H 'Content-Type: application/json' -d "$BODY"

for route in parse breakdown plan; do
  call "AC2: valid user JWT -> 200 on /$route" \
    "curl -X POST $FN/$route -H 'Authorization: Bearer <USER_JWT>' -d '$BODY'" \
    -X POST "$FN/$route" -H "Authorization: Bearer $USER_JWT" -H 'Content-Type: application/json' -d "$BODY"
done

call "valid JWT, invalid body -> 400" \
  "curl -X POST $FN/parse -H 'Authorization: Bearer <USER_JWT>' -d '{\"input\":\"\"}'" \
  -X POST "$FN/parse" -H "Authorization: Bearer $USER_JWT" -H 'Content-Type: application/json' -d '{"input":""}'

call "unknown route -> 404" \
  "curl -X POST $FN/chat -H 'Authorization: Bearer <USER_JWT>' -d '$BODY'" \
  -X POST "$FN/chat" -H "Authorization: Bearer $USER_JWT" -H 'Content-Type: application/json' -d "$BODY"

if [ "${SKIP_SLOW:-}" != "1" ]; then
  start=$(date +%s)
  call "AC2: provider slower than 20 s -> 504 AI_TIMEOUT" \
    "curl -X POST $FN/plan -H 'Authorization: Bearer <USER_JWT>' -d '{\"input\":\"SLOW\"}'" \
    -X POST "$FN/plan" -H "Authorization: Bearer $USER_JWT" -H 'Content-Type: application/json' -d '{"input":"SLOW"}'
  echo "elapsed: $(($(date +%s) - start)) s (mock answers after 25 s)"
fi
