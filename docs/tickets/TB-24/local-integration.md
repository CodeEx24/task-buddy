# TB-24 — Local integration transcript

> Jira: https://stratyge.atlassian.net/browse/TB-24 · Spec: [spec.md](spec.md) · Verification: [verification.md](verification.md)
> Recorded 2026-10-28. Every key and token is replaced by a placeholder; no golden input or model output is printed (only case ids).

## Environment
- Shared local Supabase stack `task-buddy` (API `127.0.0.1:54321`, Auth via Kong), CLI 2.122.0. Not stopped or reset.
- **Edge runtime:** the stack's own `supabase_edge_runtime_task-buddy` container was being served by another session (from the TB-22 worktree), and `supabase functions serve` would have replaced it. So this run used a separate container from the **same image** on the stack's network, with this worktree mounted read-only (spec D10):
  ```
  docker run -d --rm --name tb24-edge-runtime --network supabase_network_task-buddy \
    --add-host host.docker.internal:host-gateway -p 54394:9000 --env-file <file outside the repo> \
    -v <worktree>:/repo:ro --entrypoint edge-runtime public.ecr.aws/supabase/edge-runtime:v1.77.8 \
    start --main-service=/repo/supabase/functions/ai-gateway --port=9000
  ```
  Env file (outside the repo): `ANTHROPIC_API_KEY=<dummy>`, `ANTHROPIC_BASE_URL=http://host.docker.internal:8794`, `SUPABASE_URL=http://supabase_kong_task-buddy:8000`, `SUPABASE_ANON_KEY=<ANON_KEY>`. Auth is the real local Supabase Auth (`GET /auth/v1/user`).
- **Mock provider:** `MOCK_EXPECTED_KEY=<dummy> MOCK_OUTPUT_MIX=<mix> node scripts/ai-gateway/mock-anthropic.mjs 8794`. The mix is played per user text by FNV-1a hash (`evals/mock-output-mix.ts`); the runner predicts the same split and compares it with the gateway's answers and the mock's `/stats` call counts.
- **Runner:** `FN_URL=http://127.0.0.1:54394/ai-gateway bash scripts/ai-gateway/golden-local.sh --rps 5 --mock-stats-url http://127.0.0.1:8794/stats --mock-mix <mix>` (creates a confirmed local test user, signs in with a real password grant, runs `evals/run-golden.ts` over all 200 golden cases).

