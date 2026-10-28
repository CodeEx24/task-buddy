# TB-25 — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-25 · PR: https://github.com/CodeEx24/task-buddy/pull/26 (**draft**) · Branch: `feat/tb-25/prompt-injection-hardening`
> Record only what was actually run and observed. `node scripts/workflow/check-ticket-docs.mjs --branch <branch> --pr` fails the PR gate while any AC row is `not met`, `partial` or `TBD`.

## Commands run
All run locally on 2026-10-28 (Windows 11, Node 24.21, pnpm, Docker Desktop) in the worktree based on `main` @ 09ab8c8 (TB-22 + TB-23).

| Command | Result | Notes |
|---|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts` + `pnpm rebuild better-sqlite3` | pass | Fresh worktree; no dependency changes |
| `pnpm lint` | pass | 0 problems |
| `pnpm typecheck` | pass | `tsc --noEmit` (covers the Edge Function under Node types) |
| `pnpm test --ci --maxWorkers=2` (final code) | pass | 70 suites, 685 tests in 2 projects (668 before the review fixes) |
| `pnpm exec jest --selectProjects edge-functions --maxWorkers=2` | pass | 9 suites, 218 tests. New: `middleware/input-hardening.test.ts`, `prompt-guard.test.ts`, `no-action-path.test.ts`; TB-22 `gateway.test.ts` and TB-23 `usage-limits.test.ts` updated (see Deviations in spec.md) |
| `pnpm exec jest packages/schemas` | pass | `ai-input.test.ts` (app project) |
| `pnpm exec prettier --check <changed files>` | pass | |
| `pnpm dlx deno@2.2.15 check --no-lock --config supabase/functions/ai-gateway/deno.json supabase/functions/ai-gateway/index.ts` | pass | Deno compatibility of the new code |
| Mutation check: leak check replaced by `false` | pass | 26 tests fail, as they should; restored |
| Mutation check: sanitiser bypassed | pass | 14 tests fail, as they should; restored |
| False-positive check: `detectPromptLeak` over TB-24's golden inputs (branch `feat/tb-24/ai-output-schemas`), valid and repairable mock answers, TB-24's real prompts + hardening rules | pass | 400 answers, 0 flagged (scratch script, not committed) |
| Live: this branch in its own `edge-runtime:v1.77.8` container on the stack network + `scripts/ai-gateway/mock-anthropic-leaky.mjs` + `scripts/ai-gateway/local-injection-check.sh` with a real user JWT | pass | `/parse`: 2,000 → 200, 2,001 → 413, 2,000 emoji → 200, 2,001 emoji → 413, 9,000 → 413, controls/zero-width/bidi/tags stripped, only-invisible → 400; corpus 18 refused (502 `AI_UNSAFE_OUTPUT`) + 2 clean (tool prompts, text only). `/breakdown`: 18 + 2. Transcript: [local-integration.md](local-integration.md) |
| `psql` on `ai_usage_ledger` / `ai_usage_counters` for the run-1 user | pass | 24 ledger rows, 24 hour-counter calls for 28 requests: the 3×413 and 1×400 used no quota |
| CI on draft PR #26, run 40741555312 (`6a49844`) | pass | `ci` 1m10s (lint, typecheck, Jest; the docs `--pr` gate is skipped on drafts), `supabase` 1m22s, `bundle` 1m21s |
| `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-25/prompt-injection-hardening` | pass | "workflow check: ok". The `--pr` gate fails by design while AC1 is `partial`, so the PR is a draft |

## Acceptance criteria
| AC (verbatim) | Status | Evidence (test name, file:line, screenshot, observed result) |
|---|---|---|
| Given a corpus of 20 injection prompts (e.g. 'ignore previous instructions'), then none returns the system prompt or triggers a tool action | partial | **Met against a fully compromised model; the real-model run is pending.** Corpus: `evals/injection/corpus.json` (20 prompts, 7 categories incl. Taglish/Bisaya). `input-hardening.test.ts` "AC1: the 20-prompt injection corpus against a fully compromised model": every case on `/parse`, `/breakdown`, `/plan` → no canary, no hardening rule, no route prompt in the response; 18 leak attempts → 502 `AI_UNSAFE_OUTPUT`; the 2 tool prompts → text only. Leak forms refused: full echo, 12-word excerpt, canary plain/spaced/upper-case/reversed, Base64 of the prompt, "translation" carrying the canary (`prompt-guard.test.ts` adds ROT13 and hex). Tools: provider request keys are exactly `input, maxTokens, model, system` (corpus test); Anthropic body exactly `max_tokens, messages, model, system`, and a `tool_use` block is dropped (`no-action-path.test.ts` "AC1: the model is never offered a tool"). Live with a real JWT: 18 refused + 2 clean on two routes; mock saw no `tools`. **Why not met:** the guard is best effort. A real model that paraphrases or translates its instructions without the canary, or uses an encoding other than ROT13/Base64/hex, isn't caught (spec → Residual risk), and no real model has been run (no key on this machine). Owner step: [ai-injection-corpus-real-model.md](../../actions/ai-injection-corpus-real-model.md) |
| Inputs over 2,000 characters are rejected with 413 and control characters are stripped | met | "Characters" = Unicode code points after sanitising (spec D1). `input-hardening.test.ts` "AC2: inputs over 2,000 characters are rejected with 413": 2,000 → 200 unchanged; 2,001 → 413 `INPUT_TOO_LONG` with the TB-23 `consume` never called, counter 0, no ledger row, provider not called; 2,000 vs 2,001 emoji; 2,001 with one stripped control → 200; 8,001 units → 413 from the body stage. "AC2: control and invisible characters are stripped before the provider": C0, DEL/C1, CRLF/CR, zero-width/joiner/word joiner/BOM, bidi overrides/isolates, tag characters, lone surrogates, fullwidth (NFKC), delimiter tags; emoji ZWJ sequences and skin tones kept; only-invisible → 400. `ai-input.test.ts`: each class incl. variation selectors and blank fillers, VT/FF, idempotence. `gateway.test.ts` body-size tests now 413. Live: same results with a real JWT (transcript run 1) |
| AI-proposed actions are never executed server-side; the client must confirm | met | `no-action-path.test.ts` "AC3: the gateway has no server-side action path": every gateway source imports only zod, gateway files and `packages/schemas` (no DB client, no `src/`); only `auth.ts`, `usage-store.ts`, `providers/anthropic.ts` make network calls; no PostgREST path except `/rest/v1/rpc`, and the only RPCs are `ai_consume_call` / `ai_record_usage` (TB-23 usage accounting, not an action on user data); auth only reads `GET /auth/v1/user`; no `tools`/`tool_use`/`eval` in the source (a tripwire). The answer is returned as text in `output` (`successResponse`, `gateway.ts`); the corpus's tool prompts come back as text and nothing runs. Client side: CLAUDE.md invariant 2; the confirm UI is built by TB-29 (quick-add preview), TB-36 (breakdown) and TB-55 (chat with confirmed actions). `INPUT_TOO_LONG` / `AI_UNSAFE_OUTPUT` mapped for the app in `src/features/ai/gateway-errors.ts` (+ tests) |
| Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated | partial | Tests: 4 new test files, 685/685 passing, lint, typecheck, `deno check` green; two existing tests changed on purpose (body-size 400 → 413; ledger estimate includes the hardened prompt). Review: independent reviewer subagent (fresh context, REVIEW.md four passes incl. security), findings below, all resolved or recorded. Docs: intent, spec (D1–D10, residual risks, deviations), plan, this file, [local-integration.md](local-integration.md), gateway/schemas/evals READMEs, owner guide + to-do list. Open: human PR review and merge (orchestrator/owner), and AC1's real-model run |

## Manual / E2E
Live run with a real user JWT against the shared local Supabase stack (real Auth, PostgREST, Postgres), this branch in its own edge-runtime container, a compromised-model mock as provider: [local-integration.md](local-integration.md). Negative checks: a rejected input (413/400) never reaches the provider or the quota counter (mock log 24 calls / 28 requests; ledger 24 rows); a leaking answer never reaches the client (502 body holds only the code and a fixed message; no `tbc_`, prompt or rule text). There is no app screen for this ticket (TB-29 adds the first caller).

## Review findings
Independent reviewer: `ecc:security-reviewer` subagent with fresh context, given the AC, the design decisions, the diff and `docs/workflow/REVIEW.md`. It ran the edge-function suite (205/205 at the time) and probed the sanitiser and guard in Node.

| # | Severity | Finding (file:line) | Source | Resolution |
|---|---|---|---|---|
| 1 | Blocking | Ticket docs, action guide and gateway README missing or stale (`docs/tickets/TB-25/`, `supabase/functions/ai-gateway/README.md`) | reviewer agent | Fixed: spec, plan, verification, local-integration, `docs/actions/ai-injection-corpus-real-model.md` + to-do list, gateway README (pipeline, codes, 413, TB-25 section), schemas and evals READMEs |
| 2 | Important | "2,000 characters" counted after sanitising, not raw (`ai-input.ts` `checkAiInput`) | reviewer agent | Kept by design (invisible padding must neither push valid text over nor be smuggled under); recorded in spec Behaviour and D1, and in the Jira comment |
| 3 | Important | Variation selectors, U+034F, Hangul fillers, U+2800 kept (invisible-payload channels) | reviewer agent | Fixed: stripped except VS15/VS16 after an emoji; tests in `ai-input.test.ts` |
| 4 | Important | NFKC turns fullwidth `＜/user_input＞` into a real closing tag; nothing in TB-25 neutralised it | reviewer agent | Fixed: `neutralizeDelimiterTags()` after sanitising (same pattern and output as TB-24, idempotent); spec D10; tests in `prompt-guard.test.ts` and `input-hardening.test.ts`; live corpus cases refused |
| 5 | Important | Leak guard could flag legitimate answers once TB-24's real prompts land | reviewer agent | Checked: 0 of 400 TB-24 golden answers flagged against TB-24's prompts. Added: spans the user supplied don't count. Re-check after both PRs merge (follow-up below) |
| 6 | Nit | VT/FF glued words; tag flags lose tags; narrow ZWJ rule | reviewer agent | VT/FF now `\n`; flag trade-off recorded in spec edge cases; ZWJ rule kept |
| 7 | Nit | Leak forms the guard misses (hex, ROT13, partial canary, < 8 words, split Base64, reversed prompt, paraphrase) | reviewer agent | Hex and ROT13 added; the rest listed in spec → Residual risk; AC1 kept `partial` |
| 8 | Nit | `outputOf` duplicates `ctx.result.text`; clone not drained | reviewer agent | Comment added (TB-24 rewrites `output`, so both are checked) |
| 9 | Nit | 400/413 are free; 200 vs 502 is an oracle | reviewer agent | Recorded in spec Security (acceptable: random canary, no secrets in the prompt) |
| 10 | Important | AC3 "no tools in source" check is a grep tripwire | reviewer agent | Kept as a tripwire, stated as such in spec; the stronger evidence (provider body keys, text-only blocks, import allow-list, network callers, RPC names) is listed in the AC3 row |
| 11 | Nit | Early `return` in the corpus loop could skip routes silently (`input-hardening.test.ts`) | reviewer agent | Fixed: throws |
| 12 | Nit | Hermes support for `\p{…}` in `ai-input.ts` unverified | reviewer agent | Recorded in spec; matters only when the app imports it (TB-29) |

## Known limitations & follow-ups
- **AC1 real-model run** (owner): [ai-injection-corpus-real-model.md](../../actions/ai-injection-corpus-real-model.md). Then flip AC1 to met here and take the PR out of draft.
- After TB-24 and TB-25 are both on `main`: re-run `pnpm test` and `scripts/ai-gateway/local-injection-check.sh` (the leaky mock already understands TB-24's `<user_input>` block) to confirm no false `AI_UNSAFE_OUTPUT` on real prompt files; middleware order must be `createInputHardening()`, `createUsageLimits(...)`, `outputValidation` (last).
- Leak guard residual risk (paraphrase, other encodings): proposed follow-up, a model-graded leak eval in TB-39's eval runner.
- A leak refusal is visible only as status 502 in the request log line (no separate event), because `MiddlewareDeps.log` is typed for TB-23's entries; add a `security_event` log kind when the logger is generalised.
- TB-29: use `checkAiInput()` for a live counter in quick-add (check Hermes regex support first).

## Completion
- [ ] All AC met with evidence (AC1 partial: real-model run pending)
- [x] Gates green locally and in CI (draft PR #26)
- [x] No open Blocking findings
- [ ] Jira updated (In Review → Done)
