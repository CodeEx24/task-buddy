# Add the Deno type check for Edge Functions to CI

> Related: TB-22 (https://stratyge.atlassian.net/browse/TB-22) | Wave 2 | PR for `feat/tb-22/ai-gateway-edge-function`
> Status: Open · Created by: Claude Code on 2026-10-28

## Purpose
The AI gateway's unit tests already run in the required `ci` job. What CI doesn't check yet is that the function also type-checks **under Deno**, the runtime Supabase actually uses (Deno globals, `npm:` imports, the function's `deno.json`). A mistake there passes `pnpm typecheck` but fails at deploy. Agents can't edit `.github/workflows/*.yml` (a protected-path hook blocks it), so this is yours to paste. About 5 minutes.

## Prerequisites
- Write access to https://github.com/CodeEx24/task-buddy.
- The TB-22 PR merged (the job checks `supabase/functions/ai-gateway/index.ts`).
- Credentials needed: none.

## Steps
1. Open `.github/workflows/ci.yml` on a new branch, e.g. `ci/tb-22/deno-check`.
2. Copy the `edge-functions:` job from [`docs/tickets/TB-22/ci-deno-check.yml`](../tickets/TB-22/ci-deno-check.yml) and paste it under `jobs:`, after the `bundle` job. Keep its two-space indentation so it lines up with `ci:`, `supabase:` and `bundle:`.
3. Commit (`ci(supabase): deno type check for edge functions (TB-22)`), push, and open a PR.
4. Optional: once it has run on `main`, add `edge-functions` as a required check (Settings → Branches → `main` → Require status checks), next to `ci`, `supabase` and `bundle`.

## Expected result
The PR shows a fourth check, `edge-functions`, which passes in under a minute with a line like `Check file:///…/supabase/functions/ai-gateway/index.ts`.

## Verify
`gh pr checks <pr-number>` lists `edge-functions  pass`. Claude can run this for you.

## Completion checklist
- [ ] Job pasted into `ci.yml`
- [ ] PR opened and `edge-functions` green
- [ ] (Optional) `edge-functions` added as a required check
- [ ] Status above set to Done

## If it fails
- **YAML error / the workflow doesn't start:** the job is mis-indented. `edge-functions:` must have exactly two spaces before it, like `bundle:`.
- **`deno check` reports a type error:** real finding. Ask Claude to fix it on a branch; the error names the file and line.
- **`setup-deno` can't find `v2.1.4`:** use `v2.x`; then tell Claude so the pinned version is updated in the ticket file.
