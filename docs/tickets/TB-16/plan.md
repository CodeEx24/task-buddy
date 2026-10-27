# TB-16 — Plan

> Jira: https://stratyge.atlassian.net/browse/TB-16 · Spec: [spec.md](spec.md)
> Branch: `ci/tb-16/ci-and-eas-profiles` · Orca worktree `tb-16-ci-eas` · Merge order: **1st** in batch B (TB-16 → TB-17 → TB-21 → TB-19)
> Status: Draft

## Goal
Every PR is checked by CI in under 8 minutes, a dev-client build installs on the Android emulator, and `main` is protected.

## Owned paths
`.github/workflows/**`, `eas.json`, README "Build & CI" section, `docs/tickets/TB-16/**`, `docs/actions/**` (if a guide is needed). Shared: `package.json` (the `start` script line + `expo-dev-client`), `pnpm-lock.yaml` (regenerate, never hand-merge), `app.json` (`extra.eas`, `owner` written by `eas init`).

### Task 1 — CI workflow
- [ ] `.github/workflows/ci.yml` as in spec AC1 (`permissions: contents: read`, `concurrency`, `timeout-minutes: 8`).
- [ ] `pnpm test` gets `--ci` in the workflow only (the local script stays the same).
- [ ] Ticket-docs gate step on `pull_request` only, using `github.head_ref`.
- **Verify:** push the branch and open the PR; the `ci` check runs and passes; record the duration from `gh run view`. Negative check: a temporary commit with a lint error turns the check red, then is reverted.

### Task 2 — Dev client and EAS profiles
- [ ] `pnpm expo install expo-dev-client`; `start` becomes `expo start --dev-client`; README updated (Expo Go is no longer the default).
- [ ] `eas.json` with `development` / `preview` / `production` profiles (spec AC2).
- [ ] `npx eas-cli@26 init` (owner's `codeex24` session) → `app.json` `extra.eas.projectId` + `owner`.
- [ ] `npx eas-cli@26 build --profile development --platform android --non-interactive` → APK.
- [ ] `npx eas-cli@26 build:run -p android --latest` installs it on `Medium_Phone_API_37.0`; `pnpm start` → app opens in the dev client on the home screen; screenshot.
- **Verify:** build URL and status `finished`; `adb shell pm list packages` shows the app id; screenshot in `docs/tickets/TB-16/`.
- If `eas` needs an interactive login, stop and write `docs/actions/eas-login.md` (use `--no-browser`-style login, never a password in chat).

### Task 3 — Manual iOS-simulator job
- [ ] `.github/workflows/ios-simulator.yml`, `workflow_dispatch` only, `macos-latest`, `timeout-minutes: 30`: install → `npx expo prebuild -p ios` → `xcodebuild` for the simulator → boot, install, launch → screenshot artifact.
- **Verify:** not run automatically (cost). Lint the YAML with `actionlint` if available; one manual run only with the owner's OK.

### Task 4 — Make the repo public and protect `main` (owner decision, 2026-10-27)
- [ ] Re-run the full-history secret scan right before the flip (done once on 2026-10-27: clean).
- [ ] `gh repo edit CodeEx24/task-buddy --visibility public --accept-visibility-change-consequences`.
- [ ] After the `ci` check has run once on the PR: `gh api -X PUT repos/CodeEx24/task-buddy/branches/main/protection` with required status check `ci` (strict), required PR reviews (1 approval), `enforce_admins: false` (owner bypass), no force-push, no deletion.
- **Verify:** `gh api repos/CodeEx24/task-buddy/branches/main/protection` returns the rule; the PR shows "Required" on `ci`.
- **Rollback:** `gh repo edit --visibility private` (anything already cloned stays public), and `gh api -X DELETE …/protection`.

### Task 5 — Docs and verification
- [ ] `verification.md` with commands, CI duration, build URL, screenshots, AC table.
- [ ] Update the workflow README: the CI check exists, and `/merge-ticket` needs the owner (or an explicit `--admin` go-ahead) because of the 1-approval rule.

## Test plan
CI itself is the test: green on the PR, red on a deliberate lint error. Device check for the dev client. Protection rule read back from the API.

## Risks and rollback
- EAS free-tier queue can be slow → record the wait; it doesn't block AC1/AC3.
- Required approvals block agent merges → owner merges, or explicitly allows `gh pr merge --admin`.
- Going public exposes code, docs and commit author emails (see the PR note). Irreversible for anyone who cloned in the meantime.
