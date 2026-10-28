# TB-26 — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-26 · PR: https://github.com/CodeEx24/task-buddy/pull/14 · Branch: `feat/tb-26/task-crud`
> Record only what was actually run and observed. `node scripts/workflow/check-ticket-docs.mjs --branch <branch> --pr` fails the PR gate while any AC row is `not met`, `partial` or `TBD`.

## Commands run
Windows 11, Node 24.21.0, pnpm 10.17.1, 2026-10-28, Orca worktree `tb-26-task-crud` (base `main` 4d42e5e). No Metro, emulator or EAS build was started (worker brief).

| Command | Result | Notes |
|---|---|---|
| `pnpm add --ignore-scripts @tanstack/react-query@5.104.2 zustand@5.0.15 react-hook-form@7.90.0 @hookform/resolvers@5.9.1` | pass | 4 JS-only deps, exact-pinned, each ≥ 2 weeks old. `--ignore-scripts`: see note 1 |
| `pnpm install --frozen-lockfile --ignore-scripts` | pass | Lockfile consistent ("Done"; re-run on `d4a748b`). Plain `pnpm install --frozen-lockfile` fails on this machine already on the untouched base 4d42e5e (note 1) |
| `pnpm lint` | pass | 0 problems (re-run on `d4a748b`) (after fixing 2 `react-hooks/purity` errors and 1 `incompatible-library` warning, see failures) |
| `pnpm typecheck` | pass | `tsc --noEmit`, re-run on `d4a748b` against the typed routes Metro regenerated (`taskHref` returns a `/task/${string}` href) |
| `pnpm test --ci` | pass | 38 suites, 239 tests, ~19 s (re-run on `d4a748b` after the review fixes); no "worker failed to exit" warning (see failures) |
| `pnpm exec drizzle-kit check` | pass | "Everything's fine" (re-run on `d4a748b`). No schema change, no new migration |
| `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-26/task-crud` | pass | `workflow check: ok` (re-run after this docs update) |
| CI on draft PR #14 (before the review fixes) | pass | Reported green by the coordinator |

Notes:
1. On this machine pnpm runs `node-gyp rebuild` for `better-sqlite3` (listed in `pnpm.onlyBuiltDependencies`) and fails with "Could not find any Visual Studio installation". It fails identically on the base commit, before any TB-26 change. The package ships N-API prebuilds (`prebuilds/win32-x64.node`) that `lib/binding.js` loads, so skipping the script changes nothing: `better-sqlite3` opens and runs SQLite 3.53.4 in Node, and all DB tests pass. CI (Ubuntu) is unaffected. Not fixed here (`package.json` build config is a shared file; worth a chore).

Failures hit during the build, and their fixes:
1. `react-hooks/purity`: `Date.now()` during render in `TaskListScreen` and `TaskDetailModal` → `useNow()` hook (`src/lib/use-now.ts`) reads the clock in a state initialiser and refreshes it every minute.
2. `react-hooks/incompatible-library` warning on RHF `watch()` → `useWatch()`.
3. RNTL 14 `act` is async: un-awaited `act(() => …)` corrupted later renders in the same file (3 failures) → `await act(async () => …)`.
4. `SectionList` rendered only 10 items initially (section headers count), hiding the Completed section → `initialNumToRender={30}`.
5. "A worker process has failed to exit gracefully": TanStack mutation garbage-collection timers (5 min) outlived tests → test clients use `gcTime: Infinity` and are cleared after each test; `QueryProvider` also clears its cache on unmount.
6. The TB-18 route test expected `ID: <id>` in the modal → now expects "This task doesn't exist anymore." (spec Deviations).
7. After moving `UndoSnackbar` to the root layout it reads `useSafeAreaInsets()`: component tests now render inside a `SafeAreaProvider` (`task-test-utils.tsx`), as the app root does.

## Commands run: Android emulator and merge of `main`, 2026-10-28
Emulator `Medium_Phone_API_37.0`, EAS dev build `e98f091e` (no new native modules in TB-26), Metro `expo start --dev-client` on `f3eb97f` (after the review fixes). Screenshots `android-*.png` in this folder.

