# TB-43 — Spec

> Jira: https://stratyge.atlassian.net/browse/TB-43 · Intent: [intent.md](intent.md) · Plan: [plan.md](plan.md)
> Status: Draft → **Decisions taken by the implementing agent on 2026-10-28** under the orchestrator's brief (no human available: pick the recommended option and record why). Human review happens at the PR.

## Acceptance criteria (verbatim from Jira)
- [ ] AC1 Given two devices on one account, when I edit on device A, then device B shows the change within 10 seconds of being online
- [ ] AC2 Given the same task edited offline on both devices, then the later updated_at wins and no task is duplicated or lost (automated test)
- [ ] AC3 Soft-deleted tasks sync as tombstones and purge after 30 days
- [ ] AC4 Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated

## Behaviour
- **Signed in, online.** A cycle runs on start, on foreground, after every local write (any successful TanStack mutation), when Realtime reports a change to the user's rows, and when the Realtime channel (re)connects. Bursts are coalesced (300 ms debounce); one cycle at a time. A cycle = push local changes (lists → tasks → subtasks), pull server changes (same order), purge old tombstones. Screens refetch when a cycle changed local rows.
- **Offline.** Everything keeps working locally (repositories unchanged). Cycles fail fast and retry every 5 s while the app is in the foreground; Settings shows "Offline. Changes are saved on this device and sync when you're back online." When the network returns, the next retry (≤ 5 s) or the Realtime reconnect syncs (AC1: ≤ 10 s).
- **Realtime down or slow to start.** The scheduler polls every 5 s while the channel is not connected, every 60 s while it is (safety net).
- **Background.** No timers; requests wait. Foreground triggers a cycle.
- **Conflicts (AC2).** Last writer wins per row, by `updated_at` corrected for the writing device's clock offset (D3). Whole-row LWW: the winning version replaces every field. Exact tie: the first copy to reach the server stays. A device never resolves a conflict on its own: a row with unpushed local changes is never overwritten by a pull; its next push gets the winner back and the device adopts it.
- **Deletes (AC3).** Soft deletes (`deleted_at`) sync like any edit, so the other device keeps a tombstone (hidden from lists). Undo (restore) is just a later edit and syncs too. A later edit on another device revives a deleted task; a later delete wins over an earlier edit. The server purges tombstones untouched for 30 days (daily pg_cron job); each device purges its own synced tombstones whose `deleted_at` is older than 30 days, with their subtasks and device-only tag links.
- **Accounts on one device (D5).** Each account gets its own local database. The existing pre-sync database is adopted by the first account to sign in after the update, and its rows are pushed on the first cycle. Signing out stops sync and keeps that account's data (including unsynced changes) for when it signs in again; another account never sees it.
- **Errors.** Network failures are expected and not logged. Auth/server/local failures log `{ kind, code }` or the error class only, never row content. A malformed server row fails the cycle before anything is applied (Zod at the boundary).

## Technical design
- **Surfaces**
  - `supabase/migrations/20261028181639_offline_sync_tables.sql`: `public.lists`, `public.tasks`, `public.subtasks` (device columns + `user_id` + `server_updated_at`), RLS own-row SELECT only, `sync_push()` RPC (the only client write path), `sync_purge_tombstones()` + pg_cron job `tb43-purge-sync-tombstones` (03:17 UTC daily), tables added to the `supabase_realtime` publication. Rollback in `supabase/rollback/`.
  - `src/db/schema.ts` + `drizzle/0002_offline_sync.sql` (generated): `synced_updated_at` on lists/tasks/subtasks with a partial "dirty" index each; new device-only table `sync_meta` (owner, pull cursors).
  - `src/db/user-db.ts`, `client.ts`, `node-client.ts`: `openUserDb(userId)`; `getDb()` returns the selected user's DB. `DbGate`/`useDbMigrations` take `userId` and open that user's DB; `src/app/_layout.tsx` moves `DbGate` inside `SessionProvider`.
  - `src/features/sync/`: `sync-tables.ts` (tables, Zod schemas for server rows), `repo/sync-repo.ts` (all local sync SQL), `remote/sync-remote.ts` (interface), `remote/supabase-remote.ts` (Supabase implementation), `remote/remote-factory.ts`, `engine/sync-engine.ts` (one cycle), `engine/sync-scheduler.ts` (when cycles run), `components/SyncProvider.tsx`, `components/SyncStatus.tsx` (Settings line), `sync-status-store.ts` (zustand), `server-time.ts` (cursor timestamps), `testing/` (in-memory server, multi-device harness, Jest setup).
