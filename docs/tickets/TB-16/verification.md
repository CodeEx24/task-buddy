# TB-16 — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-16 · PR: https://github.com/CodeEx24/task-buddy/pull/5 · Branch: `ci/tb-16/ci-and-eas-profiles`
> Record only what was actually run and observed.

## Commands run
All on 2026-10-27. Local: Windows 11, Node 24.21.0, pnpm 10.17.1, EAS CLI 26.0.0 (`npx eas-cli@26`).

| Command | Result | Notes |
|---|---|---|
| `pnpm expo install expo-dev-client` | pass | `expo-dev-client ~58.0.15` |
| `pnpm lint` / `pnpm typecheck` / `pnpm test --ci` | pass | exit 0 / exit 0 / 2 suites, 3 tests |
| `npx expo-doctor` | pass | 20/20 checks |
| `npx yaml@2 valid < .github/workflows/*.yml` | pass | both workflows parse (`actionlint` not installed) |
| `node scripts/workflow/check-ticket-docs.mjs --branch ci/tb-16/ci-and-eas-profiles` | pass | `workflow check: ok` |
| `npx eas-cli@26 whoami` | pass | logged in as `codeex24` |
| `npx eas-cli@26 init --non-interactive --force` | pass | created `@codeex24/task-buddy`, project id `8306464d-a85a-4d66-bfff-0c692061bded` |
| `npx eas-cli@26 build --profile development --platform android --non-interactive --no-wait` | pass | build [`cd19a23e`](https://expo.dev/accounts/codeex24/projects/task-buddy/builds/cd19a23e-2ca0-44c8-a717-d86d4f533dd3), queued 10:38:40Z, finished 10:55:44Z (~17 min, free tier). APK artifact produced. EAS generated the Android keystore in the cloud (stored in the owner's Expo account) |
| `npx eas-cli@26 build:run -p android --id cd19a23e-…` | pass | "Successfully installed your app"; `pm list packages` → `com.codeex24.taskbuddy` |
| GitHub Actions `ci` on PR #5, run [40490345103](https://github.com/CodeEx24/task-buddy/actions/runs/40490345103) | pass (2nd attempt) | started 10:41:57Z, completed 10:42:36Z = **39 s**. Steps: Install, Lint, Typecheck, Unit tests ✓; Ticket docs gate skipped (draft) |
| Negative check: commit `2214215` adding `export const bad: any = 1`, run [40490640996](https://github.com/CodeEx24/task-buddy/actions/runs/40490640996) | pass | The check worked: CI run was **red, as intended**: `error Unexpected any … @typescript-eslint/no-explicit-any`; reverted in `d2f06e8`, next run green (38 s) |
| `gh api -X PUT repos/CodeEx24/task-buddy/branches/main/protection` then `GET` | pass | read back: checks `["ci"]`, strict, 1 approval, `enforce_admins: false`, no force-push, linear history |

Failures hit and fixes:
1. **CI did not start** (first attempt, 3 s, no steps). Annotation: *"The job was not started because recent account payments have failed or your spending limit needs to be increased."* The repo was private on a GitHub account with a billing problem. Per the owner's decision the repo was made public (after a clean full-history secret scan), and the re-run passed. **Owner:** check *GitHub → Settings → Billing & plans* if you ever make a repo private again.
2. **Ticket-docs gate vs drafts:** the gate fails until `verification.md` is complete, which can't happen before CI has run once. It now skips draft PRs, and CI also runs on `ready_for_review` (Deviation in spec).
3. `eas init` inserted an unrelated `extra.router.asyncRoutes.web: true` into `app.json`; removed (it would change web routing).
4. The dev client showed Android's "nearby devices" permission prompt (dev-launcher server discovery); answered *Don't allow*. Then the first-run dev-menu tip; dismissed. Neither appears in production builds.
5. Git Bash rewrote `/sdcard/...` paths for `adb shell`; used `MSYS_NO_PATHCONV=1`.

## Acceptance criteria
| AC (verbatim) | Status | Evidence |
|---|---|---|
| Given a PR, when it is opened, then GitHub Actions runs lint, typecheck and unit tests and finishes in under 8 minutes | met | Run 40490345103: Lint, Typecheck, Unit tests passed in 39 s (`timeout-minutes: 8` enforces the bound). Negative run 40490640996 failed on a lint error |
| Given `eas build --profile development`, then a dev-client build is produced and installs on a device or simulator | met | EAS build `cd19a23e` FINISHED with an APK; installed on emulator `Medium_Phone_API_37.0`; loaded the JS bundle from Metro (`Android Bundled 1109ms … (1281 modules)`); focused window `com.codeex24.taskbuddy/.MainActivity`; UI tree has `resource-id="home-screen"` + "Task Buddy". [Screenshot](android-dev-client-home.png). iOS: simulator profile configured, not built (owner decision) |
| Branch protection requires green CI and one review before merge to main | met | Repo made public (owner decision). Protection read back from the API: required check `ci` (strict), 1 approving review, admins may bypass because a solo author can't approve their own PR. PR #5 shows `mergeStateStatus: BLOCKED` while unapproved |
| Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated | met | CI is the test (green + proven red). Existing 3 tests pass; expo-doctor 20/20. Independent reviewer run (below). Ticket docs complete. The human PR review happens at merge |

## Manual / E2E
- Dev client on the Android emulator: `npx expo start --dev-client --port 8083`, `adb reverse tcp:8083 tcp:8083`, then the deep link `taskbuddy://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8083` opened the app on the home screen (screenshot above).
- iOS-simulator workflow (`ios-simulator.yml`): manual only; **not run** (macOS minutes; owner can run it from the Actions tab).

## Review findings
| # | Severity | Finding (file:line) | Source | Resolution |
|---|---|---|---|---|
| 1 | Important | `ios-simulator.yml` boot step: device pick order not guaranteed, no wait for boot, a launch crash wouldn't fail the job | reviewer agent | Fixed: newest iOS runtime picked, `simctl bootstatus -b`, `launchctl list` check fails the job if the app isn't running. Still never run (manual, owner's call) |
| 2 | Nit | `ci.yml` concurrency cancels in-progress runs on `main` too | reviewer agent | Fixed: `cancel-in-progress` only for `pull_request` |
| 3 | Nit | `ios-simulator.yml`: Icon Composer icon needs a recent Xcode on the runner | reviewer agent | Noted in the workflow header; pin Xcode if a run fails |
| 4 | Nit | Screenshot and `verification.md` not committed | reviewer agent | Fixed: committed with this record |
| — | — | Security: `pull_request` (not `_target`), read-only token, no secrets, `head_ref` passed via env and quoted | reviewer agent | No issue |

## Known limitations & follow-ups
- Agents can't merge under the 1-approval rule without `--admin`. The owner merges, or explicitly allows `gh pr merge --squash --admin` (documented in `docs/workflow/README.md`).
- App id `com.codeex24.taskbuddy` can change freely until store submission (TB-38).
- The iOS-simulator workflow has never run; first run is the owner's call.
- `.github/workflows` use `actions/*@v4` major tags; pinning to SHAs could follow if supply-chain policy tightens.

## Completion
- [x] All AC met with evidence
- [x] Gates green locally and in CI
- [x] No open Blocking findings
- [ ] Jira updated (In Review → Done)
