# TB-53 — Local integration run (curl + psql transcript)

> Jira: https://stratyge.atlassian.net/browse/TB-53 · Spec: [spec.md](spec.md) · Verification: [verification.md](verification.md)

Run on 2026-10-28 (about 22:49 UTC), Windows 11, Docker Desktop, against Task Buddy's local Supabase stack (CLI 2.122.0: real Auth/GoTrue, PostgREST, Kong and Postgres 17 at API `127.0.0.1:55321`, DB `55322`). Migrations already applied on the stack: `20261028120000`, `20261028180000`, `20261028181639` (TB-53 adds none). Nothing was reset or stopped; other projects' containers were not touched.

**Setup**
1. Function: this worktree's `supabase/functions/delete-account` (read-only mount) in **its own** container of the Edge Runtime image the CLI uses, on the stack's Docker network, so it reaches Auth through Kong exactly as `functions serve` does (the TB-23 pattern):
   `docker run -d --name tb53-edge-runtime --network supabase_network_task-buddy -p 55397:9000 --env-file <file outside the repo> -v <worktree>:/repo:ro public.ecr.aws/supabase/edge-runtime:v1.77.8 start --main-service=/repo/supabase/functions/delete-account --port=9000`.
   The env file held only `SUPABASE_URL=http://supabase_kong_task-buddy:8000` and the stack's local `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` (from `supabase status -o env`; never printed or committed).
2. Calls: `bash scripts/account/local-delete-check.sh` with `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY` exported and `FN_URL=http://127.0.0.1:55397/delete-account`. It creates two throwaway confirmed users through the Auth admin API (A is deleted, B is the control), signs both in with a password grant (real user access tokens), seeds both through the **real write paths** (`sync_push` as the user for lists/tasks/subtasks including a tombstone; `ai_record_usage` / `ai_consume_call` with the service role for the AI ledger and counters), then calls the function. Row counts come from `docker exec supabase_db_task-buddy psql -U postgres`. Every key, token and password is replaced by a placeholder before printing (a grep of the output for `eyJ`, `sb_secret`, `sb_publishable` found 0 matches).

## Transcript (verbatim, redacted by the script)

