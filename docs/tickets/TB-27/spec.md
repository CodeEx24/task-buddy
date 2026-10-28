# TB-27 — Spec

> Jira: https://stratyge.atlassian.net/browse/TB-27 · Intent: [intent.md](intent.md)
> Status: Draft, decisions taken by the worker agent under the coordinator's brief (2026-10-28). Owner review at PR time.

## Acceptance criteria (verbatim from Jira)
- [ ] AC1 Given tasks due today, overdue and undated, then Today shows Overdue, Today and Later groups and Inbox shows undated tasks
- [ ] AC2 Given a task row, when I swipe right/left, then it completes or reschedules to tomorrow
- [ ] AC3 Empty states explain the next action; a list of 500 tasks scrolls at 60 fps in a release build
- [ ] AC4 Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated

## Behaviour
- **Today tab** (`/`, `today-screen`). Header "Today" + **Add task** (`today-add-task-button`). Sections in order, each hidden when empty (`today-section-<key>`):
  - **Overdue**: open tasks due before today's local date.
  - **Today**: open tasks due today.
  - **Later**: open tasks due after today.
  - **Completed**: done tasks that have a due date, most recently completed first.
  Inside a group: due date ascending, then priority (High first), then creation order (TB-26 rules). Day boundaries follow the device's local calendar (`localDaysFromToday`).
- **Inbox tab** (`/inbox`, `inbox-screen`). Header "Inbox" + **Add task** (`add-task-button`, unchanged). Sections: **No date** (open undated tasks; priority, then creation order) and **Completed** (done undated tasks).
- **Where a task lives.** With a due date it is on Today, without one in the Inbox (open or done). Both tabs read the same cached board query, so a change on one tab shows on the other at once.
- **Add task.** From Inbox the form opens as in TB-26 (no date). From Today it opens `/task/new?due=today` with the **Today** chip preselected, so the new task appears on the screen it was added from. The `due` param is untrusted: only `today` is honoured; anything else means no preset.
- **Swipe (AC2).** On every row (`task-swipe-<id>`):
  - **Swipe right** (finger moves right) uncovers "Complete" (teal panel, `task-swipe-toggle-done-<id>`); releasing past 72 pt completes the task. On a done row the panel says "Mark as not done" and reopens it.
  - **Swipe left** uncovers "Move to tomorrow" (`task-swipe-tomorrow-<id>`); releasing past 72 pt sets the due date to tomorrow (local midnight), whatever it was. Done rows have no left swipe.
  - A shorter drag springs back and changes nothing. After a commit the row snaps closed and moves to its new group at once (optimistic update through TB-26 `useUpdateTask`, then written by `updateTask`).
  - An Inbox task moved to tomorrow leaves the Inbox and appears under Today → Later.
- **Non-gesture equivalent (AC2).** The row checkbox carries the same actions as accessibility actions — "Complete" / "Mark as not done" and "Move to tomorrow" — listed by VoiceOver (rotor "Actions") and TalkBack (actions menu). After a quick action the app announces "<title> completed", "<title> marked as not done" or "<title> moved to tomorrow". Without a screen reader: the checkbox completes/reopens, and Edit → **Tomorrow** chip → Save reschedules.
- **Empty states (AC3).** Today (`today-empty`): "Nothing planned — Tasks with a due date show up here. Tap Add task to plan one for today, or swipe a task in Inbox to the left to move it to tomorrow." Inbox (`inbox-empty`): "Inbox is clear — Tasks without a due date wait here. Tap Add task to note one down." Loading and error states as in TB-26 (`<tab>-loading`, `<tab>-error` with Try again).
- **500 tasks (AC3).** `SectionList` virtualisation (first 30 rows, then windowed); the board query already loads up to 500 open tasks. Swipe gestures and springs run on the UI thread (`ReanimatedSwipeable`). Smoothness is measured on a device in a release build (verification, Manual step 6).
- **Offline / restart.** Unchanged from TB-26: local SQLite only.

## Technical design
- **Surfaces**
  - Routes (thin): `src/app/(tabs)/index.tsx` → `<TaskListScreen kind="today" />`; `src/app/(tabs)/inbox.tsx` → `kind="inbox"`. New dev-only routes `src/app/dev/ui-showcase.tsx` (the TB-17 showcase that was the Today tab) and `src/app/dev/perf-tasks.tsx` (seed/remove 500 tasks).
  - Pure logic: `task-sections.ts` (`screenFor`, `dueGroupFor`, `groupTodayTasks`, `groupInboxTasks`; replaces `openSectionFor` / `groupTaskBoard`); `task-actions.ts` (swipe direction → action, repository patch, labels, announcements); `task-routes.ts` (`NEW_TODAY_TASK_HREF`, `parseNewTaskDueParam` with Zod).
  - Hook: `hooks/use-task-quick-action.ts` (optimistic `useUpdateTask` + `AccessibilityInfo.announceForAccessibility`).
  - Components: `TaskListScreen` (takes `kind`; per-tab config `TASK_SCREENS`), `SwipeableTaskRow` (new; `react-native-gesture-handler/ReanimatedSwipeable`), `TaskRow` (accessibility actions), `NewTaskModal` (`?due=today` preset), `PerfTasksDevScreen` (dev).
  - Shared primitive: `Checkbox` gains optional `accessibilityActions` / `onAccessibilityAction` pass-through props.
  - Dev data: `repo/perf-seed.ts` (`seedPerfTasks`, `removePerfTasks`; rows titled "Perf task NNN").
  - Jest: `src/components/ui/testing/swipeable-mock.tsx`, installed for all tests in `jest-setup.ts`.
