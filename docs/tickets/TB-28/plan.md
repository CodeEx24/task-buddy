# TB-28 — Implementation plan

> Jira: https://stratyge.atlassian.net/browse/TB-28 · Spec: [spec.md](spec.md)

## Branch & worktree
`feat/tb-28/task-detail-notes-subtasks` (Orca worktree `tb-28-task-detail`, from `main` ceb46ab).
Owns: `src/features/tasks/components/{TaskDetailModal,TaskDetailForm,TaskFormFields,TaskForm,SubtaskChecklist}*`, `src/features/tasks/hooks/use-subtasks.ts`, `src/lib/use-autosave*`, `docs/tickets/TB-28/**`.
Shared (minimal edits): `src/features/tasks/{schema,task-form}.ts`, `repo/task-repo.ts`, `repo/repo-utils.ts`, `hooks/task-query-keys.ts`, `hooks/use-task-mutations.ts` (one line: placeholder notes), `task-crud-routes.test.tsx`, `NewTaskModal.test.tsx`, `use-task-mutations.test.tsx`.
Must not edit: TB-27's files (`TaskListScreen`, `TaskRow`, `task-sections`, Today screen), `eslint.config.js` and other lint/format configs, `drizzle/**`, other tickets' docs.

## Dependencies
Blocked by TB-26 (US-012), merged on `main` (ceb46ab). Uses TB-21's schema and TB-18's modal route.

## Tasks
### Task 1 — Repository
- [x] `createSubtask` appends and caps at 100 (`LIMIT_REACHED`); `moveSubtask(up|down)`; schemas.
- Verify: `task-repo.test.ts` "subtask checklist order and limit (TB-28)".

### Task 2 — Form contract
- [x] `notes` in `taskFormSchema`/`TaskFields`; `changedTaskFields`; `subtaskTitleSchema`; create placeholder carries notes.
- Verify: `task-form.test.ts`.

### Task 3 — Autosave hook
- [x] `src/lib/use-autosave.ts`: debounce, unmount save, `flush`, no retry loop.
- Verify: `use-autosave.test.ts` (fake timers).

### Task 4 — UI
- [x] `TaskFormFields` (shared), `TaskForm` (add) on top of it, `TaskDetailForm` (autosave), `use-subtasks.ts`, `SubtaskChecklist`, `TaskDetailModal` composition; Delete flushes first.
- Verify: `TaskDetailModal.test.tsx`, `SubtaskChecklist.test.tsx`, `NewTaskModal.test.tsx`, `task-crud-routes.test.tsx`.

### Task 5 — Gates and docs
- [x] lint, typecheck, test, drizzle-kit check, workflow check; verification.md.

## Test strategy
| AC | Test (layer) | File |
|---|---|---|
| AC1 edit fields | Component (real SQLite twin) | `TaskDetailModal.test.tsx` "pre-fills the form and autosaves edits…" |
| AC1 checklist | Component + repo | `SubtaskChecklist.test.tsx` (add, blank, check, reorder, delete, limit, rollback); `task-repo.test.ts` |
| AC1 end to end | Route (real `src/app`) | `task-crud-routes.test.tsx` |
| AC2 | Component | `SubtaskChecklist.test.tsx` "completing the parent…" suite |
| AC3 | Hook + component (fake timers) | `use-autosave.test.ts`; `TaskDetailModal.test.tsx` "autosaves 500 ms after the last keystroke, not before", "saves a change still waiting … when the modal closes" |
| Device | Manual | verification.md "Manual / E2E" |

## Risks & rollback
- Autosave writes more often than an explicit save: each write is one local SQLite update of changed columns only; no network. Detect: save status line, tests. Roll back: revert the PR (no migration).
- Native modal dismissal (iOS swipe-down) relies on the screen unmounting to flush; checked on device by the coordinator.
- Shared-file edits with TB-27 (`task-crud-routes.test.tsx`, `use-task-mutations.ts`) may conflict on merge; both are small.
