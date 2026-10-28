# TB-43 — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-43 · PR: (set when opened) · Branch: `feat/tb-43/offline-sync`
> Record only what was actually run and observed. Windows 11, Node 24, pnpm 10.17; jest always `--maxWorkers=1` (low memory). No Metro or emulator was started by this agent: the on-device check is the orchestrator's (steps below).

## Commands run
| Command | Result | Notes |
|---|---|---|
| `pnpm lint` | pass | 0 problems |
| `pnpm typecheck` | pass | `tsc --noEmit` clean |
| `pnpm test --ci --maxWorkers=1` | pass | 72 suites, 611 tests (after review fixes; 605 before) |
| `pnpm exec drizzle-kit check` | pass | "Everything's fine" |
| `pnpm db:generate --name offline_sync` | pass | generated `drizzle/0002_offline_sync.sql` + snapshot + `migrations.js` |
| `npx supabase@2.122.0 migration up --local` | pass | applied `20261028181639_offline_sync_tables.sql` to the shared local stack (no reset) |
| `npx supabase@2.122.0 test db` | pass | Files=4, Tests=91, Result: PASS (`sync_tables.test.sql`: 48; after the review fixes the changed `sync_push` was re-applied with `create or replace`) |
| rollback in a rolled-back transaction (`begin; \i …down.sql; check; rollback;`) | pass | `rollback_clean = t`: tables, functions and cron job gone; TB-19's `set_updated_at` untouched |
| `supabase gen types typescript --local --schema public` | pass | `src/lib/database.types.ts`: only the 3 tables + 2 functions added |
| `pnpm exec jest -c jest.integration.config.js --maxWorkers=1 sync.integration` | pass | 5/5 on 3 runs after the review fixes and 10 runs before them; one earlier run (before the fallback poll / warm-up) failed, see below. Needs `--forceExit` (supabase-js timers) |
| `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-43/offline-sync --pr` | pass | "workflow check: ok" |

Failures met during the build, and fixes:
- First `src/db` run: 4 suites failed on the new `sync_meta` table and `synced_updated_at` column (hard-coded table list, migration count, a fixture rebuild without the column). Fixed the expectations (`ALL_TABLES`, `readJournal().length`, fixture column).
- First integration run: AC1 failed once ("condition not met within 10000 ms") right after the local Realtime server started; later runs passed. Cause: a cold Realtime change feed. Fix: fallback poll every 5 s while Realtime isn't connected (spec Deviation), and a reported (not asserted) warm-up edit in the test.
- Integration test couldn't load `expo-crypto` in Node: mocked to Node's `webcrypto`.
- After the review fixes, pgTAP test 39 failed on the shared DB because rows from integration runs were counted; the assertions now filter by the test users (and a new test caught that `jsonb_typeof(...) <> 'number'` is NULL for a missing key: fixed with `is distinct from`).

## Acceptance criteria
| AC (verbatim) | Status | Evidence (test name, file:line, screenshot, observed result) |
|---|---|---|
| Given two devices on one account, when I edit on device A, then device B shows the change within 10 seconds of being online | met | Real local Supabase (Auth + PostgREST + Postgres + Realtime), two device DBs on one real account, app's engine/remote/scheduler: `sync.integration.test.ts` "AC1 …". Final three runs: warm-up 743/529/774 ms; edit→visible on B 496–850 ms (max 850 ms over 15 edits); B offline while A edits, then back online → visible after 4301/4285/4317 ms. Scheduler timing unit-tested (`sync-scheduler.test.ts`), UI refetch on remote change (`SyncProvider.test.tsx`). Two physical phones not run by the agent: device steps below |
| Given the same task edited offline on both devices, then the later updated_at wins and no task is duplicated or lost (automated test) | met | Automated: `sync-engine.test.ts` "AC2 …" (both push orders, whole-row LWW, slow/fast clocks, tie, edit during push, lost reply, 3 devices); `sync.integration.test.ts` "AC2 …" ×2 against the real RPC (one server row per id, both devices equal, nothing dirty); `sync_tables.test.sql` (later wins, older-later ignored, same id twice in a batch) |
| Soft-deleted tasks sync as tombstones and purge after 30 days | met | Tombstones: `sync-engine.test.ts` "AC3 …" (delete reaches B with `deleted_at`, undo, delete vs edit), integration "AC3 …" (tombstone row on server and on B). Purge: pg_cron job `tb43-purge-sync-tombstones` daily (pgTAP asserts schedule/command), `sync_purge_tombstones()` keeps < 30 days and purges older incl. subtasks (pgTAP + integration with a future cutoff); device purge of synced tombstones > 30 days with subtasks and tag links (`sync-engine.test.ts`, `sync-repo.test.ts`) |
| Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated | met | Gates above; independent reviewer + security pass below; `docs/tickets/TB-43/*`, TB-20 limitation marked resolved, owner actions added. Human PR approval is the merge gate |

