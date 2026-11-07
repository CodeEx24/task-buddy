# TB-43 — Intent

> Jira: https://stratyge.atlassian.net/browse/TB-43 · Blueprint: US-029 · Wave 4, batch A (critical path) · Risk: **High** (sync conflict rules, new Postgres tables with RLS, migrations on synced tables, account isolation)
> Spec: [spec.md](spec.md) · Plan: [plan.md](plan.md) · Verification: [verification.md](verification.md)
> Status: Draft → **Decisions taken by the implementing agent on 2026-10-28** (no human available; the orchestrator's brief says to pick the recommended option for each decision and record why). The human reviews them at the PR.

## Problem
Tasks live only in the phone's SQLite database. A lost, reset or replaced phone loses everything, and a second device (tablet, new phone) starts empty. Since TB-20, a second account that signs in on the same phone also sees the first account's tasks (TB-20 known limitation D7-A), which TB-20 deferred to this ticket.

## Desired outcome
- Every task, subtask and list a user writes is backed up to their Supabase account and appears on their other signed-in devices within 10 seconds of those devices being online (AC1).
- Editing works fully offline. When two devices changed the same task while offline, the edit with the later `updated_at` wins, and no task is duplicated or lost (AC2, automated test).
- Deletes travel as tombstones so every device learns about them; tombstones are purged after 30 days (AC3).
- Each account on a device has its own local data: another account never sees it, and signing out never throws away unsynced changes.

## Affected users
Every signed-in user (free and Pro), on one or more devices. Shared devices (two accounts on one phone). Later tickets build on this: TB-44 (lists/tags UI), TB-53 (export and account deletion), TB-68/TB-71 (shared spaces, realtime shared lists).

## Constraints
- CLAUDE.md invariants: local-first (core task use works offline); repositories are the only local data access; every Postgres table has RLS with a test; synced tables carry `id` (UUIDv7), `updated_at`, `deleted_at`; vendors behind interfaces; no secrets client-side; no task text in logs.
- Device clocks are untrusted (skewed, changed by the user).
- Drizzle migrations are generated (`pnpm db:generate`), never hand-numbered. TB-32 (PR #19, open) also adds local migration `0002`: whichever merges second regenerates (wave-plan rule).
- Agents can't edit `.github/workflows/*.yml`; owner steps go in `docs/actions/`.
- No human available for decisions during the build (orchestrator brief).

## Out of scope
- Syncing tags and task tags (needs a merge rule for two devices creating the same tag name offline: TB-44), preferences (TB-32, still open).
- Field-level merging (LWW is per row, as the AC asks), shared spaces (TB-68), account deletion and export of the server copy (TB-53).
- A sync settings screen; only a one-line status in Settings.

## Open questions (answered in spec.md → Decisions)
| # | Question | Why it matters | Answer (who, date) |
|---|---|---|---|
| 1 | Which tables sync? | FK integrity on the other device; tag-name uniqueness conflicts | D1: lists, tasks, subtasks (agent, 2026-10-28) |
| 2 | How are local changes found and pushed, and how are server changes pulled? | Lost updates, duplicates, cursor gaps | D2: dirty marker + RPC push with server LWW; cursor pull + Realtime wake-up (agent, 2026-10-28) |
| 3 | Whose clock decides "later"? | Skewed device clocks can win forever | D3: device time corrected by the server for clock offset, capped at server time (agent, 2026-10-28) |
| 4 | How do tombstones purge after 30 days? | Storage growth vs resurrection | D4: pg_cron daily on the server + local purge of synced tombstones (agent, 2026-10-28) |
| 5 | How is local data separated per account (TB-20 D7-A)? | Privacy on shared devices vs data loss on sign-out | D5: one local database file per account (agent, 2026-10-28) |
