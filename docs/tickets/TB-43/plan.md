# TB-43 — Implementation plan

> Jira: https://stratyge.atlassian.net/browse/TB-43 · Spec: [spec.md](spec.md) · Verification: [verification.md](verification.md)
> Bar: an engineer who has never seen the conversation could implement the change from this plan alone.

## Branch & worktree
`feat/tb-43/offline-sync` (Orca worktree `tb-43-offline-sync`, from `main` @ `09ab8c8`).
Owns: `supabase/migrations/20261028181639_*`, `supabase/rollback/20261028181639_*`, `supabase/tests/database/sync_tables.test.sql`, `src/lib/database.types.ts` (regenerated), `src/db/**`, `drizzle/**`, `src/features/sync/**`, `src/features/tasks/repo/**` (one field), `docs/tickets/TB-43/**`, `docs/actions/supabase-sync-deploy.md`, `docs/actions/privacy-policy-sync.md`.
Shared files touched (coordinator to note): `src/app/_layout.tsx` (DbGate moved inside SessionProvider, SyncProvider mounted), `jest.config.js` (one setup file), `src/features/settings/registry/sections.ts` (one `sync-status` row in the Account section, TB-32's registry).
Must not edit: `.github/workflows/*.yml` (guard hook), `legal-site/**` (TB-54; owner action instead).
Drizzle: generated. TB-32 (PR #19) merged first with `0002_preferences`, so after merging `origin/main` this branch regenerated its migration as `0003_offline_sync` (wave-plan rule; no hand renumbering).

## Dependencies
Blocked by TB-21, TB-20, TB-26: all Done in Jira (checked 2026-10-28). Unblocks TB-53, TB-68, TB-71.

## Tasks
### Task 1 — Postgres tables, RLS, push RPC, purge, Realtime
- [x] Migration `20261028181639_offline_sync_tables.sql` (via `supabase migration new`): tables, composite FKs, indexes, `server_updated_at` trigger, RLS own-row SELECT, revoke all writes, `sync_push`, `sync_purge_tombstones`, pg_cron job, publication.
- [x] Rollback file; checked in a rolled-back transaction on the local DB.
- [x] pgTAP `sync_tables.test.sql` (43 assertions).
- [x] Regenerate `src/lib/database.types.ts` (`supabase gen types typescript --local --schema public`).
- Verify: `supabase migration up --local`, `supabase test db`.

### Task 2 — Local schema and one DB per account
- [x] `schema.ts`: `synced_updated_at` + partial dirty index on lists/tasks/subtasks; `sync_meta`. `pnpm db:generate --name offline_sync`.
- [x] `user-db.ts` (`resolveUserDb`, owner claim, UUID check), `openUserDb` in `client.ts`/`node-client.ts`, `useDbMigrations(userId)`, `DbGate userId`, `_layout.tsx` order: `QueryProvider > SessionProvider > DbGate(userId)`.
- [x] Repos: created rows carry `syncedUpdatedAt: null`.
- Verify: `src/db/*.test.ts(x)` incl. `user-db.test.ts`, migration-safety harness, `drizzle-kit check`.

### Task 3 — Sync repo, remote, engine, scheduler
- [x] `sync-tables.ts`, `server-time.ts`, `repo/sync-repo.ts`, `remote/sync-remote.ts`, `remote/supabase-remote.ts`, `engine/sync-engine.ts`, `engine/sync-scheduler.ts`.
- [x] In-memory server + multi-device harness (`testing/`).
- Verify: `sync-repo.test.ts`, `sync-engine.test.ts` (AC2/AC3 scenarios), `sync-scheduler.test.ts`, `server-time.test.ts`.

### Task 4 — App wiring and status
- [x] `SyncProvider` (AppState, mutation cache, Realtime, query invalidation), `SyncStatus` in Settings, Jest setup with a null remote.
- Verify: `SyncProvider.test.tsx`, full `pnpm test`.

### Task 5 — Real-stack proof
- [x] `sync.integration.test.ts` against local Supabase (Auth, PostgREST, Postgres, Realtime): AC2 both push orders, AC3 tombstone + purge, RLS isolation, AC1 latency (live and after coming online).
- Verify: run 3× with `jest.integration.config.js`; record latencies.

### Task 6 — Docs and owner actions
- [x] intent/spec/plan/verification; `docs/actions/supabase-sync-deploy.md`, `docs/actions/privacy-policy-sync.md`, to-do list; TB-20 limitation marked resolved.

## Test strategy
| AC | Test (layer) | File |
|---|---|---|
| AC1 | Realtime-triggered propagation latency, live and after reconnect (integration, real local Supabase) | `src/features/sync/sync.integration.test.ts` |
| AC1 | Debounce / retry / fallback poll / background timing (unit, fake timers) | `src/features/sync/engine/sync-scheduler.test.ts` |
| AC1 | Remote change → pull → screens refetch (component) | `src/features/sync/components/SyncProvider.test.tsx` |
| AC2 | Offline edits on two devices, both orders, skew, ties, in-flight edit, lost reply, 3 devices (unit, two SQLite DBs + in-memory server) | `src/features/sync/engine/sync-engine.test.ts` |
| AC2 | Same against the real RPC / RLS | `sync.integration.test.ts`, `supabase/tests/database/sync_tables.test.sql` |
| AC3 | Tombstones sync, undo, delete vs edit, local purge | `sync-engine.test.ts`, `sync-repo.test.ts` |
| AC3 | Server purge function + cron schedule | `sync_tables.test.sql`, `sync.integration.test.ts` |
| Isolation | RLS cross-user, forged pushes, one DB per account | `sync_tables.test.sql`, `sync.integration.test.ts`, `src/db/user-db.test.ts`, `src/db/DbGate.test.tsx` |
| AC4 | Full gates, no regressions | `pnpm lint && pnpm typecheck && pnpm test --ci --maxWorkers=1`, `drizzle-kit check`, `supabase test db` |

## Risks & rollback
- **Server:** run `supabase/rollback/20261028181639_offline_sync_tables.down.sql` then `supabase migration repair --status reverted 20261028181639`. Drops the cloud copy; devices keep their data (rows stay clean locally, so re-enabling sync later needs a fresh-cursor reset — follow-up note in verification).
- **App:** an OTA update that unmounts `SyncProvider` stops all network sync; local data is untouched. The local migration is additive (columns + table) and kept.
- **Detect:** Settings status line; Supabase logs for `sync_push` errors; `cron.job_run_details` for the purge job.
