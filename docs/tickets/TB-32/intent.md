# TB-32 — Intent

> Jira: https://stratyge.atlassian.net/browse/TB-32 · Blueprint: US-018 · Epic EP-02 · Feature FT-49 (Settings & preferences) · Wave 3 · Risk: Medium (new local table + migration, root layout change)
> Status: Draft. Decisions taken by the worker agent under the coordinator's brief (2026-10-28) and recorded in [spec.md](spec.md#decisions); pending owner review at PR time.

## Problem
The Settings tab is a TB-18 placeholder ("Your preferences will live here."). There is no place to see the account, no way to store a preference, and every later settings story (work hours TB-33, notifications, AI, billing) would have to edit the same screen and invent its own storage.

## Desired outcome
- The Settings tab shows an **Account** section (the signed-in email; sign-out slots in with TB-20) and a **Preferences** section whose rows open preference pages.
- A preference changed on a page applies at once and is still set after an app restart (local SQLite, works offline).
- Sections, rows and preference pages come from registries; a later story adds a row or a page by appending an entry, not by editing the screen or a route file.
- Every stored preference is declared once with a key, a Zod schema and a default, so a missing or corrupt value can never break a screen.

## Affected users
Every user (free and Pro), single device. Sync of preferences across devices comes with TB-43.

## Constraints
- Local-first: reads and writes go through a repository in `src/features/settings/repo`; only `src/db` opens the DB (TB-21 lint rule).
- Zod at the boundary: values are validated on write and on read; corrupt/missing → default.
- Synced-table invariants (UUIDv7 `id`, `updated_at`, `deleted_at`) on the new table, so it can sync later.
- No new native module (no new dev build): no AsyncStorage, no MMKV. Theme override uses React Native core `Appearance.setColorScheme`.
- Migrations must keep the TB-21 no-data-loss harness green and stay ordered in the journal.
- Routes stay thin (CLAUDE.md §3).

## Out of scope
- Sign-in, the session and the sign-out button itself (TB-20, PR #18): this ticket provides the Account section they plug into.
- Work hours and daily capacity (TB-33): first consumer of the preference registry.
- Syncing preferences to Supabase (TB-43) and deciding which ones are device-only.
- A "reset all settings" action, search in settings.

## Open questions
| # | Question | Why it matters | Answer (who, date) |
|---|---|---|---|
| 1 | Should the appearance theme sync across devices or stay per device? | Decides whether TB-43 pushes the `appearance.theme` row | Open, for TB-43 |
