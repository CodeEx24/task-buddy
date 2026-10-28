# TB-26 — Spec

> Jira: https://stratyge.atlassian.net/browse/TB-26 · Intent: [intent.md](intent.md)
> Status: Draft, decisions taken by the worker agent under the coordinator's brief (2026-10-28). Owner review at PR time.

## Acceptance criteria (verbatim from Jira)
- [ ] AC1 Given the add-task form, when I save a title with due date and priority, then the task appears in the right list instantly (optimistic) and persists after restart
- [ ] AC2 Given a task, when I complete it, then it moves to Completed with a timestamp and can be un-completed
- [ ] AC3 Deleting a task is a soft delete (deleted_at) with a 5-second undo
- [ ] AC4 Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated

## Behaviour
- **Task list (Inbox tab, `inbox-screen`).** Sections, in order, each hidden when empty:
  - **Today**: open tasks due today or earlier (overdue ones are labelled "Overdue").
  - **Upcoming**: open tasks due after today.
  - **No date**: open tasks without a due date.
  - **Completed**: done tasks, most recently completed first, each with "Completed <Mon D>, <h:mm AM>".
  Inside an open section: due date ascending, then priority (High first), then creation order. An empty list shows "No tasks yet" with the Add task button.
- **Add (AC1).** "Add task" (`add-task-button`) opens the `/task/new` modal with the task form. Fields: Title (required, ≤ 500 chars), Due date (chips None / Today / Tomorrow / Next week plus a `YYYY-MM-DD` field), Priority (None / Low / Medium / High). Save validates with Zod; errors show under the field and nothing is written. On save the task is inserted into the cached list **before** the SQLite write (TanStack Query optimistic update), the modal closes and the task is in its section. The write then lands in SQLite; the list is refetched from the DB. On a DB error the optimistic row is rolled back.
- **Edit.** Tapping a task's "Edit" opens `/task/<id>` with the same form pre-filled; Save updates the row (optimistic) and closes the modal. Unknown or deleted ids show "This task doesn't exist anymore." Malformed ids keep TB-18's invalid-link message.
- **Complete / un-complete (AC2).** The row checkbox (and "Mark complete" / "Mark as not done" in the modal) toggles `status`; the repository stamps `completed_at` on done and clears it on open (TB-21). The row moves between its open section and Completed at once (optimistic).
- **Delete with undo (AC3).** "Delete task" in the modal soft-deletes the task (repository sets `deleted_at` and `updated_at` on the task, its live subtasks and tag links) and closes the modal. The list shows a snackbar "Task deleted" with **Undo** (`undo-snackbar`, `undo-button`) for 5 seconds. Undo restores the task and the rows deleted with it (same `deleted_at`). After 5 s the snackbar disappears; the row stays soft-deleted. A second delete replaces the snackbar (the undo then applies to the latest delete).
- **Restart.** Everything is in `taskbuddy.db`; on restart the list is read from SQLite.
- **Offline.** No network is involved. TanStack Query uses `networkMode: 'always'` so queries and mutations never pause when the device is offline.

## Technical design
- **Surfaces**
  - Routes (thin): `src/app/(tabs)/inbox.tsx` → `TaskListScreen`; `src/app/task/new.tsx` (new) → `NewTaskModal`; `src/app/task/[id].tsx` → `TaskDetailModal` (moved from `features/navigation` to `features/tasks`). `src/app/_layout.tsx`: add `QueryProvider` and the `task/new` modal screen.
  - Components (`src/features/tasks/components`): `TaskListScreen`, `TaskRow`, `TaskForm`, `NewTaskModal`, `TaskDetailModal`, `UndoSnackbar`.
  - Hooks (`src/features/tasks/hooks`): `use-task-board.ts` (board query), `use-task.ts` (one task), `use-task-mutations.ts` (create, update, set done, delete, restore; optimistic).
  - Pure logic: `src/features/tasks/task-sections.ts` (grouping + ordering), `src/features/tasks/task-form.ts` (form schema, form ↔ repo input), `src/features/tasks/priority.ts`, `src/lib/dates.ts` (local-day maths, `YYYY-MM-DD`, labels).
  - UI store: `src/stores/undo-store.ts` (Zustand): the pending undo and its 5 s timer.
  - Shared primitive: `src/components/ui/ChipGroup.tsx` (single-choice radio chips), used for due chips and priority.
  - Query client: `src/lib/query-client.ts` + `src/lib/QueryProvider.tsx`.
