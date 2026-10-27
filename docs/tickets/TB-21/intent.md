# TB-21 — Intent

> Jira: https://stratyge.atlassian.net/browse/TB-21 · Blueprint: US-007 · Wave 1 (batch B) · Risk: **High** (migrations on tables that TB-43 will sync)
> Status: **Accepted by the owner on 2026-10-27** ("accept all")

## Problem
The app has no storage. Task Buddy is local-first: core task use must work offline (CLAUDE.md §1), and later sync (TB-43) needs every row to carry a stable id, a change time and a soft-delete marker. Getting the schema wrong now means a painful migration on user data later.

## Desired outcome
- On first launch, migrations create `tasks`, `subtasks`, `lists`, `tags` (plus a `task_tags` join) with `id` (UUIDv7), `updated_at` and `deleted_at`.
- Every later migration is tested against a database that already holds data, so no rows are lost.
- Typed repositories in `src/features/*/repo` are the only way app code reads or writes local data (CLAUDE.md §3: no raw SQL in components).
- Listing tasks stays fast at scale: 10,000 tasks, a list query under 50 ms p95 on a mid-range Android device.

## Affected users
Every user (their tasks live here), and every later data ticket (TB-26 CRUD, TB-43 sync, TB-44 lists/tags, TB-45 recurrence, TB-53 export/deletion).

## Constraints
- Stack locked: **expo-sqlite + Drizzle ORM** (FTS5 later for search).
- Invariant 4: synced tables carry `id (UUIDv7)`, `updated_at`, `deleted_at` (soft delete).
- `babel.config.js` / `metro.config.js` are shared with TB-17. **TB-17 merges first**, then TB-21 rebases and adds its entries (wave-plan hotspot 2).
- Works in Expo Go today (expo-sqlite ships in Expo Go) and in the TB-16 dev client.
- No raw SQL outside `src/db/` and repositories. Drizzle parameterises all values.

## Out of scope
Sync and conflict rules (TB-43), the ownership column / `user_id` (added additively by TB-20/TB-43), FTS5 search (TB-44), recurrence fields (TB-45), encryption at rest, task UI (TB-26).

## Open questions
| # | Question | Why it matters | Answer (who, date) |
|---|---|---|---|
| 1 | The perf AC names a "mid-range Android device". Use the Android emulator as a proxy, or does the owner have a physical Android phone? | Determines whether AC3 is fully met or an accepted exception | |
| 2 | Does the proposed schema (spec, Data section) match how you think about tasks, lists, subtasks and tags? | High risk: the owner accepts the schema before code | |