```text
# TB-53 delete-account local check
# setup: two confirmed throwaway users via the Auth admin API, then password sign-in
user A: 58fdde93-6efc-426b-b7aa-d1999fe8908c (tb53-a-1793227777-13675@example.test)
user B: 02e98e5e-75cc-424e-ac79-1c5f35c5ca56 (tb53-b-1793227777-13675@example.test)

# seed A and B: synced rows through sync_push as the user, AI usage rows with the service role
A:
  sync_push lists:    HTTP 200
  sync_push tasks:    HTTP 200
  sync_push subtasks: HTTP 200
  ai_record_usage #1 (service role): HTTP 204
  ai_record_usage #2 (service role): HTTP 204
  ai_consume_call (service role):     HTTP 200
B:
  sync_push lists:    HTTP 200
  sync_push tasks:    HTTP 200
  sync_push subtasks: HTTP 200
  ai_record_usage #1 (service role): HTTP 204
  ai_record_usage #2 (service role): HTTP 204
  ai_consume_call (service role):     HTTP 200

# before
    label    |               user_id                | auth_users | identities | sessions | refresh_tokens | profiles | lists | tasks | subtasks | ai_ledger | ai_counters 
-------------+--------------------------------------+------------+------------+----------+----------------+----------+-------+-------+----------+-----------+-------------
 A (deleted) | 58fdde93-6efc-426b-b7aa-d1999fe8908c |          1 |          1 |        1 |              1 |        1 |     1 |     2 |        1 |         2 |           2
 B (control) | 02e98e5e-75cc-424e-ac79-1c5f35c5ca56 |          1 |          1 |        1 |              1 |        1 |     1 |     2 |        1 |         2 |           2
(2 rows)

### no token -> 401
HTTP 401
{"requestId":"34b4e19e-133e-42e6-ae6a-4d4d31451170","error":{"code":"UNAUTHENTICATED","message":"A valid signed-in session is required."}}

### anon key as bearer -> 401
HTTP 401
{"requestId":"7f9eb46e-3429-4f7b-8e74-1cad1933ab06","error":{"code":"UNAUTHENTICATED","message":"A valid signed-in session is required."}}

### service-role key as bearer -> 401
HTTP 401
{"requestId":"ead24c1e-f13d-4261-be6a-d6bc79075117","error":{"code":"UNAUTHENTICATED","message":"A valid signed-in session is required."}}

### user A, wrong confirmation -> 400 (nothing deleted)
HTTP 400
{"requestId":"92a5d1a2-9a18-4a8a-bd02-cbf3ad7656ef","error":{"code":"BAD_REQUEST","message":"The request body is invalid."}}

### user A, GET -> 405
HTTP 405
{"requestId":"f80890f1-8d44-40f9-bed3-53f5aa4f3b2f","error":{"code":"METHOD_NOT_ALLOWED","message":"Use POST."}}

# after the refused calls: unchanged
    label    |               user_id                | auth_users | identities | sessions | refresh_tokens | profiles | lists | tasks | subtasks | ai_ledger | ai_counters 
-------------+--------------------------------------+------------+------------+----------+----------------+----------+-------+-------+----------+-----------+-------------
 A (deleted) | 58fdde93-6efc-426b-b7aa-d1999fe8908c |          1 |          1 |        1 |              1 |        1 |     1 |     2 |        1 |         2 |           2
 B (control) | 02e98e5e-75cc-424e-ac79-1c5f35c5ca56 |          1 |          1 |        1 |              1 |        1 |     1 |     2 |        1 |         2 |           2
(2 rows)

### user A deletes their account -> 200 deleted
HTTP 200
{"requestId":"57f5212c-80e2-47a3-ae62-e2ac4a2947c3","status":"deleted"}

# after: nothing of A remains (Auth user, identities, sessions, refresh tokens, profile, sync rows, AI rows); B intact
    label    |               user_id                | auth_users | identities | sessions | refresh_tokens | profiles | lists | tasks | subtasks | ai_ledger | ai_counters 
-------------+--------------------------------------+------------+------------+----------+----------------+----------+-------+-------+----------+-----------+-------------
 A (deleted) | 58fdde93-6efc-426b-b7aa-d1999fe8908c |          0 |          0 |        0 |              0 |        0 |     0 |     0 |        0 |         0 |           0
 B (control) | 02e98e5e-75cc-424e-ac79-1c5f35c5ca56 |          1 |          1 |        1 |              1 |        1 |     1 |     2 |        1 |         2 |           2
(2 rows)

### retry with A's (still unexpired) token -> 200 already_deleted (idempotent)
HTTP 200
{"requestId":"26947af9-60ba-4a24-8cc4-e8bba4a28d9a","status":"already_deleted"}

### A's token at Auth -> 403 user_not_found
HTTP 403
{"code":403,"error_code":"user_not_found","msg":"User from sub claim in JWT does not exist"}

### A's refresh token can't mint a new session -> 400
HTTP 400
{"code":400,"error_code":"refresh_token_not_found","msg":"Invalid Refresh Token: Refresh Token Not Found"}

### A's token can't re-create data through sync_push (no resurrection)
HTTP 409
{"code":"23503","details":"Key (user_id)=(58fdde93-6efc-426b-b7aa-d1999fe8908c) is not present in table \"users\".","hint":null,"message":"insert or update on table \"lists\" violates foreign key constraint \"lists_user_id_fkey\""}

### B is still signed in -> 200 at Auth
HTTP 200
{"id":"02e98e5e-75cc-424e-ac79-1c5f35c5ca56","aud":"authenticated","role":"authenticated","email":"tb53-b-1793227777-13675@example.test","email_confirmed_at":"2026-10-28T22:49:39.596636Z","phone":"","confirmed_at":"2026-10-28T22:49:39.596636Z","last_sign_in_at":"2026-10-28T22:49:41.281929Z","app_metadata":{"provider":"email","providers":["email"]},"user_metadata":{"email_verified":true},"identities":[{"identity_id":"97b15e63-aa43-463b-bb2c-bb4a37287106","id":"02e98e5e-75cc-424e-ac79-1c5f35c5ca56","user_id":"02e98e5e-75cc-424e-ac79-1c5f35c5ca56","identity_data":{"email":"tb53-b-1793227777-13675@example.test","email_verified":false,"phone_verified":false,"sub":"02e98e5e-75cc-424e-ac79-1c5f35c5ca56"},"provider":"email","last_sign_in_at":"2026-10-28T22:49:39.593756Z","created_at":"2026-10-28T22:49:39.59379Z","updated_at":"2026-10-28T22:49:39.59379Z","email":"tb53-b-1793227777-13675@example.test"}],"created_at":"2026-10-28T22:49:39.589964Z","updated_at":"2026-10-28T22:49:41.285978Z","is_anonymous":false}

# final
    label    |               user_id                | auth_users | identities | sessions | refresh_tokens | profiles | lists | tasks | subtasks | ai_ledger | ai_counters 
-------------+--------------------------------------+------------+------------+----------+----------------+----------+-------+-------+----------+-----------+-------------
 A (deleted) | 58fdde93-6efc-426b-b7aa-d1999fe8908c |          0 |          0 |        0 |              0 |        0 |     0 |     0 |        0 |         0 |           0
 B (control) | 02e98e5e-75cc-424e-ac79-1c5f35c5ca56 |          1 |          1 |        1 |              1 |        1 |     1 |     2 |        1 |         2 |           2
(2 rows)

```

