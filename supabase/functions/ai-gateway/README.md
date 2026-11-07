# ai-gateway

The app's only way to reach an LLM ([TB-22](https://stratyge.atlassian.net/browse/TB-22)). Server-only: never import anything from here into `src/`.

## Endpoints

`POST <SUPABASE_URL>/functions/v1/ai-gateway/<route>` with `Authorization: Bearer <user access token>` and body `{ "input": "<text>" }` (`aiGatewayRequestSchema` in `packages/schemas/src/ai-gateway.ts`).

| Route | Model tier | Default model | Timeout |
|---|---|---|---|
| `/parse` | cheap | `claude-haiku-5-5` | 20 s |
| `/breakdown` | strong | `claude-sonnet-5-5` | 20 s |
| `/plan` | strong | `claude-sonnet-5-5` | 20 s |

The 200 body is `aiGatewaySuccessSchema` (`output` is the model's raw text until TB-24 adds output schemas). Errors are `aiGatewayErrorSchema` with a fixed message per code: 401 `UNAUTHENTICATED`, 400 `BAD_REQUEST`, 404 `NOT_FOUND`, 405 `METHOD_NOT_ALLOWED`, 429 `RATE_LIMITED` / `QUOTA_EXCEEDED` (with `Retry-After` in seconds), 500 `AI_NOT_CONFIGURED` / `INTERNAL`, 502 `AI_PROVIDER_ERROR`, 504 `AI_TIMEOUT`. Every response carries `X-Request-Id`; CORS exposes it and `Retry-After`. Bodies over 64 KB are rejected with 400 before parsing. The app maps errors with `mapGatewayError()` in `src/features/ai/gateway-errors.ts` and shows `<AiErrorNotice>`.

## Usage limits and ledger (TB-23)

`middleware/usage-limits.ts` runs first, before every other middleware and the provider:

| Limit | Default | Env | Window | Over it |
|---|---|---|---|---|
| Calls per user | 30 | `AI_CALLS_PER_HOUR` | fixed UTC clock hour | 429 `RATE_LIMITED`, `Retry-After` = seconds to the next full hour |
| Input + output tokens per user | 50,000 | `AI_TOKENS_PER_DAY` | UTC day, resets at 00:00 UTC | 429 `QUOTA_EXCEEDED`, `Retry-After` = seconds to 00:00 UTC |

- Counting is in Postgres (`supabase/migrations/20261028180000_ai_usage_limits.sql`): `ai_consume_call()` checks the quota, then counts the call with one atomic upsert (`... on conflict do update ... where calls < limit`), so concurrent requests can't exceed the limit. `ai_record_usage()` writes the ledger row and adds the tokens to the day in one transaction. Only the service role may run them; `usage-store.ts` calls them over PostgREST RPC with `SUPABASE_SERVICE_ROLE_KEY`.
- If the check fails (DB down, bad answer) the call is refused with 500 `INTERNAL` (fail closed) and logged as `usage_check_failed`.
- After the provider, one `ai_usage_ledger` row per provider call (`ctx.providerCalls`): user, request id, route, model, input/output tokens, estimated cost, outcome. Timeouts and unreadable 2xx bodies may have been billed, so they are recorded at an upper-bound estimate (prompt at 3 chars/token plus the route's `max_tokens`); upstream errors and exceptions record 0. A failed ledger write is logged as `usage_record_failed` and does not fail the user's request.
- The quota is checked against tokens already recorded, so calls admitted before it was reached can overshoot it a little.
- Cost = `estimateCostUsd()` from the price table `MODEL_PRICES_USD_PER_MTOK` in `config.ts` (list prices, an **estimate**), priced by the configured model id; a dated snapshot id uses its longest known prefix; an unknown id uses the dearest price.
- Users can read their own ledger rows (RLS); nobody but the service role can write either table.

Logging: one JSON line per request with request id, route, status, model, duration, summed token usage, provider call count and, on failure, `errorKind` (`timeout` / `upstream` / `bad_response` / `exception`), `upstreamStatus` and `errorName`. Never user text, model output, tokens, keys, error messages or provider bodies.

## Configuration (Edge Function env)

| Name | Kind | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | **secret** | Set with `supabase secrets set`. Never in the app, EAS env, the repo or logs. Without it, signed-in calls get `AI_NOT_CONFIGURED` |
| `AI_MODEL_CHEAP`, `AI_MODEL_STRONG` | config | Override the default model ids in `config.ts` |
| `AI_CALLS_PER_HOUR`, `AI_TOKENS_PER_DAY` | config | TB-23 free-tier limits (defaults 30 and 50,000). Positive integers; anything else keeps the default |
| `ANTHROPIC_BASE_URL` | config | Only for the local mock (`scripts/ai-gateway/mock-anthropic.mjs`). Honoured only for `http://localhost`, `127.0.0.1` or `host.docker.internal`; any other value is ignored, so the key can't be sent elsewhere |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | auto-injected | Used to verify the caller's JWT with Supabase Auth |
| `SUPABASE_SERVICE_ROLE_KEY` | auto-injected **secret** | TB-23: the usage store's RPC calls. Server-only, never logged |

`config.toml` sets `verify_jwt = false` for this function: `auth.ts` is the enforcement point (it also rejects the anon key and signed-out sessions).

## Pipeline (contract for TB-23, TB-24, TB-25)

```
method/route (404/405) -> JWT auth (401) -> body (400) -> buildMiddleware(deps)[...] -> provider (route model, 20 s)
                                                           usage-limits (TB-23) -> TB-25 -> TB-24
```

Auth always runs first, so an unauthenticated request never reaches middleware or the provider. To add a guardrail, add **one file** in `middleware/` and **one line** in the array returned by `buildMiddleware()` in `middleware/index.ts`. A middleware without dependencies is a plain object (`myGuard,`); one that needs runtime dependencies is a factory that takes them from `MiddlewareDeps` (config, usage store, logger), which `index.ts` builds from env:

```ts
// middleware/input-hardening.ts (TB-25)
import { errorResponse } from '../http.ts';
import type { GatewayMiddleware } from '../pipeline.ts';

export const inputHardening: GatewayMiddleware = {
  name: 'input-hardening',
  async handle(ctx, next) {
    if (looksUnsafe(ctx.body.input)) return errorResponse(ctx.requestId, 'BAD_REQUEST');
    return next();
  },
};
```

`middleware/usage-limits.ts` (TB-23) is the factory example: `createUsageLimits({ store, limits, log })`.

- Request guards (TB-23 rate limit, TB-25 input hardening) act **before** `next()` and may replace `ctx.body`.
- Output handling (TB-24) acts **after** `await next()`: read `ctx.result`, replace it, and return `successResponse(ctx)` (from `gateway.ts`) or `errorResponse(ctx.requestId, 'AI_BAD_OUTPUT')`.
- `next()` may be called again after the previous call settled (TB-24 repair retry: replace `ctx.body`, call `next()` again). Each call is a fresh provider call with its own 20 s timeout; the log line sums token usage and counts `providerCalls`. An overlapping call fails the request with 500.
- `ctx.providerCalls` lists every provider call of the request (model, requested model, usage, whether the usage is estimated, outcome). Only the provider stage appends to it; middleware reads it. A retry must go through `next()` so it is ledgered and counted against the quota; never call the provider directly.

## Files

| File | Role |
|---|---|
| `index.ts` | Deno entry: reads env, wires the real verifier and provider, `Deno.serve` |
| `gateway.ts` | Runtime-agnostic handler (`createGateway`), route resolution, timeout, error mapping |
| `pipeline.ts` | `GatewayContext`, `GatewayMiddleware`, `runPipeline` |
| `middleware/index.ts` | `buildMiddleware(deps)`: registered middleware, in order |
| `middleware/usage-limits.ts` | TB-23 rate limit, daily token quota, usage ledger |
| `usage-store.ts` | TB-23 `UsageStore` + PostgREST RPC implementation (`ai_consume_call`, `ai_record_usage`) |
| `testing/memory-usage-store.ts` | Test-only in-memory store with an injected clock (mirrors the SQL) |
| `auth.ts` | Bearer parsing + Supabase Auth verifier (`GET /auth/v1/user`) |
| `config.ts` | Model tiers, route config, 20 s timeout, usage limits, price table and cost estimate |
| `providers/provider.ts`, `providers/anthropic.ts` | Provider interface and the Anthropic Messages API implementation |
| `http.ts` | JSON/error responses, CORS |

## Tests and local run

- Unit: `pnpm test --selectProjects edge-functions` (Jest, Node environment, fake provider and verifier).
- Types under Deno: `deno check supabase/functions/ai-gateway/index.ts` (also covered by `pnpm typecheck` under Node types).
- Limits end to end (TB-23): `scripts/ai-gateway/local-limits-check.sh` (31 calls with a real JWT, `PARALLEL=1` for a concurrent burst, `FN_URL` for a dedicated container); transcript in `docs/tickets/TB-23/local-integration.md`. SQL: `supabase test db` (`supabase/tests/database/ai_usage_limits.test.sql`).
- Local end to end: start the stack, run `MOCK_EXPECTED_KEY=<dummy> node scripts/ai-gateway/mock-anthropic.mjs`, serve with `supabase functions serve ai-gateway --env-file <file outside the repo with ANTHROPIC_API_KEY=<same dummy> and ANTHROPIC_BASE_URL=http://host.docker.internal:8787>`, then run `scripts/ai-gateway/local-check.sh` with `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY` exported from `supabase status -o env`.
