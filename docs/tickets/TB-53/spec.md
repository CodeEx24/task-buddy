# TB-53 — Spec

> Jira: https://stratyge.atlassian.net/browse/TB-53 · Intent: [intent.md](intent.md) · Plan: [plan.md](plan.md)
> Status: **Accepted by the orchestrator on 2026-10-28** (owner unavailable; decisions below follow the coordinator's brief).

## Acceptance criteria (verbatim from Jira)
- [x] AC1 Given Settings > Account, when I request export, then a JSON file of my tasks is generated and shared via the OS share sheet
- [x] AC2 Given I confirm deletion, then my server data and AI usage rows are deleted within 24 hours and I am signed out
- [x] AC3 The flow is reachable in 3 taps and satisfies store account-deletion rules
- [x] AC4 Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated

## Behaviour

### Export (AC1)
- Settings tab → Account card → **Export my data** (2 taps). A spinner shows on the button while the file is built; the OS share sheet opens with `task-buddy-export-YYYY-MM-DD.json` (`application/json`, UTI `public.json`).
- Built from the signed-in account's **local** DB, so it works offline and includes edits not yet synced.
- Contains **live** rows only: lists, tasks (with their tag names and steps nested), tags. Deleted tasks, steps, lists and tags (tombstones kept for undo/sync) are left out; steps of a deleted task are left out.
- The file goes to the app cache, in `data-export/`. It's overwritten by the next export the same day and removed on account deletion; the OS may also clear the cache.
- Errors: no share support → "Sharing isn't available on this device."; anything else → "Couldn't create the export. Please try again." Inline under the button. Cancelling the share sheet is not an error.

Format (`dataExportSchema`, `src/features/account/schema.ts`), version 1:
```json
{
  "format": "task-buddy-export", "version": 1, "exportedAt": "2026-10-28T12:00:00.000Z", "app": "Task Buddy",
  "counts": { "lists": 1, "tasks": 2, "subtasks": 2, "tags": 1 },
  "lists": [{ "id", "name", "color", "sortOrder", "createdAt", "updatedAt" }],
  "tasks": [{ "id", "listId": "… | null (Inbox)", "title", "notes", "status": "open|done", "priority": "0–3",
              "dueDate": "YYYY-MM-DD | null", "completedAt", "sortOrder", "createdAt", "updatedAt",
              "tags": ["name"], "subtasks": [{ "id", "title", "isDone", "sortOrder", "createdAt", "updatedAt" }] }],
  "tags": [{ "id", "name", "color" }]
}
```
Timestamps are ISO 8601 UTC; `dueDate` is the local calendar date the user picked (due dates are date-only, TB-26).

### Delete account (AC2, AC3)
1. Settings tab (tap 1) → Account card → **Delete account** (red, last row; tap 2) → native confirmation "Delete your account?" explaining that the account, synced tasks/lists/steps and AI usage records are deleted from our servers and the device copy is removed, that it can't be undone, and pointing to Export first → **Delete** (destructive, tap 3) or **Cancel**.
2. The app calls the `delete-account` Edge Function with the user's access token and `{ "confirm": "DELETE" }`. The button shows a spinner.
3. The function hard-deletes the Supabase Auth user. Postgres removes every row the user owns **in the same transaction** (cascade). This is immediate, well inside "within 24 hours".
4. On 200 (`deleted` or `already_deleted`) the app records the account id as owed a local wipe (memory + SecureStore), signs out locally (session removed from SecureStore; the route guard shows sign-in) and deletes export files. Once the signed-out tree has rendered (screens and sync unmounted), `useDbMigrations` runs the owed wipe: the account's own `taskbuddy-<id>.db` is deleted; if the account owned the legacy `taskbuddy.db`, that file is emptied in one transaction, `VACUUM`ed (plus a WAL checkpoint) and marked `retired` so nobody claims it again. A wipe that fails, or an app killed before it ran, is retried before any DB is opened on the next launch or sign-in.
5. Failure → an alert "Account not deleted" with: offline "You're offline. Connect to the internet and try again. Nothing was deleted."; 401 "Your session has expired. Sign out, sign in again, then delete your account."; anything else "Something went wrong and nothing was deleted. Please try again." The user stays signed in with all data. Nothing is queued.
6. Cancel does nothing.

After deletion, signing in with the same email creates a brand-new, empty account (TB-20 D9-A creates accounts on first code).

## Technical design
- **Surfaces**
  - `src/features/account/` (new feature): `schema.ts` (export format), `repo/export-repo.ts` (one read transaction over lists/tasks/subtasks/tags/task_tags), `export/build-data-export.ts` (pure), `export/share-data-export.ts` (expo-file-system `File`/`Directory`/`Paths.cache` + `expo-sharing`), `remote/account-remote.ts` (+ `account-remote-factory.ts`), `api/delete-account.ts` (server → sign out → wipe), `components/ExportDataButton.tsx`, `components/DeleteAccountButton.tsx`, `copy.ts`.
  - `src/features/settings/registry/sections.ts`: two `custom` rows in the Account section (TB-32 registry; the screen is untouched).
  - `src/db/user-db.ts`: `wipeUserDb(userId, wiper)` (driver-agnostic; every step attempted, `LocalWipeError` on failure), `retireDb`, `RETIRED_DB_OWNER`; `src/db/client.ts` / `node-client.ts`: `deleteUserDb(userId)` wiring it to expo-sqlite / better-sqlite3.
  - `src/db/pending-wipe.ts`: owed wipes (memory + SecureStore), `runPendingWipes` called by `src/db/use-db-migrations.ts` when signed out and before opening any account's DB.
  - `src/features/account/export/load-share-module.ts`: loads the export module (expo-sharing / expo-file-system) on first use, so a binary without those native modules still starts.
  - `supabase/functions/delete-account/`: `handler.ts` (runtime-agnostic), `account-auth.ts` (GET `/auth/v1/user`), `auth-admin.ts` (DELETE `/auth/v1/admin/users/<id>`, `should_soft_delete: false`), `index.ts` (Deno wiring), `deno.json`; `supabase/config.toml` `[functions.delete-account] verify_jwt = false`.
- **Interfaces & contracts:** `packages/schemas/src/delete-account.ts`: request `{ confirm: "DELETE" }` (strict); 200 `{ requestId, status: "deleted" | "already_deleted" }`; errors `{ requestId, error: { code, message } }` with 401 `UNAUTHENTICATED`, 400 `BAD_REQUEST`, 405 `METHOD_NOT_ALLOWED`, 500 `INTERNAL`. `X-Request-Id` and `Cache-Control: no-store` on every response.
- **Data changes:** none. No migration, no type regeneration. Every user-owned public table already references `auth.users` with `ON DELETE CASCADE` (TB-19 profiles, TB-23 ledger/counters, TB-43 lists/tasks/subtasks). New pgTAP test `supabase/tests/database/account_deletion.test.sql` makes that a CI-enforced rule for future tables.
- **Reuse:** TB-22 `bearerToken` and the "verify via `/auth/v1/user`" pattern; TB-22 response/CORS/log conventions; TB-20 `signOut()`; TB-21 `guardDb`; TB-32 settings registry; TB-43 per-account DB naming; `toDateInput`, `APP_NAME`; the design-system `Button` (`destructive`, `secondary`).

## Edge cases
| Case | Expected |
|---|---|
| Offline when confirming | Alert (offline); still signed in; nothing deleted; not queued |
| Reply lost after the server deleted; user retries | Function returns 200 `already_deleted` (token is validly signed, user gone → GoTrue 403 `user_not_found`); app signs out and wipes |
| Two deletes race | Second admin delete gets 404 → treated as `already_deleted` |
| Session expired / signed out elsewhere | 401 → "session expired" alert; no change |
| Anon/publishable or service-role key as bearer | 401 (Auth returns no user) |
| Request names another user id | Strict body → 400; the id only ever comes from Auth |
| Sync cycle pushes during/after deletion | Rows can't be created: `sync_push` inserts fail the `user_id → auth.users` FK (observed 409 / 23503 locally) |
| Legacy `taskbuddy.db` owned by the deleted user | Emptied, compacted and marked `retired` (not deleted: deleting it would let the next account claim a fresh legacy file and lose track of its own `taskbuddy-<id>.db`). Owned by someone else → untouched |
| App killed between the server delete and the wipe; or the wipe fails | The id stays owed in SecureStore; the wipe runs before any DB opens on the next launch / sign-in |
| Old binary without expo-sharing / expo-file-system | App starts; Export shows "Couldn't create the export"; deletion works (export-file cleanup is skipped) |
| Another account's local DB on a shared phone | Untouched |
| Local wipe fails (file locked) | Every step is still attempted; logged (class name only); retried on the next launch; user is signed out; server data already gone |
| Export with no data | Valid document with empty arrays |
| Export, share sheet cancelled | No error |

## Security, privacy & AI cost
- **Threats:** (T1) deleting someone else's account → the user id comes only from Auth's answer for the bearer token; the body is a strict `{confirm}` object. (T2) a non-user JWT (anon/service key) → `/auth/v1/user` returns no user → 401. (T3) CSRF/accidental call → POST only, bearer token required (no cookies), explicit confirmation word. (T4) service-role key exposure → only in the Edge Function env (auto-injected), never logged; the app holds only the publishable key. (T5) `already_deleted` abuse → it requires a token GoTrue accepted as correctly signed; it reveals only that the token's own account is gone and performs nothing. (T6) path injection into the admin URL → the id must be a UUID.
- **Logging:** one JSON line per request: request id, status, outcome, duration, admin HTTP status on failure. Never the token, user id, email or a body. App logs only error class names.
- **Data that leaves the device:** export: only where the user shares it. Deletion: only the bearer token.
- **Not deleted by this flow (documented):** Supabase Auth's own audit log rows (`auth.audit_log_entries`: sign-up, login and `user_deleted` events, with the email) stay until Supabase's log retention removes them; platform backups up to the policy's "30 more days"; Anthropic per its retention (privacy §4). See the owner action.
- **AI cost:** none (no AI calls).

## Decisions
| # | Decision | Options considered | Choice | Decided by / date |
|---|---|---|---|---|
| D1 | Export source | Local DB / server pull | **Local DB** (offline, includes unsynced edits) | Orchestrator brief, 2026-10-28 |
| D2 | File sharing module | RN `Share` (can't share files on Android) / `expo-sharing` + `expo-file-system` | **`expo-sharing` 58.0.21 + `expo-file-system` 58.0.13** via `expo install`; **new EAS dev build required** | Orchestrator brief, 2026-10-28 |
| D3 | Server deletion mechanism | Per-table deletes in a security-definer SQL function, then admin delete / **admin hard delete relying on `ON DELETE CASCADE`** | **Cascade**: one atomic transaction, no new privileged SQL surface or migration; the pgTAP guard fails CI if a future table forgets the cascade. Immediate, so "within 24 h" holds | Agent, per brief's recommendation to keep it safe and idempotent, 2026-10-28 |
| D4 | Offline | Queue / block | **Block** with a clear message; nothing changes | Orchestrator brief |
| D5 | Confirmation | Type DELETE (extra screen, >3 taps) / **destructive confirm dialog** | **Destructive dialog** with an explicit consequence text; exactly 3 taps | Agent, within the brief's allowed options |
| D6 | Google Play web deletion path | Build a web form / **use the published privacy page `#delete-account` (email route)** | Privacy page; wording update is an owner action | Agent; owner to confirm |
| D7 | Order on success | Wipe then sign out / sign out then wipe inline / **record an owed wipe, sign out, wipe from `useDbMigrations` after the signed-out render** | Nothing reads the files while they are wiped, and the wipe survives a failure or a killed app (review finding 4/5/6) | Agent, after independent review |
| D9 | Legacy file of a deleted account | Delete the file / **empty + VACUUM + mark `retired`** | Deleting it orphaned another account's own file (review finding 1, blocking) | Agent, after independent review |
| D8 | Idempotency | 401 on retry / **200 `already_deleted`** for a signed token of a missing user | Lets a retry after a lost reply finish signing out | Agent |

## Deviations (added during build)
| Date | Change | Reason | Approved by |
|---|---|---|---|
| 2026-10-28 | No migration / no `supabase/rollback` file | D3: existing cascades already cover every table; adding a definer function would add privileged surface for no gain | Recorded for the orchestrator's review |
| 2026-10-28 | Local wipe moved from `deleteAccount` to an owed-wipe queue run by `useDbMigrations`; legacy file retired instead of deleted (D7, D9) | Independent review: blocking finding 1 and important findings 4–6 | Agent (within the accepted behaviour; no AC change) |
| 2026-10-28 | Export module loaded lazily (`load-share-module.ts`) | A static import of new native modules would crash an older binary at startup | Agent |
