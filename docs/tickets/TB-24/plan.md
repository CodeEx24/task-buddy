# TB-24 — Implementation plan

> Jira: https://stratyge.atlassian.net/browse/TB-24 · Spec: [spec.md](spec.md)
> Bar: an engineer who has never seen the conversation could implement the change from this plan alone.

## Branch & worktree
`feat/tb-24/ai-output-schemas` (Orca worktree `tb-24-ai-output-schemas`, from `main` @ 01fccc8).
Owns: `packages/schemas/src/ai-output*.ts`, `supabase/functions/ai-gateway/{middleware/output-validation*,prompts/**}`, `evals/**`, `scripts/ai-gateway/{golden-local.sh,mock-anthropic.mjs}`, `docs/tickets/TB-24/**`, new `docs/actions/ai-golden-eval-real-model.md`.
Shared, minimal edits: `middleware/index.ts` (one import + one entry; TB-23 adds its own line), `config.ts`, `gateway.ts`, `pipeline.ts` (additive), `package.json` (one script), `docs/actions/README.md`, READMEs.
Must not edit: `.github/workflows/*`, anything TB-23 owns (rate-limit middleware, ledger).

## Dependencies
Blocked by TB-22 (US-008): merged to `main` (#22) and Done in Jira.

## Tasks
### Task 1 — Output schemas
- [x] `packages/schemas/src/ai-output.ts`: three strict schemas, registry, `checkAiOutput`, `formatOutputIssues`, limits.
- Verify: `packages/schemas/src/ai-output.test.ts` (valid/invalid per field, plan ordering and midnight, fence, prose, oversize, issue cap).

### Task 2 — Versioned prompts
- [x] `prompts/template.ts` (contract, `<user_input>` block, delimiter neutralising), `parse.v1.ts`, `breakdown.v1.ts`, `plan.v1.ts`, `repair.v1.ts`, `index.ts`; `config.ts` wires `prompt` + `system` per route; parse `max_tokens` 2048.
- Verify: `prompts/prompts.test.ts` (registry, version = file name, rendering, repair cap, delimiter escape).

### Task 3 — Middleware and log fields
- [x] `middleware/output-validation.ts`; register last in `middleware/index.ts`; `ctx.outputCheck` in `pipeline.ts`; `promptVersion` and `outputCheck` in `gateway.ts` log line.
- Verify: `middleware/output-validation.test.ts` (valid first try per route; repaired for schema / non-JSON / oversize; invalid twice → `AI_BAD_OUTPUT`, exactly 2 calls, persistence hook not called; provider errors pass through; no token/user id in prompts; rejected text never returned or logged; `promptVersion` logged incl. 401; registration). TB-22's `gateway.test.ts` unchanged and green.

### Task 4 — Golden set, runner, mock mix
- [x] `evals/golden/*.json` (200 synthetic cases, 30 %+ Taglish/Filipino), `evals/golden-report.ts`, `evals/mock-output-mix.ts`, `evals/run-golden.ts`, `pnpm eval`; mock serves the mix and `/stats`; `scripts/ai-gateway/golden-local.sh`.
- Verify: `evals/golden-report.test.ts` (200 cases, unique, no PII patterns, rate math, 98 % boundary, mock prediction and mismatch detection); local runs against the mock (below).

### Task 5 — Local end to end
- [x] Edge runtime with this worktree on the shared stack's network, mock on 8794, real local user JWT. Run A mix `valid=90,repair=8,fail=2`, run B `valid=80,repair=15,fail=5`; TB-22 smoke (200 ×3, 401, 504).
- Verify: [local-integration.md](local-integration.md).

### Task 6 — Docs and owner action
- [x] Ticket docs, function / schemas / evals READMEs, `docs/actions/ai-golden-eval-real-model.md` + to-do list.

## Test strategy
| AC | Test (layer) | File |
|---|---|---|
| AC1 | Golden-set integrity, scoring arithmetic, mock prediction (unit); runner against the mock through the real edge runtime (integration); real model (owner action) | `evals/golden-report.test.ts`, `local-integration.md`, `docs/actions/ai-golden-eval-real-model.md` |
| AC2 | Invalid twice → 502 `AI_BAD_OUTPUT`, 2 calls, hook not called, text not returned/logged (unit); live 502s in run A/B (integration) | `middleware/output-validation.test.ts` |
| AC3 | Registry/version/file-name test; `promptVersion` in log line for every route and for 401 (unit); live log lines | `prompts/prompts.test.ts`, `middleware/output-validation.test.ts` |
| AC4 | Full gates, independent review | `verification.md` |

## Risks & rollback
- A schema too strict for real model output lowers the AC1 rate → visible in the owner's real-model run; loosen in a `v2` schema/prompt, re-run.
- Repair doubles worst-case latency (40 s) and tokens → `providerCalls`/`usage` in logs; TB-23 quotas.
- Rollback: remove `outputValidation` from `MIDDLEWARE` (one line) to return to TB-22 raw output; or revert the PR. No data or migrations involved.