## Manual / E2E
Not run on devices by this agent (no Metro/emulator allowed: low memory). Orchestrator steps (local stack, two emulator profiles or one device + the integration test as "device B"):
1. Local stack running with Realtime (`tb43-realtime-dev` container on `supabase_network_task-buddy`, see Environment) and this migration applied.
2. Dev build pointed at the local stack (`EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:54321` or `adb reverse tcp:54321 tcp:54321`), signed in as user U on emulator A.
3. Settings shows "All changes backed up." Create "Sync check 1" → in `psql` (`select title, deleted_at from public.tasks order by server_updated_at desc limit 3;`) the row appears.
4. Second emulator (or a fresh install / second profile) signed in as U: "Sync check 1" appears within 10 s. Edit its title on A → B shows it within 10 s (stopwatch).
5. Airplane mode on both; edit the same task on A, then on B (later). Create one new task on each. Airplane off on A, then B. Both show B's title, both new tasks, no duplicates.
6. Delete a task on A (wait past the 5 s undo) → disappears on B within 10 s; `psql` shows the row with `deleted_at` set.
7. Airplane on B, edit on A, airplane off on B: change shows within 10 s.
8. Sign out on A, sign in as another account V: Today is empty (no U tasks). Sign out, sign in as U: U's tasks are back. (TB-20 D7-A fixed.)
Negative: step 8, plus as V `select` via REST returns none of U's rows (also in the integration test).

### Environment
The shared local stack (`task-buddy`, started from another worktree) ran without Realtime. For the integration test the agent started one extra container, `tb43-realtime-dev` (`public.ecr.aws/supabase/realtime:v2.147.1`, network alias `realtime-dev` so Kong's `/realtime/v1` route reaches it, env file outside the repo with the stack's JWT secret/JWKS; never printed). A first attempt, `tb43-realtime`, exited at start (Git Bash path conversion); it was left stopped. Stop the running one with `docker stop tb43-realtime-dev` when done. Test users `tb43-it-*@example.com` were created via the Auth admin API in the local stack and left in place.

