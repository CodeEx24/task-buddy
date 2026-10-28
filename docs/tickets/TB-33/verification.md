# TB-33 — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-33 · PR: see the PR for branch `feat/tb-33/work-hours-capacity` · Branch: `feat/tb-33/work-hours-capacity`
> Record only what was actually run and observed. `node scripts/workflow/check-ticket-docs.mjs --branch <branch> --pr` fails the PR gate while any AC row is `not met`, `partial` or `TBD`.

## Commands run
Windows 11, pnpm 10.17.1, 2026-10-28, Orca worktree `tb-33-work-hours` (from main @ 8fe154d). No Metro, emulator or EAS build was started (worker brief); the device check is the coordinator's.

| Command | Result | Notes |
|---|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts` | pass | Fresh worktree; no new dependency in TB-33 |
| `pnpm rebuild better-sqlite3` | pass | For the DB tests |
| `pnpm lint` | pass | 0 problems (an earlier run flagged RHF `watch()` under React Compiler and a prettier wrap; fixed with `useWatch` and `eslint --fix`) |
| `pnpm typecheck` | pass | `tsc --noEmit` |
| `pnpm test --ci --maxWorkers=1` | pass | 78 suites, 642 tests after the review fixes (first full run before them: 78 suites, 641 tests) |
| `pnpm exec drizzle-kit check` | pass | "Everything's fine"; no migration in TB-33 |
| `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-33/work-hours-capacity --pr` | pass | `workflow check: ok` |

## Acceptance criteria
Status is from Jest (schema unit tests, DB-backed accessor tests, component tests, and a route test through the real `src/app/` routes). The emulator proof is the coordinator's (steps in "Manual / E2E").

| AC (verbatim) | Status | Evidence (test name, file:line, screenshot, observed result) |
|---|---|---|
| Given work hours 9:00-17:00 and capacity 5 hours, then the value persists and is exposed to the planner | met | `WorkHoursSettings.test.tsx` "saves 9:00–17:00 with 5 h and exposes it to the planner (AC1)" (Save → SQLite row read back by `getPlanningConstraints(getDb())` = `{ workHours: { start: '09:00', end: '17:00' }, capacityMinutes: 300 }`, and `usePlanningConstraints()` in a probe re-renders to `09:00-17:00/300`); "opens with the stored value after a restart (new query cache)"; `planning-constraints.test.ts` "exposes a saved 9:00–17:00 / 5 h to the planner (AC1)"; `settings-routes.test.tsx` "Settings → Work hours page from the registry → save 9:00–17:00 / 5 h → planner reads it (TB-33)". Device: coordinator, steps 1–3 |
| Invalid ranges (end before start) are blocked with an inline error | met | `WorkHoursSettings.test.tsx` "blocks end before start with an inline error and saves nothing (AC2)" (End 8:00 → "End time must be after start time." under End, alert role, no capacity error, Save writes nothing, fixing the range clears it), "blocks an end equal to the start (an empty day)", "blocks a capacity longer than the work hours and saves nothing"; `planning.test.ts` "rejects end before start (overnight shift) on the end field", "reports an invalid range on end only, not also as a capacity error"; `planning-constraints.test.ts` "never stores an overnight range or a capacity over the span" (repo write throws `ZodError`). Device: coordinator, step 4 |
| Default values are applied for users who skip the setting | met | `planning-constraints.test.ts` "gives the defaults to a user who never set work hours (AC3)", "falls back to the defaults when the stored row is invalid"; `WorkHoursSettings.test.tsx` "shows the defaults to a user who never set them (AC3)" (9:00 / 17:00 / 6 h, hint "Your work hours are 8 h."); route test checks the same defaults; `define-preference.test.ts` "registers work hours and capacity (TB-33), defaulting to 09:00–17:00 and 6 h". Device: coordinator, step 2 |
| Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated | met | Commands table above (642 tests, lint, typecheck, drizzle, docs gate); new tests: `planning.test.ts`, `planning-constraints.test.ts`, `Stepper.test.tsx`, `WorkHoursSettings.test.tsx`, the route test and registry tests. Independent reviewer subagent (fresh context, REVIEW.md): "approve with changes", findings resolved below. Docs: intent, spec (D1–D10), plan, this file, `packages/schemas/README.md`. Human review, CI on the PR and merge: coordinator |

## Manual / E2E
For the coordinator. Needs **no new dev build** (no dependency, no native module, no migration). Existing development build + Metro on this branch; Android emulator, `adb reverse tcp:8081 tcp:8081`, `pnpm start`.

1. **Row from the registry.** Settings tab (`tab-settings`) → section Preferences shows **Appearance** and, below it, **Work hours — When you work and how much a day can hold** (`settings-row-work-hours`).
2. **Defaults (AC3).** Tap it → page `settings-page-work-hours`, native header "Work hours" with Back, tab bar stays. Start **9:00**, End **17:00**, Daily capacity **6 h**; hint "Your work hours are 8 h. …". Every button label is complete: `−1h −15m +15m +1h` under each value, and **Save**. Also check at Android font scale 1.3 (`adb shell settings put system font_scale 1.3`, then back to 1.0): buttons may wrap onto a second row but no label is cut.
3. **Save 9:00–17:00 / 5 h (AC1).** Under Daily capacity tap **−1h** → "5 h"; tap **Save** → "Saved. Your daily plan will use these hours." `adb shell am force-stop <package>`, relaunch, reopen Settings → Work hours → 9:00 / 17:00 / 5 h. (The planner reads the same row; TB-34 has no UI yet.)
4. **End before start (AC2).** Under End tap **−1h** nine times → End **8:00**, red border, "End time must be after start time." under End and no capacity error. Tap **Save** → no "Saved"; force-stop + relaunch → still 17:00 / 5 h. Tap End **+1h** until 10:00 or later → the error goes. Then set End 13:00 (span 4 h) with capacity 5 h → "Capacity can’t be longer than your work hours." under capacity; Save does nothing.
5. **Theme.** Switch Appearance to Dark and back while on this page's stack: the page re-themes and labels stay complete (TB-32 regression).

## Review findings
| # | Severity | Finding (file:line) | Source (self / reviewer agent / human) | Resolution |
|---|---|---|---|---|
| 1 | Important | Zod 4 runs the outer capacity refine even after `workHours` failed, so an invalid range also showed a false capacity error (`packages/schemas/src/planning.ts`) | reviewer agent | Capacity rule passes when span ≤ 0; tests "reports an invalid range on end only…" and capacity-error-absent checks in the AC2 component tests |
| 2 | Important | Four `flex-1` step buttons could wrap "−15m" mid-label on a 320 dp phone or a large font (`Stepper.tsx`) | reviewer agent | Row is `flex-row flex-wrap`, buttons `grow` (sized to their label): whole buttons wrap to a second row instead of breaking a label. Device check at font scale 1.3 in step 2 |
| 3 | Docs | `verification.md` missing | reviewer agent | This file |
| 4 | Nit | "Saved" shows as soon as Save is pressed; on a failed write it is replaced by the error, and the error stays while editing until the next Save | reviewer agent | Accepted and documented (known limitations): local SQLite writes finish in milliseconds; matches TB-32's optimistic `usePreference` |
| 5 | Nit | Capacity stepper went to 24 h, never valid | reviewer agent | Max is now 23 h 45 min (the longest possible span) |
| 6 | Nit | Invalid state not spoken; errors not announced on Android | reviewer agent | Value label adds ", invalid"; error texts have `accessibilityLiveRegion="polite"` |
| 7 | Nit | "end equal to start" test didn't press Save | reviewer agent | Test now presses Save and checks nothing is stored |
| 8 | Nit | Import order in `settings-routes.test.tsx` | reviewer agent | Fixed |
| 9 | Nit | `src/features/plan` imports settings internals | reviewer agent | Kept (spec D3; same pattern as TB-32 importing `tasks/repo/repo-utils`). Hoisting a settings public index is a follow-up if more consumers appear |

## Known limitations & follow-ups
- **Overnight shifts are blocked** (AC2), while TB-24's plan schema (PR #24) allows one block across midnight. A night-shift worker can't set their hours yet. Follow-up (proposed Jira issue): support end < start as "ends next day" in `workHoursSchema`, the page and TB-34.
- `planningClockTimeSchema` duplicates TB-24's `clockTimeSchema` regex because PR #24 is not merged (spec D10). Follow-up after both merge: build one on the other. `packages/schemas/README.md` will conflict with PR #24 on the table (keep both rows).
- One set of hours for every day (no per-weekday hours, no lunch break), 24-hour display only (no 12-hour locale formatting).
- "Saved" is shown optimistically (review finding 4).
- Gateway: the `/plan` request is `{ input }` only today; TB-34 adds `planningConstraintsSchema` to it.

## Completion
- [x] All AC met with evidence (Jest; device proof by the coordinator)
- [ ] Gates green locally and in CI (local green; CI on the PR pending)
- [x] No open Blocking findings
- [ ] Jira updated (In Review → Done)
