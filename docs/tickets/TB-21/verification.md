# TB-21 — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-21 · PR: (not opened yet) · Branch: `feat/tb-21/local-sqlite-schema`
> Record only what was actually run and observed. `node scripts/workflow/check-ticket-docs.mjs --branch <branch> --pr` fails the PR gate while any AC row is `not met`, `partial` or `TBD`.

## Commands run
All run on Windows 11, Node 24.21.0, pnpm 10.17.1, on 2026-10-27, in the `tb-21-local-sqlite` worktree (base `main` 90be333, before rebasing on TB-17).

| Command | Result | Notes |
|---|---|---|
| `pnpm install` | pass | better-sqlite3 13.0.3 loads from its bundled win32-x64 N-API prebuild (no native build, no `node:sqlite` fallback needed) |
| `pnpm db:generate` | pass | `drizzle/0000_init.sql` (5 tables + 2 unique partial indexes), `drizzle/0001_list_query_indexes.sql` (4 indexes), `drizzle/migrations.js` |
| `pnpm exec drizzle-kit check` | pass | "Everything's fine" (snapshots consistent) |
| `pnpm lint` | pass | 0 errors, 0 warnings |
| `pnpm typecheck` | pass | `tsc --noEmit`, strict + `noUncheckedIndexedAccess` |
| `pnpm test` | pass | 14 suites, 64 tests |
| `pnpm jest src/features/tasks/repo/list-benchmark.test.ts` (Node benchmark, 2 runs) | pass | `p50 0.61 / p95 0.91 / max 2.33 ms` and `p50 0.64 / p95 1.19 / max 1.45 ms`; one-list p95 1.03 / 1.46 ms; 10,000 tasks seeded in ~0.9 s |
| `eslint --rule <no-restricted-imports JSON>` on a temporary violating file | pass | Negative check, see below. The rule is not in `eslint.config.js` yet (see Known limitations) |
| `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-21/local-sqlite-schema` | pass | `workflow check: ok` |

Negative checks (all temporary, removed afterwards):
1. **AC2 harness catches loss.** A temporary fixture migration rebuilding `subtasks` without copying rows and dropping `tasks.notes` → the harness failed with `subtasks: 6 rows before, 0 after`, `subtasks: id checksum changed`, `tasks.notes: column dropped`. After review this fixture became a committed test (`src/db/migrations.test.ts`, "fails a destructive migration"), alongside a lossless rebuild that passes.
2. **Lint rule.** `src/features/tasks/components/tmp-violation.ts` importing `expo-sqlite` and `drizzle-orm/expo-sqlite/migrator`, linted with the rule → `2 problems (2 errors)`: "'expo-sqlite' import is restricted… Open the DB only in src/db; use a repository". File removed.
3. **Release build hides the dev route.** Removing the `__DEV__` guard in `app/dev/db-benchmark.tsx` → `db-benchmark-route-release.test.tsx` failed ("Unable to find an element with testID: not-found-screen"). Guard restored.

Failures hit during the build, and their fixes:
1. `pnpm expo install expo-sqlite` added the `expo-sqlite` config plugin to `app.json` (not an owned path, and only needed for options such as SQLCipher) → reverted.
2. jest-expo's `performance.now()` has 1 ms resolution (first benchmark read `p50 1 / p95 1 / max 1`) → `runListBenchmark` takes an injectable clock; the Jest test passes `process.hrtime`.
3. Expo Router keeps navigation state between `renderRouter` calls in one file → the release-build route test moved to its own file.
4. `useTestClock` tripped `react-hooks/rules-of-hooks` → renamed `installTestClock`.

