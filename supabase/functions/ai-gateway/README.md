# ai-gateway

The app's only way to reach an LLM ([TB-22](https://stratyge.atlassian.net/browse/TB-22)). Server-only: never import anything from here into `src/`.

## Endpoints

`POST <SUPABASE_URL>/functions/v1/ai-gateway/<route>` with `Authorization: Bearer <user access token>` and body `{ "input": "<text>" }` (`aiGatewayRequestSchema` in `packages/schemas/src/ai-gateway.ts`).

| Route | Model tier | Default model | Timeout |
|---|---|---|---|
| `/parse` | cheap | `claude-haiku-5-5` | 20 s |
| `/breakdown` | strong | `claude-sonnet-5-5` | 20 s |
| `/plan` | strong | `claude-sonnet-5-5` | 20 s |

The 200 body is `aiGatewaySuccessSchema`. Since TB-24, `output` is the canonical JSON text of a value that passed the route's schema (`checkAiOutput(route, output)` in `packages/schemas/src/ai-output.ts`; clients should run it again at their boundary). Errors are `aiGatewayErrorSchema` with a fixed message per code: 401 `UNAUTHENTICATED`, 400 `BAD_REQUEST`, 404 `NOT_FOUND`, 405 `METHOD_NOT_ALLOWED`, 500 `AI_NOT_CONFIGURED` / `INTERNAL`, 502 `AI_PROVIDER_ERROR` / `AI_BAD_OUTPUT`, 504 `AI_TIMEOUT`. Every response carries `X-Request-Id` (exposed to web clients via CORS). Bodies over 64 KB are rejected with 400 before parsing.

Logging: one JSON line per request with request id, route, status, model, `promptVersion` (TB-24), duration, summed token usage, provider call count, `outputCheck` (`valid` / `repaired` / `invalid` plus issue kinds `too_large` / `not_json` / `schema`) and, on failure, `errorKind` (`timeout` / `upstream` / `bad_response` / `exception`), `upstreamStatus` and `errorName`. Never user text, model output, tokens, keys, error messages or provider bodies.

## Configuration (Edge Function env)

| Name | Kind | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | **secret** | Set with `supabase secrets set`. Never in the app, EAS env, the repo or logs. Without it, signed-in calls get `AI_NOT_CONFIGURED` |
| `AI_MODEL_CHEAP`, `AI_MODEL_STRONG` | config | Override the default model ids in `config.ts` |
| `ANTHROPIC_BASE_URL` | config | Only for the local mock (`scripts/ai-gateway/mock-anthropic.mjs`). Honoured only for `http://localhost`, `127.0.0.1` or `host.docker.internal`; any other value is ignored, so the key can't be sent elsewhere |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | auto-injected | Used to verify the caller's JWT with Supabase Auth |

`config.toml` sets `verify_jwt = false` for this function: `auth.ts` is the enforcement point (it also rejects the anon key and signed-out sessions).

## Pipeline (contract for TB-23, TB-24, TB-25)

```
method/route (404/405) → JWT auth (401) → body (400) → MIDDLEWARE[...] → provider (route model, 20 s)
```

Auth always runs first, so an unauthenticated request never reaches middleware or the provider. To add a guardrail, add **one file** in `middleware/` and **one line** in `middleware/index.ts`:

```ts
// middleware/rate-limit.ts (TB-23)
import { errorResponse } from '../http.ts';
import type { GatewayMiddleware } from '../pipeline.ts';

export const rateLimit: GatewayMiddleware = {
  name: 'rate-limit',
  async handle(ctx, next) {
    if (await isOverLimit(ctx.user.id, ctx.route)) return errorResponse(ctx.requestId, 'RATE_LIMITED');
    return next();
  },
};
```

- Request guards (TB-23 rate limit, TB-25 input hardening) act **before** `next()` and may replace `ctx.body`.
- Output handling (TB-24) acts **after** `await next()`: read `ctx.result`, replace it, and return `successResponse(ctx)` (from `gateway.ts`) or `errorResponse(ctx.requestId, 'AI_BAD_OUTPUT')`.
- `next()` may be called again after the previous call settled (TB-24 repair retry: replace `ctx.body`, call `next()` again). Each call is a fresh provider call with its own 20 s timeout; the log line sums token usage and counts `providerCalls`. An overlapping call fails the request with 500.

## Output validation and prompts (TB-24)

`middleware/output-validation.ts` is registered **last** (innermost). It renders the route's versioned prompt from `prompts/` (user text inside one `<user_input>` block), checks the answer with the route's schema, and on failure makes **one** repair call (`prompts/repair.v1.ts`: the same user message plus the validation issues and the rejected answer). Still invalid → 502 `AI_BAD_OUTPUT`; the rejected text is dropped (never returned, logged or stored). The gateway has no write path for results.

Prompts: `prompts/<route>.v<N>.ts` exports `PROMPT_VERSION`; `prompts/index.ts` picks the current version per route. Change behaviour with a new file and version, never by editing a released one in place.

Golden set and runner: `evals/` and [docs/actions/ai-golden-eval-real-model.md](../../../docs/actions/ai-golden-eval-real-model.md).

## Files

| File | Role |
|---|---|
| `index.ts` | Deno entry: reads env, wires the real verifier and provider, `Deno.serve` |
| `gateway.ts` | Runtime-agnostic handler (`createGateway`), route resolution, timeout, error mapping |
| `pipeline.ts` | `GatewayContext`, `GatewayMiddleware`, `runPipeline` |
| `middleware/index.ts` | Registered middleware, in order |
| `auth.ts` | Bearer parsing + Supabase Auth verifier (`GET /auth/v1/user`) |
| `config.ts` | Model tiers, route config (prompt, max tokens), 20 s timeout |
| `middleware/output-validation.ts` | TB-24 schema validation + one repair retry |
| `prompts/` | Versioned prompt templates and the repair prompt |
| `providers/provider.ts`, `providers/anthropic.ts` | Provider interface and the Anthropic Messages API implementation |
| `http.ts` | JSON/error responses, CORS |

## Tests and local run

- Unit: `pnpm test --selectProjects edge-functions` (Jest, Node environment, fake provider and verifier).
- Types under Deno: `deno check supabase/functions/ai-gateway/index.ts` (also covered by `pnpm typecheck` under Node types).
- Local end to end: start the stack, run `MOCK_EXPECTED_KEY=<dummy> [MOCK_OUTPUT_MIX=valid=90,repair=8,fail=2] node scripts/ai-gateway/mock-anthropic.mjs`, serve with `supabase functions serve ai-gateway --env-file <file outside the repo with ANTHROPIC_API_KEY=<same dummy> and ANTHROPIC_BASE_URL=http://host.docker.internal:8787>`, then run `scripts/ai-gateway/local-check.sh` with `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY` exported from `supabase status -o env`. TB-24 golden run: `scripts/ai-gateway/golden-local.sh --mock-stats-url http://127.0.0.1:8787/stats --mock-mix <same mix>`.
