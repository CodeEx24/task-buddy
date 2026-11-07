# TB-23 — Plan

> Jira: https://stratyge.atlassian.net/browse/TB-23 · Spec: [spec.md](spec.md) · Verification: [verification.md](verification.md)
> Branch / worktree: `feat/tb-23/ai-rate-limits` in `C:/Users/jocar/orca/workspaces/task-buddy/tb-23-ai-rate-limits` (from `main` @ 01fccc8).

## Goal
Per-user hourly call limit, daily token quota and a usage ledger for every AI call, enforced in the gateway before the provider, plus the app-side error mapping and friendly message.

## Owned paths
`supabase/functions/ai-gateway/**` (new middleware, store, tests; small edits to `pipeline.ts`, `gateway.ts`, `http.ts`, `config.ts`, `index.ts`, `middleware/index.ts`), `supabase/migrations/20261028180000_*`, `supabase/rollback/20261028180000_*`, `supabase/tests/database/ai_usage_limits.test.sql`, `src/features/ai/**`, `src/lib/database.types.ts` (generated), `scripts/ai-gateway/local-limits-check.sh`, `docs/tickets/TB-23/**`, `docs/actions/ai-gateway-deploy.md`, `docs/actions/README.md`.
Shared: `packages/schemas/src/ai-gateway.ts` (one new error code; every consumer's tests must pass). TB-24 and TB-25 also register in `middleware/index.ts`: expect a one-line merge.

### Task 1 — Schema and SQL
- [x] Migration: `ai_usage_ledger`, `ai_usage_counters`, RLS, grants, `ai_consume_call`, `ai_record_usage`.
- [x] Rollback file.
- [x] pgTAP `ai_usage_limits.test.sql`: AC1 31st call, Retry-After math, per-user, hour reset; AC2 row fields; AC3 quota, reset at 00:00 UTC; RLS (own rows, other user's rows → 0, no writes, no counters, anon denied); function privileges.
- Verify: run migration + test inside a rolled-back transaction, then `migration up --local` + `supabase test db`; rollback inside a rolled-back transaction.

### Task 2 — Gateway
- [x] `config.ts`: limits + env overrides, price table, `estimateCostUsd()`.
- [x] `pipeline.ts` / `gateway.ts`: `ctx.providerCalls`.
- [x] `usage-store.ts`: RPC client.
- [x] `middleware/usage-limits.ts` + registration; `index.ts` wiring; `http.ts` code + CORS.
- Verify: `config.test.ts`, `usage-store.test.ts`, `middleware/usage-limits.test.ts` (31st call → 429 + Retry-After; provider not called when limited; quota → `QUOTA_EXCEEDED`; reset at 00:00 UTC with an injected clock; ledger fields; failures; write failure logged; check failure fails closed), existing `gateway.test.ts` unchanged and green; `deno check`.

### Task 3 — App
- [x] `src/features/ai/gateway-errors.ts`, `copy.ts`, `components/AiErrorNotice.tsx` + tests.
- Verify: `pnpm exec jest --selectProjects app src/features/ai`.

### Task 4 — Local integration and docs
- [x] Regenerate `src/lib/database.types.ts` (CI type-drift check).
- [x] Serve the function against the local stack with the mock provider; 31 calls with a real JWT; 40 concurrent calls; tiny quota; psql the ledger. Transcript in [local-integration.md](local-integration.md).
- [x] Gateway README, schemas README, owner guide (`ai-gateway-deploy.md`), verification.

## Test plan
Unit (Jest `edge-functions` + `app`), SQL (pgTAP via `supabase test db`, also in the CI `supabase` job), live local run, full `pnpm lint && pnpm typecheck && pnpm test --ci --maxWorkers=2`, `check-ticket-docs.mjs --pr`.

## Risks and rollback
- **Migration on hosted projects** is an owner step (`docs/actions/ai-gateway-deploy.md`); the function must not be deployed before the migration, or every AI call fails closed with 500. Rollback: the `.down.sql` file + `migration repair`, then redeploy TB-22's function.
- **CI rollback check** covers only TB-19's file (agents can't edit `ci.yml`); TB-23's rollback was proven locally inside a rolled-back transaction. Owner follow-up in the guide.
- **Merge with TB-24/TB-25** in `middleware/index.ts` and `pipeline.ts`: small, line-level.