## Acceptance criteria
| AC (verbatim) | Status | Evidence (test name, file:line, screenshot, observed result) |
|---|---|---|
| Given a first launch, then migrations run and tables tasks, subtasks, lists, tags exist with id (UUIDv7), updated_at and deleted_at | partial | **Node (met):** `src/db/schema.test.ts` applies every migration to an empty DB and asserts the 5 tables (incl. `task_tags`) and `id TEXT PK`, `updated_at INTEGER NOT NULL`, `deleted_at INTEGER NULL` via `pragma_table_info`; idempotent second launch; journal order; `drizzle/migrations.js` bundles every journal entry. UUIDv7: `src/lib/ids.test.ts`, `task-repo.test.ts`. `DbGate.test.tsx` runs migrations before rendering children and recovers after a failed attempt. Atomicity on first launch and on update: `migrations.test.ts` "migration atomicity". **Device: pending coordinator emulator run** after Task 6 wiring (open `/dev/db-benchmark`, which lists `sqlite_master` tables of the real `taskbuddy.db`) |
| Given a v1 database with data, when v2 migration runs in a test, then no rows are lost | met | `src/db/migrations.test.ts` "migration 1 (0001_list_query_indexes) keeps every row of version k-1": seeds live and soft-deleted rows in every table at v1, applies v2, compares row counts, id checksums and every column value. Generic for every future migration. Proven to fail on a destructive fixture and pass on a lossless rebuild (committed tests) |
| Given 10,000 tasks, a list query returns in under 50 ms at p95 on a mid-range Android device | partial | **Pending coordinator emulator run** (owner decision: Android emulator as proxy) of `app/dev/db-benchmark.tsx`. Supporting evidence: Node benchmark p95 0.91–1.19 ms (`list-benchmark.test.ts`, budget < 50 ms); `EXPLAIN QUERY PLAN` of every statement `listOpenTasks` issues uses `tasks_live_status_due_sort_idx` with no table scan and no temp B-tree for ORDER BY |
| Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated | partial | 64 tests pass (TB-15's 3 still pass). Independent reviewer + security reviewer done (below). Ticket docs updated (spec Deviations, this file, `src/db/README.md`). Pending: rebase on TB-17 + Task 6 wiring, ESLint rule applied, PR + human review |

## Manual / E2E
Not run by this worker (no emulator use per brief). For the coordinator, after Task 6 wiring on the emulator:
1. `pnpm android`, wait for the home screen (the app passes `DbGate`, so migrations ran).
2. Open `exp://…/--/dev/db-benchmark` (or navigate to `/dev/db-benchmark`): "Tables in taskbuddy.db" must read `lists, subtasks, tags, task_tags, tasks`, "Migrations applied: 2" → AC1 device evidence (screenshot).
3. Tap **Run benchmark (10,000 tasks)**; record p50/p95/max (also logged as `[TB-21 benchmark] {...}` in Metro) → AC3 (screenshot). p95 must be < 50 ms.

## Review findings
| # | Severity | Finding (file:line) | Source | Resolution |
|---|---|---|---|---|
| 1 | Important | Driver failures propagate as `DrizzleQueryError`, whose message embeds bound params (task titles/notes/tag names) → could reach logs/Sentry (`src/db/db-errors.ts`, all repos) | security reviewer | Fixed: every exported repo function is wrapped by `guardDb` (`repo-utils.ts`), rethrowing `RepoError('DB_FAILURE')` with only `{ name, code }`. Tests: `repo-utils.test.ts`, `task-repo.test.ts` "surfaces driver failures as DB_FAILURE without task text" |
| 2 | Nit | `idSchema = z.uuid()` accepts any version (`schema.ts:14`) | security reviewer | Fixed: `z.uuidv7()`; test "accepts only UUIDv7 ids". Revisit if sync ever imports foreign ids |
| 3 | Nit | Dev route code ships as dead code in release (`app/dev/db-benchmark.tsx`) | security reviewer | Accepted: render gated by `__DEV__` (proven by test); no access to user data beyond read-only introspection |
| 4 | Nit | Benchmark `console.log`, `tableColumns` param binding | security reviewer | Confirmed fine, no change |
| 5 | Important | No test that a failing migration leaves no partial schema | reviewer agent | Fixed: "migration atomicity" tests (first launch and update path, retry) |
| 6 | Important | AC2 harness only proven on an index-only migration; destructive fixture not committed | reviewer agent | Fixed: committed fixture tests via `src/db/migration-fixtures.ts` (destructive fails, lossless rebuild passes) through the real seed → migrate → compare pipeline |
| 7 | Nit | No `CHECK` constraints on `status` / `priority` | reviewer agent | **Open — owner decision.** The accepted schema has none; Zod enforces at the repo boundary. Adding a CHECK later needs a table rebuild, so decide before release (and before TB-43 sync writes rows) |
| 8 | Nit | Cascading soft-deletes beyond the spec text not recorded | reviewer agent | Fixed: recorded in spec Deviations |
| 9 | Nit | Empty patch still bumps `updated_at` | reviewer agent | Fixed: update functions return the current row without writing; test "does not write for an empty patch" |
| 10 | — | Self-review: Drizzle's migrator skips a migration whose journal `when` is not newer than the last applied one | self | Fixed: test "keeps the journal ordered" |
| 11 | — | Self-review: injection (all values bound), soft deletes only, `updated_at` on every write, transactions on every multi-statement write, logs carry no task data, no `any` | self | — |

## Known limitations & follow-ups
- **ESLint rule not committed** (a config-protection hook blocks edits to `eslint.config.js`). Coordinator applies the block in the worker report; the rule itself is proven.
- **Task 6 wiring pending** (after TB-17): Babel `inline-import` for `.sql`, Metro `sourceExts.push('sql')`, `<DbGate>` around the root `Stack` in `app/_layout.tsx`. Until then `src/db/client.ts` and `drizzle/migrations.js` are not exercised by the app or Jest (Jest maps `@/db/client` to the Node twin).
- **Future table rebuilds:** with `foreign_keys = ON`, drizzle-kit's `PRAGMA foreign_keys=OFF` inside the migration transaction is a no-op, so rebuilding a *parent* table (`lists`, `tasks`, `tags`) with children present will fail on devices. Write such migrations by hand (or run them outside the transaction) and prove them with the fixture harness.
- `tags` uniqueness uses SQLite `lower()`, which folds ASCII only; Postgres `lower()` is Unicode-aware. TB-43 should align the rule.
- The one-list query uses `tasks_list_id_idx` plus a sort of that list's rows (Node p95 ~1 ms at 10k). Add a `(list_id, deleted_at, status, due_at, sort_order)` index only if device numbers call for it.
- Soft-deleted rows stay on device until TB-53 (hard delete + VACUUM). SQLCipher is out of scope (TB-54).
- `status`/`priority` CHECK constraints: owner decision (finding 7).

## Completion
- [ ] All AC met with evidence (AC1/AC3 device runs pending the coordinator)
- [x] Gates green locally (CI from TB-16)
- [x] No open Blocking findings
- [ ] Jira updated (In Review → Done)
