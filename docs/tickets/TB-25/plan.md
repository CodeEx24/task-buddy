# TB-25 — Plan

> Jira: https://stratyge.atlassian.net/browse/TB-25 · Spec: [spec.md](spec.md) · Verification: [verification.md](verification.md)
> Branch / worktree: `feat/tb-25/prompt-injection-hardening` in `C:/Users/jocar/orca/workspaces/task-buddy/tb-25-input-hardening` (from `main` @ 09ab8c8, which has TB-22 and TB-23).

## Goal
Normalise and cap user text before any AI call, make "the system prompt never comes back" a gateway guarantee, and prove the gateway has no tool or action path.

## Owned paths
`packages/schemas/src/ai-input.ts` (+test), `supabase/functions/ai-gateway/{prompt-guard.ts,no-action-path.test.ts,prompt-guard.test.ts}`, `middleware/input-hardening.ts` (+test), `evals/injection/**`, `scripts/ai-gateway/{mock-anthropic-leaky.mjs,injection-check.mjs,local-injection-check.sh}`, `docs/tickets/TB-25/**`, `docs/actions/ai-injection-corpus-real-model.md`.
Shared, small edits: `packages/schemas/src/ai-gateway.ts` (two codes), `gateway.ts` (body stage), `http.ts`, `pipeline.ts` (one field), `middleware/index.ts` (one line), `src/features/ai/gateway-errors.ts` + `copy.ts`, gateway README, `docs/actions/README.md`.
Must not edit: TB-24's `prompts/**`, `middleware/output-validation.ts`, `scripts/ai-gateway/mock-anthropic.mjs`.

### Task 1 — Shared normaliser
- [x] `ai-input.ts`: sanitise (surrogates, line breaks, C0/C1, `\p{Cf}` except emoji ZWJ, NFKC), count code points, check against 2,000.
- Verify: `ai-input.test.ts` (each class, idempotence, 2,000/2,001, emoji, empty).

### Task 2 — Gateway
- [x] Error codes and messages; body stage 413.
- [x] `prompt-guard.ts`: rules, canary, leak detection (canary any form, 8-word spans, Base64).
- [x] `middleware/input-hardening.ts`, registered first.
- Verify: `input-hardening.test.ts` (413 before counter and provider, stripping, canary per request, leak kinds → 502, non-200 untouched), `prompt-guard.test.ts`, updated `gateway.test.ts` and `usage-limits.test.ts`.

### Task 3 — AC1 / AC3 proof
- [x] Corpus (20, diverse) + compromised-model double; corpus test over all three routes.
- [x] `no-action-path.test.ts`: imports, network callers, RPC names, no tools in the provider body, `tool_use` ignored.
- [x] Mutation check: disabling the leak check or the sanitiser makes tests fail.

### Task 4 — App mapping
- [x] `input_too_long` kind and message; tests.

### Task 5 — Local run and docs
- [x] Leaky mock + runner + wrapper; run in an own `edge-runtime` container on the stack network with a real JWT; transcript in `local-integration.md`.
- [x] Owner guide for the real-model run; to-do list; READMEs.
- [x] Gates: `pnpm lint && pnpm typecheck && pnpm test --ci --maxWorkers=2`, `deno check`, docs gate.

## Risks and rollback
- False positives of the leak guard on legitimate answers (mitigated: 8-word spans; checked against TB-24's golden answers). Rollback: remove one line in `middleware/index.ts` (the guard is self-contained); no data changes.
- Merge with TB-24: both touch `middleware/index.ts`, `gateway.ts`, `pipeline.ts`, `packages/schemas/src/ai-gateway.ts` in different hunks. Order in the array after both: `createInputHardening()`, `createUsageLimits(...)`, `outputValidation` (last).