- **Interfaces & contracts**
  - `sync_push(p_table text, p_rows jsonb, p_client_now bigint) → jsonb { server_now, rows }`. `p_table ∈ {lists, tasks, subtasks}`, `p_rows` ≤ 500 device rows (snake_case, epoch ms; `user_id` ignored), `p_client_now` = device `Date.now()` at send. Errors: `42501` unauthenticated / anon, `22023` bad table / rows / time, `23514` table checks. Reply rows omit `user_id`.
  - Pull: `GET /rest/v1/<table>?user_id=eq.<uid>&order=server_updated_at,id&limit=500` plus `server_updated_at=gte.<cursor − 10 s>` or the keyset `or=(server_updated_at.gt."ts",and(server_updated_at.eq."ts",id.gt.<id>))`.
  - Realtime: channel `sync:<uid>`, `postgres_changes` `*` on the three tables with `filter=user_id=eq.<uid>` (RLS applies). Payloads are ignored; any event requests a cycle.
  - `SyncRemote` interface: `push`, `pull`, `subscribe(onChange, onConnection)`.
- **Data changes**
  - Postgres: 3 tables, 8 indexes, 3 triggers, 3 functions, 1 cron job, publication membership. Epoch-ms `bigint` timestamps mirror the device exactly (lossless round trip; LWW compares integers). Composite FKs `(list_id, user_id) → lists (id, user_id)` and `(task_id, user_id) → tasks (id, user_id) on delete cascade` stop cross-user references. Reversible: `supabase/rollback/20261028181639_offline_sync_tables.down.sql` (drops the cloud copy; devices re-push).
  - SQLite: 3 nullable columns, 3 partial indexes, 1 table. Additive (the migration-safety harness checks no rows are lost). Existing rows start dirty and are pushed once.
  - `src/lib/database.types.ts` regenerated.
- **Reuse:** `guardDb`/`RepoError` (repo-utils), task/list repositories untouched except for `syncedUpdatedAt: null` on created rows, `openMigratedNodeDb` for tests, TB-23's migration/rollback/pgTAP pattern, TB-20's integration-test pattern (`*.integration.test.ts`, `jest.integration.config.js`), `AppState` pattern from `app-state-refresh.ts`, `taskQueryKeys.all` invalidation.

## Edge cases
| Case | Expected |
|---|---|
| Same task edited offline on two devices, either push order | Later corrected `updated_at` wins on both; one row per id (engine + integration tests) |
| Device clock 1 h slow / 1 day fast | Offset-corrected; a fast clock is capped at server time and can't win later edits |
| Exact tie | First copy on the server stays; both devices converge |
| Edit while a push is in flight | Reply not adopted for that row; it stays dirty and goes next cycle |
| Push reply lost (connection drops after commit) | Same id pushed again → same server row; no duplicate |
| Task arrives before its new list (race) | Pull stops before it, cursor not advanced past it, another cycle runs; no FK error |
| Server winner points at a list the device hasn't pulled | Row stays dirty until the list is pulled; adopted next cycle |
| Task pushed with a list that isn't on the server (purged / other user's) | Stored in the Inbox (`list_id` NULL), like deleting a list does |
| Subtask pushed whose task isn't on the server | Skipped (left out of the reply), stays dirty |
| Another account pushes my task id | Nothing changes; empty reply |
| Delete vs later edit / edit vs later delete | Later one wins |
| Undo after the delete synced | Restore is a later edit; task returns everywhere |
| Two accounts on one device | Separate DB files; the legacy file belongs to the first account to sign in |
| Invalid user id (not a UUID) | Rejected before it becomes a file name; DbGate error screen |
| Malformed row from the server | Cycle fails before applying; retried; no partial apply |
| Slow transaction commits after a later-stamped one was pulled | Caught by the 10 s overlap re-read |
| Device away > 29 days (no complete pull) | Full re-pull of that table; synced live rows the server no longer has (deleted elsewhere and purged) become local tombstones |
| Device offline > 30 days with an unsynced edit to a task deleted elsewhere | The edit wins if later; if earlier and the server already purged the tombstone, the task comes back (known limitation) |
| Tombstone of a row the device doesn't have (never had it, or purged it already) | Skipped: no insert, no churn, cursor moves on |
| A row blocks on a missing parent twice in a row (parent purged here, or deleted and never pulled) | Skipped on the second cycle, so sync never stalls |
| Fast sign-out / sign-in while a DB is still opening | Only the newest open selects its DB (generation token); sign-out deselects |
| Task pushed into a deleted list | Stored in the Inbox |
| Pushed row without an id or numeric `updated_at` | `22023`, nothing written |

