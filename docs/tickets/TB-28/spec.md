# TB-28 — Spec

> Jira: https://stratyge.atlassian.net/browse/TB-28 · Intent: [intent.md](intent.md)
> Status: Draft, decisions taken by the worker agent under the coordinator's brief (2026-10-28). Owner review at PR time.

## Acceptance criteria (verbatim from Jira)
- [ ] AC1 Given a task, when I open it, then I can edit title, notes, due date, priority and manage a subtask checklist
- [ ] AC2 Given all subtasks are checked, then I am offered to complete the parent task
- [ ] AC3 Edits autosave within 500 ms of the last keystroke
- [ ] AC4 Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated

## Behaviour
- **Detail screen (`/task/<id>`, AC1).** Top to bottom: a "Task" card with Title, Due date (chips No date / Today / Tomorrow / Next week + "Or type a date" `YYYY-MM-DD`), Priority (None / Low / Medium / High) and **Notes** (multi-line); a save status line; the **Steps** card; the completion time (done tasks); **Mark complete / Mark as not done**; **Delete task**; **Close**. There is no Save button.
- **Autosave (AC3).** After any change to title, due date, priority or notes, the screen waits 500 ms; every new keystroke restarts the wait. Then, if every field is valid, only the fields that differ from the stored task are written with `updateTask` (optimistic, as in TB-26: board and detail cache update first). The status line shows "Saving…" while a change waits or is written, "All changes saved" after, or "Couldn't save. Please try again." on a DB error (the typed text stays; the same value is not retried in a loop, the next edit retries).
  - Invalid values (blank title, bad date, notes over 10,000 characters) show their error under the field as you type and nothing is saved until fixed; the status line reads "Not saved yet: fix the field marked in red."
  - Closing the screen (Close, Android back, iOS swipe-down) saves a change still waiting. **Delete task** first saves a waiting change, so Undo brings it back too.
  - Blank notes (only whitespace) are stored as `NULL`; other notes are stored exactly as typed.
