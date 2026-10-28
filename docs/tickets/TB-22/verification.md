# TB-22 — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-22 · PR: https://github.com/CodeEx24/task-buddy/pull/22 · Branch: `feat/tb-22/ai-gateway-edge-function`
> Record only what was actually run and observed. `node scripts/workflow/check-ticket-docs.mjs --branch <branch> --pr` fails the PR gate while any AC row is `not met`, `partial` or `TBD`.

## Commands run
All run locally on 2026-10-28 (Windows 11, Node 24.21, pnpm 10.17.1, Deno 2.9.8, Docker Desktop) on the worktree based on `main` @ 1a00ccf.

| Command | Result | Notes |
|---|---|---|
| `pnpm install --ignore-scripts` + `pnpm rebuild better-sqlite3` | pass | Fresh worktree; no dependency changes |
| `pnpm lint` | pass | 0 problems |
| `pnpm typecheck` | pass | `tsc --noEmit`; covers the Edge Function under Node types (`allowImportingTsExtensions`) |
| `pnpm test --ci --maxWorkers=2` (before review fixes) | pass | 47 suites, 356 tests in 2 projects (`app`, `edge-functions`) |
| `pnpm test --ci --maxWorkers=2` (final code, after review fixes) | pass | 47 suites, 371 tests. A pre-existing TB-26 flake failed 2 of 3 other full runs; see "Pre-existing flaky test" below |
| `pnpm exec jest --selectProjects edge-functions` (final code) | pass | 3 suites, 70 tests (`gateway.test.ts`, `auth.test.ts`, `providers/anthropic.test.ts`) |
| `deno check --no-lock --config supabase/functions/ai-gateway/deno.json supabase/functions/ai-gateway/index.ts` | pass | Deno globals, `npm:zod@4.6.7`, relative `.ts` imports incl. `packages/schemas` |
| `supabase functions serve ai-gateway --env-file <outside repo>` + `bash scripts/ai-gateway/local-check.sh` | pass | Shared local stack (CLI 2.122.0, Edge Runtime 1.77.8). Final run: 401 ×4 (no token, garbage, anon key, service-role key), 200 ×3, 400, 404, 504 at 20 s. Run 3 times (first build, after timeout hardening, after review fixes), same statuses. Transcript: [local-integration.md](local-integration.md) |
| `expo export --platform android` with an `ANTHROPIC_API_KEY` canary in the shell, then `node scripts/check-bundle-secrets.ts <dir>` | pass | "29 files scanned, no secrets found"; 0 files contain the canary, `ANTHROPIC` or `ai-gateway` |
| `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-22/ai-gateway-edge-function --pr` | pass | "workflow check: ok" |
| CI on PR #22, run 40726822074 (`12462c1`) | pass | `ci` (lint, typecheck, Jest incl. `edge-functions`, ticket-docs gate) 1m07s; `bundle` (Android + iOS export, scan) 1m49s; `supabase` (pgTAP, type drift, rollback) 2m24s |

### Pre-existing flaky test (not caused by this change)
`src/features/tasks/repo/task-repo.test.ts` › "surfaces driver failures as DB_FAILURE without task text" (TB-26) failed in some local full runs: `dbError` came back as `{ name: 'object' }` instead of `{ code: 'SQLITE_CONSTRAINT_TRIGGER' }`. It also fails with only the `app` Jest project selected (2 of 3 runs), whose config is unchanged from `main`, and passes when run alone. So it predates TB-22. It is likely a cross-realm `instanceof` check on the native better-sqlite3 error in `repo-utils.ts` `describeDbError`. Outside this ticket's owned paths; proposed as a follow-up for the coordinator.