## Review findings
| # | Severity | Finding (file:line) | Source (self / reviewer agent / human) | Resolution |
|---|---|---|---|---|
| 1 | Important | AC1 missed once on a cold Realtime feed; only a 60 s poll as fallback | self (integration run) | Fixed: 5 s poll while Realtime isn't connected (`sync-scheduler.ts`), test added |
| 2 | Important | Privacy policy says tasks aren't uploaded until sync is described | self | Owner action `docs/actions/privacy-policy-sync.md` (legal wording is the owner's call), release blocker for outside testers |
| 3 | Important (I1) | Device purge + 10 s overlap: re-read subtask tombstones of a locally purged task block the pull every 300 ms until the server cron runs; purged tombstones re-inserted each cycle (`sync-repo.ts` applyPulledRows) | independent reviewer agent | Fixed: tombstones of unknown rows are skipped; a row blocking twice is skipped (`blocked:<table>` in `sync_meta`). Tests: "does not stall or churn…", "a live child whose parent the device purged…", `sync-repo.test.ts` |
| 4 | Important (I2) | Device away > 30 days never learns about deletions already purged | reviewer | Fixed: full re-pull when the last complete pull is older than 29 days; synced live rows missing on the server become local tombstones. Test "a device away longer than 30 days…" |
| 5 | Important (I3) | Rollback comment claimed devices re-push after a rollback | reviewer | Corrected in the down file and plan; recovery needs an app-side sync-state reset (known limitation) |
| 6 | Important (I4) | Fast account switch: a late `openUserDb` could select the previous account's DB (`client.ts`) | reviewer | Fixed: generation token; `clearUserDb()` on sign-out (DbGate with no user). Test "a fast account switch never leaves the previous account selected" |
| 7 | Important (I5) | plan/verification and doc edits uncommitted | reviewer | Committed |
| 8 | Nit (N1) | Realtime DELETE events (server purge) aren't RLS-filtered and wake every device | reviewer | Fixed: subscribe to INSERT/UPDATE only |
| 9 | Nit (N2) | A row with null `updated_at` fails the batch with a NOT NULL error | reviewer | Fixed: `sync_push` rejects rows without an id / numeric `updated_at` (`22023`); pgTAP test |
| 10 | Nit (N3) | One bad row fails the whole batch; full unplaceable batches re-pushed 25× | reviewer | Partly fixed: the push loop stops when a full batch adopts nothing. Bad rows can't come from the repositories (Zod at the boundary); per-row error isolation is a follow-up |
| 11 | Nit (N4) | Task pushed into a deleted list keeps the list id | reviewer | Fixed: mapped to the Inbox; pgTAP test |
| 12 | Nit (N5) | CI doesn't exercise TB-43's rollback | reviewer | Owner step 5 in `docs/actions/supabase-sync-deploy.md` (agents can't edit workflows); rollback proven locally |

Security pass: the independent reviewer's brief included the security lens (ownership, RLS, Realtime, `security definer` hygiene, injection, logging, secrets); no Blocking findings. Its "checked and fine" list: owner forced to `auth.uid()`, id-collision safe, composite FKs, grants, RLS + pgTAP, offset/cap maths, purge order, bound parameters only in local SQL, push-reply race, cursor ordering, scheduler stop, UUID-checked file names, logs carry no task text.

## Known limitations & follow-ups
- **Tombstone expiry:** a device offline for more than 30 days with an *earlier* unsynced edit to a task deleted elsewhere brings that task back after the server purged its tombstone. Inherent to time-limited tombstones; acceptable for a to-do app. Follow-up idea: refuse pushes from a device whose last successful pull is older than 30 days until it pulls.
- **Whole-row LWW:** concurrent edits to different fields of the same task keep only the later row (the AC asks for row-level "later updated_at wins"). Field-level merge could come with TB-71.
- **Tags and task tags stay on the device** (D1) until TB-44 defines a merge rule for duplicate names.
- **No per-user sync quota** on `sync_push` (500 rows per call cap only). Follow-up: rate-limit like TB-23 if abuse appears.
- **Shared device:** the previous account's database stays on the phone after sign-out (not visible to others). Deletion on request/account deletion: TB-53.
- **Settings line** is replaced by TB-32's Settings screen: whichever merges second re-adds `<SyncStatus />`. Local migration number `0002` collides with TB-32 (PR #19): the second to merge regenerates.
- **Rollback recovery:** after a server rollback, devices don't re-push already-synced rows on their own; re-enabling sync needs an app release that resets device sync state (or a server "sync epoch" follow-up).
- **One bad row** (fails a server CHECK) still fails its batch; per-row error isolation is a follow-up.
- **CI:** the integration test runs locally only (like TB-20's auth test, which waits for an owner-pasted CI job); the TB-43 rollback CI step is in `docs/actions/supabase-sync-deploy.md` for the owner to paste.

## Completion
- [x] All AC met with evidence
- [ ] Gates green locally and in CI
- [ ] No open Blocking findings
- [ ] Jira updated (In Review → Done)
