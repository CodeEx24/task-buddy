# TB-24 — Intent

> Jira: https://stratyge.atlassian.net/browse/TB-24 · Blueprint: US-010 · Epic EP-04 · Feature FT-14 (Output contracts & safety) · Wave 2 · Risk: **High** (AI gateway, prompt handling)
> Status: Draft → **Accepted by the coordinator on 2026-10-28** (no human was available; the coordinator's brief told the worker to take the recommended option for each open question and record it here and in [spec.md](spec.md))

## Problem
After TB-22 the gateway returns the model's raw text in `output`. Nothing checks that it is JSON, that it has the shape the app expects, or that its strings and lists are bounded. A model slip (prose around the JSON, a wrong enum, a 12-hour time, a 400-item list) would reach the app, and through it the user's task list. Prompts are placeholder strings in `config.ts` with no version, so a quality change can't be traced to the prompt that caused it.

## Desired outcome
- Every `/parse`, `/breakdown` and `/plan` answer is checked against a strict, shared Zod schema before it leaves the gateway.
- An invalid answer gets exactly one automatic repair attempt. If that fails too, the client gets the typed error `AI_BAD_OUTPUT` and the rejected text goes nowhere: not returned, not logged, not stored.
- Each route's prompt is a versioned file in the repo, and every request's log line says which version answered it.
- A committed set of 200 golden inputs, and a runner that measures the validation rate after repair (the AC1 target is ≥ 98 %).

## Affected users
Every signed-in user of AI features (quick-add parse TB-30, breakdown TB-31, plan TB-34). Indirectly the app's gateway client (TB-29), which validates `output` with the same schemas.

## Constraints
- CLAUDE.md §4: validate every external input, **including AI output**, with Zod; shared schemas in `packages/schemas`. The app never calls an LLM directly. AI never changes data without the user's confirmation.
- TB-22 pipeline contract: one middleware file plus one line in `middleware/index.ts`. TB-23 (rate limits) edits the same file in parallel.
- No provider key on this machine: AC1's real-model number can't be measured yet.
- No PII or task text in logs. No secrets in prompts.

## Out of scope
- Prompt quality tuning and content-level golden expectations (TB-30, TB-31, TB-34; eval harness TB-39).
- Rate limits and the usage ledger (TB-23). Input hardening and injection filtering (TB-25).
- Client-side use of the schemas (TB-29 and later).

## Open questions
| # | Question | Why it matters | Answer (who, date) |
|---|---|---|---|
| 1 | What shape does each route return? | Schema = product contract | Strict schemas from the brief: parse = tasks (title, optional due date/time, priority, notes); breakdown = subtasks with minute estimates; plan = time blocks (+ `unscheduled`). See spec D1 (coordinator brief, 2026-10-28) |
| 2 | How many repairs, and what does the repair prompt contain? | Cost and safety | At most one. Fixed `repair.v1` prompt: the original user message unchanged, the validation issues and the rejected answer (capped at 4000 chars). No user id, token or keys (D2) |
| 3 | Does `output` stay a string or become an object? | Wire contract shared with TB-22 tests and the app | Stays a string, now holding the canonical JSON of the validated value (D3) |
| 4 | How is AC1 proven without an API key? | Honest evidence | Golden set + runner + deterministic mock mix; real-model run is an owner step; AC1 stays `partial` (D6) |
| 5 | What does "nothing is persisted" mean when the gateway has no DB writes? | AC2 | Made explicit: no write path exists; the only hook (`onValidOutput`) is called for validated output only, and a test proves it is never called on `AI_BAD_OUTPUT` (D7) |