## Acceptance criteria
| AC (verbatim) | Status | Evidence (test name, file:line, screenshot, observed result) |
|---|---|---|
| Given an unauthenticated request, then the gateway returns 401 and never calls the provider | met | Unit: `gateway.test.ts` "AC1: unauthenticated requests get 401 and never reach the provider" (no header, garbage token, empty bearer, `Basic` scheme without calling the verifier, auth checked before body and before registered middleware, 401 even with no provider key); each asserts `calls` to the fake provider is empty. `auth.test.ts`: Auth 401/403, no id, network error and Auth timeout all fail closed. Live: no token, garbage token and the anon key as bearer → HTTP 401 `UNAUTHENTICATED`; the mock provider log shows zero calls for them ([local-integration.md](local-integration.md)). Auth is stage 2 in `gateway.ts` `handle()`, before body, middleware and provider |
| Given a valid request, then routes /parse, /breakdown, /plan use their configured model and a 20-second timeout | met | Unit: "AC2: …" — `/parse` → `claude-haiku-5-5`, `/breakdown` and `/plan` → `claude-sonnet-5-5` (provider receives that model and the response reports it); `AI_MODEL_CHEAP`/`AI_MODEL_STRONG` override; every route `timeoutMs` 20 000 (`config.ts` `AI_TIMEOUT_MS`); fake timers: signal not aborted at 19 999 ms, aborted at 20 000 ms → 504 `AI_TIMEOUT`; a provider that ignores the signal still gets 504 at 20 s; timer cleared on success. Live with a real user JWT: 200 on all three routes with those models and per-route `max_tokens` 1024/2048/4096 at the mock; slow mock → 504 after `durationMs: 20012` |
| The provider API key exists only as an Edge Function secret and a search of the app bundle finds no key | met | The key is read only in `supabase/functions/ai-gateway/index.ts` from Deno env (`ANTHROPIC_API_KEY`), never logged or echoed (`gateway.test.ts` "never logs user text or tokens"; `anthropic.test.ts` drops upstream bodies). Not in `app.json`, EAS env, `src/` or `.env.example`. `src/lib/no-secrets.test.ts` now forbids the key name, `sk-ant-` values and any `supabase/functions` import in `src/`; `scripts/check-bundle-secrets.ts` flags both in the export (`check-bundle-secrets.test.ts` "flags an LLM provider key …"). Local Android export with a key canary in the shell: scanner clean, 0 hits. CI `bundle` job (Android + iOS) on the PR. Setting the secret on the hosted projects is the owner's step: `docs/actions/ai-gateway-deploy.md` |
| Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated | met | 70 new edge-function tests plus scanner and static-guard tests; full suite green (371 tests; the only failure seen is the pre-existing TB-26 flake above); lint, typecheck and `deno check` green. Independent reviewer subagent with a security pass (fresh context, REVIEW.md): no Blocking findings, verdict "approve with changes"; its 3 Important findings and the nits are resolved below. Docs: intent, spec (decisions D1–D7, deviations), plan, this file, local-integration transcript, function/schemas/functions READMEs, two owner guides. Human review and merge are the coordinator's and owner's gate |

## Manual / E2E
Local integration against real Supabase Auth: see [local-integration.md](local-integration.md). Environment: shared local stack (`task-buddy`, API 127.0.0.1:54321), fresh confirmed test user from the Auth admin API, real password-grant access token. Negative checks: no token, garbage token, anon key (a valid JWT that is not a user) → 401 with zero provider calls; invalid body → 400; unknown route → 404. There is no app UI for this ticket (the first client is TB-29).