## Run A — mix `valid=90,repair=8,fail=2` (expected to meet AC1's threshold)
First run, before the review fixes (summed `usage` in the body, `repair_failed` outcome, delimiter and runner fixes):
```
create local test user: HTTP 200
sign in: got an access token (795 chars)
parse-033: 502 AI_BAD_OUTPUT
parse-051: 502 AI_BAD_OUTPUT
parse-056: 502 AI_BAD_OUTPUT
golden cases: 200
valid after <= 1 repair: 197/200 (98.5%)
AI_BAD_OUTPUT: 3, other errors: 0, tokens reported: 85518
  /parse: 117/120 (97.5%), bad 3, errors 0
  /breakdown: 45/45 (100.0%), bad 0, errors 0
  /plan: 35/35 (100.0%), bad 0, errors 0
AC1 (>= 98.0%): PASS
not valid: parse-033, parse-051, parse-056
mock prediction: 179 valid first try, 18 repaired, 3 AI_BAD_OUTPUT; provider calls predicted 200 + 21 repair, measured 200 + 21 repair
mock check: measured = predicted
runner exit code: 0
```
Repeated on the final code, on a fresh runtime container (identical counts; `tokens reported` is higher because a repaired 200 now reports both calls' usage). The log grouping below is from this repeat:
```
create local test user: HTTP 200
sign in: got an access token (795 chars)
parse-033: 502 AI_BAD_OUTPUT
parse-051: 502 AI_BAD_OUTPUT
parse-056: 502 AI_BAD_OUTPUT
golden cases: 200
valid after <= 1 repair: 197/200 (98.5%)
AI_BAD_OUTPUT: 3, other errors: 0, tokens reported: 103293
  /parse: 117/120 (97.5%), bad 3, errors 0
  /breakdown: 45/45 (100.0%), bad 0, errors 0
  /plan: 35/35 (100.0%), bad 0, errors 0
AC1 (>= 98.0%): PASS
not valid: parse-033, parse-051, parse-056
mock prediction: 179 valid first try, 18 repaired, 3 AI_BAD_OUTPUT; provider calls predicted 200 + 21 repair, measured 200 + 21 repair
mock check: measured = predicted
runner exit code: 0
```

Gateway log lines for run A (the 200 requests of the repeat, from `docker logs tb24-edge-runtime`), grouped by route, status, `promptVersion`, `providerCalls`, `outputCheck.outcome`, `firstIssue`, `repairIssue`:
```
parse      200 parse.v1     1 valid                      106
parse      200 parse.v1     2 repaired  not_json           5
parse      200 parse.v1     2 repaired  schema             4
parse      200 parse.v1     2 repaired  too_large          2
parse      502 parse.v1     2 invalid   not_json not_json  3
breakdown  200 breakdown.v1 1 valid                       39
breakdown  200 breakdown.v1 2 repaired  not_json           3
breakdown  200 breakdown.v1 2 repaired  schema             3
plan       200 plan.v1      1 valid                       34
plan       200 plan.v1      2 repaired  too_large          1
```
179 valid first try + 18 repaired + 3 invalid = 200; repair calls 18 + 3 = 21 = the mock's measured repair count. No request made more than 2 provider calls.

Two of those lines verbatim (ids are random request ids):
```
{"fn":"ai-gateway","requestId":"20e20f4f-554c-4a4f-9105-1b9fbd3bc0b2","route":"parse","status":200,"durationMs":9,"model":"claude-haiku-5-5","promptVersion":"parse.v1","providerCalls":2,"usage":{"inputTokens":4896,"outputTokens":5074},"outputCheck":{"outcome":"repaired","firstIssue":"too_large","repairPromptVersion":"repair.v1"}}
{"fn":"ai-gateway","requestId":"148b003b-4710-4ba0-a7bd-4d2bd3e3b450","route":"parse","status":502,"durationMs":11,"model":"claude-haiku-5-5","promptVersion":"parse.v1","providerCalls":2,"usage":{"inputTokens":677,"outputTokens":18},"outputCheck":{"outcome":"invalid","firstIssue":"not_json","repairPromptVersion":"repair.v1","repairIssue":"not_json"}}
```

## Run B — mix `valid=80,repair=15,fail=5` (expected to miss the threshold)
Shows the runner reports a failing rate honestly and the arithmetic still matches the mock.
```
create local test user: HTTP 200
sign in: got an access token (795 chars)
parse-031: 502 AI_BAD_OUTPUT
parse-033: 502 AI_BAD_OUTPUT
parse-039: 502 AI_BAD_OUTPUT
parse-051: 502 AI_BAD_OUTPUT
parse-056: 502 AI_BAD_OUTPUT
parse-071: 502 AI_BAD_OUTPUT
parse-085: 502 AI_BAD_OUTPUT
breakdown-008: 502 AI_BAD_OUTPUT
breakdown-035: 502 AI_BAD_OUTPUT
breakdown-042: 502 AI_BAD_OUTPUT
golden cases: 200
valid after <= 1 repair: 190/200 (95.0%)
AI_BAD_OUTPUT: 10, other errors: 0, tokens reported: 171466
  /parse: 113/120 (94.2%), bad 7, errors 0
  /breakdown: 42/45 (93.3%), bad 3, errors 0
  /plan: 35/35 (100.0%), bad 0, errors 0
AC1 (>= 98.0%): FAIL
not valid: parse-031, parse-033, parse-039, parse-051, parse-056, parse-071, parse-085, breakdown-008, breakdown-035, breakdown-042
mock prediction: 163 valid first try, 27 repaired, 10 AI_BAD_OUTPUT; provider calls predicted 200 + 37 repair, measured 200 + 37 repair
mock check: measured = predicted
runner exit code: 0
```
(With `--mock-stats-url` the exit code reflects only the mock check, since a low mix is deliberate. Without it, a rate below 98 % exits 1.)

## Partial runs never claim AC1 (final code)
```
$ FN_URL=http://127.0.0.1:54394/ai-gateway bash scripts/ai-gateway/golden-local.sh --rps 5 --routes plan
...
  /plan: 35/35 (100.0%), bad 0, errors 0
AC1: not assessed (ran 35 of 200 golden cases)
runner exit code: 1
```

## TB-22 smoke on the same runtime (no regression)
Mock default-like answers, real user JWT:
```
### /parse, /breakdown, /plan with {"input":"buy milk tomorrow at 9"} -> HTTP 200 each, `output` is schema-valid JSON, e.g.
{"route":"parse","model":"claude-haiku-5-5","output":"{\"tasks\":[{\"title\":\"buy milk tomorrow at 9\",\"dueDate\":null,\"dueTime\":null,\"priority\":\"none\",\"notes\":null}]}",...}
### no token -> HTTP 401 UNAUTHENTICATED (log line: status 401, promptVersion parse.v1, no provider call)
### {"input":"SLOW"} on /plan -> HTTP 504 AI_TIMEOUT after 20 s (log: durationMs 20002, providerCalls 1, errorKind timeout)
```
These three 200s were taken while the mock ran mix B; for this text the mock played `repair` (log: `providerCalls 2`, `outcome repaired`, `firstIssue too_large`).

## What this does and does not prove
- Proves, through the real edge runtime and real local Auth: schema validation per route, at most one repair, `AI_BAD_OUTPUT` after a failed repair, `promptVersion` and `outputCheck` in every log line, and that the runner's rate and the mock's call counts agree exactly with the prediction.
- Does **not** prove the AC1 rate for a real model. That run is the owner action [ai-golden-eval-real-model.md](../../actions/ai-golden-eval-real-model.md).
- Each `golden-local.sh` run (and the smoke check) left one `tb24-*@example.test` user in the local Auth database (5 in total; local data only).
