# TB-27 — Intent

> Jira: https://stratyge.atlassian.net/browse/TB-27 · Blueprint: US-013 · Epic EP-03 / FT-08 · Wave 2 · Risk: Medium
> Status: Draft, decisions taken by the worker agent under the coordinator's brief (2026-10-28). Owner review at PR time.

## Problem
Since TB-26 every task sits on one Inbox board (Today / Upcoming / No date / Completed) and the Today tab is still the TB-17 design-system demo. No screen answers "what matters now", and every change needs a tap into the row or the edit modal.

## Desired outcome
- **Today** tab: tasks with a due date, grouped **Overdue**, **Today** and **Later**.
- **Inbox** tab: tasks without a due date.
- On any row: **swipe right** completes it, **swipe left** moves it to tomorrow, with an equivalent that needs no gesture (screen readers, motor impairments).
- Empty screens say what to do next; a 500-task list scrolls smoothly (60 fps, release build).

## Affected users
Every user (local-first). No free/Pro split. No shared spaces yet.

## Constraints
- Local-first: everything works offline on the local SQLite DB through the TB-21 repositories and TB-26 query hooks; no network, no AI.
- No new native module (the current EAS dev build must keep working): gestures with the already-installed `react-native-gesture-handler` 3.3 + `react-native-reanimated` 4.7.
- Accessibility: every swipe has a non-gesture equivalent.
- Keep TB-26 behaviour (optimistic add/edit/complete/delete + undo) and the TB-18 navigation guarantees (tabs mounted, modal back keeps the screen underneath).

## Out of scope
- Undo for complete/reschedule (TB-26's undo covers delete only).
- Haptics (would need `expo-haptics`, a new native module and a new dev build).
- Pagination beyond the board's first 500 open tasks (TB-63), reordering, lists/projects, search.
- A "Done today" filter or completed-history screen.

## Open questions
| # | Question | Why it matters | Answer (who, date) |
|---|---|---|---|
| 1 | Should completed tasks stay visible on Today/Inbox? | TB-26 AC2 needs un-complete to stay reachable | Yes: each tab lists its own completed tasks last (spec D3) — worker, 2026-10-28 |
| 2 | Is haptic feedback on swipe wanted for MVP? | Needs a new native module | Deferred to a follow-up (spec D6) — worker, 2026-10-28 |