## Review findings
| # | Severity | Finding (file:line) | Source (self / reviewer agent / human) | Resolution |
|---|---|---|---|---|
| 1 | Important | A provider that ignores `signal` would hang past 20 s (`gateway.ts` `callProvider`) | self | `Promise.race` with a deadline promise; test "still returns 504 at 20 s when a provider ignores the abort signal" |
| 2 | Nit | `response.headers.set('X-Request-Id')` throws if a middleware returns a Response with immutable headers (`gateway.ts`) | self | `withRequestId()` copies the response when headers are immutable |
| 3 | Important | jest-expo's lazy "winter" globals throw on web `Request`/`fetch` in Edge Function tests | self | Separate `edge-functions` Jest project with `testEnvironment: 'node'` |
| 4 | Important | `pipeline.ts` allowed `next()` once, and the context had no provider access, so TB-24's repair retry couldn't fit the one-file contract; `trace.usage` kept only the last call | reviewer agent | `next()` may be called again after the previous call settled (overlap → 500); usage summed and `providerCalls` counted. Tests: "lets a middleware retry the provider…", "…while a call is in flight fails closed with 500". README updated |
| 5 | Important | `gateway.ts` dropped failure causes from the log: a bad key (upstream 401), an outage (529) and a code bug all looked the same | reviewer agent | Log line gains `errorKind`, `upstreamStatus`, `errorName` (no messages or bodies). Tests in "failure causes in the log line"; seen live (`errorKind: "timeout"`) |
| 6 | Important | verification.md claimed a finished independent review before it had finished | reviewer agent | This table and the AC4 row now record the actual review |
| 7 | Nit | `jest.config.js` lost the regex escaping: the source `'\\.css$'` became `'\.css$'`, which JavaScript reads as `.css$` (matching e.g. `tailwindcss`) | reviewer agent | Restored `'\\.css$'` and `'\\.[jt]sx?$'` in the source |
| 8 | Nit | Body read with no size cap before Zod's 8000-char limit | reviewer agent | `MAX_BODY_BYTES` 64 KB on `Content-Length` and the read text → 400. Tests in "body size" |
| 9 | Nit | `ANTHROPIC_BASE_URL` set by mistake on a hosted project would send the key elsewhere | reviewer agent | `localProviderBaseUrl()` honours only `http://localhost`, `127.0.0.1`, `host.docker.internal`; tests incl. `localhost.evil.example.com` |
| 10 | Nit | Mock binds `0.0.0.0`; `local-check.sh` leaves a test user each run; no service-role-as-bearer case; `X-Request-Id` not exposed via CORS; static guard missed `require(`/`import(` | reviewer agent | `0.0.0.0` kept with a comment (the container reaches it via `host.docker.internal`); leftover local user documented in the script (local data only; no deletes by agents); service-role case added (→ 401 live); `Access-Control-Expose-Headers: X-Request-Id`; guard regex covers all three forms |
| 11 | Info | If the hosted projects disable legacy API keys, the injected `SUPABASE_ANON_KEY` sent as `apikey` to Auth might be refused (every user → 401: an outage, not a hole) | reviewer agent | Recorded in limitations; checked at deploy by the unauthenticated/authenticated curl in `docs/actions/ai-gateway-deploy.md` |

## Known limitations & follow-ups
- Until TB-23 lands, a signed-in user can call the gateway without limits. The owner guide asks for a spend limit on the Anthropic workspace before the key is set.
- `output` is the model's raw text; TB-24 adds output schemas, `AI_BAD_OUTPUT` and repair through the pipeline. TB-25 adds injection filtering.
- System prompts are placeholders; TB-30/31/34 own the real prompts and golden examples (wave plan judgement call 1). No eval baseline is affected yet.
- Hosted deploy not done (no key exists yet): `docs/actions/ai-gateway-deploy.md`. Deploy must confirm that `packages/schemas` resolves (it does under `functions serve`).
- Deno type check isn't in CI yet: `docs/actions/ci-deno-check.md` (YAML in `ci-deno-check.yml`).
- Auth being unreachable surfaces as 401 (fail closed), not 503.
- If the hosted projects ever disable the legacy JWT-based API keys, the auto-injected `SUPABASE_ANON_KEY` may stop working as the `apikey` for Auth; switch the verifier to the publishable key then (finding 11).
- Each `local-check.sh` run leaves one `tb22-check-*@example.test` user in the local Auth database.
- Pre-existing flaky TB-26 test (above): proposed follow-up.

## Completion
- [x] All AC met with evidence
- [x] Gates green locally and in CI (run 40726822074)
- [x] No open Blocking findings (independent review: none)
- [ ] Jira updated (In Review done 2026-10-28; Done after merge)
