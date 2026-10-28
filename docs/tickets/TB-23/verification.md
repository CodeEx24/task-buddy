# TB-23 — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-23 · PR: see the PR for branch `feat/tb-23/ai-rate-limits` · Branch: `feat/tb-23/ai-rate-limits`
> Record only what was actually run and observed. `node scripts/workflow/check-ticket-docs.mjs --branch <branch> --pr` fails the PR gate while any AC row is `not met`, `partial` or `TBD`.

## Commands run
All run locally on 2026-10-28 (Windows 11, Node 24, pnpm 10.17.1, Docker Desktop) in the worktree based on `main` @ 01fccc8.

| Command | Result | Notes |
|---|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts` + `pnpm rebuild better-sqlite3` | pass | Fresh worktree; no dependency changes |
| `pnpm lint` | pass | 0 problems (after `prettier --write` on the new files) |
| `pnpm typecheck` | pass | `tsc --noEmit` (covers the Edge Function under Node types) |
| `pnpm test --ci --maxWorkers=2` (final code) | pass | 62 suites, 531 tests in 2 projects. Before the review fixes: 62 suites, 528 tests |
| `pnpm lint && pnpm typecheck && pnpm test --ci --maxWorkers=2` after rebasing onto `main` @ 8d9cd11 (TB-54) | pass | 66 suites, 555 tests; one docs conflict in `docs/actions/README.md` resolved by keeping both to-do entries |
| `pnpm exec jest --selectProjects edge-functions --maxWorkers=2` (final code) | pass | 6 suites, 118 tests (new: `middleware/usage-limits.test.ts`, `usage-store.test.ts`, `config.test.ts`; TB-22's `gateway.test.ts` unchanged and green) |
| `pnpm exec jest --selectProjects app --maxWorkers=2 src/features/ai` | pass | 2 suites, 34 tests (`gateway-errors.test.ts`, `components/AiErrorNotice.test.tsx`) |
| `deno check --no-lock --config supabase/functions/ai-gateway/deno.json supabase/functions/ai-gateway/index.ts` | pass | Deno 2.9.8 (also 2.2.15 via `pnpm dlx deno`) |
| Migration + pgTAP test inside `begin; … rollback;` via `docker exec -i supabase_db_task-buddy psql` | pass | 29/29 before applying anything; again after the review edit as rollback → migration → test in one rolled-back transaction (real local rows untouched) |
| `npx supabase@2.122.0 migration up --local` | pass | `Applying migration 20261028180000_ai_usage_limits.sql...` on the shared stack; no reset |
| `npx supabase@2.122.0 test db` | pass | `Files=3, Tests=43 … Result: PASS` (TB-19's 14 + TB-23's 29) |
| Rollback inside `begin; … rollback;` (migration, then `.down.sql`, then a `to_regclass`/`to_regproc` check) | pass | `t`: both tables and both functions gone |
| `supabase gen types typescript --local --schema public` → `src/lib/database.types.ts` | pass | Regenerated for the CI type-drift check (two tables, two functions) |
| Live: TB-23 function in its own `edge-runtime:v1.77.8` container on the stack network + `scripts/ai-gateway/local-limits-check.sh` | pass | 31 calls with a real user JWT: 30×200, call 31 → 429 `RATE_LIMITED` `Retry-After: 3207`; 40 concurrent calls → exactly 30×200 + 10×429; `AI_TOKENS_PER_DAY=60` → 2×200 then 429 `QUOTA_EXCEEDED` `Retry-After: 24773` (to 00:00 UTC); re-run on the final code: 30×200 + 429. Transcript: [local-integration.md](local-integration.md) |
| `psql` on `ai_usage_ledger` / `ai_usage_counters` | pass | One row per provider call with user, route, model, tokens, cost; counters match (30 calls / 900 tokens) |
| `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-23/ai-rate-limits --pr` | pass | "workflow check: ok" |

## Acceptance criteria
| AC (verbatim) | Status | Evidence (test name, file:line, screenshot, observed result) |
|---|---|---|
| Given a free user, when they make a 31st AI call within an hour, then the gateway returns 429 with Retry-After and the app shows a friendly message | met | **Gateway:** `middleware/usage-limits.test.ts` "AC1 … allows 30 calls, then returns 429 RATE_LIMITED with Retry-After to the next UTC hour" (`Retry-After: 2700` at 10:15), "checks the limit before the provider", "runs before the other middleware", "counts per user and resets at the top of the next UTC hour". SQL: `ai_usage_limits.test.sql` tests 6–11 (30 allowed, 31st `rate_limited` with 2700 s, refused call not counted, per user, hour reset, Retry-After ≥ 1). **Live** with a real JWT: call 31 → HTTP 429 `RATE_LIMITED`, `Retry-After: 3207`, provider not called; 40 concurrent calls → exactly 30 admitted. **App:** `src/features/ai/gateway-errors.ts` `mapGatewayError()` → `{ kind: 'rate_limited', retryAfterSeconds }`, `copy.ts` and `components/AiErrorNotice.tsx`; `AiErrorNotice.test.tsx` "AC1: shows a friendly message for the 31st call" renders "Your buddy needs a short break … Try again in about 45 minutes. You can still add and edit tasks yourself." from a real 429 body + header. No screen calls the gateway yet, so the notice is wired into a screen by TB-29 (decision D9) |
| Every AI call writes a row to the usage ledger with user, route, model, input/output tokens and cost estimate | met | `usage-limits.test.ts` "AC2: records user, route, model, input/output tokens and the cost estimate"; failed calls recorded (upstream/exception with 0 tokens; timeout/bad body at an upper-bound estimate that also counts against the quota); one row per provider call on a TB-24-style retry; ledger write failure logged without PII and the request still 200. SQL tests 13–14 (row fields), 20–22. `usage-store.test.ts` "record() calls ai_record_usage with every ledger field". Live: 30 rows for the 30 calls of run 1 (`claude-haiku-5-5`, 22/8 tokens, `0.000006`), 2 rows for run 2 (`claude-sonnet-5-5`, `0.000124`), 30 for the concurrent run; no row for refused calls |
| A daily token quota per user is enforced and the quota resets at 00:00 UTC | met | `usage-limits.test.ts` "AC3: returns 429 QUOTA_EXCEEDED (distinct code) with Retry-After to 00:00 UTC", "resets at 00:00 UTC, not on a rolling 24 hours" (23:59:59 refused, 00:00:00 allowed, injected clock), "is per user", "a quota refusal does not use up an hourly call". SQL tests 15–19 (45k allowed, at 50k `quota_exceeded` with 900 s at 23:45, reset at 00:00 UTC). Live with `AI_TOKENS_PER_DAY=60`: 2×200 then 429 `QUOTA_EXCEEDED` `Retry-After: 24773` (= until 00:00 UTC); on the real DB the same user is refused at 23:59:59 UTC and allowed at 00:00 UTC with `tokens_today = 0` |
| Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated | met | 48 new edge-function tests, 34 app tests, 29 pgTAP tests; full suite 531/531, lint, typecheck, `deno check`, `supabase test db` green. Independent reviewer subagent (fresh context, REVIEW.md four passes + security): findings and resolutions below; human review and merge are the orchestrator's/owner's gate. Docs: intent, spec (decisions D1–D10, deviations), plan, this file, [local-integration.md](local-integration.md), gateway/schemas READMEs, owner guide `docs/actions/ai-gateway-deploy.md` (steps 0, 5, 6) and the to-do list |

## Manual / E2E
Live run against the shared local Supabase stack (real Auth, PostgREST, Postgres) with the TB-22 mock provider: [local-integration.md](local-integration.md). Negative checks: a refused call never reaches the provider (mock log: 62 provider calls for 75 gateway calls; the 13 refused ones are missing); pgTAP as `authenticated`: another user's ledger rows → 0 rows, insert/update/delete → 42501, counters → 42501, both functions not executable; as `anon`: ledger → 42501. There is no app screen for this ticket (TB-29 adds the first caller).

## Review findings
Independent reviewer subagent (fresh context; inputs: AC, decisions, the full diff, REVIEW.md). Verdict before fixes: "request changes" (the SQL, privileges and middleware were judged solid).

| # | Severity | Finding (file:line) | Source (self / reviewer agent / human) | Resolution |
|---|---|---|---|---|
| 1 | Blocking | `docs/tickets/TB-23/` missing (AC4, REVIEW.md) | reviewer agent | Timing: the review ran while the docs were being written. intent/spec/plan/verification/local-integration are now in place; deviations are in spec.md |
| 2 | Important | `gateway.ts` recorded a timeout as 0 tokens, but Anthropic may bill an aborted call; long `plan` outputs could time out every time, escaping the quota and showing $0 | reviewer agent | `estimateUsageUpperBound()`: `timeout` and `bad_response` are recorded at prompt chars / 3 + the route's `max_tokens` (`usageEstimated: true`), which counts against the quota and the cost. Tests: "records a possibly-billed failure (timeout / bad_response) at an upper-bound token estimate". Column comment documents it |
| 3 | Important | Cost looked up by the provider-reported model id; a dated snapshot id would fall back to the dearest price (≈50× too high for Haiku 5.5) | reviewer agent | Priced by the configured `requestedModel`; `priceForModel()` also matches the longest known prefix. Tests: "prices by the configured model when the provider reports a dated snapshot id", "prices a dated snapshot id by its longest known prefix" |
| 4 | Important | Gateway README still described `MIDDLEWARE[...]`, nothing on `buildMiddleware` or `ctx.providerCalls` | reviewer agent | README: pipeline, example, factory pattern, `providerCalls` rule ("retries go through `next()`"), new Usage limits section, env and files tables |
| 5 | Important | AC1 "app shows a friendly message": no screen renders `AiErrorNotice` yet | reviewer agent | Recorded as decision D9 and in the AC row: met at the component level with a real 429 mapping; TB-29 (blocked by TB-23) wires it into quick-add. Follow-up below |
| 6 | Nit | Quota read takes no lock: admitted concurrent calls can overshoot | reviewer agent | Accepted and documented (spec D4, README); bounded by the hourly cap |
| 7 | Nit | `ai_usage_counters` is never purged | reviewer agent | Follow-up: scheduled delete of windows older than 2 days |
| 8 | Nit | Ledger writes are sequential in `finally` (5 s timeout each) | reviewer agent | Accepted: normally one write per request; a slow DB delays the response but never fails it |
| 9 | Nit | `updated_at` set in the upserts instead of `set_updated_at()` | reviewer agent | Accepted: only these two functions write the table, and both set it |
| 10 | Important | Python on Windows wrote CRLF into edited files | self | Normalised back to LF before commit |
| 11 | Important | pgTAP "30 calls" used a non-correlated lateral call, so the function ran once | self | `p_now` now depends on the row number; test 6 really makes 30 calls (verified: 31st refused) |
| 12 | Nit | `parseRetryAfter('-5')` returned 0 (`Date.parse` reads it as a year) | self | Only `Ddd,`-shaped HTTP dates are parsed; test case added |

## Known limitations & follow-ups
- **AC1 on a device:** the friendly message is not on a screen until TB-29 (quick-add) calls the gateway. TB-29 should use `mapGatewayError()` + `<AiErrorNotice>`.
- **Fixed hour window** (D1): up to 60 calls across an hour boundary. Revisit with tiers (TB-78).
- **Quota overshoot** (D4) by calls admitted before the quota was reached; a ledger write failure leaves that call's tokens out of the quota (logged as `usage_record_failed`).
- **Estimated tokens** for timeouts / unreadable bodies are an upper bound (they can over-count).
- **Counter rows are never purged** (about 25 rows per active user per day). Proposed follow-up: a pg_cron job deleting `ai_usage_counters` windows older than 2 days.
- **CI rollback check** covers only TB-19's file; TB-23's rollback was proven locally. Owner step 6 in `docs/actions/ai-gateway-deploy.md` adds it to CI.
- **Hosted deploy** (migration before function) is an owner step: `docs/actions/ai-gateway-deploy.md` steps 0 and 2–3. Without the migration the deployed TB-23 gateway fails closed (500) for signed-in users.
- **Local run** used a dedicated edge-runtime container rather than `supabase functions serve` (see spec Deviations); it leaves 4 `tb23-check-*@example.test` users and their ledger rows in the local database only, and two stopped `tb23-edge-runtime*` containers.

## Completion
- [x] All AC met with evidence
- [x] Gates green locally (CI: see PR)
- [x] No open Blocking findings
- [ ] Jira updated (In Review now; Done after merge by the orchestrator)
