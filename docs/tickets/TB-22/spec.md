# TB-22 — Spec

> Jira: https://stratyge.atlassian.net/browse/TB-22 · Intent: [intent.md](intent.md) · Plan: [plan.md](plan.md)
> Status: Draft → **Accepted by the coordinator on 2026-10-28** (no human available; recommended options taken, recorded below for the owner to review on the PR).

## Acceptance criteria (verbatim from Jira)
- [x] Given an unauthenticated request, then the gateway returns 401 and never calls the provider
- [x] Given a valid request, then routes /parse, /breakdown, /plan use their configured model and a 20-second timeout
- [x] The provider API key exists only as an Edge Function secret and a search of the app bundle finds no key
- [x] Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated

## Behaviour
Request: `POST /functions/v1/ai-gateway/<route>`, `Authorization: Bearer <access token>`, JSON body `{ "input": string }` (trimmed, 1..8000 chars, no other keys).

Order of checks (first failure wins):

| Stage | Failure | Status / code |
|---|---|---|
| `OPTIONS` | — | 200 CORS preflight |
| Route is one of parse, breakdown, plan | unknown or extra path segments | 404 `NOT_FOUND` |
| Method is POST | anything else | 405 `METHOD_NOT_ALLOWED` (+ `Allow`) |
| Bearer token present and Supabase Auth returns a user | missing, malformed, garbage, anon key, expired, signed out, Auth down | 401 `UNAUTHENTICATED` (+ `WWW-Authenticate`) |
| Body matches `aiGatewayRequestSchema` | not JSON, missing/empty/oversized input, unknown key | 400 `BAD_REQUEST` |
| Provider configured (`ANTHROPIC_API_KEY` set) | unset | 500 `AI_NOT_CONFIGURED` |
| Registered middleware (none yet) | a middleware's own response | e.g. 429 `RATE_LIMITED` (TB-23) |
| Provider call: route model, route `max_tokens`, 20 s abort | timeout / upstream error or bad body / anything else | 504 `AI_TIMEOUT` / 502 `AI_PROVIDER_ERROR` / 500 `INTERNAL` |
| Success | — | 200 `{ requestId, route, model, output, usage }` |

Error bodies carry a fixed message per code: never the user's text, the provider's body or a stack. Every response has `X-Request-Id`. One JSON log line per request: request id, route, status, model, duration, token usage. No input, output, tokens or keys.

## Technical design
- **Surfaces:** `supabase/functions/ai-gateway/` (`index.ts` Deno entry; `gateway.ts` runtime-agnostic handler; `pipeline.ts` contract; `middleware/index.ts` registry; `auth.ts`; `config.ts`; `providers/provider.ts` + `providers/anthropic.ts`; `http.ts`). `supabase/config.toml` `[functions.ai-gateway]` with `verify_jwt = false`.
- **Interfaces & contracts:** `packages/schemas/src/ai-gateway.ts` (`aiGatewayRequestSchema`, `aiGatewaySuccessSchema`, `aiGatewayErrorSchema`, `AI_ROUTES`, `AI_ERROR_CODES`, `MAX_AI_INPUT_CHARS`). `AiProvider.complete(request, signal)`. `AuthVerifier.verify(token)`. `GatewayMiddleware.handle(ctx, next)`.
- **Pipeline contract** (wave plan Wave 2 step 2): fixed stages route → auth → body → `MIDDLEWARE[]` → provider. A middleware is one file in `middleware/` plus one line in the array. Request guards act before `next()` (and may replace `ctx.body`); output handling acts after `next()` on `ctx.result` and rebuilds with `successResponse(ctx)`, and may call `next()` again for a repair retry once the previous call settled (overlapping calls → 500). Auth is not a middleware: it can't be reordered or removed.
- **Config:** model tiers `cheap` / `strong`, defaults `claude-haiku-5-5` / `claude-sonnet-5-5`, overridable with `AI_MODEL_CHEAP` / `AI_MODEL_STRONG`. Routes: parse → cheap (1024 tokens), breakdown → strong (2048), plan → strong (4096); all 20 000 ms. `ANTHROPIC_BASE_URL` optional (local mock only).
- **Provider:** Anthropic Messages API (`POST /v1/messages`, `x-api-key`, `anthropic-version: 2023-06-01`) via `fetch`. The response is Zod-validated (`model`, `content[]`, `usage`); text blocks are concatenated. Non-2xx bodies are discarded unread.
- **Auth:** `GET <SUPABASE_URL>/auth/v1/user` with the bearer token and the anon key as `apikey` (what `supabase.auth.getUser(jwt)` does), 5 s timeout, fail closed.
- **Tests:** Jest project `edge-functions` (plain Node env, no jest-expo globals) in `jest.config.js`; runs in the existing `ci` job. `tsconfig.json` gains `allowImportingTsExtensions` (Deno-style `.ts` imports; `noEmit` already on).
- **AC3 guards:** `scripts/check-bundle-secrets.ts` also flags `sk-ant-…` values and the `ANTHROPIC_API_KEY` name; `src/lib/no-secrets.test.ts` forbids both in `src/` and forbids importing `supabase/functions` from `src/`.
- **Data changes:** none (no tables, no migrations).
- **Reuse:** Zod (already a dependency) for request and provider-response validation; the TB-19 bundle scanner and static guard extended rather than duplicated.

