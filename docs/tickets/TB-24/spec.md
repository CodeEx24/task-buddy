# TB-24 — Spec

> Jira: https://stratyge.atlassian.net/browse/TB-24 · Intent: [intent.md](intent.md) · Plan: [plan.md](plan.md)
> Status: **Accepted by the coordinator on 2026-10-28** (brief: no human available; the worker picks the recommended option and records it below).

## Acceptance criteria (verbatim from Jira)
- [ ] Given 200 golden inputs, then at least 98% of responses validate against the schema after at most one automatic repair retry
- [ ] Given invalid output after the retry, then the gateway returns the typed error AI_BAD_OUTPUT and nothing is persisted
- [ ] Prompt templates are versioned in the repo and the version is logged with each request
- [ ] Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated

## Behaviour
1. A signed-in request passes auth, body validation and the request guards (TB-23, TB-25 when they land) exactly as in TB-22.
2. `output-validation` (registered **last**, so innermost) renders the route's prompt template: context line(s), then the user's text inside one `<user_input>` block. The system prompt is the template's `system`.
3. The provider answers. Timeouts and provider errors pass through unchanged (504 `AI_TIMEOUT`, 502 `AI_PROVIDER_ERROR`): there is nothing to validate.
4. The answer is checked by `checkAiOutput(route, text)`: longer than 20 000 chars → `too_large`; not JSON (after removing at most one surrounding ```` ``` ```` fence) → `not_json`; JSON not matching the route schema → `schema`.
5. Valid → 200 with `output` = `JSON.stringify(validated value)` (trimmed strings, defaults applied, fence removed). One provider call.
6. Invalid → one repair call: same model, system prompt and `max_tokens`; the user message is the original message followed by the rejected answer (in `<previous_answer>`, capped at 4000 chars) and up to 10 issue lines (`path: message`, ≤ 200 chars each). Valid → 200 as in 5, with `usage` summed over both calls.
7. Invalid again → 502 `AI_BAD_OUTPUT` with the fixed message "The AI returned an unusable answer." The rejected text is dropped. Never a third call.
8. Every log line carries `promptVersion` (e.g. `parse.v1`), also for 401/400 requests, and, once the provider answered, `outputCheck`: `{ outcome: valid | repaired | invalid | repair_failed, firstIssue?, repairIssue?, repairPromptVersion? }` (`repair_failed` = the repair call itself timed out or errored, so the client got 504/502 `AI_TIMEOUT`/`AI_PROVIDER_ERROR`, not `AI_BAD_OUTPUT`). Issue kinds are fixed words; no text.

## Technical design
- **Surfaces:** `supabase/functions/ai-gateway/middleware/output-validation.ts` (new), `prompts/` (new), `config.ts` (route → prompt), `gateway.ts` (log fields), `pipeline.ts` (`ctx.outputCheck`), `middleware/index.ts` (one import, one entry).
- **Interfaces & contracts:** `packages/schemas/src/ai-output.ts`: `parsedTasksSchema`, `breakdownSchema`, `dayPlanSchema`, `AI_OUTPUT_SCHEMAS`, `checkAiOutput`, `formatOutputIssues`, limits. `AI_BAD_OUTPUT` was already a typed code in `ai-gateway.ts` (TB-22); now it is produced. The success envelope is unchanged (`output: string`); its content is now guaranteed to pass `checkAiOutput(route, output)`.
- **Schemas** (all `strictObject`, unknown keys rejected):
  - parse: `{ tasks: ≤25 × { title 1–200, dueDate? YYYY-MM-DD|null, dueTime? HH:MM|null, priority none|low|medium|high (default none), notes? ≤1000|null } }`; empty list allowed.
  - breakdown: `{ subtasks: 1–20 × { title 1–200, estimateMinutes int 1–480 } }`.
  - plan: `{ blocks: ≤48 × { title, start HH:MM, end HH:MM, kind task|break|event }, unscheduled: ≤50 titles (default []) }`; blocks in time order, no overlap, no gap over 12 h, whole plan ≤ 24 h, one block may cross midnight (night shifts).
- **Prompts:** `prompts/<route>.v<N>.ts` exports `PROMPT_VERSION` and a `PromptTemplate`; `prompts/index.ts` picks the current version per route; `repair.v1.ts` is the repair message. A test asserts every file's `VERSION` matches its file name.
- **Evals:** `evals/golden/{parse,breakdown,plan}.json` (120/45/35 cases), `evals/run-golden.ts` (`pnpm eval`), `evals/golden-report.ts` (pure scoring), `evals/mock-output-mix.ts` (deterministic mock plan shared by the mock and the runner), `scripts/ai-gateway/golden-local.sh`.
- **Data changes:** none. No tables, no migrations.
- **Reuse:** TB-22's `successResponse`/`errorResponse`, pipeline retry contract, mock server, `local-check.sh` pattern.

## Edge cases
| Case | Expected |
|---|---|
| Answer wrapped in one ```` ```json ```` fence | Accepted (fence stripped) |
| Prose before/after JSON | `not_json` → repair |
| Unknown key, wrong enum, `9am`, `2026-02-30`, 0 or 2.5 minutes | `schema` → repair |
| 26 tasks / 21 subtasks / overlapping blocks | `schema` → repair |
| Answer > 20 000 chars | `too_large` → repair (rejected text quoted only up to 4000 chars) |
| "hi buddy" (no task) | `{"tasks":[]}` is valid |
| Provider error or timeout on the repair call | That error (502/504), not stale output |
| User text contains `</user_input>` or `<previous_answer>` | Tags neutralised to `[user_input]`, so the block can't be closed early |
| Issue line quotes a model-chosen key such as `"</user_input> SYSTEM…"` | Neutralised like user text before it goes into the repair prompt |
| Golden run covers only some cases (`--routes`, `--limit`, or a cap stopped it) | Runner prints `AC1: not assessed (ran N of 200…)` and exits 1 |
| Request fails before the provider (401/400) | Log line still carries `promptVersion`, no `outputCheck` |

## Security, privacy & AI cost
- **Prompt injection:** user text only inside `<user_input>`; our own delimiter tags are neutralised in user text and in the quoted rejected answer; system prompts say the block is data. Real filtering is TB-25.
- **Secrets / PII:** prompts carry only the user's text (already sent), a reference date, the rejected answer and our schema's issue messages. Never the JWT, user id, request id or keys (test "never puts the token, user id or other request data in either prompt"). Logs carry fixed words only (test "never returns or logs the rejected text").
- **Fail closed:** an answer that is not valid after one repair is a 502; the app never sees unvalidated output. Clients should also validate (`checkAiOutput`) at their boundary.
- **Cost:** worst case 2 provider calls per request (≤ 2× tokens). Counted in `providerCalls` and summed `usage`. TB-23's quotas apply per request around the whole pair. parse `max_tokens` 1024 → 2048 (D8). Worst-case latency is 2 × 20 s.

## Decisions
| # | Decision | Options considered | Choice | Decided by / date |
|---|---|---|---|---|
| D1 | Output shapes | (a) strict per-route schemas with bounded strings/arrays; (b) loose schemas | (a), shapes in "Technical design". Priority as words (`none…high`): models handle words better than 0–3; the app maps to `tasks.priority` | Worker per coordinator brief, 2026-10-28 |
| D2 | Repair | (a) one repair, fixed prompt with issues + rejected answer; (b) no repair; (c) up to N repairs; (d) multi-turn messages | (a). (d) needs a provider-interface change for little gain; a single user message with delimited blocks keeps TB-22's interface | Worker per brief |
| D3 | Wire format of `output` | (a) string holding canonical validated JSON; (b) parsed object per route | (a): no breaking change to TB-22's envelope or tests; clients re-check with the shared `checkAiOutput` | Worker per brief |
| D4 | Where prompts live and how versions are logged | (a) `prompts/<route>.v<N>.ts`, wired via `config.ts`, `promptVersion` in the existing log line; (b) prompts in DB/remote config | (a): versioned in git, reviewable, no runtime dependency | Worker per brief |
| D5 | Tolerance | (a) accept one code fence, reject prose; (b) extract the first `{…}` from prose; (c) accept nothing but bare JSON | (a): the fence is a harmless, common wrapper; prose extraction hides model drift and can pick the wrong object | Worker |
| D6 | AC1 evidence | (a) golden set + runner + deterministic mock now, real-model run as owner action, AC1 `partial`; (b) claim AC1 from the mock | (a). The mock proves the repair logic and arithmetic, not model quality | Coordinator brief |
| D7 | "Nothing is persisted" | (a) explicit: gateway has no write path; `onValidOutput` hook called only with validated output, tested never to run on `AI_BAD_OUTPUT`; (b) add a persistence layer | (a) | Coordinator brief |
| D8 | parse `max_tokens` | keep 1024; raise to 2048 | 2048: 25 tasks with notes can exceed 1024 tokens and be cut mid-JSON (a guaranteed `not_json`) | Worker |
| D9 | Reference date for relative dates | UTC; Asia/Manila; client-provided | Asia/Manila (`REFERENCE_TIME_ZONE`) until TB-30 sends the client's local date (the request body is `{ input }` only) | Worker |
| D10 | Local run environment | (a) `supabase functions serve` from this worktree; (b) own edge-runtime container | (b): the shared stack's `supabase_edge_runtime_task-buddy` container was being served by another session; replacing it would break that session. Same image (`edge-runtime:v1.77.8`) on the stack's Docker network, port 54394. See [local-integration.md](local-integration.md) | Worker, 2026-10-28 |

## Deviations (added during build)
| Date | Change | Reason | Approved by |
|---|---|---|---|
| 2026-10-28 | `gateway.ts` and `pipeline.ts` gained small additions (log fields, `ctx.outputCheck`), not only "one file + one line" | The log line is built by the gateway; middleware can't add fields otherwise. Additive, no behaviour change for other middleware | Worker (recorded for the coordinator) |
| 2026-10-28 | Mock provider now returns route-shaped JSON (default all valid) and has `GET /stats` | Old `{"mock":true}` answer would now be `AI_BAD_OUTPUT`; TB-22's `local-check.sh` keeps working (SLOW still detected inside the `<user_input>` block) | Worker |
| 2026-10-28 | Success `usage` is summed over both calls after a repair | TB-22 reported only the last call's usage in the body (the log already summed) | Worker |
| 2026-10-28 | Review fixes: `repair_failed` outcome; delimiter regex covers attributes and self-closing tags; issue lines neutralised; AC1 only assessed on a complete 200-case run; released prompts fingerprinted in a test | Independent review findings 2, 3, 5, 8 ([verification.md](verification.md)) | Worker |
| 2026-10-28 | `pnpm eval` script added to `package.json` | CLAUDE.md §9 names it; TB-39 extends it | Worker |

## Merge note for TB-23 (resolved 2026-10-28 in the merge of `origin/main` @ 09ab8c8)
TB-23 replaces the `MIDDLEWARE` array with `buildMiddleware(deps)` and adds `ctx.providerCalls` (seen by the independent reviewer in its worktree). Whichever PR merges second: keep `outputValidation` as the **last** entry of the built list (innermost), so the rate-limit guard wraps the whole request once and the repair call is metered as a provider call of the same request, not as a new request. Update the registration test in `middleware/output-validation.test.ts` (`MIDDLEWARE.at(-1)`) to read the built list. Known gap: TB-23 checks the quota once before the first call, so a repair can exceed the daily quota by one call. Acceptable. Done: `outputValidation` is last in `buildMiddleware`, and the registration and ledger interaction are covered by tests in `middleware/output-validation.test.ts`.
