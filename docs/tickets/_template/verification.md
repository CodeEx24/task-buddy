# TB-### — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-### · PR: <link> · Branch: `<branch>`
> Record only what was actually run and observed. `node scripts/workflow/check-ticket-docs.mjs --branch <branch> --pr` fails the PR gate while any AC row is `not met`, `partial` or `TBD`.

## Commands run
| Command | Result | Notes |
|---|---|---|
| `pnpm lint` | pass / fail | |
| `pnpm typecheck` | | |
| `pnpm test` | | N passed |

<Paste the relevant failing output and the re-run after each fix.>

## Acceptance criteria
| AC (verbatim) | Status | Evidence (test name, file:line, screenshot, observed result) |
|---|---|---|
| … | met | |

## Manual / E2E
Environment, account or role, steps, observed result, screenshots. Include a negative check (a user who must *not* see or do this) when permissions are involved.

## Review findings
| # | Severity | Finding (file:line) | Source (self / reviewer agent / human) | Resolution |
|---|---|---|---|---|

## Known limitations & follow-ups
…

## Completion
- [ ] All AC met with evidence
- [ ] Gates green locally and in CI
- [ ] No open Blocking findings
- [ ] Jira updated (In Review → Done)