- **Interfaces & contracts:** `TaskSectionKey = 'overdue' | 'today' | 'later' | 'no-date' | 'completed'`; `TaskQuickAction = 'toggle-done' | 'tomorrow'`; testIDs prefixed per tab (`today-*`, `inbox-*`) because both tabs stay mounted.
- **Data changes:** none (no migration). Reschedule = `updateTask(id, { dueAt })`.
- **Reuse:** TB-26 board query, `useUpdateTask` (optimistic + rollback), `board-cache`, `TaskRow`, `useNow`, date helpers (`addLocalDays`, `localDaysFromToday`, `toDateInput`); TB-17 `Button`, `Card`, `Checkbox`; TB-21 benchmark seeding pattern.

## Edge cases
| Case | Expected |
|---|---|
| Task due 23:00 yesterday vs 00:00 today | Overdue vs Today (local calendar days) |
| Swipe left on a task already due tomorrow | Due date stays tomorrow; row stays in Later |
| Swipe left on an overdue task | Moves to Later, labelled "Tomorrow" |
| Swipe left on a done task | Not possible (no panel, no accessibility action) |
| Short or slow drag below 72 pt | Springs back, no change |
| Swipe right on a done task | Reopens it (back to its open group) |
| `/task/new?due=yesterday`, repeated `due` | No preset (untrusted param) |
| DB write fails on a quick action | Optimistic change rolled back and refetched (TB-26 `useUpdateTask`) |
| More than 500 open tasks | First 500 shown (TB-26 board limit; TB-63) |

## Security, privacy & AI cost
No AI, no network, no new permissions, no new dependencies. The `due` route param is validated with Zod (only `today`). Announcements contain the task title and are spoken locally by the OS screen reader; nothing is logged. Dev routes render the not-found screen in release builds (`__DEV__`).

## Decisions
| # | Decision | Options considered | Choice | Decided by / date |
|---|---|---|---|---|
| D1 | What Today shows | (a) overdue + today only; (b) every dated task in Overdue / Today / Later; (c) today only | (b): the AC names the three groups, and every dated task stays one tab away (TB-26 had Upcoming in the Inbox) | Worker, 2026-10-28 |
| D2 | What Inbox shows | (a) undated only; (b) everything (TB-26 board) | (a), as the AC says: dated tasks are planned and live on Today | Worker, 2026-10-28 |
| D3 | Completed tasks | (a) hide; (b) a separate screen; (c) each tab lists its own completed tasks last | (c): TB-26 AC2 (un-complete) stays reachable without a new screen; scoped by due date like open tasks | Worker, 2026-10-28 |
| D4 | Swipe directions | right = complete / left = tomorrow, or the reverse | Finger moves right = complete (reopen when done); left = move to tomorrow. Follows the AC's order and the common mail/to-do convention | Worker, 2026-10-28 |
| D5 | Swipe mechanics | (a) reveal buttons, tap to act; (b) release past a threshold commits | (b): one gesture, one action. 72 pt ≈ 60 % of the 120 pt panel; overshoot friction 8. `ReanimatedSwipeable` (expo-animation skill: use it rather than a hand-rolled pan; runs on the UI thread) | Worker, 2026-10-28 |
| D6 | Haptics | `expo-haptics`, RN `Vibration`, none | None for now: `expo-haptics` is a native module (new dev build; the brief says not to add one) and `Vibration` needs the Android VIBRATE permission. Visual change + screen-reader announcement only. Follow-up | Worker, 2026-10-28 |
| D7 | Accessible alternative to swipe | (a) accessibility actions; (b) visible extra buttons per row; (c) both | (a) plus the existing visible controls: custom actions on the row checkbox (VoiceOver/TalkBack) with announcements; the checkbox and Edit → Tomorrow cover users without a screen reader, without cluttering every row | Worker, 2026-10-28 |
| D8 | Add task from Today | (a) the same blank form (the task lands in Inbox); (b) preset due today | (b) `/task/new?due=today`, so the task appears where it was added | Worker, 2026-10-28 |
| D9 | The TB-17 showcase that was the Today tab | delete vs move | Move to dev-only `/dev/ui-showcase` (keeps the TB-17 theme check on device and its tests) | Worker, 2026-10-28 |
| D10 | List component for 500 rows | `SectionList` vs FlashList (new dependency) | `SectionList` (already used, virtualised); FlashList only if the device measurement fails | Worker, 2026-10-28 |

## Deviations (added during build)
| Date | Change | Reason | Approved by |
|---|---|---|---|
| 2026-10-28 | TB-18 AC3 route tests ("closing the modal keeps the screen underneath") assert the same Today host instance before and after the modal, plus a remount control, instead of typed text | Today no longer has the demo text field | Worker |
| 2026-10-28 | `ReanimatedSwipeable` is replaced by a Jest stand-in for all tests (`jest-setup.ts`) | The real component needs Reanimated's native runtime (`Reanimated?.isSharedValue is not a function` in Jest); a pan gesture can't be driven from Jest anyway | Worker |
| 2026-10-28 | Added dev route `/dev/perf-tasks` | Puts 500 tasks on a device for the AC3 scroll check | Worker |
