# TB-28 — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-28 · PR: https://github.com/CodeEx24/task-buddy/pull/16 · Branch: `feat/tb-28/task-detail-notes-subtasks`
> Record only what was actually run and observed. `node scripts/workflow/check-ticket-docs.mjs --branch <branch> --pr` fails the PR gate while any AC row is `not met`, `partial` or `TBD`.

## Commands run
Windows 11, Node 24.21.0, pnpm 10.17.1, 2026-10-28, Orca worktree `tb-28-task-detail` (base `main` ceb46ab). No Metro, emulator or EAS build was started (worker brief). Every gate below was re-run after the PR #16 review fixes (round 2) with the same results.

| Command | Result | Notes |
|---|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts` | pass | Lockfile unchanged (no new dependencies). `--ignore-scripts`: on this machine `better-sqlite3`'s `node-gyp rebuild` fails ("Could not find any Visual Studio installation"), as on the untouched base; its N-API prebuild (`prebuilds/win32-x64.node`) loads fine and all DB tests run on it (same as TB-26 note 1). CI (Ubuntu) unaffected |
| `pnpm test --ci` (baseline on ceb46ab, before any change) | pass | 42 suites, 265 tests |
| `pnpm lint` | pass | 0 problems (after `prettier --write` on 2 formatting errors, see failures) |
| `pnpm typecheck` | pass | `tsc --noEmit`; `.expo/types/router.d.ts` was not stale (no route changes) |
| `pnpm test --ci` | pass | 44 suites, 299 tests (+2 suites, +34 tests vs baseline), re-run after the PR #16 review fixes; no "worker failed to exit" warning |
| `pnpm exec drizzle-kit check` | pass | "Everything's fine". No schema change, no new migration; `src/db/migrations.test.ts` untouched and green |
| `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-28/task-detail-notes-subtasks` | pass | `workflow check: ok` |

Failures hit during the build, and their fixes:
1. Prettier (2 errors: a wrapped arrow call, a wrapped array) → `pnpm exec prettier --write` on the touched files.
2. Files first written from a Windows script had CRLF line endings in the working copy (the committed blobs were LF via `.gitattributes`) → normalised to LF.
3. A test string with a literal newline broke parsing → `\n` escape.

## Commands run: Android emulator, 2026-10-28
Emulator `Medium_Phone_API_37.0`, EAS dev build `e98f091e` (no new native modules), Metro `expo start --dev-client` on `d9a230a` (after the review fixes). Screenshots `android-*.png` in this folder.

| Command | Result | Notes |
|---|---|---|
| Edit title: append " at 3pm", wait (AC3) | pass | `task-detail-save-status` read "All changes saved" ~1.5 s after typing (`android-01-title-autosaved.png`) |
| Type notes, press Back at once (flush on close) | pass | Reopened: notes "Ask about the cleaning" kept |
| `am force-stop` (no pid) → relaunch → reopen (AC1) | pass | Title "Call the dentist at 3pm" and notes still there (`android-02-notes-after-restart.png`) |
| Clear the title | pass | "Not saved yet: fix the field marked in red." (`android-03-empty-title-warning.png`); retyping saved it |
| Add 2 steps via `subtask-add-input` + Enter, move first down, (AC1) | pass | Order flipped to "Book the appointment", "Find insurance card" (`android-04-two-steps.png`, `android-05-reordered.png`) |
| Check both steps (AC2) | pass | `subtasks-complete-offer`: "All steps are done. Complete the task too?" (`android-06-complete-offer.png`); "Not now" hid it |
| Add a 3rd step, check it (review fix 2) | pass | Offer shown again after "Not now"; deleting that step via `subtask-delete-<id>` removed it |
| "Complete task" | pass | Task completed: "Completed Oct 28, 5:44 AM", "2 of 2 done" (`android-07-task-completed.png`) |
| Delete task → Undo → reopen | pass | Notes and both steps (still checked) restored (`android-08-after-undo-detail.png`) |

## Acceptance criteria
| AC (verbatim) | Status | Evidence (test name, file:line, screenshot, observed result) |
|---|---|---|
| Given a task, when I open it, then I can edit title, notes, due date, priority and manage a subtask checklist | met | **Emulator:** title, notes, due date and priority edits kept across restart; steps added, reordered, checked and deleted (`android-02-…`, `android-05-reordered.png`). | `TaskDetailModal.test.tsx` "pre-fills the form and autosaves edits without a Save button (TB-28 AC1, AC3)" (title, notes, Tomorrow, High → SQLite row); `SubtaskChecklist.test.tsx` "adds steps to the end…", "rejects a blank step", "checks and unchecks a step", "reorders steps with move up / move down", "deletes a step (soft delete)" (row kept with `deleted_at`), "rolls a failed write back and says so", "hides the add field at 100 steps"; `task-repo.test.ts` "subtask checklist order and limit (TB-28)" (append, move with `updated_at` only on moved rows, ends, legacy equal sort orders, deleted rows, `LIMIT_REACHED`); `task-crud-routes.test.tsx` real routes: Inbox → Edit → Today chip + Notes + "Find the bill" step autosaved → Close; `NewTaskModal.test.tsx` "saves notes typed when adding a task". Device: steps 1–4 |
| Given all subtasks are checked, then I am offered to complete the parent task | met | **Emulator:** offer shown when all steps checked, "Not now" hides it, it returns after a new step is checked, "Complete task" completes the task (`android-06-complete-offer.png`, `android-07-task-completed.png`). | `SubtaskChecklist.test.tsx` "offers to complete the task once the last step is checked, and completes it on accept" (offer shown, task still `open` until accepted, then `done`), "\"Not now\" hides the offer until a step is unchecked and checked again", "\"Not now\" is forgotten when a step is added or deleted", "offers it when a task opens with every step already checked", "does not offer it for a completed task or a task without steps". Device: step 5 |
| Edits autosave within 500 ms of the last keystroke | met | **Emulator:** "All changes saved" shown after typing with no Save button; notes typed right before closing were saved (`android-01-title-autosaved.png`). The 500 ms bound itself is proven with fake timers (nothing at 499 ms, saved at 500 ms). | `TaskDetailModal.test.tsx` "autosaves 500 ms after the last keystroke, not before (TB-28 AC3)" (fake timers: nothing stored 499 ms after the last keystroke, status "Saving…"; stored at 500 ms), "saves a change still waiting for autosave when the modal closes", "shows field errors for invalid input and saves nothing until it is valid", "shows an error and keeps the typed text when autosave fails" (one attempt, no retry loop); `use-autosave.test.ts` (9 tests, incl. exactly one attempt per distinct failing value: debounce, same-content no restart, unmount save, flush, no retry, re-save after change back). Device: steps 2–3 |
| Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated | met | Reviewer pass: nothing blocking; 1 Important + 5 nits fixed (`45dbcbf`, `6820514`, `9dcc162`, `d9a230a`). 44 suites / 299 tests, lint, typecheck, drizzle check green; CI on PR #16. | 44 suites / 299 tests green (baseline 42 / 265), lint, typecheck, drizzle check, workflow check green; `docs/tickets/TB-28/*` written; self-review done (below). PR review, CI and device proof: coordinator |

## Manual / E2E
For the coordinator. Needs **no new dev build**: no new dependencies and no native code; the existing development build (`e98f091e`) plus Metro on this branch is enough. Android emulator `Medium_Phone_API_37.0`, `adb reverse tcp:8081 tcp:8081`, `pnpm start`.

1. **Open (AC1).** Inbox tab (`tab-inbox`) → **Add task** (`add-task-button`) → Title `Pay rent`, Notes (`task-form-notes`) `Landlord: Ana`, **Save task**. Tap **Edit** on "Pay rent" → `/task/<id>` opens (`task-detail-modal`): Title, chips, date field, Priority, **Notes** pre-filled with "Landlord: Ana", a **Steps** card (`subtasks`) with the empty hint (`subtasks-empty`), no "Save changes" button.
2. **Autosave (AC3).** Type in Title (`task-form-title`) → ` and water`; stop typing. Within about half a second the status line (`task-detail-save-status`) goes "Saving…" → "All changes saved". Tap **Tomorrow** (`task-form-due-chips-tomorrow`) and **High** (`task-form-priority-3`), add a second line to Notes; each shows "All changes saved". Tap **Close** → Inbox row shows the new title under Upcoming with "Tomorrow · High priority". Reopen → notes kept (both lines).
3. **Close right after typing (AC3).** In Notes type `IBAN on the fridge` and immediately press Android back (iOS: swipe the sheet down). Reopen the task → the text is there. Force-stop and relaunch → still there.
   - Negative: clear the Title → "Add a title" under it and the status line reads "Not saved yet: fix the field marked in red."; Close and reopen → the last valid title is kept (the other fields saved before stay saved).
4. **Steps (AC1).** In **New step** (`subtask-add-input`) type `Find the bill` → **Add step** (`subtask-add-button`); type `Pay online` → keyboard done key (keyboard stays open). Rows appear in that order with "0 of 2 done" (`subtasks-progress`). Tap ↓ on "Find the bill" (`subtask-move-down-<id>`) → order flips; ↑ on the first row and ↓ on the last are disabled. Tap ✕ on one (`subtask-delete-<id>`) → it disappears. Re-add it. Close and reopen → order and checks kept. Tap **Add step** with an empty field → "Type a step first".
5. **Complete offer (AC2).** Check both steps (`subtask-checkbox-<id>`) → "2 of 2 done" and the card "All steps are done. Complete the task too?" (`subtasks-complete-offer`) appears. Tap **Not now** (`subtasks-complete-offer-dismiss`) → hidden, task still open. Uncheck and re-check a step → offer back. Tap **Not now** again, add a step `Pay online` and check it → offer back. Tap **Complete task** (`subtasks-complete-offer-accept`) → the toggle reads "Mark as not done", the completion time shows, the offer disappears; Close → the task is under Completed in Inbox.
6. **Delete + undo with steps.** Open the task → **Delete task** (`task-detail-delete`) → **Undo** (`undo-button`) within 5 s → reopen: notes and both steps are back.
7. **Regression.** Deep link `adb shell am start -a android.intent.action.VIEW -d "taskbuddy://task/<id>"` opens the same screen; `taskbuddy://task/not%20a%20task` shows "This link doesn't point to a task." Dark mode (`adb shell cmd uimode night yes`): notes field, steps rows and offer card follow the theme. TalkBack: step buttons read "Move <title> up/down", "Delete <title>"; after tapping ↓ on the first of two steps TalkBack says "Moved <title> to position 2 of 2". The ↑ / ↓ / ✕ buttons are at least 44 pt wide (easy to hit without touching the neighbour).

## Review findings
| # | Severity | Finding (file:line) | Source (self / reviewer agent / human) | Resolution |
|---|---|---|---|---|
| 1 | Medium → Important | A failed autosave retried every 500 ms forever: the optimistic patch made `pending` null, which cleared the remembered key, then the rollback re-armed the same value (`use-autosave.ts`, `use-task-mutations.ts` onError) | self, then coordinator review (PR #16) | Fixed in round 2: a failed value is blocked until a different value is attempted (the block survives `pending` going null and unmount); status "Couldn't save. Edit again to retry."; `use-autosave.test.ts` "makes exactly one attempt per distinct value when every save fails (optimistic + rollback)", "retries a failed value once another value was attempted", "saves a value again when it is edited back to after an optimistic save" |
| 2 | Medium | Delete within 500 ms of typing would lose the edit (unmount flush after delete hits NOT_FOUND) | self | Delete awaits `flush()` first (`TaskDetailModal.tsx`) |
| 3 | Low | Equal legacy `sort_order` values make a swap a no-op | self | `moveSubtask` renumbers the checklist 0..n-1; test "renumbers legacy rows that share a sort order" |
| 4 | Low | With an invalid field the status line still said "All changes saved" from the last save | self | Shows "Not saved yet: fix the field marked in red." while any field is invalid; asserted in "shows field errors…" |
| 5 | Low | Step rows don't support renaming in place | self | Out of scope (intent); follow-up |
| 6 | Minor | "Not now" stayed dismissed after adding a step (`SubtaskChecklist.tsx`) | coordinator review (PR #16) | Dismissal is tied to the step count and reset on add / delete / uncheck; test "\"Not now\" is forgotten when a step is added or deleted" |
| 7 | Minor | Subtask update / move / delete didn't check the parent task is live (`task-repo.ts`) | coordinator review (PR #16) | `findEditableSubtask` throws `NOT_FOUND` (Task); test "refuses to change, move or delete a live subtask whose task is deleted" (row unchanged) |
| 8 | Minor | ↑ / ↓ / ✕ narrower than 44 pt | coordinator review (PR #16) | Wrapped locally in `SubtaskChecklist` (`minWidth: MIN_TOUCH_TARGET`; shared `Button` untouched); test "gives the move and delete buttons a full-width touch target" |
| 9 | Minor | No screen-reader feedback after a move | coordinator review (PR #16) | `AccessibilityInfo.announceForAccessibility("Moved <title> to position <n> of <count>")`; asserted in "reorders steps with move up / move down" |
| 10 | Nit | Spec silent on invalid fields at close | coordinator review (PR #16) | `spec.md` Behaviour + Edge cases: invalid values are not saved on close |

Self-review of the full diff vs `origin/main` done; independent reviewer pass: coordinator at PR time.

## Known limitations & follow-ups
- No in-place rename of a step (delete and re-add); no drag-and-drop reorder; no undo for a deleted step.
- List rows (TB-27) don't show notes or "N of M steps" yet; worth a follow-up once TB-27 lands.
- Autosave writes once per pause in typing (each a local SQLite update of the changed columns only); sync (TB-43) may want to coalesce pushes.
- On iOS the flush on swipe-down relies on the modal screen unmounting (standard for native-stack modals); to confirm on device.
- `pnpm install` on Windows without Visual Studio needs `--ignore-scripts` (better-sqlite3 build script); chore proposed in TB-26.

## Completion
- [x] All AC met with evidence (emulator, 2026-10-28)
- [x] Gates green locally
- [ ] Gates green in CI
- [x] No open Blocking findings
- [ ] Jira updated (In Review → Done)
