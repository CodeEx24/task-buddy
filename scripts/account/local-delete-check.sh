#!/usr/bin/env bash
# TB-53 local integration check (https://stratyge.atlassian.net/browse/TB-53): the delete-account
# Edge Function against a real local Supabase stack (Auth, PostgREST, Postgres).
#
# Needs (from `supabase status -o env`, exported in your shell, never committed):
#   API_URL, ANON_KEY, SERVICE_ROLE_KEY
# Optional: FN_URL (default $API_URL/functions/v1/delete-account), DB_CONTAINER (default
# supabase_db_task-buddy, for the psql row counts).
#
# Creates two throwaway users (A is deleted, B is the control), gives both synced lists, tasks and
# steps through the real write path (sync_push as the user) and AI usage rows (ai_record_usage
# with the service role), then deletes A and shows with psql that nothing of A remains while B is
# intact. Every key, token and password is replaced by a placeholder before printing. B is left in
# the local database; A is deleted by the check itself.
set -euo pipefail

: "${API_URL:?}" "${ANON_KEY:?}" "${SERVICE_ROLE_KEY:?}"
FN="${FN_URL:-$API_URL/functions/v1/delete-account}"
DB_CONTAINER="${DB_CONTAINER:-supabase_db_task-buddy}"
STAMP="$(date +%s)-$RANDOM"
PASSWORD="pw-$(openssl rand -hex 12)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

redact() {
  sed -e "s#${ANON_KEY}#<ANON_KEY>#g" -e "s#${SERVICE_ROLE_KEY}#<SERVICE_ROLE_KEY>#g" \
    -e "s#${JWT_A:-__none__}#<USER_A_JWT>#g" -e "s#${JWT_B:-__none__}#<USER_B_JWT>#g" \
    -e "s#${REFRESH_A:-__none__}#<USER_A_REFRESH_TOKEN>#g" -e "s#${PASSWORD}#<PASSWORD>#g"
}

json_field() {
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let v;try{v=JSON.parse(s)[process.argv[1]]}catch{};process.stdout.write(typeof v==="string"?v:"")})' "$1"
}

psql_q() {
  docker exec "$DB_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -P pager=off -c "$1"
}

create_user() { # email → user id
  curl -sS -X POST "$API_URL/auth/v1/admin/users" \
    -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PASSWORD\",\"email_confirm\":true}" | json_field id
}

sign_in() { # email → full token response
  curl -sS -X POST "$API_URL/auth/v1/token?grant_type=password" \
    -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}"
}

rpc_as() { # jwt fn body → "HTTP <status>"
  curl -sS -o "$TMP/rpc" -w 'HTTP %{http_code}' -X POST "$API_URL/rest/v1/rpc/$2" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -d "$3"
}

seed() { # jwt user-id label
  local now list task
  now=$(node -e 'process.stdout.write(String(Date.now()))')
  list=$(node -e 'process.stdout.write(crypto.randomUUID())')
  task=$(node -e 'process.stdout.write(crypto.randomUUID())')
  echo "  sync_push lists:    $(rpc_as "$1" sync_push "{\"p_table\":\"lists\",\"p_client_now\":$now,\"p_rows\":[{\"id\":\"$list\",\"created_at\":$now,\"updated_at\":$now,\"name\":\"List $3\"}]}")"
  echo "  sync_push tasks:    $(rpc_as "$1" sync_push "{\"p_table\":\"tasks\",\"p_client_now\":$now,\"p_rows\":[{\"id\":\"$task\",\"created_at\":$now,\"updated_at\":$now,\"list_id\":\"$list\",\"title\":\"Task $3\"},{\"id\":\"$(node -e 'process.stdout.write(crypto.randomUUID())')\",\"created_at\":$now,\"updated_at\":$now,\"deleted_at\":$now,\"title\":\"Tombstone $3\"}]}")"
  echo "  sync_push subtasks: $(rpc_as "$1" sync_push "{\"p_table\":\"subtasks\",\"p_client_now\":$now,\"p_rows\":[{\"id\":\"$(node -e 'process.stdout.write(crypto.randomUUID())')\",\"created_at\":$now,\"updated_at\":$now,\"task_id\":\"$task\",\"title\":\"Step $3\"}]}")"
  for i in 1 2; do
    echo "  ai_record_usage #$i (service role): $(rpc_as "$SERVICE_ROLE_KEY" ai_record_usage "{\"p_user_id\":\"$2\",\"p_request_id\":\"tb53-$3-$i\",\"p_route\":\"parse\",\"p_model\":\"claude-haiku-5-5\",\"p_input_tokens\":22,\"p_output_tokens\":8,\"p_cost_usd\":0.0001,\"p_outcome\":\"ok\"}")"
  done
  echo "  ai_consume_call (service role):     $(rpc_as "$SERVICE_ROLE_KEY" ai_consume_call "{\"p_user_id\":\"$2\",\"p_calls_per_hour\":30,\"p_tokens_per_day\":50000}")"
}

