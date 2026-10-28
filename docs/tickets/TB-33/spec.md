# TB-33 — Spec

> Jira: https://stratyge.atlassian.net/browse/TB-33 · Intent: [intent.md](intent.md)
> Status: Draft; decisions taken by the worker agent under the coordinator's brief (no human available, recommended options, 2026-10-28), pending owner review at PR time.

## Acceptance criteria (verbatim from Jira)
- [ ] AC1 Given work hours 9:00-17:00 and capacity 5 hours, then the value persists and is exposed to the planner
- [ ] AC2 Invalid ranges (end before start) are blocked with an inline error
- [ ] AC3 Default values are applied for users who skip the setting
- [ ] AC4 Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated

## Behaviour
- **Settings → Preferences** gains a row "Work hours — When you work and how much a day can hold" (`settings-row-work-hours`), after Appearance. It opens `/settings/work-hours` in the Settings stack (native header "Work hours", Back, tab bar stays). Comes from the registry; the Settings screen and routes are unchanged.
- **Page:** three steppers, each a large value with four buttons `−1h −15m +15m +1h`:
  - **Start** and **End**: 24-hour clock shown as `9:00`, `17:00`; range 0:00–23:45 (clamped; a button that can't move the value is disabled).
  - **Daily capacity**: `6 h`, `5 h 30 min`, `45 min`; stepper range 15 min–23 h 45 min (the longest possible span).
  - A hint: "Your work hours are 8 h. Capacity is how much task time the planner may fill; the rest stays free for breaks and meetings."
  - **Save** writes the value. "Saved. Your daily plan will use these hours." shows until the next change.
- **Validation (AC2), live and on Save:** end ≤ start → "End time must be after start time." under End (alert role, red border on the value). Capacity > end − start (with a valid range) → "Capacity can’t be longer than your work hours." under Daily capacity; an invalid range shows only the End error. While either error shows, Save writes nothing. Fixing the value clears the message.
- **Defaults (AC3):** nothing stored, or a stored value that is missing/corrupt/invalid → 09:00–17:00, 6 h, both on the page and from the planner accessor.
- **Planner (AC1):** `getPlanningConstraints(db)` returns `{ workHours: { start: '09:00', end: '17:00' }, capacityMinutes: 300 }` after that save; `usePlanningConstraints()` re-renders with it at once (shared query cache).
- **Write failure:** "Couldn't save your work hours. Try again." (alert). The stored value is re-read (TB-32 `usePreference`); the form keeps the edit so Save can be retried.
- **Offline:** local only.

## Technical design
- **Surfaces**
  - `packages/schemas/src/planning.ts`: `planningClockTimeSchema` (`HH:MM`, 15-minute step), `workHoursSchema` (end > start, issue on `end`), `planningConstraintsSchema` (`{ workHours, capacityMinutes }`, capacity int, multiple of 15, 15–1440, ≤ span, issue on `capacityMinutes`), `DEFAULT_PLANNING_CONSTRAINTS`, `clockTimeToMinutes`, `minutesToClockTime`, `workHoursSpanMinutes`, messages, `PLANNING_STEP_MINUTES`.
  - `src/features/settings/preferences/planning.ts`: `planningConstraintsPreference` (key `planner.constraints`), registered in `PREFERENCES`.
  - `src/features/settings/components/WorkHoursSettings.tsx`: loads with `usePreference`, then an RHF form (`zodResolver(planningConstraintsSchema)`); every change re-validates the whole form (`trigger()`), because each rule spans fields.
  - `src/features/settings/registry/pages.ts`: `{ slug: 'work-hours', … }` appended.
  - `src/features/plan/planning-constraints.ts`: `getPlanningConstraints(db)` + re-exported schema/types; `src/features/plan/hooks/use-planning-constraints.ts`: `usePlanningConstraints()`.
  - `src/components/ui/Stepper.tsx`: new design-system primitive (value + step buttons, clamped, built from `Button`).
- **Interfaces & contracts**
  ```ts
  type WorkHours = { start: string /* HH:MM */; end: string /* HH:MM, > start */ };
  type PlanningConstraints = { workHours: WorkHours; capacityMinutes: number /* 15..span, step 15 */ };
  function getPlanningConstraints(db: TaskBuddyDb): PlanningConstraints;
  function usePlanningConstraints(): PlanningConstraints;
  ```
  Times use the same `HH:MM` 24-hour format as TB-24's plan blocks (`clockTimeSchema`, PR #24), so TB-34 can check blocks against work hours without conversion. The gateway request today is `{ input }` only; TB-34 adds the constraints to it and validates them with this schema.
- **Data changes:** none. One new key in TB-32's `preferences` table (JSON value). No migration (`drizzle-kit check` clean).
- **Reuse:** TB-32 `definePreference` / `readPreference` / `writePreference` / `usePreference` / `SETTINGS_PAGES` / `SettingsPageScreen`; `Button` (no-clip label fix); RHF + `zodResolver` pattern from `TaskForm`; `newId`; test helpers `renderWithQuery`, `resetTaskData`.

## Edge cases
| Case | Expected |
|---|---|
| Nothing stored | Defaults 09:00–17:00 / 6 h |
| Stored row with end before start, unknown key, off-step time, or malformed JSON | Defaults (decode falls back), next save repairs the row |
| End = start | Blocked: "End time must be after start time." |
| End before start (overnight) | Blocked (AC2); see known limitation |
| Capacity = span (e.g. 9–12, 3 h) | Allowed |
| Capacity > span | Blocked on capacity |
| Start +1h at 23:00 | Clamped to 23:45; at 23:45 the `+` buttons are disabled |
| Capacity −1h at 0:30 | Clamped to 15 min |
| Write fails (DB error) | Save error shown; value re-read from SQLite |
| Write with an invalid value at runtime (bypassing the form) | `ZodError`, nothing stored |

## Security, privacy & AI cost
No network, no AI call in this ticket. Work hours are non-secret, local, in the app's private SQLite file. When TB-34 sends them to the gateway they are a small, schema-validated object with no free text, so they add no prompt-injection surface.

## Decisions
| Decision | Options considered | Choice | Decided by / date |
|---|---|---|---|
| D1 Storage | New table; TB-32 `preferences` | **`preferences`** (TB-32 registry): no migration, validated both ways, sync-ready columns | Worker per brief (recommended), 2026-10-28 |
| D2 Keys | Two keys (`planner.work-hours`, `planner.capacity`); one key | **One key `planner.constraints`** holding `{ workHours, capacityMinutes }`: "capacity ≤ span" is a cross-field rule, and one value makes it hold on every write and read (two keys could be saved half-way and disagree) | Worker, 2026-10-28 |
| D3 "Exposed to the planner" | Planner reads the preference directly; typed accessor | **`getPlanningConstraints(db)` (pure, for TB-34's request builder) and `usePlanningConstraints()` (UI) in `src/features/plan`**; schema in `packages/schemas/src/planning.ts` because the gateway will validate the same object | Worker per brief, 2026-10-28 |
| D4 Defaults | 9–17 / 8 h; 9–17 / 6 h; 9–17 / 5 h | **09:00–17:00, 6 h**: the brief's recommendation; leaves ~2 h of an 8 h day for meetings, breaks and overrun, which keeps the first plans realistic | Worker per brief, 2026-10-28 |
| D5 Time and capacity control | Native date-time picker (new native module → new dev build); text input `HH:MM`; chips; stepper | **`Stepper` primitive built from `Button`** (`−1h −15m +15m +1h`): no native module, 15-minute step by construction, every value reachable in a few taps, inherits Button's no-clip label layout and 44 pt target. Short visible labels (≤ 4 chars) so four fit on a 360 dp row; one non-wrapping row of equal `flex-1` buttons (a `flex-wrap` row left a ~300 px gap on device, see Deviations); labels fit at font scale 1.3 on a 411 dp device; full spoken labels ("End 1 hour earlier") | Worker, 2026-10-28 |
| D6 Save model | Autosave per tap (like Appearance); explicit Save | **Explicit Save**: intermediate states are often invalid (moving End past Start on the way), and AC2 asks that invalid ranges are blocked with an inline error rather than silently not saved | Worker, 2026-10-28 |
| D7 Value format | Minutes after midnight; `HH:MM` strings | **`HH:MM`** like TB-24's plan blocks; capacity in minutes (int) | Worker, 2026-10-28 |
| D8 Time step | 5, 15, 30 min | **15 min** (brief) for times and capacity, enforced by the schema | Coordinator brief, 2026-10-28 |
| D9 Overnight shifts | Allow end < start (crosses midnight); block | **Block** (AC2). Mismatch with TB-24's plan schema, which allows one block across midnight: recorded as a known limitation and follow-up | Coordinator brief, 2026-10-28 |
| D10 `HH:MM` regex | Import TB-24's `clockTimeSchema`; own copy | **Own `planningClockTimeSchema`** with the same regex: TB-24 (PR #24) is not merged, so importing it would block this PR. Follow-up: once both are on main, build `planningClockTimeSchema` on `clockTimeSchema` | Worker, 2026-10-28 |

## Deviations (added during build)
| Date | Change | Reason | Approved by |
|---|---|---|---|
| 2026-10-28 | Stepper button row back to one non-wrapping `flex-1` row (was `flex-row flex-wrap` + `grow` after review finding 2) | Coordinator's device check of efdab53: Yoga measured the wrapping row at a narrow width, where labels wrap tall, and kept that height, so each Stepper was 720 px tall with ~300 px of empty space under its buttons; the End error landed far from End. With `flex-1` each Stepper is 310 px; labels complete at font scale 1.0 and 1.3 (screenshots in verification) | Coordinator (device finding), worker fix |