## Function log (from `docker logs tb53-edge-runtime`)

```text
{"fn":"delete-account","requestId":"68e0919c-9726-4e67-b48b-fb9d5a99297f","status":401,"outcome":"unauthenticated","durationMs":4}
{"fn":"delete-account","requestId":"34b4e19e-133e-42e6-ae6a-4d4d31451170","status":401,"outcome":"unauthenticated","durationMs":0}
{"fn":"delete-account","requestId":"7f9eb46e-3429-4f7b-8e74-1cad1933ab06","status":401,"outcome":"unauthenticated","durationMs":54}
{"fn":"delete-account","requestId":"ead24c1e-f13d-4261-be6a-d6bc79075117","status":401,"outcome":"unauthenticated","durationMs":5}
{"fn":"delete-account","requestId":"92a5d1a2-9a18-4a8a-bd02-cbf3ad7656ef","status":400,"outcome":"bad_request","durationMs":0}
{"fn":"delete-account","requestId":"f80890f1-8d44-40f9-bed3-53f5aa4f3b2f","status":405,"outcome":"method_not_allowed","durationMs":0}
{"fn":"delete-account","requestId":"57f5212c-80e2-47a3-ae62-e2ac4a2947c3","status":200,"outcome":"deleted","durationMs":65}
{"fn":"delete-account","requestId":"26947af9-60ba-4a24-8cc4-e8bba4a28d9a","status":200,"outcome":"already_deleted","durationMs":5}
```

The log carries request id, status, outcome and duration only: no token, user id or email.

## What this shows
- **AC2, server side:** one call removed user A's Auth user, identity, session, refresh token, profile, lists, tasks (tombstone included), subtasks, both AI usage ledger rows and both AI usage counters: every count 0. User B kept all of the same rows. The delete is immediate (65 ms), well inside "within 24 hours".
- **Authorization:** no token, the anon key and the service-role key (both valid JWTs but not users) → 401; the wrong confirmation word → 400; GET → 405. None of them changed a row (counts unchanged between "before" and "after the refused calls").
- **Idempotency:** retrying with A's still-unexpired access token → 200 `already_deleted` (GoTrue answers 403 `user_not_found` for a correctly signed token of a deleted user). A's refresh token can't mint a new session.
- **No resurrection:** a sync push with A's token after deletion fails the `user_id → auth.users` foreign key (409 / 23503), so a device that is still syncing can't re-create server rows.
- **Not removed (documented in spec and the owner action):** `auth.audit_log_entries` keeps 3 rows mentioning user A (`user_signedup`, `login`, `user_deleted`, with the email in `actor_username`); they belong to Supabase Auth's security log and expire with its retention.

## Cleanup
User A was deleted by the check itself. User B (`tb53-b-…@example.test`) and earlier throwaway users stay in the **local** stack only. The `tb53-edge-runtime` container (created for this run) was removed afterwards.