- **Interfaces & contracts**
  - Repository additions (`task-repo.ts`): `listCompletedTasks(db, { limit? })` (live `done` tasks, `completed_at` desc, then id desc; default 100, max 500) and `restoreTask(db, id)` (un-deletes a soft-deleted task plus the subtasks and tag links that carry the same `deleted_at`; tag links whose tag is no longer live stay deleted; a task whose list was deleted meanwhile comes back in the Inbox, `list_id = NULL`; throws `NOT_FOUND` if the id is unknown or the task is live). Both validated with Zod and wrapped in `guardDb`.
  - Board query: `{ open: Task[]; completed: Task[] }`, key `['tasks', 'board']`; task detail key `['tasks', 'detail', id]`.
  - Due date storage: `due_at` = local midnight of the chosen day, epoch ms (date-only; see D3).
  - Priority: existing `priority` integer 0–3 = None / Low / Medium / High.
- **Data changes:** none. No migration; existing columns and indexes cover the queries (`listCompletedTasks` is bounded by `LIMIT`).
- **Reuse:** TB-21 repositories and Zod schemas (`createTaskInputSchema`, `updateTaskInputSchema`, `taskPrioritySchema`, `MAX_TITLE_LENGTH`); TB-17 `Button`, `Card`, `Checkbox`, `Input`; TB-18 `parseTaskIdParam` and modal close behaviour; `newId()` for optimistic rows.

## Edge cases
| Case | Expected |
|---|---|
| Blank / whitespace title | "Add a title" error, nothing saved |
| Title > 500 chars | Error, nothing saved |
| `2026-02-30`, `tomorrow`, `2026-1-5` in the date field | "Use a real date as YYYY-MM-DD" error |
| Empty date field | No due date |
| Due date in the past | Allowed; shows in Today as "Overdue" |
| Task due today at midnight vs end of day | Both in Today (day comparison, local time) |
| DB write fails | Optimistic change rolled back, list refetched, an error message shows in the form ("Couldn't save. Please try again.") |
| Undo after 5 s | Not offered (snackbar gone) |
| Delete A then B within 5 s | Snackbar shows for B; Undo restores B only |
| Edit a task that was deleted meanwhile | "This task doesn't exist anymore." |
| Deep link to `/task/<id>` of a deleted task | Same not-found message |

## Security, privacy & AI cost
No AI, no network, no new permissions. Task titles are user content: they are never logged (RepoError messages carry no user content, TB-21). The route `id` param stays untrusted and validated (TB-18). New dependencies are JS-only and pinned (no new native code, no new dev build).

## Decisions
| # | Decision | Options considered | Choice | Decided by / date |
|---|---|---|---|---|
| D1 | Where tasks are listed until TB-27 | (a) Inbox tab becomes a sectioned list; (b) replace Today's design-system demo; (c) new tab | (a) Inbox tab with Today / Upcoming / No date / Completed sections. Keeps Today (TB-27's) and the tab set (TB-18) untouched; "right list" = right section | Worker, 2026-10-28 |
| D2 | Where the add form lives | (a) `/task/new` modal route; (b) bottom `Sheet`; (c) inline card | (a): native modal (Expo Router skill: prefer `presentation: 'modal'` over custom modals), keyboard handling is standard, and it shares `TaskForm` with the edit modal. The bottom sheet's plain `TextInput` would need `BottomSheetTextInput` for keyboard avoidance | Worker, 2026-10-28 |
| D3 | Due date granularity | date-only vs date + time | Date only, stored as local midnight epoch ms. Times come with reminders (TB-40) | Worker, 2026-10-28 |
| D4 | Date picker | `@react-native-community/datetimepicker` (native, new dev build) vs JS | JS-only: chips None / Today / Tomorrow / Next week + `YYYY-MM-DD` field, validated by Zod | Worker, 2026-10-28 |
| D5 | Priority values | 3 vs 4 levels | 4: None (0), Low (1), Medium (2), High (3), matching the TB-21 column check `0..3` | Worker, 2026-10-28 |
| D6 | Data/state libraries | Hand-rolled store vs locked stack | Add the locked-stack libraries (CLAUDE.md §2), all JS-only, exact-pinned, ≥ 2 weeks old: `@tanstack/react-query` 5.104.2, `zustand` 5.0.15, `react-hook-form` 7.90.0, `@hookform/resolvers` 5.9.1 (6.x is < 2 weeks old) | Worker, 2026-10-28 |
| D7 | Delete confirmation | Confirm dialog vs undo | Undo only (AC3); no confirm dialog | Worker, 2026-10-28 |
| D8 | Undo scope | Task only vs task + children | Task plus the subtasks/tag links deleted in the same operation (matching `deleted_at`) | Worker, 2026-10-28 |

## Deviations (added during build)
| Date | Change | Reason | Approved by |
|---|---|---|---|
