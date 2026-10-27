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
| Schema (above) | — | As specified above | Owner, 2026-10-27 ("accept all") |
| Timestamps | ISO text · epoch ms integer | epoch ms (compact, sortable, cheap index) | Owner, 2026-10-27 ("accept all") |
| Test driver | better-sqlite3 · node:sqlite via sqlite-proxy · expo-sqlite web | better-sqlite3, with node:sqlite fallback (fallback not needed) | Owner, 2026-10-27 ("accept all") |
| Ownership column | add `user_id` now · add with auth/sync | later (TB-20/TB-43, additive migration) | Owner, 2026-10-27 ("accept all") |

## Deviations (added during build)
| Date | Change | Reason | Approved by |
|---|---|---|---|
| 2026-10-27 | No `node:sqlite` fallback needed: better-sqlite3 13.0.3 ships an N-API prebuild for win32-x64 (works on Node 24.21.0). `pnpm.onlyBuiltDependencies: ["better-sqlite3"]` kept as planned | Prebuild loads without a native build | Worker (within plan) |
| 2026-10-27 | ESLint `no-restricted-imports` rule **not committed** to `eslint.config.js`: a local config-protection hook blocks edits to lint config. The exact rule was proven with `eslint --rule` (temporary violating import → 2 errors) and is handed to the coordinator to apply | Tooling guard; not bypassed | Pending coordinator |
| 2026-10-27 | `pnpm expo install expo-sqlite` auto-added the `expo-sqlite` config plugin to `app.json`; reverted (outside owned paths, and the plugin is only needed for options such as SQLCipher) | Ownership | Worker |
| 2026-10-27 | Added `@types/node` (dev). Node-only files (`src/db/node-client.ts`, `migration-safety.ts`, some tests) use `/// <reference types="node" />` so Node types stay out of app code (`types: ["jest"]` in tsconfig) | TypeScript 6 doesn't auto-load `@types/*` | Worker |
| 2026-10-27 | `zod` 4.6.7 (latest) | Brief allowed 3 or 4 | Worker |
| 2026-10-27 | Soft-deleting a task also soft-deletes its live subtasks and `task_tags` links; soft-deleting a tag soft-deletes its links; soft-deleting a list moves **all** its tasks (including soft-deleted ones) to the Inbox | Spec was silent; avoids live children of deleted parents syncing later | Worker (flag for owner) |
| 2026-10-27 | The unique partial indexes on `tags(lower(name))` and `task_tags(task_id, tag_id)` ship in `0000` with their tables; `0001` holds the four list-query indexes | Uniqueness is part of the table contract | Worker |
| 2026-10-27 | The AC2 harness is stronger than specified: besides counts and id checksum it flags changed values in surviving columns and dropped columns. A test also fails if the migration journal's `when` timestamps are not strictly increasing (Drizzle would silently skip such a migration) | Data-loss protection | Worker |
| 2026-10-27 | `jest.config.js` maps `@/db/client` → `src/db/node-client.ts` (better-sqlite3 twin with the same exports) | Lets DbGate and the benchmark route run real migrations in Jest | Worker (within brief) |
| 2026-10-27 | The dev benchmark screen's UI lives in `app/dev/db-benchmark.tsx` (render only; seeding/timing in `src/features/tasks/repo/list-benchmark.ts`, introspection in `src/db/introspect.ts`). Release builds render the app's `+not-found` screen. It also reports a one-list p95 | No owned feature folder for dev UI | Worker |
| 2026-10-27 | After review: repositories rethrow driver failures as `RepoError('DB_FAILURE')` carrying only the error class and SQLite code (Drizzle error messages embed bound params); ids must be UUIDv7 (`z.uuidv7()`); empty update patches do not write or bump `updated_at` | Security review (task text out of logs), reviewer findings | Worker |
| 2026-10-27 | Task 6 wiring (Babel `inline-import`, Metro `sourceExts`, `<DbGate>` in `app/_layout.tsx`) is prepared but left to the coordinator after rebasing on TB-17 | Ordering constraint (TB-17 creates babel/metro config) | Coordinator brief |
