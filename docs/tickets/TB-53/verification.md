# TB-53 — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-53 · PR: https://github.com/CodeEx24/task-buddy/pull/29 · Branch: `feat/tb-53/data-export-account-deletion`
> Record only what was actually run and observed. Device check (Android, new dev build) is done by the orchestrator after this PR; see "Manual / E2E".

## Commands run
| Command | Result | Notes |
|---|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts` + `pnpm rebuild better-sqlite3` | pass | fresh worktree |
| `npx expo install expo-sharing expo-file-system` | pass | `expo-sharing` 58.0.21, `expo-file-system` 58.0.13; `expo-sharing` config plugin added to `app.json` (share-extension options off by default) |
| `pnpm lint` | pass | 0 problems |
| `pnpm typecheck` | pass | |
| `pnpm test --ci --maxWorkers=1` | pass | `Test Suites: 90 passed, 90 total` · `Tests: 761 passed, 761 total` (app + edge-functions; after merging `origin/main` with TB-33; before the merge: 86 / 723) |
| `pnpm exec drizzle-kit check` | pass | "Everything's fine" (no local schema change) |
| `supabase test db --db-url postgresql://…@127.0.0.1:55322/postgres?sslmode=disable` (CLI 2.122.0) | pass | `Files=5, Tests=105 … Result: PASS` (new `account_deletion.test.sql`: 14) |
| `bash scripts/account/local-delete-check.sh` against the local stack + own edge-runtime container | pass | [local-integration.md](local-integration.md) |
| `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-53/data-export-account-deletion --pr` | pass | `workflow check: ok` (its only finding before this row was filled in was this row itself) |

Failures on the way and fixes:
- First full Jest run: `account-routes.test.tsx` export case failed (0 share calls) and `app-shell-routes.test.tsx` timed out at 5 s once. Cause of the first: the export module had just been switched to `await import()`, which Jest (jest-expo, no VM modules) can't load; replaced by a typed lazy `require` in `load-share-module.ts` (Metro inlines it). The app-shell timeout was a cold-start one-off while files were being edited mid-run; it passed in the next full run (below).
- `supabase test db --db-url` without `sslmode=disable` → "server does not support SSL"; re-run with it.

## Acceptance criteria
| AC (verbatim) | Status | Evidence (test name, file:line, screenshot, observed result) |
|---|---|---|
| Given Settings > Account, when I request export, then a JSON file of my tasks is generated and shared via the OS share sheet | met | `account-routes.test.tsx` "Export my data: Settings tab → Export (2 taps) shares a JSON file of my tasks": `Sharing.shareAsync` called with a `file://…/data-export/task-buddy-export-YYYY-MM-DD.json` URI and `application/json`; the written file parses and holds the task. `data-export.test.ts`: versioned document from a seeded DB (lists, tasks with tags/steps, tags; ISO dates; `dueDate` local), deleted rows excluded, empty DB valid, share-unavailable and failure paths. Device: orchestrator, new dev build |
| Given I confirm deletion, then my server data and AI usage rows are deleted within 24 hours and I am signed out | met | Real local stack ([local-integration.md](local-integration.md)): one call → user A's Auth user, identity, session, refresh token, profile, lists, tasks (tombstone incl.), subtasks, 2 ledger rows, 2 counters all 0 immediately; user B unchanged; retry → `already_deleted`; refused calls change nothing. `account_deletion.test.sql` (cascade guard for every current/future table + delete/isolation). `handler.test.ts` / `clients.test.ts` (authz, idempotency, errors, no PII in logs). App: `account-routes.test.tsx` "Delete … (3 taps) deletes, signs out and wipes the device" (signOut `{scope:'local'}`, sign-in screen shown, DB emptied + retired); `delete-account.test.ts` (order; offline/session/failed change nothing); `user-db.test.ts`, `pending-wipe.test.ts` (local wipe, other account untouched, retries) |
| The flow is reachable in 3 taps and satisfies store account-deletion rules | met | Export: Settings tab → Export my data (2 taps). Delete: Settings tab → Delete account → Delete (3 taps), asserted in `account-routes.test.tsx`. Apple 5.1.1(v): in-app, deletes the account itself (hard delete of the Auth user + all data), not deactivation. Google Play: in-app path + web path = the published privacy page `#delete-account` (email route). The page's wording still says "coming in a future update": owner action [account-deletion-deploy.md](../../actions/account-deletion-deploy.md) step 4 (legal wording is the owner's call; must be done before TB-64 submission) |
| Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated | met | New tests: 2 edge-function suites, 1 pgTAP file, 5 app suites/sections (see Commands run); full suite green; independent reviewer agent (findings below, all resolved or recorded); `docs/tickets/TB-53/` intent/spec/plan/verification/local-integration. Human PR review + merge: orchestrator |

