# TB-21 — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-21 · PR: https://github.com/CodeEx24/task-buddy/pull/9 · Branch: `feat/tb-21/local-sqlite-schema`
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

## Commands run: after rebasing on `main` (6fb9238: TB-16, TB-15 routes move, TB-17) and Task 6 wiring
Same machine and toolchain, 2026-10-27, worktree `tb-21-local-sqlite`, CI order. No Metro dev server, emulator, Docker or EAS build was started.

| Command | Result | Notes |
|---|---|---|
| `git rebase origin/main` | pass after conflicts | `package.json` (kept both sides' deps: TB-17's `@gorhom/bottom-sheet`, `expo-dev-client`, `nativewind`, `react-native-worklets`, `tailwindcss` + TB-21's `drizzle-orm`, `expo-crypto`, `expo-sqlite`, `uuidv7`, `zod`, `pnpm.onlyBuiltDependencies`); `pnpm-lock.yaml` taken from `main` and regenerated with `pnpm install` (never hand-merged). `jest.config.js` merged cleanly (TB-17 `setupFiles` + CSS stub kept, TB-21 `@/db/client` mapping kept) |
| `pnpm install --frozen-lockfile` | pass | "Already up to date" |
| `pnpm lint` | pass | 0 problems (after `prettier --write` on `home-route.test.tsx`) |
| `pnpm typecheck` | pass | `tsc --noEmit` |
| `pnpm test --ci` | pass | 23 suites, 137 tests (TB-15 + TB-16 + TB-17 + TB-21). First run (cold transform cache after the Babel change) failed 2 route tests on the 5 s timeout (see failures below); fixed. Final cold run `pnpm test --ci --no-cache`: 23/23 suites, 137/137 tests, 79.8 s. Re-run on HEAD `bf34706`: 23/23, 137/137 |
| `npx expo-doctor` | pass, then 19/20 on re-run | First run 20/20. Re-run on HEAD `bf34706` (via `pnpm dlx expo-doctor`): 19/20. The one failure is patch-version drift in packages TB-21 does not own (`expo` 58.0.19 → ~58.0.20, `expo-dev-client` 58.0.15 → ~58.0.16, `expo-router` 58.0.26 → ~58.0.27). New patches were published between the two runs. `main` pins the same versions, so this affects `main` too. TB-21's `expo-sqlite` and `expo-crypto` are not flagged. Not fixed here (stack versions are locked in CLAUDE.md; a separate chore) |
| `npx expo export --platform android --output-dir <scratchpad>/tb21-export` | pass | One Hermes bundle (5.2 MB). The bundle contains `tasks_status_check`, `tasks_live_status_due_sort_idx`, ``CREATE TABLE `task_tags` `` and `taskbuddy.db` (`grep -c -a` = 1 each), so the `.sql` migrations are inlined by `babel-plugin-inline-import` through Metro |
| `pnpm exec drizzle-kit check` | pass | "Everything's fine" |
| `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-21/local-sqlite-schema` | pass | `workflow check: ok` |

## Commands run: device run and merge of `main` (TB-18 app shell), 2026-10-28
Android emulator `Medium_Phone_API_37.0` (owner-approved proxy for a mid-range Android device), EAS development build `e98f091e` (built from `d7b1d9a`, includes expo-sqlite + expo-crypto), Metro `expo start --dev-client` on 8081.

| Command | Result | Notes |
|---|---|---|
| `eas build -p android --profile development` | pass | Build `e98f091e-c14b-4c09-9b8f-b922524da0e4` FINISHED; APK installed with `adb install -r` |
| Emulator: open `/dev/db-benchmark` (AC1) | pass | "Tables in taskbuddy.db: lists, subtasks, tags, task_tags, tasks", "Migrations applied: 2" (`android-db-tables.png`) |
| Emulator: Run benchmark, 10,000 tasks (AC3) | pass | `listOpenTasks` first page (100 rows) × 100 runs: p50 6.21 ms, **p95 9.1 ms**, max 16.7 ms; one-list p95 8.49 ms; seeded in 2262 ms (`android-db-benchmark.png`; Metro log `[TB-21 benchmark] {...}`) |
| `git merge origin/main` (TB-18 #10) | pass after conflicts | `src/app/_layout.tsx`: DbGate now wraps TB-18's tab + modal Stack. `home-route.test.tsx`: TB-18's test name, TB-21's async form. Benchmark route tests now mock Ionicons (tab bar renders under the root layout) |
| `pnpm lint` (after merge) | pass | 0 problems |
| `pnpm typecheck` (after merge) | pass | After removing the stale, git-ignored `.expo/types/router.d.ts` generated before the merge |
| `pnpm test --ci` (after merge) | pass | 27 suites, 181 tests |
| `pnpm exec drizzle-kit check` (after merge) | pass | "Everything's fine" |
| Emulator, cleared app data, merged code (after merge) | pass | Fresh install runs migrations: Today tab with TB-18 tab bar (`android-merged-today-tabs.png`); `/dev/db-benchmark` lists the 5 tables, 2 migrations (`android-merged-db-tables.png`) |

Failures hit after the rebase, and their fixes:
1. `home-route.test.tsx` (TB-15) and `db-benchmark-route-release.test.tsx` timed out (5 s) in the first full run: the root layout now renders screens only after `DbGate` migrates, and the Babel config change invalidated the Jest transform cache. Both pass alone and on a warm cache. Fixed for CI's cold cache: `findBy*` instead of `getBy*`, 30 s per-test timeout; verified with `--no-cache`.

Negative checks (all temporary, removed afterwards):
1. **AC2 harness catches loss.** A temporary fixture migration rebuilding `subtasks` without copying rows and dropping `tasks.notes` → the harness failed with `subtasks: 6 rows before, 0 after`, `subtasks: id checksum changed`, `tasks.notes: column dropped`. After review this fixture became a committed test (`src/db/migrations.test.ts`, "fails a destructive migration"), alongside a lossless rebuild that passes.
2. **Lint rule.** `src/features/tasks/components/tmp-violation.ts` importing `expo-sqlite` and `drizzle-orm/expo-sqlite/migrator`, linted with the rule → `2 problems (2 errors)`: "'expo-sqlite' import is restricted… Open the DB only in src/db; use a repository". File removed.
3. **Release build hides the dev route.** Removing the `__DEV__` guard in `app/dev/db-benchmark.tsx` (now `src/app/dev/`) → `db-benchmark-route-release.test.tsx` failed ("Unable to find an element with testID: not-found-screen"). Guard restored.

Failures hit during the build, and their fixes:
1. `pnpm expo install expo-sqlite` added the `expo-sqlite` config plugin to `app.json` (not an owned path, and only needed for options such as SQLCipher) → reverted.
2. jest-expo's `performance.now()` has 1 ms resolution (first benchmark read `p50 1 / p95 1 / max 1`) → `runListBenchmark` takes an injectable clock; the Jest test passes `process.hrtime`.
3. Expo Router keeps navigation state between `renderRouter` calls in one file → the release-build route test moved to its own file.
4. `useTestClock` tripped `react-hooks/rules-of-hooks` → renamed `installTestClock`.

## Acceptance criteria
| AC (verbatim) | Status | Evidence (test name, file:line, screenshot, observed result) |
|---|---|---|
| Given a first launch, then migrations run and tables tasks, subtasks, lists, tags exist with id (UUIDv7), updated_at and deleted_at | met | **Device (met):** emulator shows `lists, subtasks, tags, task_tags, tasks` and "Migrations applied: 2" on a fresh install, before and after merging TB-18 (`android-db-tables.png`, `android-merged-db-tables.png`). **Node (met):** `src/db/schema.test.ts` applies every migration to an empty DB and asserts the 5 tables (incl. `task_tags`) and `id TEXT PK`, `updated_at INTEGER NOT NULL`, `deleted_at INTEGER NULL` via `pragma_table_info`; idempotent second launch; journal order; `drizzle/migrations.js` bundles every journal entry. UUIDv7: `src/lib/ids.test.ts`, `task-repo.test.ts`. `DbGate.test.tsx` runs migrations before rendering children and recovers after a failed attempt. Atomicity on first launch and on update: `migrations.test.ts` "migration atomicity". Wiring: `src/app/_layout.tsx` wraps the root `Stack` in `DbGate`; Android export bundles the inlined migrations. **Device: pending coordinator emulator run** (open `/dev/db-benchmark`, which lists `sqlite_master` tables of the real `taskbuddy.db`) |
| Given a v1 database with data, when v2 migration runs in a test, then no rows are lost | met | `src/db/migrations.test.ts` "migration 1 (0001_list_query_indexes) keeps every row of version k-1": seeds live and soft-deleted rows in every table at v1, applies v2, compares row counts, id checksums and every column value. Generic for every future migration. Proven to fail on a destructive fixture and pass on a lossless rebuild (committed tests) |
| Given 10,000 tasks, a list query returns in under 50 ms at p95 on a mid-range Android device | met | **Emulator (owner-approved proxy): p95 9.1 ms** (p50 6.21, max 16.7; one-list p95 8.49) over 100 runs with 10,000 tasks, budget 50 ms (`android-db-benchmark.png`). Supporting evidence: Node benchmark p95 0.91–1.19 ms (`list-benchmark.test.ts`, budget < 50 ms); `EXPLAIN QUERY PLAN` of every statement `listOpenTasks` issues uses `tasks_live_status_due_sort_idx` with no table scan and no temp B-tree for ORDER BY |
| Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated | met | After merging `main` (TB-18): 27 suites / 181 tests pass, no regressions; CI green on PR #9. Reviewer + security reviewer on the schema/repos; a second reviewer pass on the wiring diff (`795f491..HEAD`) found nothing blocking (finding 12 below). Ticket docs updated. ESLint rule still not committed (hook-protected config, see Known limitations; not part of this AC) |

## Manual / E2E
Run on 2026-10-28 (see "Device run" above; all screenshots in this folder). Steps used:
1. `pnpm android`, wait for the home screen (the app passes `DbGate`, so migrations ran).
2. Open `exp://…/--/dev/db-benchmark` (route file `src/app/dev/db-benchmark.tsx`) (or navigate to `/dev/db-benchmark`): "Tables in taskbuddy.db" must read `lists, subtasks, tags, task_tags, tasks`, "Migrations applied: 2" → AC1 device evidence (screenshot).
3. Tap **Run benchmark (10,000 tasks)**; record p50/p95/max (also logged as `[TB-21 benchmark] {...}` in Metro) → AC3 (screenshot). p95 must be < 50 ms.

## Review findings
| # | Severity | Finding (file:line) | Source | Resolution |
|---|---|---|---|---|
| 1 | Important | Driver failures propagate as `DrizzleQueryError`, whose message embeds bound params (task titles/notes/tag names) → could reach logs/Sentry (`src/db/db-errors.ts`, all repos) | security reviewer | Fixed: every exported repo function is wrapped by `guardDb` (`repo-utils.ts`), rethrowing `RepoError('DB_FAILURE')` with only `{ name, code }`. Tests: `repo-utils.test.ts`, `task-repo.test.ts` "surfaces driver failures as DB_FAILURE without task text" |
| 2 | Nit | `idSchema = z.uuid()` accepts any version (`schema.ts:14`) | security reviewer | Fixed: `z.uuidv7()`; test "accepts only UUIDv7 ids". Revisit if sync ever imports foreign ids |
| 3 | Nit | Dev route code ships as dead code in release (`src/app/dev/db-benchmark.tsx`) | security reviewer | Accepted: render gated by `__DEV__` (proven by test); no access to user data beyond read-only introspection |
| 4 | Nit | Benchmark `console.log`, `tableColumns` param binding | security reviewer | Confirmed fine, no change |
| 5 | Important | No test that a failing migration leaves no partial schema | reviewer agent | Fixed: "migration atomicity" tests (first launch and update path, retry) |
| 6 | Important | AC2 harness only proven on an index-only migration; destructive fixture not committed | reviewer agent | Fixed: committed fixture tests via `src/db/migration-fixtures.ts` (destructive fails, lossless rebuild passes) through the real seed → migrate → compare pipeline |
| 7 | Nit | No `CHECK` constraints on `status` / `priority` | reviewer agent | **Fixed (owner decision): `tasks_status_check`, `tasks_priority_check` in `0000_init.sql`.** Original note: The accepted schema has none; Zod enforces at the repo boundary. Adding a CHECK later needs a table rebuild, so decide before release (and before TB-43 sync writes rows) |
| 8 | Nit | Cascading soft-deletes beyond the spec text not recorded | reviewer agent | Fixed: recorded in spec Deviations |
| 9 | Nit | Empty patch still bumps `updated_at` | reviewer agent | Fixed: update functions return the current row without writing; test "does not write for an empty patch" |
| 10 | — | Self-review: Drizzle's migrator skips a migration whose journal `when` is not newer than the last applied one | self | Fixed: test "keeps the journal ordered" |
| 12 | Important | `.sql` inlining (Babel/Metro) is not exercised by Jest, which maps `@/db/client` to the Node twin | reviewer agent (wiring pass) | Covered for this PR by the Android export check and the emulator run on a real expo-sqlite DB. Follow-up: add `expo export --platform android` to CI |
| 11 | — | Self-review: injection (all values bound), soft deletes only, `updated_at` on every write, transactions on every multi-statement write, logs carry no task data, no `any` | self | — |

## Known limitations & follow-ups
- **ESLint rule committed on 2026-10-28** (`chore/tb-21/eslint-db-import-rule`, at the owner's explicit request; the config-protection hook had blocked agent edits before). `no-restricted-imports` blocks `expo-sqlite`, `better-sqlite3` and `drizzle-orm/expo-sqlite/*` outside `src/db/**`. Proven with a temporary violating file: 2 errors.
- **Task 6 wiring done**; `src/db/client.ts` + `drizzle/migrations.js` are proven to bundle (Android export) but only run on a device: Jest still maps `@/db/client` to the Node twin. The emulator run is the first real execution of the expo-sqlite path.
- **Future table rebuilds:** with `foreign_keys = ON`, drizzle-kit's `PRAGMA foreign_keys=OFF` inside the migration transaction is a no-op, so rebuilding a *parent* table (`lists`, `tasks`, `tags`) with children present will fail on devices. Write such migrations by hand (or run them outside the transaction) and prove them with the fixture harness.
- `tags` uniqueness uses SQLite `lower()`, which folds ASCII only; Postgres `lower()` is Unicode-aware. TB-43 should align the rule.
- The one-list query uses `tasks_list_id_idx` plus a sort of that list's rows (Node p95 ~1 ms at 10k). Add a `(list_id, deleted_at, status, due_at, sort_order)` index only if device numbers call for it.
- Soft-deleted rows stay on device until TB-53 (hard delete + VACUUM). SQLCipher is out of scope (TB-54).
- `status`/`priority` CHECK constraints: decided by the owner and added (spec Decisions).

## Completion
- [x] All AC met with evidence (AC1/AC3 on the Android emulator, 2026-10-28)
- [x] Gates green locally (CI from TB-16)
- [x] No open Blocking findings
- [ ] Jira updated (In Review → Done)
