# TB-28 — Intent

> Jira: https://stratyge.atlassian.net/browse/TB-28 · Blueprint: US-014 · Epic EP-03 · Feature FT-08 · Wave 2 · Risk: Medium
> Status: Draft. Decisions taken by the worker agent under the coordinator's brief (2026-10-28) and recorded in [spec.md](spec.md#decisions); pending owner review at PR time.

## Problem
Since TB-26 a user can open a task and change its title, due date and priority, but only through an explicit "Save changes" that closes the screen. There is nowhere to write context (an address, a link, who to call) and no way to break a task into steps, although the database has had `tasks.notes` and a `subtasks` table since TB-21.

## Desired outcome
- Opening a task shows one detail screen where the user edits title, notes, due date and priority, and manages a checklist of steps (add, check, reorder, delete).
- Edits save on their own within 500 ms of the last keystroke; closing the screen never loses what was typed.
- When every step is checked, the app offers to complete the task; it never completes it on its own.
- Works offline and survives a restart (local SQLite), like everything in TB-26.

## Affected users
Every user (free and Pro), single device. Shared Spaces and sync come later (TB-43).

## Constraints
- Local-first: reads and writes go through `src/features/tasks/repo/*`; no network, no AI.
- Locked stack (CLAUDE.md §2): TanStack Query (optimistic mutations as in TB-26), React Hook Form + Zod, design-system primitives from `src/components/ui`.
- Zod at the boundary, including the notes length limit (`MAX_NOTES_LENGTH` = 10,000, TB-21).
- Synced-table invariant: soft delete and `updated_at` on every write (subtasks included).
- No new native module (it would need a new dev build). Drag-to-reorder is not in the AC, so reordering uses accessible move up / move down buttons.
- Keep TB-18 route behaviour (deep link `taskbuddy://task/<id>`, back keeps state) and TB-26's undo.

## Out of scope
- Today/Inbox screens, swipe actions and row layout (TB-27, in parallel). The list rows do not show notes or step progress yet.
- Renaming a step in place (delete and re-add for now), drag-and-drop reordering, undo for a deleted step.
- AI "break this task into steps" (later AI tickets; it will reuse this checklist and need confirmation).
- Rich text or links in notes.

## Open questions
| # | Question | Why it matters | Answer (who, date) |
|---|---|---|---|
| 1 | Autosave or explicit save? | AC3 asks for autosave within 500 ms | Autosave everything on the detail screen; no Save button (worker, 2026-10-28; spec D1) |
| 2 | Does checking every step complete the task? | AC2 says "offered" | Offer only, with "Complete task" / "Not now" (worker, 2026-10-28; spec D3) |
| 3 | How are steps reordered without a new native module? | Drag needs gestures and a design pass | Move up / move down buttons (worker, 2026-10-28; spec D4) |