counts() {
  psql_q "select u.label, u.id as user_id,
       (select count(*) from auth.users where id = u.id)               as auth_users,
       (select count(*) from auth.identities where user_id = u.id)     as identities,
       (select count(*) from auth.sessions where user_id = u.id)       as sessions,
       (select count(*) from auth.refresh_tokens where user_id = u.id::text) as refresh_tokens,
       (select count(*) from public.profiles where id = u.id)          as profiles,
       (select count(*) from public.lists where user_id = u.id)        as lists,
       (select count(*) from public.tasks where user_id = u.id)        as tasks,
       (select count(*) from public.subtasks where user_id = u.id)     as subtasks,
       (select count(*) from public.ai_usage_ledger where user_id = u.id)   as ai_ledger,
       (select count(*) from public.ai_usage_counters where user_id = u.id) as ai_counters
     from (values ('A (deleted)', '$USER_A'::uuid), ('B (control)', '$USER_B'::uuid)) as u(label, id);"
}

call() { # label, curl args... → prints the request and the redacted response
  local label="$1"; shift
  echo "### $label"
  curl -sS -D "$TMP/h" -o "$TMP/b" "$@" >/dev/null || true
  echo "HTTP $(head -1 "$TMP/h" | awk '{print $2}')"
  redact <"$TMP/b"; echo; echo
}

echo "# TB-53 delete-account local check"
echo "# setup: two confirmed throwaway users via the Auth admin API, then password sign-in"
EMAIL_A="tb53-a-$STAMP@example.test"; EMAIL_B="tb53-b-$STAMP@example.test"
USER_A=$(create_user "$EMAIL_A"); USER_B=$(create_user "$EMAIL_B")
[ -n "$USER_A" ] && [ -n "$USER_B" ] || { echo "create user failed"; exit 1; }
TOKENS_A=$(sign_in "$EMAIL_A"); JWT_A=$(echo "$TOKENS_A" | json_field access_token)
REFRESH_A=$(echo "$TOKENS_A" | json_field refresh_token)
JWT_B=$(sign_in "$EMAIL_B" | json_field access_token)
[ -n "$JWT_A" ] && [ -n "$JWT_B" ] && [ -n "$REFRESH_A" ] || { echo "sign-in failed"; exit 1; }
echo "user A: $USER_A ($EMAIL_A)"
echo "user B: $USER_B ($EMAIL_B)"
echo
echo "# seed A and B: synced rows through sync_push as the user, AI usage rows with the service role"
echo "A:"; seed "$JWT_A" "$USER_A" A
echo "B:"; seed "$JWT_B" "$USER_B" B
echo
echo "# before"
counts

call "no token -> 401" -X POST "$FN" -H 'Content-Type: application/json' -d '{"confirm":"DELETE"}'
call "anon key as bearer -> 401" -X POST "$FN" -H "Authorization: Bearer $ANON_KEY" -H 'Content-Type: application/json' -d '{"confirm":"DELETE"}'
call "service-role key as bearer -> 401" -X POST "$FN" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H 'Content-Type: application/json' -d '{"confirm":"DELETE"}'
call "user A, wrong confirmation -> 400 (nothing deleted)" -X POST "$FN" -H "Authorization: Bearer $JWT_A" -H 'Content-Type: application/json' -d '{"confirm":"delete"}'
call "user A, GET -> 405" -X GET "$FN" -H "Authorization: Bearer $JWT_A"

echo "# after the refused calls: unchanged"
counts

call "user A deletes their account -> 200 deleted" -X POST "$FN" -H "Authorization: Bearer $JWT_A" -H 'Content-Type: application/json' -d '{"confirm":"DELETE"}'

echo "# after: nothing of A remains (Auth user, identities, sessions, refresh tokens, profile, sync rows, AI rows); B intact"
counts

call "retry with A's (still unexpired) token -> 200 already_deleted (idempotent)" -X POST "$FN" -H "Authorization: Bearer $JWT_A" -H 'Content-Type: application/json' -d '{"confirm":"DELETE"}'
call "A's token at Auth -> 403 user_not_found" "$API_URL/auth/v1/user" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $JWT_A"
call "A's refresh token can't mint a new session -> 400" -X POST "$API_URL/auth/v1/token?grant_type=refresh_token" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' -d "{\"refresh_token\":\"$REFRESH_A\"}"
echo "### A's token can't re-create data through sync_push (no resurrection)"
echo "$(rpc_as "$JWT_A" sync_push "{\"p_table\":\"lists\",\"p_client_now\":$(node -e 'process.stdout.write(String(Date.now()))'),\"p_rows\":[{\"id\":\"$(node -e 'process.stdout.write(crypto.randomUUID())')\",\"created_at\":1,\"updated_at\":1,\"name\":\"zombie\"}]}")"
redact <"$TMP/rpc"; echo; echo
call "B is still signed in -> 200 at Auth" "$API_URL/auth/v1/user" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $JWT_B"

echo "# final"
counts
