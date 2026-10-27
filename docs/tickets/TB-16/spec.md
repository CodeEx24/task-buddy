# TB-16 — Spec

> Jira: https://stratyge.atlassian.net/browse/TB-16 · Intent: [intent.md](intent.md)
> Status: **Accepted by the owner on 2026-10-27** ("accept all")

## Acceptance criteria (verbatim from Jira)
- [ ] Given a PR, when it is opened, then GitHub Actions runs lint, typecheck and unit tests and finishes in under 8 minutes
- [ ] Given `eas build --profile development`, then a dev-client build is produced and installs on a device or simulator
- [ ] Branch protection requires green CI and one review before merge to main
- [ ] Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated

## Behaviour
- **AC1:** `.github/workflows/ci.yml` runs on `pull_request` to `main` and on `push` to `main`. One `ubuntu-latest` job, `timeout-minutes: 8`, with `concurrency` cancelling superseded runs on the same ref. Steps: checkout → `pnpm/action-setup` (version read from `packageManager`) → `actions/setup-node` (Node 24, `cache: pnpm`) → `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm test --ci` → `node scripts/workflow/check-ticket-docs.mjs --branch "$HEAD_REF" --pr` (PRs only). A failure in any step fails the check `ci`.
- **AC2:** `eas.json` profiles:
  - `development`: `developmentClient: true`, `distribution: internal`, Android `buildType: apk`, iOS `simulator: true`.
  - `preview`: internal distribution.
  - `production`: `autoIncrement`, with `appVersionSource: remote`.
  
  `expo-dev-client` is installed and `pnpm start` becomes `expo start --dev-client`. Evidence: the EAS build URL, then `eas build:run -p android` installing the APK on the `Medium_Phone_API_37.0` emulator and opening the app on the home screen.
- **AC3:** depends on open question 1 (see Decisions).
- **Manual iOS job:** `.github/workflows/ios-simulator.yml` runs on `workflow_dispatch` only, on `macos-latest`. It runs `npx expo prebuild -p ios` plus `xcodebuild` for the simulator, then boots the app and checks the home screen. This covers the TB-15 iOS-simulator follow-up without spending macOS minutes on every PR.

## Technical design
- **Owned paths (wave plan):** `.github/workflows/**`, `eas.json`, the README build section, plus the `start` script line and the `expo-dev-client` dependency in `package.json` (a shared file: rebase and run `pnpm install`, never hand-merge the lockfile).
- **Interfaces:** the CI check is named `ci`, and later tickets add jobs to it rather than new workflows where possible.
- **Data changes:** none. `app.json` gains `extra.eas.projectId` and `owner` from `eas init`.
- **Reuse:** the existing `pnpm lint/typecheck/test` scripts and `scripts/workflow/check-ticket-docs.mjs`.

## Edge cases
| Case | Expected |
|---|---|
| Lockfile out of date | `--frozen-lockfile` fails the job with a clear message |
| Docs-only PR | CI still runs. It's fast (<3 min) and keeps the required check uniform |
| PR from a branch without `TB-###` | The ticket-docs gate fails, which is intended |
| EAS free-tier queue is slow | The build still counts. Record the queue time in verification |

## Security, privacy & AI cost
- No secrets in workflows. `permissions: contents: read` at the workflow level.
- Actions pinned to major versions from GitHub's verified publishers (`actions/*`, `pnpm/action-setup`).
- The EAS project ID is not a secret. `EXPO_TOKEN` isn't needed for this ticket (builds are run locally by the owner's CLI session).

## Decisions
| Decision | Options considered | Choice | Decided by / date |
|---|---|---|---|
| Branch protection (AC3) | GitHub Pro · make repo public · accept exception | **Make the repo public** (after a full-history secret scan), then protect `main`: PR required, required check `ci`, 1 approval, admins may bypass (a solo author can't approve their own PR) | Owner, 2026-10-27 |
| Who runs `eas init` + the first build | Claude via the owner's logged-in CLI · owner runs it | Claude runs `eas init` and **one Android** dev build (free tier). The iOS simulator profile is configured, not built | Owner, 2026-10-27 |
| iOS-simulator job trigger | every PR · nightly · manual | manual (`workflow_dispatch`), 10× macOS minute cost | proposed |

## Deviations (added during build)
| Date | Change | Reason | Approved by |
|---|---|---|---|
| 2026-10-27 | The ticket-docs gate skips **draft** PRs; CI also runs on `ready_for_review` | `verification.md` is finished last (TB-16's own AC1 evidence needs CI to have run), so the gate would be red on every early push | Coordinator (within the accepted plan's intent) |
| 2026-10-27 | Added `ios.bundleIdentifier` / `android.package` = `com.codeex24.taskbuddy` and `owner: codeex24` in `app.json`; removed an unrelated `extra.router.asyncRoutes` that `eas init` inserted | EAS builds need app identifiers; the identifier can still change until store submission (TB-38) | Coordinator; flagged to owner |
