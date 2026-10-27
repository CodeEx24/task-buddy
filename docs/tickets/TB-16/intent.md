# TB-16 — Intent

> Jira: https://stratyge.atlassian.net/browse/TB-16 · Blueprint: US-002 · Wave 1 (batch B) · Risk: Medium
> Status: Draft

## Problem
Nothing checks a PR automatically. Lint, typecheck and tests only run when someone remembers to run them locally, and there is no installable development build. TB-15 ran on Expo Go, which can't load custom native modules (NativeWind's Reanimated setup, expo-sqlite config plugins and later notifications all need a dev client).

## Desired outcome
- Every PR to `main` runs lint, typecheck, unit tests and the ticket-docs gate on GitHub Actions in under 8 minutes.
- `eas build --profile development` produces a dev-client build that installs on the Android emulator. iOS gets a simulator build profile.
- `pnpm start` launches the dev client (`expo start --dev-client`), per the TB-15 follow-up.
- `main` can only change through a PR with green CI (see open question 1; GitHub Free limits this on a private repo).

## Affected users
Developers and agents opening PRs, and the owner, who merges them.

## Constraints
- No secrets in the repo. EAS uses the owner's Expo account (`codeex24`). A CI token, if it's ever needed, is a GitHub Actions secret named `EXPO_TOKEN` (name only, never the value).
- Private repo on GitHub Free: branch protection and rulesets return HTTP 403 ("Upgrade to GitHub Pro or make this repository public"), verified 2026-10-27 with `gh api repos/CodeEx24/task-buddy/branches/main/protection`.
- macOS runner minutes cost 10× on private repos, so any iOS-simulator job is manual-only.
- The owner is the only developer. GitHub doesn't let an author approve their own PR.

## Out of scope
EAS Submit and store builds (TB-38), EAS Update channels (TB-38), Sentry source maps (TB-37), Maestro E2E in CI (TB-52).

## Open questions
| # | Question | Why it matters | Answer (who, date) |
|---|---|---|---|
| 1 | Branch protection is unavailable on a private Free repo: upgrade to Pro, make the repo public, or accept an exception? | AC3 can't be met as written without a plan change | |
| 2 | May Claude run `eas init` (links the project to the `codeex24` Expo account) and queue a free-tier Android dev build? | Outward-facing, uses build quota | |
