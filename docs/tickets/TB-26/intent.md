# TB-26 — Intent

> Jira: https://stratyge.atlassian.net/browse/TB-26 · Blueprint: US-012 · Epic EP-03 · Feature FT-08 · Wave 2 · Risk: Medium
> Status: Draft. Decisions taken by the worker agent under the coordinator's brief (2026-10-28) and recorded in [spec.md](spec.md#decisions); pending owner review at PR time.

## Problem
The app has a local database and repositories (TB-21) and a navigation shell (TB-18), but a user still can't create, edit, complete or delete a task. The Inbox tab is a placeholder and the task modal shows "coming soon".

## Desired outcome
- A user can add a task with a title, an optional due date and a priority, and sees it in the right section of the task list at once.
- A user can open a task, change its title, due date or priority, and complete or un-complete it. Completed tasks show when they were completed.
- A user can delete a task and undo the delete for 5 seconds. Delete is a soft delete (`deleted_at`).
- Everything works offline and survives an app restart (local SQLite).

## Affected users
Every user (free and Pro), single device. Shared Spaces and sync come later (TB-43).

## Constraints
- Local-first: all reads and writes go through `src/features/tasks/repo/*` (TB-21). No network.
- Locked stack (CLAUDE.md §2): TanStack Query for async/data state, Zustand for UI state, React Hook Form + Zod for forms, design-system primitives from `src/components/ui`.
- No new native module (it would need a new dev build): JS-only dependencies only.
- Synced-table invariant: soft delete, `updated_at` bumped on every write.
- Routes stay thin; logic lives in `src/features/tasks`.

## Out of scope
- Today/Inbox split screens and swipe actions (TB-27). Task notes and subtasks UI (TB-28).
- Lists, tags and filters (TB-44). Reminders (TB-40). Recurring tasks (TB-45). AI quick-add (TB-29).
- Due *times* (only a due date). A native date picker.
- Pagination/virtualisation beyond the first 500 open tasks (TB-63 performance budgets).

## Open questions
| # | Question | Why it matters | Answer (who, date) |
|---|---|---|---|
| 1 | Where do tasks show until TB-27 builds Today/Inbox? | "appears in the right list" | Inbox tab becomes the task list with Today / Upcoming / No date / Completed sections (worker, 2026-10-28; see spec D1) |
| 2 | Date picker: native module or JS? | A native module needs a new dev build | JS-only: quick chips + `YYYY-MM-DD` field (worker, 2026-10-28; spec D4) |