## Edge cases
| Case | Expected |
|---|---|
| `Authorization: Basic …`, `Bearer` with no token, `Bearer a b` | 401 without calling Auth |
| Anon/publishable key as bearer (a valid JWT, but no user) | 401 (Auth returns no user) |
| Auth unreachable or slower than 5 s | 401 (fail closed) |
| Unauthenticated **and** invalid body / missing provider key | 401 (auth is checked first) |
| `/ai-gateway`, `/ai-gateway/parse/x`, `/ai-gateway/__proto__` | 404 |
| Provider answers at 19.999 s | 200; timer cleared |
| Provider hangs | aborted at 20 s → 504 |
| Provider 4xx/5xx (body may echo the prompt) | 502, body not read, not logged |
| Provider 200 with HTML or wrong JSON | 502 |
| Middleware throws | 500 `INTERNAL` |

## Security, privacy & AI cost
- **Threats:** (1) unauthenticated spend — blocked by stage-2 auth before any provider call (tests + local run); (2) key leakage to the app — key read only in `index.ts` from Deno env; bundle scanner + static guard; key never logged or echoed; (3) using the anon key as a "user" — rejected by Auth `/user`; (4) prompt/output leakage via logs or error bodies — fixed error messages, log line has no text; (5) model override by the client — `strictObject` rejects unknown keys, model comes from server config only; (6) SSRF via base URL — `ANTHROPIC_BASE_URL` is server env only, not request-controlled.
- **Remaining (later tickets):** a signed-in user can still spend without limit until TB-23 lands; model output is raw text until TB-24; prompt-injection filtering is TB-25. The system prompts already tell the model to treat user text as data.
- **Data leaving the device:** the user's `input` text goes to the gateway and on to the provider. Nothing is stored.
- **CORS:** `Access-Control-Allow-Origin: *` for Expo web. No cookies are used (bearer only), so this grants nothing without a token.

## Decisions
No human was available; the coordinator instructed taking the recommended option for each.

| Decision | Options considered | Choice | Decided by / date |
|---|---|---|---|
| D1 JWT verification | (a) **in-function via Supabase Auth `/auth/v1/user`, `verify_jwt = false`**; (b) platform `verify_jwt` only; (c) both; (d) in-function local JWKS check (`getClaims`) | (a). Single tested enforcement point; works with asymmetric signing keys (platform check is the legacy path); rejects the anon key, signed-out sessions and deleted users, which a signature check alone accepts. Cost: one in-network hop to Auth per call | Coordinator (recommended), 2026-10-28 |
| D2 `/breakdown` model tier | (a) **strong**; (b) cheap | (a). Step quality and estimates drive the feature, calls are user-initiated per task (low volume). Switchable per route in `config.ts`; ids per tier via env | Coordinator (recommended), 2026-10-28 |
| D3 Provider client | (a) **plain `fetch` behind `AiProvider`**; (b) `npm:@anthropic-ai/sdk` | (a). No dependency or cold-start cost, trivially faked, base URL override for the local mock | Coordinator (recommended), 2026-10-28 |
| D4 Test runner | (a) **Jest project in the existing `ci` job + `deno check` step proposed to the owner**; (b) `deno test` only (needs a YAML change before it runs anywhere) | (a). Tests gate PRs today; Deno type check follows via `docs/actions/ci-deno-check.md` | Coordinator (recommended), 2026-10-28 |
| D5 Local "valid request" proof | (a) **mock HTTP server via `ANTHROPIC_BASE_URL`**; (b) env-flag fake provider inside the function | (a). No fake code path ships, so nothing can enable it in production; exercises the real provider code and headers | Coordinator (recommended), 2026-10-28 |
| D6 Pipeline contract | (a) **onion `(ctx, next)` middleware with fixed stage order and one registry array**; (b) separate `before`/`after` hook arrays; (c) per-route hook config | (a). One shape covers guards (TB-23/25) and output wrapping (TB-24); each ticket adds one file + one line | Coordinator (recommended), 2026-10-28 |
| D7 Shared schema location | (a) **`packages/schemas/src/ai-gateway.ts`, imported by relative path**; (b) `supabase/functions/_shared` | (a). The app client (TB-29) needs the same envelope; verified that `functions serve` resolves the import | Coordinator (recommended), 2026-10-28 |

## Deviations (added during build)
| Date | Change | Reason | Approved by |
|---|---|---|---|
| 2026-10-28 | Started while blocker TB-20 is In Progress | Gateway needs Supabase Auth JWTs only, not TB-20's sign-in UI; coordinator dispatched in parallel | Coordinator |
| 2026-10-28 | `jest.config.js` split into `app` and `edge-functions` projects; `tsconfig.json` gains `allowImportingTsExtensions`; `supabase/.gitignore` ignores `functions/**/deno.lock` | jest-expo's lazy React Native globals break web `Request`/`fetch` in tests; Deno needs `.ts` import extensions; `deno check` writes a lockfile newer than the Edge Runtime's Deno | Coordinator (shared config outside owned paths) |
| 2026-10-28 | `scripts/check-bundle-secrets.ts` and `src/lib/no-secrets.test.ts` (TB-19 files) extended | AC3: the bundle search must cover the provider key | Coordinator |
| 2026-10-28 | After independent review: `next()` may be re-called after the previous call settled (was: once); log line gains `providerCalls`, `errorKind`, `upstreamStatus`, `errorName`; 64 KB body cap → 400; `ANTHROPIC_BASE_URL` honoured only for local hosts; `X-Request-Id` exposed via CORS | TB-24's repair retry must fit the one-file contract; diagnosable failures; memory safety; key can't be redirected | Coordinator (review findings 4–10 in verification.md) |