## Security, privacy & AI cost
- **Threats and mitigations**
  - *Read another user's rows* (PostgREST, Realtime): RLS own-row SELECT on all three tables; Realtime enforces the same policies; pgTAP + integration tests prove isolation.
  - *Write another user's rows* (id collision / forged payload): clients have no direct INSERT/UPDATE/DELETE grant; `sync_push` forces `user_id = auth.uid()`, its `ON CONFLICT ... WHERE t.user_id = v_uid` never touches another owner's row, and the reply only returns own rows. Composite FKs block pointing at another user's list or task.
  - *Win every conflict with a forged future timestamp*: `updated_at` is capped at server time (only affects the attacker's own rows anyway).
  - *`security definer` misuse*: `set search_path = ''`, fully qualified names, input validated (table whitelist, array, ≤ 500 rows, positive client time), `execute` revoked from `public`/`anon`; purge executable by `service_role` only.
  - *Path injection via user id in the DB file name*: user id must be a UUID (Zod) before use.
  - *Shared device* (TB-20 D7-A): one DB per account.
  - *Abuse / storage growth*: no per-user sync quota yet (push is capped at 500 rows per call). Follow-up below.
- **Data leaving the device:** list names/colors, task titles, notes, status, priority, dates, subtask titles, to the user's own Supabase project rows. Tags stay local. The privacy policy (TB-54) still says tasks are not uploaded until a sync feature is described there: owner action [privacy-policy-sync.md](../../actions/privacy-policy-sync.md) must land before a build with sync reaches outside testers.
- **Logging:** no row content; errors log kind/code/class only.
- **AI cost:** none.

## Decisions
| Decision | Options considered | Choice | Decided by / date |
|---|---|---|---|
| D1 Synced tables | A tasks + subtasks only · **B lists + tasks + subtasks** · C all five incl. tags and task_tags | **B.** Tasks reference lists by FK, so syncing tasks without lists would break the FK on the other device (or need the list id dropped). Lists have no uniqueness rule, so they are cheap. Tags (case-insensitive unique names) and task_tags (unique live pair) need a merge rule for two devices creating the same name offline: that belongs to TB-44. Preferences (TB-32) stay local. | agent (brief: recommended), 2026-10-28 |
| D2 Push / pull mechanism | A outbox table filled by SQLite triggers · **B per-row `synced_updated_at` marker (dirty = differs from `updated_at`)** · C `updated_at > last push time` watermark. Server: **RPC with atomic `INSERT … ON CONFLICT DO UPDATE … WHERE`** vs plain PostgREST upsert. Pull: **cursor on a server-stamped column + Realtime as a wake-up signal** vs applying Realtime payloads | **B + RPC + cursor/wake-up.** B needs no repository changes (every write already sets `updated_at`, so every write marks the row dirty), no triggers, and survives app kills. A watermark (C) breaks with device clock changes. The RPC is the only write path, so LWW and ownership can't be bypassed. The cursor uses `server_updated_at` (server clock, monotonic per write) because device timestamps arrive out of order. Applying Realtime payloads directly would duplicate the merge logic and miss changes while disconnected; a pull is idempotent. | agent, 2026-10-28 |
| D3 Clock skew | A trust device `updated_at` · B server stamps `updated_at` at push time ("last synced wins") · **C hybrid: device time corrected by the device's current offset (`server_now − p_client_now`), capped at server now** | **C.** A lets a wrong clock win forever. B breaks the AC: an edit made earlier but synced later would win. C keeps "the later edit wins" in real time for slow and fast clocks (tested ±1 h / +1 day); the residual error is the network latency and any clock change between the edit and the push. | agent, 2026-10-28 |
| D4 Tombstone purge | **A pg_cron job in the migration** · B SQL function + a manual schedule owner step · C Edge Function cron | **A.** pg_cron 1.6 is preloaded in the local and CI Postgres images and available on hosted Supabase, so the schedule ships with the migration and needs no owner step; pgTAP asserts it. The clock is `server_updated_at` (server time). Devices purge their own synced tombstones after 30 days by `deleted_at`. | agent, 2026-10-28 |
| D5 Local data per account (TB-20 D7-A) | A `user_id` column on every local row + filter every query · **B one SQLite file per account (legacy file adopted by the first account)** · C one DB, wipe on account switch | **B.** No repository query changes (A would touch every read and is easy to get wrong), no data loss (C would drop the previous account's unsynced changes), and complete isolation. DbGate already gates rendering, so it now opens the signed-in user's file. | agent, 2026-10-28 |
| D6 Status UI | **A one line in Settings** · B badge on every screen · C none | **A** — cheap, and enough for the owner's device check. | agent, 2026-10-28 |

## Deviations (added during build)
| Date | Change | Reason | Approved by |
|---|---|---|---|
| 2026-10-28 | Added a 5 s **fallback poll while Realtime is not connected** (60 s while connected) | First integration run: right after a fresh local Realtime server starts, its change feed took several seconds to start streaming after SUBSCRIBED, so one edit missed AC1's 10 s. The fallback poll keeps AC1 when Realtime is down or slow to start. Cost: three small GETs every 5 s only while the channel is down and the app is in the foreground | Pending human (PR review) |
| 2026-10-28 | Review fixes (independent reviewer, I1–I4, N1/N2/N4): pull skips tombstones of unknown rows and skips a row that blocks twice; full re-pull after 29 days away marks purged rows deleted; push stops when a full batch adopts nothing; `openUserDb` generation token + `clearUserDb` on sign-out; Realtime listens to INSERT/UPDATE only; `sync_push` validates id/`updated_at` and maps deleted lists to the Inbox; rollback note corrected | Found by review before the PR; same behaviour the spec describes, closes gaps | Pending human (PR review) |
| 2026-10-28 | Local Realtime for the integration test runs in an extra container (`tb43-realtime-dev`, image `realtime:v2.147.1`) on the shared stack's network | The shared local stack was started without Realtime; `supabase start`/`stop` from this worktree was off limits. Additive only; see verification.md | Pending orchestrator |
