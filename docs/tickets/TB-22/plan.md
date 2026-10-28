# TB-22 — Plan

> Jira: https://stratyge.atlassian.net/browse/TB-22 · Spec: [spec.md](spec.md) · Branch: `feat/tb-22/ai-gateway-edge-function` (Orca worktree `tb-22-ai-gateway`)

## Goal
A JWT-verified `ai-gateway` Edge Function with `/parse`, `/breakdown`, `/plan`, a provider interface, a 20 s timeout and the middleware contract TB-23/24/25 plug into. Proven by unit tests in CI and a local run against real Supabase Auth.

## Owned paths
`supabase/functions/ai-gateway/**`, `packages/schemas/**` (wave plan). Also touched, with reason in spec deviations: `supabase/config.toml` (`[functions.ai-gateway]` block only), `supabase/.gitignore`, `jest.config.js`, `tsconfig.json`, `scripts/check-bundle-secrets*.ts`, `src/lib/no-secrets.test.ts`, `scripts/ai-gateway/**`, `docs/tickets/TB-22/**`, `docs/actions/**`. Not touched: `.github/workflows/*.yml` (protected; proposal in `ci-deno-check.yml`).

## Tasks
### Task 1 — Shared contract
- [x] `packages/schemas/src/ai-gateway.ts`: request/success/error schemas, routes, error codes.
- Verify: `pnpm typecheck`; used by the gateway tests.

### Task 2 — Provider interface + Anthropic provider
- [x] `providers/provider.ts` (`AiProvider`, `ProviderError`), `providers/anthropic.ts` (fetch, Zod-validated response).
- Verify: `providers/anthropic.test.ts` (request shape, headers, signal, error mapping, abort passthrough).

### Task 3 — Auth
- [x] `auth.ts`: `bearerToken`, `createSupabaseAuthVerifier` (fail closed, 5 s timeout).
- Verify: `auth.test.ts`.

### Task 4 — Config, pipeline, handler, entry
- [x] `config.ts` (tiers, routes, 20 s), `pipeline.ts` (contract), `middleware/index.ts` (empty registry with TB-23/24/25 slots), `http.ts`, `gateway.ts`, `index.ts`, `deno.json`; `config.toml` `verify_jwt = false`.
- Verify: `gateway.test.ts` — AC1 (401 cases, provider and middleware never called), AC2 (route → model, env override, 20 s abort with fake timers, timer cleanup), error mapping, logging hygiene, pipeline order/short-circuit/rewrite/double-next. `deno check` on `index.ts`.

### Task 5 — Test wiring
- [x] Jest `edge-functions` project (Node env); `allowImportingTsExtensions`.
- Verify: `pnpm test --ci` runs both projects.

### Task 6 — AC3 guards
- [x] Scanner rule for provider key value + name; static guard in `src/`; no `supabase/functions` import from `src/`.
- Verify: `check-bundle-secrets.test.ts`, `no-secrets.test.ts`; local `expo export --platform android` with an `ANTHROPIC_API_KEY` canary in the shell, then the scanner; CI `bundle` job.

### Task 7 — Local integration
- [x] `scripts/ai-gateway/mock-anthropic.mjs`, `scripts/ai-gateway/local-check.sh`; serve against the shared local stack with an env file outside the repo.
- Verify: transcript in [local-integration.md](local-integration.md): no token / garbage / anon key → 401; real user JWT → 200 on all three routes with the right model; 400; 404; slow provider → 504 at 20 s. Mock log shows zero provider calls for the rejected requests.

### Task 8 — Docs, review, PR
- [x] Function README, schemas README, functions README, ticket docs, `docs/actions/ai-gateway-deploy.md`, `docs/actions/ci-deno-check.md` + to-do list.
- [x] Independent reviewer + security pass; findings in verification.md.
- [x] `check-ticket-docs.mjs --pr`; PR ready for review; Jira In Review.

## Test plan
| AC | Layer | Test |
|---|---|---|
| AC1 | unit | `gateway.test.ts` "AC1: …" (5 cases) + `auth.test.ts` |
| AC1 | local integration | `local-check.sh` 401 ×3, mock log |
| AC2 | unit | `gateway.test.ts` "AC2: …" (route→model ×3, env override, 20 000 ms config, abort at 20 s, timer cleared) + `anthropic.test.ts` |
| AC2 | local integration | 200 ×3 with model per route; 504 after 20 s |
| AC3 | unit / bundle | `check-bundle-secrets.test.ts`, `no-secrets.test.ts`; local export + scan; CI `bundle` |
| AC4 | gates | `pnpm lint && pnpm typecheck && pnpm test`, CI `ci`/`supabase`/`bundle` |

## Risks and rollback
- **Hosted deploy resolving `../../../packages/schemas`:** verified with `functions serve` (same bundler). If `functions deploy` ever rejects it, move the file under `supabase/functions/_shared/` and re-export from `packages/schemas`. Owner checks at deploy (`docs/actions/ai-gateway-deploy.md`).
- **Edge Runtime Deno 2.1 vs local Deno 2.9:** `deno check` passes on 2.9; the proposed CI step pins the runtime's Deno version.
- **Rollback:** no data or migrations. Revert the PR; for a deployed function, `supabase functions delete ai-gateway` is the owner's call (not done by agents).
