# Review guide — Task Buddy

Used by the self-review (phase 8 of `/implement-ticket`), the independent reviewer subagent, `/senior-pr-reviewer`, and human reviewers. AI review informs the human decision. It never approves or blocks a merge on its own: branch protection and a human do that.

## Inputs a reviewer needs

The Jira AC (verbatim), `docs/tickets/TB-###/spec.md` and `plan.md` (or `README.md`), the full diff, and the gate output. A reviewer gets **no conversation history**. That is the point of an independent pass.

## Passes (run all four, report separately)

1. **Spec compliance.** Is every AC met with evidence? Anything built that the spec doesn't ask for? Any deviation that isn't recorded in `spec.md`?
2. **Correctness.** Empty, null and boundary values. Timezones and dates (`dueAt`, user timezone, DST). Offline and sync paths, soft deletes (`deleted_at`). Error paths that swallow failures. Concurrency and ordering.
3. **Security and Task Buddy invariants** (CLAUDE.md §4, AGENTS.md):
   - No LLM call outside `supabase/functions/ai-gateway`. No provider key or secret in app code; `EXPO_PUBLIC_*` values are non-secret.
   - Every gateway route checks auth, rate limit and quota, and validates the output with Zod. On failure it returns `AI_BAD_OUTPUT` and never persists unvalidated output.
   - AI-proposed changes need explicit user confirmation. The server never executes actions from user text.
   - Every new or changed Postgres table has RLS and a test in `supabase/tests`. Synced tables keep `id (UUIDv7)`, `updated_at`, `deleted_at`.
   - No task text or notes in logs, Sentry breadcrumbs or analytics.
4. **Tests and maintainability.** Do the tests fail without the change? Does each AC have a test at the right layer? Reuse-first (no duplicate component, hook or util)? Naming per CLAUDE.md §4? Strict TypeScript, no `any`?

## Severity

| Level | Meaning | Merge? |
|---|---|---|
| **Blocking** | Violates an invariant, an AC is unmet, a security or data-loss risk, a failing or missing test for an AC | No, until fixed |
| **Important** | A likely bug or a maintainability cost that will hurt soon | Fix in this PR, or open a Jira follow-up with your agreement |
| **Nit** | Style or preference | Optional. Don't bundle many nits as one Important |

Every finding needs `file:line`, a concrete failure scenario, and a suggested fix. Verify a finding before reporting it.

## Where findings go

Record them in the "Review findings" table in `verification.md` with their resolution. Summarize them in the PR description.

## Adding rules

When the same finding shows up on two tickets, add it here (or as a lint rule or hook if it can be checked mechanically). Promote it to CLAUDE.md at the next Epic boundary.
