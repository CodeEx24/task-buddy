# TB-21 — Spec

> Jira: https://stratyge.atlassian.net/browse/TB-21 · Intent: [intent.md](intent.md)
> Status: **Accepted by the owner on 2026-10-27** ("accept all")

## Acceptance criteria (verbatim from Jira)
- [ ] Given a first launch, then migrations run and tables tasks, subtasks, lists, tags exist with id (UUIDv7), updated_at and deleted_at
- [ ] Given a v1 database with data, when v2 migration runs in a test, then no rows are lost
- [ ] Given 10,000 tasks, a list query returns in under 50 ms at p95 on a mid-range Android device
- [ ] Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated

## Data (proposed schema)
All timestamps are **integer epoch milliseconds, UTC**. Every table has `id TEXT PRIMARY KEY` (UUIDv7, generated in the app), `created_at`, `updated_at` (set by the repository on every write) and `deleted_at` (NULL = live). Drizzle fields are camelCase and map to snake_case columns.

| Table | Columns (besides id / created_at / updated_at / deleted_at) |
|---|---|
| `lists` | `name TEXT NOT NULL`, `color TEXT NULL`, `sort_order REAL NOT NULL DEFAULT 0` |
| `tasks` | `list_id TEXT NULL → lists.id`, `title TEXT NOT NULL`, `notes TEXT NULL`, `status TEXT NOT NULL DEFAULT 'open'` (`open` or `done`), `priority INTEGER NOT NULL DEFAULT 0` (0 none … 3 high), `due_at INTEGER NULL`, `completed_at INTEGER NULL`, `sort_order REAL NOT NULL DEFAULT 0` |
| `subtasks` | `task_id TEXT NOT NULL → tasks.id`, `title TEXT NOT NULL`, `is_done INTEGER NOT NULL DEFAULT 0`, `sort_order REAL NOT NULL DEFAULT 0` |
| `tags` | `name TEXT NOT NULL`, `color TEXT NULL`. Unique index on `lower(name)` where `deleted_at IS NULL` |
| `task_tags` | `task_id → tasks.id`, `tag_id → tags.id`. Unique index on (`task_id`, `tag_id`) where `deleted_at IS NULL`. It has its own `id` so it syncs like any other row |

Foreign keys are declared, but deletes are **soft**. Repositories never hard-delete except in a later account-deletion path (TB-53). Deleting a list soft-deletes nothing else: its tasks fall back to `list_id = NULL` ("Inbox"), set in the same transaction.

Indexes (shipped as migration `0001`, which also gives AC2 a real v1→v2 step):
- `tasks(deleted_at, status, due_at, sort_order)` for the main list query.
- `tasks(list_id)`.
- `subtasks(task_id)`.
- `task_tags(tag_id)`.

## Behaviour
- **AC1 (first launch):** `src/db/client.ts` opens `taskbuddy.db` with `expo-sqlite` (`openDatabaseSync`, WAL journal, `foreign_keys = ON`) and wraps it in Drizzle. `useDbMigrations()` (built on `useMigrations` from `drizzle-orm/expo-sqlite/migrator`) runs pending migrations before any repository is used. Until it finishes, `DbGate` shows a blank splash. On error it shows a "Couldn't open your data" message with a retry and logs the error (no task data in the log). A Jest test (Node driver) applies all migrations to an empty DB and asserts the 5 tables and their `id/updated_at/deleted_at` columns via `PRAGMA table_info`. On the emulator, the dev benchmark screen also reads `sqlite_master` from the real device DB.
- **AC2 (no rows lost):** `src/db/migrations.test.ts` is a generic harness. For each migration *k ≥ 1*, it applies migrations `0…k-1` to a fresh DB, seeds rows in every table (including soft-deleted ones), applies migration *k*, and asserts row counts and a checksum of ids are unchanged. Every future migration gets this check for free.
- **AC3 (perf):** the query is `listOpenTasks({ listId?, limit = 100, cursor? })`: live, `status = 'open'`, ordered by `due_at` (nulls last) then `sort_order`, keyset-paginated. A `__DEV__`-only screen `app/dev/db-benchmark.tsx` seeds 10,000 tasks into a separate `benchmark.db`, runs the query 100 times, and shows and logs p50/p95/max. In production builds the route renders not-found. A Node benchmark runs in Jest as a regression guard (`< 50 ms p95` on the CI runner, not the AC evidence).
- **Repositories:** `src/features/tasks/repo/task-repo.ts` (create, update, softDelete, getById, listOpenTasks, plus subtask methods) and `src/features/tasks/repo/list-repo.ts`, `tag-repo.ts`. They take a `TaskBuddyDb` handle typed on the Drizzle SQLite base, so the same code runs on expo-sqlite (app) and the Node driver (tests). Inputs are validated with Zod at the repository boundary (`src/features/tasks/schema.ts`). `packages/schemas` waits for the first shared app↔edge schema (TB-22/24).
- **IDs:** `src/lib/ids.ts` exports `newId()` using the `uuidv7` package. `crypto.getRandomValues` comes from `expo-crypto`, polyfilled once in `src/lib/polyfills.ts` before first use.