## Manual / E2E
Not run by this agent (no Metro/emulator by instruction). **Needs a new EAS dev build** (expo-sharing, expo-file-system). Steps for the orchestrator, Android, with a **throwaway** account only:
1. Install the new dev build; `pnpm start`; sign in with a throwaway email (Mailpit at `http://127.0.0.1:55324` if the build points at the local stack, otherwise the dev project's inbox).
2. Create 2 tasks (one with a due date and a step), wait for "All changes backed up." in Settings.
3. Settings tab → **Export my data** → the Android share sheet opens with `task-buddy-export-<date>.json`; share to Drive/Files or Gmail and open it: `format: task-buddy-export`, `version: 1`, both tasks, the step nested.
4. Turn on airplane mode → Settings → **Delete account** → **Delete** → alert "Account not deleted / You're offline…"; still on Settings with tasks intact. Turn airplane mode off.
5. Settings → **Delete account** → **Cancel** → nothing happens.
6. Settings → **Delete account** → **Delete** → the sign-in screen appears. (Requires the `delete-account` function deployed to the project the build points at; for the local stack: `supabase functions serve` or an edge-runtime container as in local-integration.md.)
7. Check the server: the user is gone from Authentication → Users (or `select count(*) from auth.users where email = '<throwaway>'` → 0) and `tasks`/`ai_usage_ledger` have no rows for that id.
8. Sign in again with the same email → a new, empty account (no old tasks).
Negative check: a second throwaway account signed in on another device/emulator keeps its data.

## Review findings
| # | Severity | Finding (file:line) | Source | Resolution |
|---|---|---|---|---|
| 1 | Blocking | Deleting the account that owns the legacy `taskbuddy.db` deleted the file; the next account would claim a fresh legacy file and lose track of its own `taskbuddy-<id>.db` | reviewer agent | Fixed: the legacy file is emptied, VACUUMed and marked `retired` (`user-db.ts` `retireDb`/`wipeUserDb`); test "review fix: deleting the legacy owner keeps another account's own file reachable" |
| 2 | Important | Privacy policy §9 still says in-app deletion is "coming"; Play's web path is that paragraph | reviewer agent | Owner action (legal wording): [account-deletion-deploy.md](../../actions/account-deletion-deploy.md) step 4; called out in the PR as an open pre-submission item |
| 3 | Important | verification.md missing | reviewer agent | This file |
| 4 | Important | A failing step stopped the wipe; nothing retried | reviewer agent | Fixed: every step attempted (`LocalWipeError`), and wipes are owed in `pending-wipe.ts` until they succeed |
| 5 | Important | App killed between server delete and wipe leaves data on the device | reviewer agent | Fixed: the owed wipe is persisted (SecureStore) before sign-out and runs before any DB opens on the next launch |
| 6 | Nit | Wipe ran while screens/sync could still read the DB | reviewer agent | Fixed: the wipe runs from `useDbMigrations` after the signed-out render |
| 7 | Nit | iOS `deleteDatabaseSync` sidecars | reviewer agent | Checked: expo-sqlite 58 iOS `deleteDatabaseFiles` removes sidecars too (`removeSidecarFiles`); the legacy file is compacted with `wal_checkpoint(TRUNCATE)` |
| 8 | Nit | Export files stay in the cache after sharing | reviewer agent | Kept on purpose (Android hands the URI to the receiving app asynchronously); overwritten per day, removed on deletion, OS-clearable. Recorded below |
| 9 | Nit | No rate limit on `delete-account` | reviewer agent | Accepted: every call needs a live session and costs one Auth lookup; recorded below |
| 10 | Self | A static import of the new native modules would crash an older binary at startup | self-review | Fixed: `load-share-module.ts` lazy load |

Security pass: the reviewer prompt covered authz, idempotency, secrets/PII in logs and the threat list in spec.md (T1–T6); no authz finding.

## Known limitations & follow-ups
- **Privacy policy wording** (owner): §9 "Deleting your account" and "Your choices and rights". Before TB-64.
- **Hosted deploy** (owner): `supabase functions deploy delete-account` to dev and staging.
- Supabase Auth's audit log (`auth.audit_log_entries`) keeps sign-up/login/`user_deleted` events with the email until Supabase's log retention removes them; mentioned in the suggested policy wording. Possible follow-up: a scheduled purge of audit entries older than N days.
- If the app is killed after the server delete but before sign-out, the still-valid access token can keep the deleted user "signed in" (with an empty, freshly wiped DB) until it expires (≤ 1 h); every server call fails meanwhile. Follow-up candidate: sign out when the owed-wipe list contains the current user.
- Export files remain in the app cache until the next export that day, account deletion or OS cleanup.
- No per-user rate limit on `delete-account` (low impact; needs a live session).
- Import of an export file is not implemented (format is versioned for it).

## Completion
- [x] All AC met with evidence (device check pending with the orchestrator on the new dev build)
- [ ] Gates green in CI (pending the PR run)
- [x] No open Blocking findings
- [ ] Jira updated (In Review now → Done by the orchestrator)