| Command | Result | Notes |
|---|---|---|
| Inbox → Add task → title "Pay electricity bill", Tomorrow, High → Save (AC1) | pass | Row appears at once under **Upcoming** with "Tomorrow · High priority" (`android-02-new-task-form.png`, `android-03-task-added.png`) |
| `am force-stop` (process gone: `pidof` empty) → relaunch → Inbox (AC1 restart) | pass | Task still there under Upcoming (`android-04-after-restart.png`) |
| Tap the row checkbox, then tap again (AC2) | pass | Moves to **Completed** with "Completed Oct 28, 4:56 AM" (emulator clock is UTC), then back to Upcoming (`android-05-completed.png`, `android-06-uncompleted.png`) |
| Edit → Delete, wait > 5 s (AC3) | pass | "Task deleted · Undo" snackbar, then gone; the task stays deleted (list empty) |
| Edit → Delete → Undo within the window (AC3) | pass | Snackbar shown (`android-08-undo-snackbar.png`); Undo tapped about 4 s after delete restored "Call the dentist" (`android-09-after-undo.png`) |
| Deep link `taskbuddy://task/<id>` over Today → Delete → Undo (review fix 1) | pass | Undo snackbar shown over Today (`android-10-undo-over-today.png`); Undo restored the task |
| `git merge origin/main` (TB-18 #11, TB-19 #12, TB-21 lint rule #15) | pass after conflicts | `package.json`: kept both sides' deps (`@hookform/resolvers`, `@supabase/supabase-js`, `@tanstack/react-query`); `pnpm-lock.yaml` taken from `main` and regenerated (never hand-merged) |
| `pnpm lint` / `pnpm typecheck` (after merge) | pass | Includes the new `no-restricted-imports` DB rule: no TB-26 file imports SQLite outside `src/db` |
| `pnpm test --ci` (after merge) | pass | 42 suites, 265 tests |
| `pnpm exec drizzle-kit check` (after merge) | pass | "Everything's fine" |

Dev-build-only observations (not product bugs): the dev client's floating gear button overlaps the right half of the Inbox "Add task" button (taps there open the dev menu), and a LogBox warning ("ImageBackground is deprecated", from a dependency) can cover the tab bar until dismissed. Neither exists in release builds.

## Acceptance criteria
| AC (verbatim) | Status | Evidence (test name, file:line, screenshot, observed result) |
|---|---|---|
| Given the add-task form, when I save a title with due date and priority, then the task appears in the right list instantly (optimistic) and persists after restart | met | **Emulator:** saved task appears instantly under Upcoming as "Tomorrow · High priority" and survives a force-stop + relaunch (`android-03-task-added.png`, `android-04-after-restart.png`). `NewTaskModal.test.tsx` "saves a title with due date and priority, then closes (AC1)"; `use-task-mutations.test.tsx` "create shows the task in the board before the SQLite write" (the cache holds the row when `createTask` is called) and "rolls back … when the write fails"; `task-sections.test.ts` (section rules); `task-crud-routes.test.tsx` (real routes: `/inbox` → `/task/new` → saved task under **Upcoming** with "Tomorrow · High priority"); restart: `TaskListScreen.test.tsx` "shows saved tasks after a restart (new query client, same DB)" and `task-repo.test.ts` "keeps a saved task … after the DB file is reopened" (file DB closed and reopened). Device: steps 1–3 below |
| Given a task, when I complete it, then it moves to Completed with a timestamp and can be un-completed | met | **Emulator:** checkbox moves it to Completed with "Completed Oct 28, 4:56 AM"; tapping again moves it back (`android-05-completed.png`, `android-06-uncompleted.png`). `TaskListScreen.test.tsx` "completing moves a task to Completed with a timestamp; un-completing moves it back (AC2)" (meta matches `Completed Mon D, h:mm AM/PM`; SQLite `status`/`completed_at` checked); `TaskDetailModal.test.tsx` "completes with a timestamp and un-completes (AC2)"; `board-cache.test.ts`; `task-crud-routes.test.tsx`. Device: step 4 |
| Deleting a task is a soft delete (deleted_at) with a 5-second undo | met | **Emulator:** Delete shows "Task deleted · Undo"; Undo restores the task, including from a modal deep-linked over Today; waiting past 5 s leaves it deleted (`android-08-undo-snackbar.png`, `android-09-after-undo.png`, `android-10-undo-over-today.png`). `TaskDetailModal.test.tsx` "soft-deletes, closes and offers undo (AC3)" (row kept with `deleted_at` set); `TaskListScreen.test.tsx` "Undo restores a deleted task" and "the undo snackbar disappears after 5 seconds and the task stays deleted" (fake timers: visible at 4999 ms, gone at 5000 ms); `undo-store.test.ts` (expiry, replacement); `task-crud-routes.test.tsx` "undo shows after deleting from a task modal deep-linked over Today" (snackbar over Today, Undo restores); `use-task-mutations.test.tsx` "keeps a newer offer made while the restore was running"; `TaskDetailModal.test.tsx` "never shows not found while a delete closes the modal"; `task-repo.test.ts` "restoreTask" suite (children restored, deleted tag/list cases); `task-crud-routes.test.tsx`. Device: steps 5–6 |
| Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated | met | Independent reviewer pass: nothing blocking; its 4 Important findings + 1 nit fixed in `d4a748b`. After merging `main`: 42 suites / 265 tests, lint (incl. the DB-import rule), typecheck, drizzle check green; CI on PR #14. Before merge: 38 suites / 239 tests green (was 27 / 181 on `main` after TB-21+TB-18), lint/typecheck green, `docs/tickets/TB-26/*` written. PR review and CI: coordinator |

## Manual / E2E
For the coordinator. Needs **no new dev build**: all new deps are JS-only, so the existing TB-21 development build (`e98f091e`, includes expo-sqlite + expo-crypto) plus Metro on this branch is enough. Android emulator `Medium_Phone_API_37.0`, `adb reverse tcp:8081 tcp:8081`, `pnpm start`.

1. **Add (AC1).** Open the app → tap the **Inbox** tab (`tab-inbox`). Expect the "No tasks yet" card (`task-list-empty`). Tap **Add task** (`add-task-button`) → the New task modal opens (`new-task-modal`). Type "Pay rent" in **Title** (`task-form-title`), tap **Tomorrow** (`task-form-due-chips-tomorrow`; the date field `task-form-due-date` fills with tomorrow's `YYYY-MM-DD`), tap **High** (`task-form-priority-3`), tap **Save task** (`task-form-submit`). Expect: the modal closes and "Pay rent" is already listed under **Upcoming** (`task-section-upcoming`) with "Tomorrow · High priority". No spinner or delay.
2. **Validation.** Add task → tap Save with an empty title → "Add a title" under Title, modal stays. Type `2026-02-30` in "Or type a date" → "Use a real date as YYYY-MM-DD". Cancel.
3. **Restart (AC1).** `adb shell am force-stop <app id>` (or swipe the app away) and relaunch → Inbox still shows "Pay rent" under Upcoming with the same label.
4. **Complete / un-complete (AC2).** Tap the checkbox "Pay rent" (`task-checkbox-<id>`) → the row moves to **Completed** (`task-section-completed`), checked, with "Completed <Mon D>, <h:mm AM/PM>" (current time). Tap it again → back under Upcoming, the timestamp is gone. Also: tap **Edit** → **Mark complete** (`task-detail-toggle-done`) shows the completed time in the modal; **Mark as not done** reverts.
5. **Edit.** Tap **Edit** on "Pay rent" → modal pre-filled (title, Tomorrow + High selected). Tap **Today**, change the title, **Save changes** → row now under **Today** with the new title.
6. **Delete + undo (AC3).** Tap **Edit** → **Delete task** (`task-detail-delete`) → the modal closes straight away (no "This task doesn't exist anymore" flash), the row is gone, and the snackbar "Task deleted · Undo" (`undo-snackbar`) sits just above the tab bar. Tap **Undo** (`undo-button`) within 5 s → the row comes back in the same section. Repeat the delete and wait: the snackbar disappears after ~5 s and the task stays gone (also after a restart).
   - **Outside Inbox:** take a task id (DB, or the `/task/<id>` path when its Edit modal is open), run `adb shell am start -a android.intent.action.VIEW -d "taskbuddy://task/<id>"`, tap **Delete task** → the modal closes onto Today and the same snackbar shows there; **Undo** restores the task (check Inbox).
7. **Negative / regression.** Today tab → type in "Task name" → tap **Add a task** (`home-add-task-button`, was "Open sample task") → the New task modal (`new-task-modal`) opens; Android back or **Cancel** returns to Today with the typed text kept (TB-18). `adb shell am start -a android.intent.action.VIEW -d "taskbuddy://task/not%20a%20task"` → "This link doesn't point to a task."
8. Dark mode (`adb shell cmd uimode night yes`): chips, snackbar and form follow the theme.

Optional DB proof: `adb shell run-as <app id> sqlite3 databases/taskbuddy.db "select title, priority, due_at, status, completed_at, deleted_at from tasks"` (if `sqlite3` is on the image) — the deleted task keeps its row with `deleted_at` set.

## Review findings
| # | Severity | Finding (file:line) | Source (self / reviewer agent / human) | Resolution |
|---|---|---|---|---|
| 1 | Medium | `Date.now()` read during render (impure; lint error) in list, form and detail | self (lint) | `useNow()` hook |
| 2 | Medium | Mutation GC timers kept Jest workers alive | self | Test clients `gcTime: Infinity` + cleared per test; provider clears on unmount |
| 3 | Low | Delete from a modal deep-linked over Today: the undo snackbar lived on the Inbox screen only | self + coordinator review | Fixed in `d4a748b`: `UndoSnackbar` rendered once in `src/app/_layout.tsx`; route test added |
| 4 | Low | The Today tab's "Open sample task" demo opened a not-found modal | self + coordinator review | Fixed in `d4a748b`: "Add a task" (`home-add-task-button`) opens `/task/new`; TB-18 AC3 route tests use it |
| 5 | Medium | `useRestoreTask.onSettled` dismissed any offer, including a newer delete's | coordinator review | Fixed in `d4a748b`: dismiss only while the offer is still for the restored task; test added |
| 6 | Low | After Delete the modal briefly showed "This task doesn't exist anymore" (detail query refetched before close) | coordinator review | Fixed in `d4a748b`: delete marks that detail query stale (`refetchType: 'none'`) and refetches the rest; test asserts the query never holds `null` |
| 7 | Nit | Title length message wording | coordinator review | "Use at most 500 characters" |

Independent reviewer pass (medium risk): run by the coordinator on draft PR #14, nothing blocking; findings 5–7 and the fixes for 3–4 came from that round.

## Known limitations & follow-ups
- The board loads the first `BOARD_OPEN_LIMIT` = 500 open tasks and the 100 most recent completed ones; anything beyond is not shown (no pagination yet) — TB-63.
- Optimistic rollback restores a snapshot of the whole board taken before the mutation, so a rollback can briefly undo another mutation that landed in between; the invalidation after every mutation refetches from SQLite and heals it.
- iOS: native modals are presented above the root view, so the snackbar becomes visible once the modal has closed (delete always closes it). Android draws it above the stack.
- Due dates are date-only (local midnight); no time of day — TB-40 reminders.
- No native date picker (JS chips + `YYYY-MM-DD` field) to avoid a new dev build; revisit with a design pass.
- `pnpm install` on Windows without Visual Studio fails on the `better-sqlite3` build script (note 1) — propose a chore.
- Inbox temporarily shows every task (Today / Upcoming / No date / Completed); TB-27 splits Today and Inbox and adds swipe actions.

## Completion
- [x] All AC met with evidence (emulator, 2026-10-28)
- [x] Gates green locally
- [ ] Gates green in CI
- [x] No open Blocking findings
- [ ] Jira updated (In Review → Done)
