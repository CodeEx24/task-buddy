# TB-26 — Implementation plan

> Jira: https://stratyge.atlassian.net/browse/TB-26 · Spec: [spec.md](spec.md)

## Branch & worktree
`feat/tb-26/task-crud` (Orca worktree `tb-26-task-crud`, from `main` 4d42e5e).
Owns: `src/features/tasks/**`, `src/stores/undo-store*`, `src/lib/dates*`, `src/lib/query-client*`, `src/lib/QueryProvider*`, `src/components/ui/ChipGroup*`, `src/app/task/**`, `src/app/(tabs)/inbox.tsx`, `docs/tickets/TB-26/**`.
Shared (minimal edits): `package.json` + `pnpm-lock.yaml` (4 JS deps via `pnpm add`, never hand-merged), `src/app/_layout.tsx` (QueryProvider + `task/new` screen), `src/components/ui/index.ts` (export), `src/features/navigation/**` (move `TaskDetailModal` out, retire `InboxScreen` placeholder, update route tests).
Must not edit: `eslint.config.js` and other lint/format configs, `drizzle/**` (no migration needed), other tickets' docs.

## Dependencies
Blocked by TB-21 and TB-18, both merged on `main` (4d42e5e, 8974964).

## Tasks
### Task 1 — Docs
- [x] intent.md, spec.md, plan.md.

### Task 2 — Dependencies and query client
- [ ] `pnpm add` the four pinned deps (D6).
- [ ] `src/lib/query-client.ts` (`networkMode: 'always'`, `retry: false`, `staleTime: Infinity`), `src/lib/QueryProvider.tsx`; wire into `src/app/_layout.tsx` inside `DbGate`.
- Verify: `pnpm typecheck`, existing route tests.

### Task 3 — Repository additions
- [ ] `listCompletedTasks`, `restoreTask` + schemas; tests in `task-repo.test.ts` (ordering, limit, restore of children, not-found, deleted list → Inbox, deleted tag stays unlinked, file DB reopen keeps tasks).

### Task 4 — Pure logic
- [ ] `src/lib/dates.ts` (+ test): `startOfLocalDay`, `addLocalDays`, `toDateInput`, `parseDateInput`, `formatDueLabel`, `formatCompletedAt`.
- [ ] `src/features/tasks/priority.ts`, `task-form.ts` (+ test), `task-sections.ts` (+ test).

### Task 5 — UI store and primitives
- [ ] `src/stores/undo-store.ts` (+ test with fake timers): `offerUndo`, `dismissUndo`, 5 s expiry, replacement.
- [ ] `src/components/ui/ChipGroup.tsx` (+ test): radiogroup/radio roles, checked state, 44 pt targets.

### Task 6 — Hooks
- [ ] `use-task-board.ts`, `use-task.ts`, `use-task-mutations.ts` with optimistic `onMutate`, rollback `onError`, `invalidateQueries` on settle.

### Task 7 — Screens
- [ ] `TaskForm` (RHF + `zodResolver`), `TaskRow`, `UndoSnackbar`, `TaskListScreen`, `NewTaskModal`, `TaskDetailModal` (moved); routes; component tests + route-level integration tests (create → section, complete → Completed → un-complete, delete → undo, restart).

### Task 8 — Gates, self-review, verification.md

## Test strategy
| AC | Test (layer) | File |
|---|---|---|
| AC1 form → right section, optimistic | Component integration (real SQLite via better-sqlite3) | `src/features/tasks/components/TaskListScreen.test.tsx`, `NewTaskModal.test.tsx`, `src/features/tasks/hooks/use-task-mutations.test.tsx` |
| AC1 persists after restart | New QueryClient + remount reads the DB; file DB reopen | `TaskListScreen.test.tsx`, `task-repo.test.ts` |
| AC1 routing | Route test (`renderRouter`) | `src/features/tasks/task-routes.test.tsx` |
| AC2 complete / un-complete | Component + repo | `TaskListScreen.test.tsx`, `TaskDetailModal.test.tsx`, `task-repo.test.ts` (TB-21) |
| AC3 soft delete + 5 s undo | Store (fake timers), component, repo | `undo-store.test.ts`, `TaskDetailModal.test.tsx`, `TaskListScreen.test.tsx`, `task-repo.test.ts` |
| Grouping / dates / form | Unit | `task-sections.test.ts`, `dates.test.ts`, `task-form.test.ts` |

Device checks (coordinator, Android dev build): see verification.md "Manual / E2E".

## Risks & rollback
- Optimistic cache and DB disagree → every mutation invalidates the board on settle, so the DB wins. Rollback on error.
- Keyboard covering the form in the modal → ScrollView with `keyboardShouldPersistTaps`; checked on device.
- Rollback: revert the squash commit. No migration, so no data change to undo.
