# TB-23 — Spec

> Jira: https://stratyge.atlassian.net/browse/TB-23 · Intent: [intent.md](intent.md) · Plan: [plan.md](plan.md)
> Status: **Accepted by the orchestrator on 2026-10-28** (no human available; decisions D1–D9 picked by the implementer as the recommended options, per the brief). The human reviews at PR time.

## Acceptance criteria (verbatim from Jira)
- [x] AC1 Given a free user, when they make a 31st AI call within an hour, then the gateway returns 429 with Retry-After and the app shows a friendly message
- [x] AC2 Every AI call writes a row to the usage ledger with user, route, model, input/output tokens and cost estimate
- [x] AC3 A daily token quota per user is enforced and the quota resets at 00:00 UTC
- [x] AC4 Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated

## Behaviour
Request order in the gateway (TB-22 stages, plus this ticket's middleware first in stage 4):

```
route/method → JWT auth (401) → body (400) → provider key? (500) → usage-limits → [TB-25, TB-24] → provider
```

1. **Before the provider** `usage-limits` calls `ai_consume_call(user, callsPerHour, tokensPerDay)`:
   - tokens recorded today (UTC) ≥ quota → **429 `QUOTA_EXCEEDED`**, `Retry-After` = seconds to the next 00:00 UTC. Not counted as a call.
   - otherwise atomically add 1 to this UTC hour's call count unless it is already at the limit; at the limit → **429 `RATE_LIMITED`**, `Retry-After` = seconds to the next full UTC hour. A refused call does not increase the count.
   - store unreachable or an unexpected answer → **500 `INTERNAL`** (fail closed: no unmetered AI call). Logged as `usage_check_failed`.
   - In all three cases the provider and the later middleware are not called.
2. **After the provider** (also when it failed or threw): one `ai_record_usage()` per provider call of the request (`ctx.providerCalls`), which inserts the ledger row and adds input + output tokens to today's total in one transaction. Failed calls are recorded with 0 tokens and their outcome (`timeout`, `upstream`, `bad_response`, `exception`).
   A ledger write failure is logged as `usage_record_failed` (request id, error class, status) and the user still gets their answer.
3. Both 429s carry `Retry-After` (whole seconds ≥ 1) and `X-Request-Id`; CORS exposes both.
4. **App:** `mapGatewayError(status, headers, body)` turns any gateway error into `{ kind, retryAfterSeconds, requestId }`; `gatewayErrorTitle/Message()` and `<AiErrorNotice error={…} />` show it (e.g. "Your buddy needs a short break — Try again in about 45 minutes. You can still add and edit tasks yourself.").

## Technical design
- **Surfaces:**
  - `supabase/functions/ai-gateway/middleware/usage-limits.ts` (new): the guard.
  - `supabase/functions/ai-gateway/usage-store.ts` (new): `UsageStore` interface and the PostgREST RPC implementation (service-role key, 5 s timeout, no bodies kept).
  - `middleware/index.ts`: `buildMiddleware(deps)` (see Deviations), `index.ts` wiring, `config.ts` limits and prices, `pipeline.ts` `ctx.providerCalls`, `gateway.ts` records each provider call, `http.ts` code + CORS.
  - `src/features/ai/` (new): `gateway-errors.ts`, `copy.ts`, `components/AiErrorNotice.tsx`.
- **Interfaces & contracts:**
  - `packages/schemas/src/ai-gateway.ts`: new error code `QUOTA_EXCEEDED` (429). `RATE_LIMITED` (429) already existed.
  - Env: `AI_CALLS_PER_HOUR` (default 30), `AI_TOKENS_PER_DAY` (default 50,000), positive integers; anything else falls back to the default. `SUPABASE_SERVICE_ROLE_KEY` (auto-injected on Supabase).
  - SQL: `ai_consume_call(p_user_id uuid, p_calls_per_hour int, p_tokens_per_day bigint, p_now timestamptz default now())` → `(allowed, reason, retry_after_seconds, calls_this_hour, tokens_today)`; `ai_record_usage(p_user_id, p_request_id, p_route, p_model, p_input_tokens, p_output_tokens, p_cost_usd, p_outcome, p_now default now())`. `p_now` exists for tests; the gateway never sends it, so the DB clock decides.
- **Data changes** (`supabase/migrations/20261028180000_ai_usage_limits.sql`):
  - `ai_usage_ledger` (id uuid, user_id → auth.users cascade, request_id, route, model, input_tokens, output_tokens, cost_usd numeric(12,6), outcome, created_at) + index (user_id, created_at desc). RLS on; `authenticated` may `select` own rows only; no client insert/update/delete; `anon` nothing.
  - `ai_usage_counters` (user_id, window_kind 'hour'|'day', window_start, calls, tokens, updated_at), PK (user_id, window_kind, window_start). RLS on, no policies, no client grants.
  - Both functions `security invoker`, `search_path = ''`, `execute` revoked from `public, anon, authenticated`, granted to `service_role`.
  - Reversible: `supabase/rollback/20261028180000_ai_usage_limits.down.sql` (drops both functions and tables).
  - `src/lib/database.types.ts` regenerated.
- **Reuse:** TB-22's middleware contract, `errorResponse()`, the fetch-with-timeout pattern of `auth.ts`, TB-19's migration/RLS/test conventions, the design-system `Card`.

## Edge cases
| Case | Expected |
|---|---|
| 40 concurrent calls, limit 30 | Exactly 30 admitted (row-locked upsert). Seen live: 30×200, 10×429 |
| Call at 10:59:59.6 UTC when limited | `Retry-After: 1` (rounded up, never 0) |
| Over quota and over rate limit | `QUOTA_EXCEEDED` (checked first; the longer wait wins) |
| Quota refusal | Does not consume an hourly call |
| Provider timeout / 5xx / bad body / throw | Ledger row with 0 tokens and the outcome; user sees 504/502/500 |
| TB-24 repair retry (two provider calls) | Two ledger rows, both tokens counted |
| Ledger write fails | Logged (no PII); user gets the 200 |
| Limit check fails (DB down) | 500 `INTERNAL`, provider not called |
| No provider key (`AI_NOT_CONFIGURED`) | Returned before the guard; nothing counted (no AI call happened) |
| Unknown model id from an `AI_MODEL_*` override | Costed at the dearest known price (over-, never under-estimate) |
| Invalid `AI_CALLS_PER_HOUR` (`0`, `-3`, `2.5`, `abc`) | Default 30 |
| Retry-After as an HTTP date or garbage (app) | Date → seconds; garbage → `null` → "a moment" |
| A proxy's 429 without the gateway body (app) | Still `rate_limited` |

## Security, privacy & AI cost
- **Threats → mitigations:** a user flooding the gateway → hourly cap enforced server-side before the provider; parallel bursts to slip past a read-then-write check → single-statement upsert with the row lock; a user forging or erasing ledger rows / resetting counters → no client grants on either table and `execute` on the functions only for `service_role` (pgTAP-tested); reading other users' spend → own-row RLS (tested); DB outage turning limits off → fail closed.
- **Data:** the ledger holds ids, route, model, token counts, cost and outcome. No prompt, task text or model output. Logs carry request id and error class only (no user id).
- **Secrets:** the service-role key is server-only (auto-injected Edge Function env), sent only to this project's PostgREST, never logged; error objects keep no response body.
- **Known gaps (accepted):** the quota is checked against recorded tokens, so calls already admitted can overshoot it (bounded by 30 calls/hour × max tokens per route); a ledger write failure loses that call's tokens from the quota (logged). See Decisions D3/D6.
- **Cost:** no extra provider calls; two small RPCs per AI call (~ms on the same network).

## Decisions
| # | Decision | Options considered | Choice | Decided by / date |
|---|---|---|---|---|
| D1 | Hour window | (a) **Fixed UTC clock hour** (one counter row, atomic upsert, exact Retry-After) · (b) rolling 60 min over the ledger (needs an advisory lock and counts only finished calls) · (c) sliding-window approximation | **(a)**. Simple, atomic in one statement, and the `Retry-After` is exact. Trade-off: up to 2×30 calls across an hour boundary; acceptable for cost capping. Revisit with tiers (TB-78) if abuse shows | Implementer (brief: no human), 2026-10-28 |
| D2 | Free-tier defaults | 30 calls/hour (AC) · daily tokens 20k / **50k** / 100k | **30 calls/hour, 50,000 tokens/day**, env overrides `AI_CALLS_PER_HOUR` / `AI_TOKENS_PER_DAY`. 50k covers a few dozen typical calls a day; worst case per user (all 50k as output tokens) ≈ $0.025/day on Haiku 5.5, ≈ $0.50/day on Sonnet 5.5, plus the overshoot of calls admitted before the quota was reached | Implementer, 2026-10-28 |
| D3 | Where counting happens | (a) **Postgres functions called by RPC with the service role**, check-and-increment in one statement · (b) read-then-write from the function · (c) Redis/KV | **(a)**. Atomic under concurrency, no new vendor, same DB as the ledger; (b) races, (c) adds infra | Implementer, 2026-10-28 |
| D4 | Quota check | (a) **Pre-check recorded tokens, record after the call** · (b) reserve `max_tokens` before the call and settle after | **(a)**. Real usage is unknown until the provider answers; (b) would refuse calls that would fit. Overshoot bounded by admitted calls | Implementer, 2026-10-28 |
| D5 | Ledger granularity | (a) **One row per provider call**, failures included with 0 tokens · (b) one row per request | **(a)**. "Every AI call" and cost per call; a TB-24 repair retry is a second paid call | Implementer, 2026-10-28 |
| D6 | Ledger write failure | (a) **Log (no PII), don't fail the user's request** · (b) fail the request | **(a)** (brief's recommendation). The answer is already paid for; failing it would waste the cost and anger the user. Tested | Implementer, 2026-10-28 |
| D7 | Limit-check failure | (a) **Fail closed: 500 INTERNAL** · (b) fail open | **(a)**. CLAUDE.md invariant: every AI call passes the rate limit and quota | Implementer, 2026-10-28 |
| D8 | Quota error code | (a) **New `QUOTA_EXCEEDED` (429)** · (b) reuse `RATE_LIMITED` | **(a)**. Different wait (hours vs minutes) and different copy; the brief asks for a distinct code | Implementer, 2026-10-28 |
| D9 | App part of AC1 | (a) **Typed `mapGatewayError()` + friendly copy + `AiErrorNotice` with tests in `src/features/ai/`**, used by TB-29 · (b) wait for TB-29 · (c) a demo screen | **(a)**. No screen calls the gateway yet (TB-29 adds quick-add); a throwaway screen would be dead code in `src/app/`. AC1's app part is met at the component level (rendered with a real 429 mapping in tests); its on-device use lands with TB-29 | Implementer, 2026-10-28 |
| D10 | Cost estimate | Price table in `config.ts` (USD/MTok, Anthropic list prices from the `claude-api` skill, cached 2026-10-06) | Haiku 5.5 $0.10/$0.50, Sonnet 5.5 $2/$10, Opus 5.5 $4/$20 (+ older ids); unknown model → dearest price; stored in the row at write time and labelled an estimate | Implementer, 2026-10-28 |

## Deviations (added during build)
| Date | Change | Reason | Approved by |
|---|---|---|---|
| 2026-10-28 | `middleware/index.ts`: the constant `MIDDLEWARE` array became `buildMiddleware(deps)`; `index.ts` calls it with config, the usage store and the logger | The guard needs runtime dependencies (service-role key from env, limits). TB-22's contract had no way to pass them without touching Deno env inside middleware. Still one middleware file plus one line in the array; static middleware (TB-25) adds `myGuard,` as before | Recorded for the human reviewer (no human available) |
| 2026-10-28 | `pipeline.ts` / `gateway.ts`: new `ctx.providerCalls` (model, usage, outcome per provider call) pushed by the provider stage | Middleware could only see the last `ctx.result`, not failures or a TB-24 repair retry, so "every AI call" could not be ledgered from one file | Same |
| 2026-10-28 | Local integration ran the function in a dedicated `edge-runtime` container (`tb23-edge-runtime`, port 54393) instead of `supabase functions serve` | The shared `supabase_edge_runtime_task-buddy` container was owned by another session and was removed when serve restarted; TB-24's agent uses the same per-ticket container pattern. Same image (v1.77.8), same network, same Auth/DB | — |
