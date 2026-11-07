# TB-24 — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-24 · PR: https://github.com/CodeEx24/task-buddy/pull/24 (draft) · Spec: [spec.md](spec.md) · Plan: [plan.md](plan.md) · Branch: `feat/tb-24/ai-output-schemas`
> Record only what was actually run and observed. `node scripts/workflow/check-ticket-docs.mjs --branch <branch> --pr` fails the PR gate while any AC row is `not met`, `partial` or `TBD`. **AC1 is `partial` on purpose:** the real-model run is still to do, so this PR stays a draft.

## Commands run
All run locally on 2026-10-28 (Windows 11, Node 24.21, pnpm 10.17.1, Deno 2.9.8, Docker Desktop) in the worktree based on `origin/main` @ 01fccc8.

| Command | Result | Notes |
|---|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts` + `pnpm rebuild better-sqlite3` | pass | Fresh worktree; no dependency changes |
| `pnpm lint` | pass | 0 problems (final code) |
| `pnpm typecheck` | pass | `tsc --noEmit`, final code |
| `pnpm test --ci --maxWorkers=2` (before review fixes) | pass | 61 suites, 539 tests in 2 projects |
| `pnpm test --ci --maxWorkers=2` (final code) | pass | 61 suites, 546 tests in 2 projects (`app`, `edge-functions`); the TB-26 flake noted by TB-22 did not occur |
| `pnpm exec jest --selectProjects edge-functions --ci --maxWorkers=2` (final code) | pass | 5 suites, 109 tests (TB-22's 70 unchanged + 39 new) |
| `pnpm exec jest --selectProjects app --ci --maxWorkers=2 evals packages/schemas` (final code) | pass | 2 suites, 54 tests |
| `deno check --no-lock --config supabase/functions/ai-gateway/deno.json supabase/functions/ai-gateway/index.ts` | pass | Final code |
| Golden run A, mix `valid=90,repair=8,fail=2`, through the edge runtime + real local Auth (`scripts/ai-gateway/golden-local.sh`) | pass | 197/200 (98.5 %) valid after ≤ 1 repair, 3 `AI_BAD_OUTPUT`; measured = predicted (179 + 18 + 3; 200 + 21 provider calls). Run before and after the review fixes, same counts. [local-integration.md](local-integration.md) |
| Golden run B, mix `valid=80,repair=15,fail=5` | pass | 190/200 (95 %), runner correctly prints `AC1: FAIL`; measured = predicted (163 + 27 + 10; 200 + 37 calls) |
| Partial golden run `--routes plan` (final code) | pass | `AC1: not assessed (ran 35 of 200 golden cases)`, exit 1 as designed |
| TB-22 smoke on the same runtime: 200 on all 3 routes, 401 without token, `SLOW` → 504 at 20 s | pass | Log lines carry `promptVersion` on all of them |
| Rebase onto `origin/main` @ 8d9cd11 (TB-54), conflict in `docs/actions/README.md` resolved by keeping both to-do items; then `pnpm lint`, `pnpm typecheck`, edge-functions Jest | pass | 113 edge-function tests |
| Merge of `origin/main` @ 09ab8c8 (TB-23, PR #25), conflicts in `gateway.ts`, `pipeline.ts`, `middleware/index.ts`, two READMEs resolved; TB-23's test fake now returns schema-valid answers and its timeout-estimate test uses the rendered prompt length (the upper-bound estimate now sees TB-24's template) | pass | No behaviour change to TB-23's limits |
| `pnpm lint`, `pnpm typecheck`, `deno check` (after the TB-23 merge) | pass | |
| `pnpm test --ci --maxWorkers=2` (after the TB-23 merge) | pass | 70 suites, 655 tests; edge-functions 164 |
| CI on PR #24, run 40734880150 (`b208c3b`) | pass | `ci` 1m13s (ticket-docs gate skipped on drafts), `bundle` 1m33s, `supabase` 1m32s |
| `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-24/ai-output-schemas` | pass | "workflow check: ok". Without `--pr` while the PR is a draft (the `--pr` gate fails on the `partial` AC1 row, as intended) |

## Acceptance criteria
| AC (verbatim) | Status | Evidence (test name, file:line, screenshot, observed result) |
|---|---|---|
| Given 200 golden inputs, then at least 98% of responses validate against the schema after at most one automatic repair retry | partial | **Done:** 200 golden inputs committed (`evals/golden/`: 120 parse, 45 breakdown, 35 plan; 30 %+ Taglish/Tagalog/Bisaya, injection and no-task cases; `golden-report.test.ts` "has exactly 200 cases…", "contains no personal data patterns"). Runner `pnpm eval` (`evals/run-golden.ts`: 1 rps default, `--max-requests` 200, `--max-tokens` 400 000; AC1 only assessed on a complete run). Repair logic and the runner's arithmetic proven against the deterministic mock through the real edge runtime: run A 197/200 = 98.5 %, run B 190/200 = 95 %, both exactly as predicted, never more than 2 provider calls per request. **Not done:** the rate for a **real model**, because no Anthropic key exists on this machine. Owner step: [docs/actions/ai-golden-eval-real-model.md](../../actions/ai-golden-eval-real-model.md). The mock numbers say nothing about real-model quality |
| Given invalid output after the retry, then the gateway returns the typed error AI_BAD_OUTPUT and nothing is persisted | met | `middleware/output-validation.ts` returns `errorResponse(…, 'AI_BAD_OUTPUT')` after the second failed check and drops the text. Tests in `output-validation.test.ts` "invalid twice → AI_BAD_OUTPUT, nothing persisted": schema/schema, non-JSON/non-JSON, schema/oversized → 502 with the fixed message, exactly 2 provider calls, persistence hook (`onValidOutput`) called 0 times; "never returns or logs the rejected text". The gateway has no write path for results. Since TB-23 merged, the only gateway write is TB-23's usage ledger (user, request id, route, model, token counts, cost, outcome: no text), and both paid calls of an `AI_BAD_OUTPUT` request are recorded there (test "AI_BAD_OUTPUT still records both paid calls"); the only hook is called for validated output only. Live: 3 `AI_BAD_OUTPUT` in run A, 10 in run B, logs `outcome: invalid` with `providerCalls: 2`. `AI_BAD_OUTPUT` is a typed code in `packages/schemas/src/ai-gateway.ts` (`AI_ERROR_CODES`) |
| Prompt templates are versioned in the repo and the version is logged with each request | met | `supabase/functions/ai-gateway/prompts/{parse,breakdown,plan,repair}.v1.ts` each export `PROMPT_VERSION`; `prompts/index.ts` selects the current one; `config.ts` wires it per route. Tests (`prompts/prompts.test.ts`): version id matches the file name, registry wired into the route config, released prompts frozen by fingerprint. `gateway.ts` log line has `promptVersion` (and `outputCheck.repairPromptVersion` when a repair ran); tests "prompt version in the log line" for every route and for a 401. Live: every log line in [local-integration.md](local-integration.md) carries `promptVersion` |
| Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated | met | 39 new edge-function tests, 54 schema/eval tests; full suite green; TB-22's 70 tests untouched and green; lint, typecheck, `deno check` green. Independent reviewer subagent with a security pass (fresh context, REVIEW.md): no blocking code defects, verdict "approve with changes"; findings resolved below. Docs: intent, spec (decisions D1–D10, deviations, TB-23 merge note), plan, this file, local-integration transcript, function / schemas / evals READMEs, owner guide. Human review and merge are the coordinator's and owner's gate |

## Manual / E2E
No app UI in this ticket (the first client is TB-29). End to end through the real Supabase edge runtime image and real local Auth with a password-grant user token: [local-integration.md](local-integration.md). Negative checks: no token → 401 (no provider call); a run below 98 % → `AC1: FAIL`; a partial run → `AC1: not assessed`.

## Review findings
| # | Severity | Finding (file:line) | Source (self / reviewer agent / human) | Resolution |
|---|---|---|---|---|
| 1 | Blocking (docs) | `verification.md` (and at review time `spec.md`/`plan.md`) missing | reviewer agent | All ticket docs written |
| 2 | Important | Repair prompt put model-chosen text (Zod "Unrecognized key" names) outside any block unescaped; delimiter regex missed `</user_input x="1">` and `<user_input/>` (`repair.v1.ts`, `template.ts`) | reviewer agent | Issue lines go through `neutralizeDelimiters`; regex now `/<\s*\/?\s*(user_input\|previous_answer)\b[^>]*>/gi`. Tests "issue lines quoting model-chosen key names cannot open or close a block", "neutralises tags with attributes or a self-closing slash" |
| 3 | Important | Runner could print `AC1: PASS` on a partial run stopped by a cap (`golden-report.ts` `summarize`) | reviewer agent | `summarize(results, expectedTotal)`; AC1 only on a complete 200-case run, otherwise "not assessed" and exit 1. Test "a partial run … never meets AC1"; seen live |
| 4 | Important | `middleware/index.ts` and the registration test will conflict with TB-23's `buildMiddleware(deps)` | reviewer agent | Resolved in the merge of `origin/main` @ 09ab8c8 (TB-23): `outputValidation` is the last entry of `buildMiddleware`. Tests "with TB-23 usage limits (the registered order)": a repair is a second ledger row of the same request, counts once against the hourly call limit, and both calls' tokens count toward the daily quota; `AI_BAD_OUTPUT` records both paid calls; a rate-limited request never reaches validation or the provider. Registration test reads the built list |
| 5 | Nit | A repair call that timed out was logged as `outcome: invalid` | reviewer agent | New outcome `repair_failed`; test "a provider error on the repair call returns that error, not stale output" |
| 6 | Nit | `stop_reason: max_tokens` isn't passed through, so a truncated answer gets a repair at the same `max_tokens` | reviewer agent | Not changed (provider interface is TB-22's; parse limit raised to 2048, D8). Follow-up proposed below |
| 7 | Nit | Stale comments (`ai-gateway.ts` "raw text", `run-golden.ts` usage, function README) | reviewer agent | Updated |
| 8 | Nit | Nothing stops an in-place edit of a released prompt | reviewer agent | Fingerprint test "released prompts are frozen" (fails with instructions to add `v2`) |
| 9 | Nit | `REFERENCE_TIME_ZONE = 'Asia/Manila'` hard-coded | reviewer agent | Recorded (D9); follow-up for TB-30 proposed below |
| 10 | Important | parse `max_tokens` 1024 could cut a 25-task answer mid-JSON | self | Raised to 2048 (D8) |
| 11 | Nit | Success body reported only the repair call's usage | self | Summed over both calls; test in "invalid, then repaired" |
| 12 | Info | Python edits on Windows wrote CRLF into three TS files, and one escaped `\b` became a control character | self | Converted back to LF; regex line rewritten and checked for control characters |

## Known limitations & follow-ups
- **AC1 real-model rate not measured** (no key here). Owner action: [ai-golden-eval-real-model.md](../../actions/ai-golden-eval-real-model.md). If below 98 %, tune via `prompts/<route>.v2.ts`.
- Golden cases check the output contract only, not answer quality (TB-30/31/34, TB-39).
- Reference date uses Asia/Manila until the client sends its local date. Proposed follow-up: TB-30 adds `localDate`/time zone to the parse request.
- Proposed follow-up: pass the provider's `stop_reason` and skip or shorten the repair on `max_tokens`.
- Worst case per request: 2 provider calls, 2 × 20 s. TB-23 meters both calls; its quota check before the first call can let a repair exceed the daily quota by one call.
- Local runs used a separate edge-runtime container (same image) because the shared `supabase functions serve` container belonged to another session (D10). Five `tb24-*@example.test` users remain in the local Auth database (local data only).

## Completion
- [ ] All AC met with evidence (AC1 partial: real-model run pending)
- [x] Gates green locally and in CI (run 40734880150)
- [x] No open Blocking findings in code (docs finding resolved)
- [ ] Jira updated (In Progress 2026-10-28; In Review when the PR opens; Done after merge)
