# TB-21 — Plan

> Jira: https://stratyge.atlassian.net/browse/TB-21 · Spec: [spec.md](spec.md)
> Branch: `feat/tb-21/local-sqlite-schema` · Orca worktree `tb-21-local-sqlite` · Merge order: **3rd** (after TB-16 and TB-17; rebase onto TB-17's `babel.config.js` / `metro.config.js` before the PR)
> Status: **Accepted by the owner on 2026-10-27** ("accept all")

## Goal
Versioned local schema with tested migrations, typed repositories, and a list query that stays under 50 ms p95 at 10,000 tasks.

## Owned paths
`src/db/**`, `src/features/tasks/repo/**`, `src/features/tasks/schema.ts`, `src/lib/ids.ts`, `src/lib/polyfills.ts`, `drizzle.config.ts`, `drizzle/**`, `app/dev/**`, `docs/tickets/TB-21/**`. Shared: `package.json`/lockfile; Drizzle entries appended to `babel.config.js` / `metro.config.js` **after** TB-17 merges (until then, work and test in Node; the Metro wiring is the last task); one-line `DbGate` wrap in `app/_layout.tsx` (recorded in the PR).

### Task 1 — Dependencies and test driver
- [ ] `pnpm expo install expo-sqlite expo-crypto`; `pnpm add drizzle-orm@0.45 uuidv7 zod`; `pnpm add -D drizzle-kit@0.31 better-sqlite3 @types/better-sqlite3 babel-plugin-inline-import`.
- [ ] pnpm 10 blocks install scripts: add `better-sqlite3` to `pnpm.onlyBuiltDependencies`. If no Node 24 prebuild on Windows, use the `node:sqlite` + `drizzle-orm/sqlite-proxy` fallback and log a Deviation.
- **Verify:** a smoke test opens an in-memory DB and runs `select 1`.

### Task 2 — Schema and migrations
- [ ] `src/db/schema.ts` (spec Data section) with a shared `syncColumns()` helper for `id/created_at/updated_at/deleted_at`.
- [ ] `drizzle.config.ts` (`dialect: 'sqlite'`, `driver: 'expo'`, `out: './drizzle'`); `pnpm db:generate` → `0000` (tables) then `0001` (indexes).
- [ ] `src/db/migrate-node.ts` test helper that applies the generated folder (or the first *k* entries of the journal) to a Node DB.
- **Verify:** `schema.test.ts` — all 5 tables and the 4 sync columns exist (`PRAGMA table_info`), ids are TEXT PKs.

### Task 3 — Migration safety harness (AC2)
- [ ] `src/db/migrations.test.ts`: for each migration k ≥ 1, apply 0…k-1, seed every table (live + soft-deleted rows), apply k, assert counts and id checksum unchanged.
- **Verify:** passes for `0000→0001`; a deliberately destructive test migration (drop + recreate `tasks` without copying) makes it fail (fixture only, not committed).

### Task 4 — IDs, validation, repositories
- [ ] `src/lib/polyfills.ts` (`crypto.getRandomValues` from `expo-crypto` when missing) and `src/lib/ids.ts` (`newId()`); test that ids are v7, unique and time-ordered.
- [ ] `src/features/tasks/schema.ts` Zod inputs (title ≤ 500, notes ≤ 10,000, priority 0–3, status enum).
- [ ] `task-repo.ts`, `list-repo.ts`, `tag-repo.ts` per spec, typed on a `TaskBuddyDb` base type; `updated_at` set on every write; soft delete only; list delete moves tasks to Inbox in one transaction; case-insensitive unique tag names on live rows.
- [ ] ESLint `no-restricted-imports`: `expo-sqlite` and `drizzle-orm/expo-sqlite` only inside `src/db/**`.
- **Verify:** repo tests for every method and every edge case in the spec table; lint rule proven with a temporary violating import.

### Task 5 — Perf (AC3)
- [ ] `listOpenTasks` keyset pagination using the `0001` index; `EXPLAIN QUERY PLAN` test asserts the index is used (no full scan).
- [ ] Node benchmark test: seed 10,000 tasks, 100 runs, p95 < 50 ms (regression guard).
- [x] `src/app/dev/db-benchmark.tsx` (was `app/dev/`; `__DEV__` only; otherwise not-found) seeding a separate `benchmark.db`.
- **Verify:** emulator run (owner decision: emulator as proxy) → p50/p95/max recorded with a screenshot.

### Task 6 — App wiring (after TB-17 merges)
- [x] Rebase on `main`; append `inline-import` (`.sql`) to `babel.config.js` and `sourceExts.push('sql')` to `metro.config.js`; `src/db/client.ts` + `DbGate` + `useDbMigrations`; wrap in `src/app/_layout.tsx` (routes moved by TB-15).
- [ ] Device verify (coordinator, emulator).
- **Verify:** fresh install on the emulator → app opens; benchmark screen lists the tables from `sqlite_master` (AC1 device evidence).

### Task 7 — Review and verification
- [ ] Independent reviewer + **security pass** (high risk) + top-tier model; data/migration lens.
- [ ] `verification.md`; `check-ticket-docs.mjs --pr`; comment on TB-53 about hard-delete + VACUUM.

## Risks and rollback
- better-sqlite3 native build on Windows/Node 24 → fallback in Task 1.
- Shipped migrations are permanent on devices: after release, never edit `0000`/`0001`; fix forward with a new migration. Before release (now), regenerate freely.
- Rollback: revert the PR (no released app yet, so no on-device data to migrate back).
