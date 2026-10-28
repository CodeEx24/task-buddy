# TB-23 — Local integration run (curl + psql transcript)

> Jira: https://stratyge.atlassian.net/browse/TB-23 · Spec: [spec.md](spec.md) · Verification: [verification.md](verification.md)

Run on 2026-10-28 (about 17:06–17:12 UTC), Windows 11, Docker Desktop, against the shared local Supabase stack for project `task-buddy` (CLI 2.122.0: real Auth, PostgREST and Postgres 17.11 at `127.0.0.1:54321` / `54322`).

**Setup**
1. Migration applied non-destructively from this worktree: `npx supabase@2.122.0 migration up --local` → `Applying migration 20261028180000_ai_usage_limits.sql...` (no reset). `npx supabase@2.122.0 test db` → `Files=3, Tests=43 ... Result: PASS`.
2. Provider: `scripts/ai-gateway/mock-anthropic.mjs 8788` (TB-22's mock; returns 401 unless it gets the per-run dummy key; reports `input_tokens` = input characters, 22, and `output_tokens` 8 → 30 tokens per call).
3. Function: TB-23's `ai-gateway` code (read-only mount of this worktree) in a dedicated container of the same Edge Runtime image the CLI uses, on the stack's Docker network, so it reaches Auth and PostgREST through Kong exactly as `functions serve` does:
   `docker run -d --name tb23-edge-runtime --network supabase_network_task-buddy -p 54393:9000 --add-host host.docker.internal:host-gateway --env-file <file outside the repo> -v <worktree>:/repo:ro public.ecr.aws/supabase/edge-runtime:v1.77.8 start --main-service=/repo/supabase/functions/ai-gateway --port=9000`.
   The env file held only `ANTHROPIC_API_KEY=<random per-run dummy>`, `ANTHROPIC_BASE_URL=http://host.docker.internal:8788`, `SUPABASE_URL=http://supabase_kong_task-buddy:8000` and the stack's local `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` (from `supabase status -o env`; never printed or committed). `supabase functions serve` was tried first; the shared `supabase_edge_runtime_task-buddy` container belonged to another session and went away when serve restarted, so this run used its own container, the same pattern TB-24's session uses (see spec Deviations).
4. Calls: `bash scripts/ai-gateway/local-limits-check.sh` with `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY` exported and `FN_URL=http://127.0.0.1:54393/ai-gateway`. It creates a fresh confirmed user through the Auth admin API, signs in with a password grant (a real user access token), then calls the gateway. Every key and token is replaced by a placeholder before printing.

## Run 1 — AC1 + AC2: default limits (30 calls/hour, 50,000 tokens/day)

```text
# AC1 + AC2: default limits (30 calls/hour, 50,000 tokens/day)
# setup: create a confirmed local test user via the Auth admin API, then sign in
test user id: f9fc52f1-336d-423b-802b-50d1cbc0db4e
sign in: got an access token (802 chars, role authenticated)

$ for i in $(seq 1 31); do curl -i -X POST http://127.0.0.1:54393/ai-gateway/parse -H 'Authorization: Bearer <USER_JWT>' -d '{"input":"buy milk tomorrow at 9"}'; done
call  1: HTTP 200  {"requestId":"2ec482ac-4cd4-4810-8201-c50d7c01a78e","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call  2: HTTP 200  {"requestId":"13c51b8b-d2d9-4252-8540-e81a89d6b994","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call  3: HTTP 200  {"requestId":"1578589f-d065-4622-9981-30e2ac58b2ff","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call  4: HTTP 200  {"requestId":"52f7f8e5-1c31-4009-8685-aff9ca784ca2","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call  5: HTTP 200  {"requestId":"9e38871d-3bb2-45c4-8ef5-e84dd5b635e4","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call  6: HTTP 200  {"requestId":"4fd873e2-51d7-4c3a-95c5-27d541e51dc7","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call  7: HTTP 200  {"requestId":"844008d8-1521-46a7-8853-09ce5228a343","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call  8: HTTP 200  {"requestId":"f9aecb1a-de42-49dd-8e78-54c84fc64061","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call  9: HTTP 200  {"requestId":"e31f07e0-641e-4375-ad8f-73357898a77e","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call 10: HTTP 200  {"requestId":"49077d0c-0d04-476e-93e5-89e22f67cca1","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call 11: HTTP 200  {"requestId":"4fe07fbf-29f4-4a08-a04a-2f69c9123be3","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call 12: HTTP 200  {"requestId":"93dfb843-4e23-414b-a5ed-9f3acd7f97ae","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call 13: HTTP 200  {"requestId":"8288d9b5-0651-46ab-9270-ffd6b4e6526c","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call 14: HTTP 200  {"requestId":"9a1d7862-ecc7-415e-b7fa-62e2b7ae7753","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call 15: HTTP 200  {"requestId":"7c286d72-4d7c-4776-8712-a1fca785eaf8","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call 16: HTTP 200  {"requestId":"57d94dc2-6b84-42ee-940e-e66ddf4db376","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call 17: HTTP 200  {"requestId":"b325d637-2514-4eca-b5fa-dd3c7adf15d1","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call 18: HTTP 200  {"requestId":"e851f78f-d8ec-48f1-b874-f2bffa7d71bd","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call 19: HTTP 200  {"requestId":"d62859ae-49fe-40c7-b7bf-68faaba1c662","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call 20: HTTP 200  {"requestId":"cfb85ec3-1829-4d7c-beb7-1641e8645e1f","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call 21: HTTP 200  {"requestId":"00593798-a61e-4140-af12-1783ecfc440b","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call 22: HTTP 200  {"requestId":"93624965-d9a2-4c27-bcad-cc7ce4aca854","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call 23: HTTP 200  {"requestId":"fb23236c-70d9-4240-9003-102ede741372","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call 24: HTTP 200  {"requestId":"59694e37-67af-4027-bd0c-fe744b3bd96d","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call 25: HTTP 200  {"requestId":"7d2163d6-26f0-4adb-88f0-be0e1b47b21c","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call 26: HTTP 200  {"requestId":"4589d7e4-05bc-438e-b903-aca24f2ad27d","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call 27: HTTP 200  {"requestId":"90322f1e-ab56-434b-b983-979538a75e3d","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call 28: HTTP 200  {"requestId":"47b7f880-974c-4d4b-9933-63c75ed71260","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call 29: HTTP 200  {"requestId":"d0d47b62-a34a-4b23-97be-1c93e8505500","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call 30: HTTP 200  {"requestId":"7f632e9c-d6fe-40ea-8047-fc68956a73a5","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call 31: HTTP 429  Retry-After: 3207  {"requestId":"22cd700c-6cd5-42af-a2bd-0e800b5d1d75","error":{"code":"RATE_LIMITED","message":"Too many AI requests. Try again later."}}
```

Call 31 → **HTTP 429 `RATE_LIMITED` with `Retry-After: 3207`** (it ran at 17:06:33 UTC; the next UTC hour starts in 53 min 27 s). The provider was not called for it (mock log below).

Ledger and counters for that user (`docker exec supabase_db_task-buddy psql -U postgres -c ...`):

```text
 rows | input_tokens | output_tokens | cost_usd 
------+--------------+---------------+----------
   30 |          660 |           240 | 0.000180
(1 row)

               user_id                |              request_id              | route |      model       | input_tokens | output_tokens | cost_usd | outcome |          created_at           
--------------------------------------+--------------------------------------+-------+------------------+--------------+---------------+----------+---------+-------------------------------
 f9fc52f1-336d-423b-802b-50d1cbc0db4e | 2ec482ac-4cd4-4810-8201-c50d7c01a78e | parse | claude-haiku-5-5 |           22 |             8 | 0.000006 | ok      | 2026-10-28 17:06:19.139156+00
 f9fc52f1-336d-423b-802b-50d1cbc0db4e | 13c51b8b-d2d9-4252-8540-e81a89d6b994 | parse | claude-haiku-5-5 |           22 |             8 | 0.000006 | ok      | 2026-10-28 17:06:19.411598+00
 f9fc52f1-336d-423b-802b-50d1cbc0db4e | 1578589f-d065-4622-9981-30e2ac58b2ff | parse | claude-haiku-5-5 |           22 |             8 | 0.000006 | ok      | 2026-10-28 17:06:19.670194+00
(3 rows)

 window_kind |      window_start      | calls | tokens 
-------------+------------------------+-------+--------
 day         | 2026-10-28 00:00:00+00 |    30 |    900
 hour        | 2026-10-28 17:00:00+00 |    30 |      0
(2 rows)

```

30 rows, one per provider call, each with user, route, model, input/output tokens and the cost estimate (Haiku 5.5: 22 × $0.10/M + 8 × $0.50/M = $0.0000062 → `0.000006`). The refused 31st call wrote no row and did not move the hour counter past 30.

## Run 2 — AC3: tiny daily quota (`AI_TOKENS_PER_DAY=60`)

Second container `tb23-edge-runtime-quota` (port 54392), same env file plus `AI_TOKENS_PER_DAY=60`; a new user; `/plan` (Sonnet 5.5).

```text
# AC3: tiny daily quota (AI_TOKENS_PER_DAY=60; each mock call uses 22 + 8 = 30 tokens)
# setup: create a confirmed local test user via the Auth admin API, then sign in
test user id: 19b08dd5-d754-49fb-bddf-02ef14596708
sign in: got an access token (802 chars, role authenticated)

$ for i in $(seq 1 4); do curl -i -X POST http://127.0.0.1:54392/ai-gateway/plan -H 'Authorization: Bearer <USER_JWT>' -d '{"input":"buy milk tomorrow at 9"}'; done
call  1: HTTP 200  {"requestId":"3a10b981-48fe-422b-b5a9-5f2e5ad572f6","route":"plan","model":"claude-sonnet-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call  2: HTTP 200  {"requestId":"54e460fc-f3fd-4327-8fc1-df7cc21c5a6b","route":"plan","model":"claude-sonnet-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}
call  3: HTTP 429  Retry-After: 24773  {"requestId":"9ed2cef4-d4f0-4281-9eba-d80b265f3b02","error":{"code":"QUOTA_EXCEEDED","message":"Daily AI limit reached. It resets at 00:00 UTC."}}
call  4: HTTP 429  Retry-After: 24772  {"requestId":"0109e91e-8d35-4329-b3ef-dc935236cacc","error":{"code":"QUOTA_EXCEEDED","message":"Daily AI limit reached. It resets at 00:00 UTC."}}
```

After two calls (60 tokens) the third is **429 `QUOTA_EXCEEDED`** (distinct from `RATE_LIMITED`) with `Retry-After: 24773` = 6 h 52 min 53 s, i.e. until **00:00 UTC** (call at 17:07:07 UTC).

Ledger, counters, and the reset at 00:00 UTC on the real database (the function is called as `service_role` with `p_now` set to the last second of today and to the next 00:00 UTC, inside a transaction that is rolled back):

```text
 route |       model       | input_tokens | output_tokens | cost_usd | outcome 
-------+-------------------+--------------+---------------+----------+---------
 plan  | claude-sonnet-5-5 |           22 |             8 | 0.000124 | ok
 plan  | claude-sonnet-5-5 |           22 |             8 | 0.000124 | ok
(2 rows)

 window_kind |      window_start      | calls | tokens 
-------------+------------------------+-------+--------
 day         | 2026-10-28 00:00:00+00 |     2 |     60
 hour        | 2026-10-28 17:00:00+00 |     2 |      0
(2 rows)

BEGIN
SET
         at         | allowed |     reason     | retry_after_seconds | calls_this_hour | tokens_today 
--------------------+---------+----------------+---------------------+-----------------+--------------
 now (23:59:59 UTC) | f       | quota_exceeded |                   1 |                 |           60
 next 00:00 UTC     | t       |                |                     |               1 |            0
(2 rows)

ROLLBACK
```

Sonnet 5.5 cost: 22 × $2/M + 8 × $10/M = `0.000124`. At 23:59:59 UTC the user is still over quota (`Retry-After` 1 s); at 00:00 UTC the same user is allowed with `tokens_today = 0`: the quota resets at 00:00 UTC.

## Run 3 — AC1 under concurrency: 40 simultaneous calls, limit 30

```text
# AC1 under concurrency: 40 simultaneous calls, limit 30
# setup: create a confirmed local test user via the Auth admin API, then sign in
test user id: 9e4f2d40-8a05-417a-aa67-5fa9f9a260fe
sign in: got an access token (800 chars, role authenticated)

$ for i in $(seq 1 40); do curl -i -X POST http://127.0.0.1:54393/ai-gateway/parse -H 'Authorization: Bearer <USER_JWT>' -d '{"input":"buy milk tomorrow at 9"}'; done
(all 40 calls sent concurrently)
status counts:
     30 200
     10 429
```

```text
 ledger_rows | hour_calls | day_tokens 
-------------+------------+------------
          30 |         30 |        900
(1 row)

```

Exactly 30 admitted and 10 refused with all 40 in flight at once: the single-statement check-and-increment holds under concurrency, and the ledger and counters agree (30 rows, 30 calls, 900 tokens).

## Gateway log lines (from the containers)

```text
{"fn":"ai-gateway","requestId":"2ec482ac-4cd4-4810-8201-c50d7c01a78e","route":"parse","status":200,"durationMs":95,"model":"claude-haiku-5-5","providerCalls":1,"usage":{"inputTokens":22,"outputTokens":8}}
{"fn":"ai-gateway","requestId":"13c51b8b-d2d9-4252-8540-e81a89d6b994","route":"parse","status":200,"durationMs":25,"model":"claude-haiku-5-5","providerCalls":1,"usage":{"inputTokens":22,"outputTokens":8}}
{"fn":"ai-gateway","requestId":"22cd700c-6cd5-42af-a2bd-0e800b5d1d75","route":"parse","status":429,"durationMs":12,"model":"claude-haiku-5-5"}
{"fn":"ai-gateway","requestId":"9a578656-1584-4343-814f-c4a35cc5f65d","route":"parse","status":429,"durationMs":10,"model":"claude-haiku-5-5"}
{"fn":"ai-gateway","requestId":"9ed2cef4-d4f0-4281-9eba-d80b265f3b02","route":"plan","status":429,"durationMs":8,"model":"claude-sonnet-5-5"}
{"fn":"ai-gateway","requestId":"0109e91e-8d35-4329-b3ef-dc935236cacc","route":"plan","status":429,"durationMs":8,"model":"claude-sonnet-5-5"}
usage_check_failed / usage_record_failed lines across all runs: 0 (tb23-edge-runtime), 0 (tb23-edge-runtime-quota)
```

One line per request: request id, route, status, model, duration, provider calls and token usage. No user id, input text, token or key. No store failures in any run.

## Mock provider log (every request that reached the "provider", all runs)

```text
62 requests:
     60 mock-anthropic: 200 model=claude-haiku-5-5 max_tokens=1024
      2 mock-anthropic: 200 model=claude-sonnet-5-5 max_tokens=4096
401 (wrong key) responses: 0
```

30 (run 1) + 2 (run 2) + 30 (run 3) = 62 provider calls for 75 gateway calls: the 13 refused calls (1 + 2 + 10) never reached the provider, so the limits are checked before it.

## Run 4 — final code (after the review fixes)

After the review fixes (upper-bound estimate for timeouts, pricing by the configured model id, docs), the same script against the same container at 17:17 UTC with a new user:

```text
calls 1-30: HTTP 200
call 31: HTTP 429  Retry-After: 2558  {"requestId":"79ac7962-cc7d-42ec-95d4-ce300e394b6e","error":{"code":"RATE_LIMITED","message":"Too many AI requests. Try again later."}}
ledger for that user: 30 rows | 900 tokens | $0.000180
```

## Clean-up
The two `tb23-edge-runtime*` containers were stopped (not removed) after the runs; the shared stack was not restarted, reset or stopped. Each run left one `tb23-check-<timestamp>@example.test` user and its ledger rows in the **local** database only.