## Technical design
- **Owned paths:** `src/db/**`, `src/features/*/repo/**`, `src/features/tasks/schema.ts`, `src/lib/ids.ts`, `src/lib/polyfills.ts`, `drizzle.config.ts`, `drizzle/**` (generated SQL), `app/dev/**`. Shared: `package.json`/lockfile, and the Drizzle entries in `babel.config.js` (`inline-import` for `.sql`) and `metro.config.js` (`sourceExts.push('sql')`) **after TB-17 merges**. The `DbGate` wiring into `app/_layout.tsx` is one line, coordinated with TB-18.
- **Scripts:** `pnpm db:generate` runs `drizzle-kit generate` (name kept from CLAUDE.md §9).
- **Versions (npm, 2026-10-27):** drizzle-orm 0.45.4, drizzle-kit 0.31.11, expo-sqlite 58.0.14, uuidv7 1.2.1. The test driver is better-sqlite3 13.0.3. If it has no prebuilt binary for Node 24 on Windows, the fallback is `drizzle-orm/sqlite-proxy` over Node's built-in `node:sqlite` (recorded as a deviation).
- **Reuse:** `@/` path alias and the test conventions from TB-15.

## Edge cases
| Case | Expected |
|---|---|
| Migration fails mid-way on a device | Drizzle runs each migration in a transaction. The app shows the error screen with retry. No partial schema is left |
| App updated from a build with fewer migrations | Only the pending migrations run. Covered by the AC2 harness |
| Deleting a list that has tasks | Tasks move to `list_id = NULL` in the same transaction |
| Duplicate tag name with different case | Rejected by the repository (unique `lower(name)` on live rows). A soft-deleted tag can be re-created |
| Device clock wrong | `updated_at` uses device time. TB-43 owns conflict rules and server timestamps |
| Very long title or notes | Zod caps `title` at 500 and `notes` at 10,000 characters |

## Security, privacy & threats (high risk)
- **Data at rest:** the database is plain SQLite inside the app sandbox, protected by OS sandboxing and device encryption. SQLCipher-style encryption is out of scope and logged as a follow-up for a later privacy review (TB-54).
- **Injection:** all values go through Drizzle's parameter binding. The only raw `sql` template use is in migrations and the benchmark. A lint rule (`no-restricted-imports` of `expo-sqlite` outside `src/db/**`) keeps components from opening the DB directly.
- **Soft-deleted data persists:** deleted rows stay on the device until account deletion or purge (TB-53 must hard-delete and VACUUM). This is noted on TB-53.
- **Logging:** errors log table and migration names only, never task titles or notes.
- **Abuse:** local-only data, with no multi-user boundary on the device. RLS applies on the server side (TB-19/TB-43).
- **AI cost:** none.

## Decisions
| Decision | Options considered | Choice | Decided by / date |
|---|---|---|---|
| Perf device (AC3) | Android emulator proxy · physical Android phone | **Android emulator as proxy** (accepted exception, like TB-15's iOS one) plus a CI benchmark as a regression guard | Owner, 2026-10-27 |
| Schema (above) | — | _pending owner acceptance_ | |
| Timestamps | ISO text · epoch ms integer | epoch ms (compact, sortable, cheap index) | proposed |
| Test driver | better-sqlite3 · node:sqlite via sqlite-proxy · expo-sqlite web | better-sqlite3, with node:sqlite fallback | proposed |
| Ownership column | add `user_id` now · add with auth/sync | later (TB-20/TB-43, additive migration) | proposed |

## Deviations (added during build)
| Date | Change | Reason | Approved by |
|---|---|---|---|