- **Steps (subtask checklist, AC1).** Shows "N of M done" (or a hint when empty), one row per live step in order: checkbox (label = step title), ↑ (Move up), ↓ (Move down), ✕ (Delete). ↑ is disabled on the first row and ↓ on the last. Below: "New step" field + "Add step" button (the keyboard's done key adds too and keeps the keyboard open). New steps go to the end. A blank step shows "Type a step first". At 100 live steps the add field is replaced by "This task has the maximum of 100 steps." Every change is optimistic and rolled back with "Couldn't save. Please try again." if the write fails. Deleting a step is a soft delete (no undo).
- **Complete offer (AC2).** When the task is open, has at least one step and every step is checked, the Steps card shows "All steps are done. Complete the task too?" with **Complete task** (completes the parent, like Mark complete) and **Not now** (hides the offer until a step is unchecked and checked again, or the screen is reopened). Also shown when opening a task whose steps are all checked. Never shown for a completed task. Steps never change when the parent is completed or reopened.
- **Add form (`/task/new`).** Also has the Notes field (same component), saved with the task on "Save task".
- **Offline / restart.** Everything is in SQLite; no network.

## Technical design
- **Surfaces**
  - `src/features/tasks/components/TaskFormFields.tsx` (new): the four fields, shared by `TaskForm` (add, explicit submit) and `TaskDetailForm` (detail, autosave). `TaskForm.tsx` now renders it.
  - `TaskDetailForm.tsx` (new): React Hook Form (`mode: 'onChange'`) + `taskFormSchema`; computes the pending patch (`changedTaskFields`) against the cached task and hands it to `useAutosave`. Exposes `flush()` through `ref` (React 19 ref prop + `useImperativeHandle`).
  - `SubtaskChecklist.tsx` (new): the Steps card and the complete offer.
  - `TaskDetailModal.tsx`: composes the two; Delete flushes autosave first.
  - `src/lib/use-autosave.ts` (new, generic): debounced save keyed by the pending value's JSON; saves on unmount; `flush()`; a value handed to `save` is not re-saved until it changes.
  - `src/features/tasks/hooks/use-subtasks.ts` (new): `useSubtasks(taskId)` and `useSubtaskMutations(taskId)` → `add`, `setDone`, `move`, `remove`, each optimistic on `['tasks', 'subtasks', taskId]`, rolled back on error, refetched on settle.
- **Interfaces & contracts**
  - `taskFormSchema` gains `notes: string ≤ MAX_NOTES_LENGTH` ("Use at most 10,000 characters"); `TaskFields` gains `notes: string | null`; `changedTaskFields(fields, task)`; `subtaskTitleSchema` (trimmed, 1–500).
  - Repository (`task-repo.ts`): `createSubtask` without `sortOrder` appends (max live `sort_order` + 1, 0 when empty) and throws `RepoError('LIMIT_REACHED')` at `MAX_SUBTASKS_PER_TASK` = 100 live subtasks; new `moveSubtask(db, id, 'up' | 'down')` renumbers the live checklist 0..n-1 in a transaction, writing (with `updated_at`) only rows whose position changed, and returns the new order. `RepoErrorCode` gains `LIMIT_REACHED`. Direction validated by `subtaskMoveDirectionSchema`.
  - Query key `taskQueryKeys.subtasks(taskId)` = `['tasks', 'subtasks', taskId]` (under `tasks`, so TB-26's invalidations, e.g. after delete/undo, refresh it).
- **Data changes:** none. `tasks.notes`, `subtasks` (`sort_order`, `is_done`, sync columns) and `subtasks_task_id_idx` exist since TB-21. No migration; `drizzle-kit check` clean.
- **Reuse:** TB-17 `Button`, `Card`, `Checkbox`, `Input`, `ChipGroup`; TB-21 subtask repository and schemas; TB-26 `useUpdateTask` (optimistic), form schema and fields, `SAVE_FAILED_MESSAGE`, undo (restores subtasks deleted with the task).

## Edge cases
| Case | Expected |
|---|---|
| Typing continuously | One write 500 ms after the last keystroke |
| Close within 500 ms of typing | The change is saved on close |
| Delete within 500 ms of typing | Change saved, then deleted; Undo restores the edited task |
| Blank title / bad date / notes > 10,000 chars | Field error, nothing saved until valid |
| Notes of only whitespace | Stored as `NULL` |
| DB write fails | Rolled back, error line shown, typed text kept, no retry loop |
| Move first step up / last step down | Buttons disabled; repo no-op |
| Legacy steps sharing one `sort_order` | First move renumbers 0..n-1 |
| 100 live steps | Add field hidden; repo rejects with `LIMIT_REACHED` |
| All steps checked, then "Not now" | Offer hidden until a step is unchecked and re-checked |
| Task already completed with all steps checked | No offer |
| Delete task, then Undo | Task, notes and its steps come back (TB-26 restore) |

## Security, privacy & AI cost
No AI, no network, no new permissions. Notes and step titles are user content: never logged (repository errors name the entity only, TB-21). The route id stays untrusted and validated (TB-18). Notes are length-limited at the form and again at the repository boundary.

## Decisions
| Decision | Options considered | Choice | Decided by / date |
|---|---|---|---|
| D1 Save model on the detail screen | (a) autosave all fields; (b) autosave notes only, Save button for the rest; (c) explicit save | (a): AC3 says "edits autosave"; one model is simpler; the Save button and close-on-save from TB-26 are removed | Worker, 2026-10-28 |
| D2 When autosave writes | Debounce 500 ms after the last change / save on blur / throttle | Debounce 500 ms (`AUTOSAVE_DELAY_MS`), only valid values, only changed fields, flushed on close and before delete | Worker, 2026-10-28 |
| D3 All steps checked | (a) offer; (b) auto-complete; (c) auto-complete with undo | (a) "Complete task" / "Not now" (AC2 says offered; matches "never change data without confirmation" spirit) | Worker, 2026-10-28 |
| D4 Reorder | Drag (gesture-handler + reanimated) / move up-down buttons | Move up / down: accessible, no gesture work, AC doesn't ask for drag | Worker, 2026-10-28 |
| D5 Order of new steps | Prepend / append | Append (`max + 1`) in the repository | Worker, 2026-10-28 |
| D6 Limits | None / 100 steps per task | 100 live steps per task (repo + UI); step titles ≤ 500 and notes ≤ 10,000 (TB-21 limits) | Worker, 2026-10-28 |
| D7 Parent ↔ steps | Completing the parent checks all steps / leaves them | Leaves steps untouched both ways | Worker, 2026-10-28 |
| D8 Undo for a deleted step | Reuse the task undo / none | None for now (the undo store holds tasks only); a step is cheap to re-add | Worker, 2026-10-28 |
| D9 Notes on the add form | Detail only / both | Both: the shared field component makes it free and the schema is one | Worker, 2026-10-28 |

## Deviations (added during build)
| Date | Change | Reason | Approved by |
|---|---|---|---|
| 2026-10-28 | TB-26 tests that pressed "Save changes" now wait for autosave and press Close (`TaskDetailModal.test.tsx`, `task-crud-routes.test.tsx`) | D1 removes the Save button | Worker |
