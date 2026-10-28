# TB-33 — Intent

> Jira: https://stratyge.atlassian.net/browse/TB-33 · Blueprint: US-019 · Epic EP-07 · Feature FT-18 (Work hours) · Wave 3 · Risk: Medium (3 pts; new shared schema that the AI planner will consume)
> Status: Draft. No human was available; the worker agent took the recommended option for each question under the coordinator's brief (2026-10-28). Decisions are in [spec.md](spec.md#decisions), pending owner review at PR time.

## Problem
The planner (TB-34) has to fit a day into the user's real working time, but the app has no idea when the user works or how much task time a day can hold. Without that, an AI plan would fill 24 hours or guess.

## Desired outcome
- Settings → Preferences has a **Work hours** page: start time, end time and daily capacity, in 15-minute steps.
- A saved value (e.g. 9:00–17:00, 5 h) persists locally and is available to the planner through one typed accessor.
- End before (or equal to) start, and a capacity longer than the work hours, are blocked with an inline error; nothing is saved.
- A user who never opens the page gets sensible defaults (09:00–17:00, 6 h).

## Affected users
Every user who will use the daily plan (TB-34). Single device; preference sync is TB-43's call.

## Constraints
- Reuse TB-32: the `preferences` table and registry (`definePreference`, `usePreference`, `SETTINGS_PAGES`); no Settings screen or route edits.
- React Hook Form + Zod with a shared schema (`packages/schemas`), because the `/plan` request will carry the same value.
- No new native module (no new dev build): no native time picker.
- Labels must render in full (TB-32 found a clipped Button label; controls are built on the fixed `Button`).
- Offline: everything is local.

## Out of scope
- Overnight shifts (end before start): blocked by AC2 (see spec, known limitation).
- Per-weekday hours, breaks/lunch, time zones.
- Using the value in a plan: TB-34. Onboarding asking for it: TB-51.

## Open questions
| # | Question | Why it matters | Answer (who, date) |
|---|---|---|---|
| 1 | Storage: new table or TB-32's `preferences`? | Migration vs reuse | `preferences`, one key `planner.constraints` (worker per brief, 2026-10-28; D1, D2) |
| 2 | How is the value "exposed to the planner"? | TB-34's contract | `getPlanningConstraints(db)` / `usePlanningConstraints()` in `src/features/plan`, shape = `planningConstraintsSchema` in `packages/schemas` (D3) |
| 3 | Defaults | AC3 | 09:00–17:00, 6 h (D4) |
| 4 | Picker control | Native module = new dev build | `Stepper` built from `Button` (D5) |
