# TB-40 — Intent

> Jira: https://stratyge.atlassian.net/browse/TB-40 · Blueprint: US-026 · Wave 4, batch A · Risk: **Medium** (new native module and OS permission; touches the task form, sync trigger and sign-out path; no schema, RLS or AI change)
> Spec: [spec.md](spec.md) · Plan: [plan.md](plan.md) · Verification: [verification.md](verification.md)
> Status: Draft → **Decisions taken by the implementing agent on 2026-10-28** (no human available; the orchestrator's brief says to pick the recommended option for each decision and record it in `spec.md`). The human reviews them at the PR.

## Problem
A task can have a due date, but nothing tells the user when it is due. Due dates are date-only (TB-26 D3 deferred times to this ticket), so there is not even a time to be reminded at. A to-do app that never reminds you is easy to forget, and the reminder has to work offline and with the app closed.

## Desired outcome
- A task can carry a due **time** as well as a date.
- At that time a local notification shows the task's title, even when the app is closed and the phone is offline (AC1).
- Completing or deleting the task cancels its reminder (AC2); editing the due time moves it (AC3). Undo, un-complete and changes synced from another device keep reminders right too.
- Tapping the reminder opens the task.
- Signing out (or switching account) leaves no reminders of the previous account behind.

## Affected users
Every signed-in user on iOS and Android, free and Pro. Date-only tasks (all tasks created before this ticket) are unchanged and get no reminder.

## Constraints
- Local-first: scheduling uses on-device notifications only; nothing is sent to a server, and the task title never leaves the device or reaches a log.
- Vendors behind interfaces (CLAUDE.md §3): expo-notifications sits behind a `ReminderScheduler` interface with a fake for tests.
- Repositories are the only DB path; no raw SQL outside `features/*/repo`.
- iOS keeps at most 64 pending local notifications per app.
- Android 12+ exact alarms need `SCHEDULE_EXACT_ALARM` (user-granted on Android 14+) or `USE_EXACT_ALARM` (Play-restricted). Android 13+ needs `POST_NOTIFICATIONS` at runtime.
- Needs a new dev build (new native module). TB-53 (PR #29) adds other native modules in parallel; lockfile conflicts are resolved by re-running `pnpm install`, never by hand.

## Out of scope
- The full permission flow (explainer, re-asking after denial, opening system settings, the exact-alarm settings screen) and quiet hours: **TB-41**.
- Snooze, custom lead times ("10 minutes before"), recurring reminders (TB-45), server push check-ins (TB-46/TB-47).
- A Settings toggle for reminders (TB-41 owns notification settings in the TB-32 registry).

## Open questions
| # | Question | Why it matters | Answer (who, date) |
|---|---|---|---|
| 1 | How is a due time stored next to date-only due dates? | Data model; sync; which tasks get reminders | Local midnight = date-only, any other minute = due time; no migration (spec D1). Agent, 2026-10-28 |
| 2 | How does the user enter a time? | UI; native dependency | `HH:MM` 24-hour text field next to the date (spec D2). Agent, 2026-10-28 |
| 3 | `SCHEDULE_EXACT_ALARM` or `USE_EXACT_ALARM` on Android? | AC1's 60-second window vs Play policy | `SCHEDULE_EXACT_ALARM` only (spec D3). Agent, 2026-10-28 |
| 4 | When is notification permission asked? | UX; overlap with TB-41 | Once, right after the user saves a task while a reminder is needed; denial is respected silently (spec D5). Agent, 2026-10-28 |
| 5 | Per-event scheduling or full reconcile? | Correctness under sync, undo, sign-out | Idempotent full reconcile keyed by task id, nearest 60 (spec D6). Agent, 2026-10-28 |
