# TB-### — Implementation plan

> Jira: https://stratyge.atlassian.net/browse/TB-### · Spec: [spec.md](spec.md)
> Bar: an engineer who has never seen the conversation could implement the change from this plan alone.

## Branch & worktree
`<type>/tb-###/<slug>` · Owns: `<paths>` · Must not edit: `<paths>` · Shared-file rules: …

## Dependencies
Blocked by: … (verified Done in Jira on <date>)

## Tasks
### Task 1 — <name>
- [ ] Step …
- Files: …
- Verify: <test name / command>

### Task 2 — …

## Test strategy
| AC | Test (layer) | File |
|---|---|---|

Unit, integration, RLS (`supabase/tests`), E2E (`.maestro/`), and eval cases where relevant.

## Risks & rollback
<What could break, how to detect it, how to revert: migration down, feature flag, OTA rollback.>
