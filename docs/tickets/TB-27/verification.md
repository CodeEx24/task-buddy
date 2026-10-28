# TB-27 — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-27 · PR: https://github.com/CodeEx24/task-buddy/pull/17 · Branch: `feat/tb-27/today-inbox-swipe`
> Record only what was actually run and observed. `node scripts/workflow/check-ticket-docs.mjs --branch <branch> --pr` fails the PR gate while any AC row is `not met`, `partial` or `TBD`.

## Commands run
Windows 11, Node 24.21.0, pnpm 10.17.1, 2026-10-28, Orca worktree `tb-27-today-inbox` (base `main` ceb46ab), re-run after the PR #17 review fixes. No Metro, emulator or EAS build was started (worker brief).

| Command | Result | Notes |
|---|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts` | pass | "Done". No dependency changes in TB-27. `--ignore-scripts`: `better-sqlite3`'s `node-gyp rebuild` fails on this machine (no Visual Studio), as on `main` since TB-26; its bundled N-API prebuild loads and every DB test passes. CI (Ubuntu) is unaffected |
| `pnpm lint` | pass | 0 problems (incl. the TB-21 `no-restricted-imports` SQLite rule), re-run after the review fixes |
| `pnpm typecheck` | pass | `tsc --noEmit`, after deleting the stale git-ignored `.expo/types/router.d.ts`, re-run after the review fixes |
| `pnpm test --ci` | pass | 46 suites, 293 tests, ~19 s after the review fixes (first run 45 / 290; `main` 42 / 265); no "worker failed to exit" warning |
| `pnpm exec drizzle-kit check` | pass | "Everything's fine" (re-run). No schema change, no migration |
| `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-27/today-inbox-swipe` | pass | `workflow check: ok` (re-run after this docs update) |
| Gates after the list-performance changes (lazy panels, `LIST_TUNING`, memoised sections/headers): install `--ignore-scripts`, `pnpm lint`, `pnpm typecheck`, `pnpm test --ci`, `pnpm exec drizzle-kit check`, check-ticket-docs | pass | All green; `pnpm test --ci` 50 suites, 339 tests (incl. the new scroll and lazy-panel guards) |
| Gates after the diagonal-swipe fix (`SwipeRow`): install `--ignore-scripts`, `pnpm lint`, `pnpm typecheck`, `pnpm test --ci`, `pnpm exec drizzle-kit check`, check-ticket-docs | pass | All green; `pnpm test --ci` 50 suites, 336 tests (incl. `swipe-row-config.test.ts`, `SwipeRow.test.tsx`) |
| `git merge origin/main` (merge of main (TB-28) `1a00ccf`), then all gates again | pass after conflicts | Conflicts in `NewTaskModal.test.tsx` (kept TB-27's `?due=today` tests and TB-28's notes test) and `task-crud-routes.test.tsx` (kept TB-28's autosave + notes + step + Close flow, with TB-27's Today paths/testIDs: Close → `/`, `today-section-today`). No `package.json`/lockfile conflict. After merge: install `--ignore-scripts`, lint, typecheck, drizzle check, ticket-docs check pass; `pnpm test --ci` 48 suites, 327 tests |

Failures hit during the build, and their fixes:
1. The real swipe gesture throws in Jest (`Reanimated?.isSharedValue is not a function`) → a Jest stand-in for screens (now `src/components/ui/testing/swipe-row-mock.tsx`, installed in `jest-setup.ts`) renders both action panels and two test buttons that release a swipe left/right. The gesture rules are pure and unit-tested (`swipe-row-config.test.ts`), and `SwipeRow.test.tsx` renders the real row with gesture-handler/Reanimated stubbed to assert the pan config and release handling.
2. Swipe panels are hidden from assistive tech, so RNTL's default queries skip them → tests query them with `includeHiddenElements: true`.
3. Review fix 1: a refetch from SQLite returns new objects for unchanged tasks (TanStack's structural sharing did not keep the reference in the test), so `React.memo` with default comparison still re-rendered every row → `SwipeableTaskRow` compares task fields (`areRowPropsEqual`).
4. Both tabs stay mounted (`lazy: false`), so shared testIDs (`task-list-empty`, `task-section-completed`) would collide in route tests → every screen testID is prefixed per tab (`today-*`, `inbox-*`).

## Commands run: Android emulator, 2026-10-28
Emulator `Medium_Phone_API_37.0` (software GLES: `ro.hardware.egl=emulation`), EAS dev build `e98f091e`, Metro on this branch (`41719ea` → `5285d82` → `5966378`). Screenshots `android-*.png` in this folder.

| Command | Result | Notes |
|---|---|---|
| Today with overdue, today and later tasks; Inbox with an undated one (AC1) | pass | Overdue "Pay rent · Overdue · Oct 26", Today "Water plants", Later "Read a book · Tomorrow"; Inbox shows only "Read a book" (no date) (`android-02-today-sections.png`, `android-04-inbox-undated.png`) |
| Inbox empty state (AC3 part) | pass | "Inbox is clear · Tasks without a due date wait here…" (`android-03-inbox-empty.png`) |
| Today Add task preset (`/task/new?due=today`) | pass | Form opened with due date 2026-10-28; saved task appears under Today |
| Swipe left `900→150` on the Inbox task (AC2) | pass | Leaves Inbox; appears on Today under Later as "Tomorrow" (`android-06-today-after-move.png`) |
| Swipe right `150→900` on an overdue task (AC2) | pass | Moves to Completed with a timestamp (`android-07-swipe-right-completed.png`) |
| Short swipe `300→420` | pass | Springs back, no change |
| Diagonal drags `400→650 / +400 px down` (and 2 more) on `41719ea` | pass (expected red) | **Bug found:** the first diagonal completed the task. Fixed in `5285d82` (vertical-dominant drags fail the row pan) |
| Same 3 diagonal drags on `5285d82` | pass | No action; task unchanged (`android-08-after-diagonals.png`) |
| Swipe right on a completed task; straight left/right after the fix | pass | Reopens; left → Later "Tomorrow"; right → Completed (`android-09-…`, `android-10-…`) |
| 500 perf tasks, production-mode bundle (`--no-dev --minify`), 24 flings, `dumpsys gfxinfo` (AC3) | pass (measured; see AC3) | `41719ea`: p50 40 / p90 125 / p95 150 / p99 250 ms, 34.7 % janky. `5966378` (per-row cost cut), two runs: p50 40 / 34, p90 93 / 85, p95 121 / 97, p99 150 / 129 ms, 47.7 % / 37.9 % janky |
| Baseline: Android Settings app, same 24 flings | pass (reference) | p50 29 / p90 42 / p95 46 ms, 15.4 % janky. The emulator's software GPU can't render 60 fps even natively, so 60 fps cannot be proven here |

## Acceptance criteria
| AC (verbatim) | Status | Evidence (test name, file:line, screenshot, observed result) |
|---|---|---|
| Given tasks due today, overdue and undated, then Today shows Overdue, Today and Later groups and Inbox shows undated tasks | met | `TaskListScreen.test.tsx` "Today shows Overdue, Today and Later; Inbox shows undated tasks (AC1)" (both tabs on one cache; order and membership asserted); `task-sections.test.ts` (local-day boundaries 23:00 yesterday / 00:00 and 23:00 today, ordering, hidden empty groups, completed split by tab); `task-crud-routes.test.tsx` "Today: add → edit → …" (real routes: Tomorrow → Later, Today → Today group) and "Inbox: an undated task lands in Inbox …". Device confirmation: Manual steps 1–2 |
| Given a task row, when I swipe right/left, then it completes or reschedules to tomorrow | met | **Emulator:** right completes (and reopens a done task), left moves to tomorrow; short and diagonal drags do nothing after `5285d82` (`android-06…`, `android-07…`, `android-08…`, `android-10…`). | `TaskListScreen.test.tsx` "swipe right completes a task and swipe right again reopens it", "swipe left moves a task to tomorrow: Today → Later", "swipe left on an Inbox task plans it for tomorrow …" (row closes, SQLite `status` / `due_at` checked), "accessible alternative to swiping" suite (actions listed per state, "Move to tomorrow" and "Complete" run + announce, unknown action ignored, swipe panels hidden from assistive tech: `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`); `task-actions.test.ts` (direction mapping, gesture-handler `SwipeDirection` = `left`/`right`, tomorrow = next local midnight); `Checkbox.test.tsx` (pass-through); `task-crud-routes.test.tsx` (accessibility action through the real app). The physical gesture can't run in Jest: Manual steps 3–5 |
| Empty states explain the next action; a list of 500 tasks scrolls at 60 fps in a release build | partial — empty states met on the emulator; **60 fps not proven**: the emulator renders natively at p50 29 ms / p95 46 ms, and the 500-task list at p50 34–40 ms / p95 97–121 ms in production mode after `5966378`. Needs a physical device (or an owner decision to defer to TB-63) | Empty states: `TaskListScreen.test.tsx` "Today: the empty state explains the next action …", "Inbox: the empty state explains …". 500 tasks: "virtualizes a list of 500 tasks: only the first window of rows is rendered" (< 100 of 500 rows mounted); `TaskListScreen.render.test.tsx` (render counter: changing one task, incl. the SQLite refetch, does not re-render other rows; a clock tick re-renders no row whose label is unchanged, with a control that the list did re-render); `perf-seed.test.ts` (500 tasks: 100 overdue / 100 today / 150 later / 150 undated); `root-routes.test.tsx` "the dev perf route seeds and removes 500 tasks". 60 fps needs a release build on a device: Manual step 6 |
| Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated | partial — Jest met; PR review pending coordinator | Reviewer pass on draft PR #17: nothing blocking; its findings fixed (Review findings 5–6). 28 new tests (265 → 293), full suite, lint, typecheck, drizzle check green; TB-17/18/26 tests updated and passing; `docs/tickets/TB-27/*` written. PR, CI and review: coordinator |

## Manual / E2E
For the coordinator. **No new dev build needed**: no dependency changes; gesture-handler 3.3 and Reanimated 4.7 are already in the TB-21 dev build (`e98f091e`). Android emulator `Medium_Phone_API_37.0` (1080 × 2400), `adb reverse tcp:8081 tcp:8081`, `pnpm start`.

**What only the device can check.** Jest replaces `SwipeRow` with a stand-in on screens, so it does not cover: gesture conflicts (vertical scroll vs horizontal pan, tab navigator, diagonal drags — now `activeOffsetX ±20` / `failOffsetY ±12`; re-run `adb shell input swipe 400 764 650 1164 300`: the row must not move and the list scrolls), the panels' `pointerEvents` and touch behaviour while open/closing, the `GestureHandlerRootView` wiring (from `UiProvider`), thresholds, springs and frame rate. Steps 3–6 cover these.

Swipe with `adb shell input swipe <x1> <y> <x2> <y> 300` along the middle of the row (y = the row's vertical centre: tap-and-hold the title in the screenshot, or `adb shell uiautomator dump` and read the bounds of the node whose text is the task title). Right swipe: `x1=150 → x2=900`; left swipe: `x1=900 → x2=150` (both well past the 72 dp ≈ 190 px threshold). A short swipe for the negative check: `x1=300 → x2=420`.

1. **Groups (AC1).** Fresh app → **Today** tab (`tab-index`) shows "Nothing planned" (`today-empty`); **Inbox** (`tab-inbox`) shows "Inbox is clear" (`inbox-empty`). On Today tap **Add task** (`today-add-task-button`) → the form has **Today** selected → title "Water plants" → Save → listed under **Today** (`today-section-today`). Add "Pay rent" with date = yesterday (type it in "Or type a date") → **Overdue** (`today-section-overdue`, meta "Overdue · <Mon D>"). Add "Dentist" with **Next week** → **Later**. Inbox → Add task (`add-task-button`) → "Call mom", no date → listed under **No date** in Inbox only, not on Today.
2. **Cross-tab.** Edit "Call mom" → Tomorrow → Save → it disappears from Inbox and is on Today → Later.
3. **Swipe right (AC2).** On Today, swipe "Water plants" right → a teal "Complete" panel follows the finger; release → the row snaps back and moves to **Completed** checked, with "Completed <Mon D>, <time>". Swipe it right again ("Mark as not done") → back under Today. Try a left swipe on the completed row → nothing opens.
4. **Swipe left (AC2).** Swipe "Pay rent" (Overdue) left → "Move to tomorrow" panel; release → it moves to **Later** labelled "Tomorrow". In Inbox, add an undated task and swipe it left → it leaves Inbox ("Inbox is clear") and shows on Today → Later. Negative: a short swipe (`300 → 420`) springs back and changes nothing. Feel-check: flick quickly (short distance, high speed), reverse direction mid-drag, and scroll the list vertically starting on a row — vertical scrolling must not open a panel.
5. **Accessible path (AC2).** Enable TalkBack (`adb shell settings put secure enabled_accessibility_services com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService`, or Settings → Accessibility). Focus a task's checkbox → open the actions menu (three-finger tap, or swipe up-then-right) → **Move to tomorrow** / **Complete** are listed; choosing one runs it and TalkBack says "<title> moved to tomorrow" / "<title> completed". iOS (optional): VoiceOver rotor → Actions. Without a screen reader: the checkbox completes; Edit → **Tomorrow** → Save reschedules.
6. **500 tasks, 60 fps (AC3).** In the dev build open `taskbuddy://dev/perf-tasks` (`adb shell am start -a android.intent.action.VIEW -d "taskbuddy://dev/perf-tasks"`) → **Add 500 tasks** (`perf-tasks-seed`) → "Added 500 tasks." Then measure in a release JS bundle: stop Metro, run `pnpm start --no-dev --minify`, reload the app (the seeded data stays in `taskbuddy.db`; the dev route is hidden in this mode), or install a `preview` (release) EAS build over the dev build. With the Perf Monitor (dev menu) or `adb shell dumpsys gfxinfo com.codeex24.taskbuddy reset` → fling Today top-to-bottom and back for ~10 s (`adb shell input swipe 540 2000 540 400 150` repeatedly) → `adb shell dumpsys gfxinfo com.codeex24.taskbuddy`. Pass: UI and JS ≈ 60 fps in the monitor / janky frames low single-digit %, no blank rows during the fling. Repeat on Inbox (150 rows). Clean up afterwards in the dev build: `/dev/perf-tasks` → **Remove perf tasks**.
7. **Regression (TB-18 / TB-26).** Today → Add task → Android back → Today is unchanged (same scroll position). Delete a task from its Edit modal → "Task deleted · Undo" snackbar above the tab bar → Undo restores it in its group. `taskbuddy://dev/ui-showcase` shows the old TB-17 primitives demo (dev build only). Dark mode (`adb shell cmd uimode night yes`): swipe panels, empty states and headers follow the theme.

## Review findings
| # | Severity | Finding (file:line) | Source (self / reviewer agent / human) | Resolution |
|---|---|---|---|---|
| 1 | Medium | Add task on Today would create an undated task that lands in Inbox (invisible where it was added) | self | `/task/new?due=today` preset, validated param (spec D8) |
| 2 | Medium | Completed tasks would vanish from both tabs, making TB-26 un-complete unreachable | self | Each tab lists its own completed tasks (spec D3) |
| 3 | Low | Duplicate testIDs across the two always-mounted tabs | self | Per-tab prefixes |
| 4 | Low | `Checkbox` primitive could not carry accessibility actions | self | Two optional pass-through props + test (shared file) |
| 5 | Important | `TaskListScreen.tsx`: inline `renderItem`, unmemoised `SwipeableTaskRow` and a new `runQuickAction` per render: the 60 s `useNow` tick and every board change re-rendered all rows in both mounted tabs | reviewer agent (PR #17) | `SwipeableTaskRow` = `memo(…, areRowPropsEqual)` (field-wise task compare); `useTaskQuickAction` returns a `useCallback` on TanStack's stable `mutate`; `toggleDone` / `openTask` / `renderItem` are `useCallback`s; rows get a precomputed `meta` label instead of `now`. Test: `TaskListScreen.render.test.tsx` |
| 7 | Blocking (device) | A mostly vertical diagonal drag, `adb shell input swipe 400 764 650 1164 300` (250 px right, 400 px down on a Today row, emulator 420 dpi), completed the task: `ReanimatedSwipeable` activates on 10 pt horizontal travel and exposes no `failOffsetY` | coordinator (emulator) | New `SwipeRow` primitive: `usePanGesture` with `activeOffsetX ±20` and `failOffsetY ±12` (vertical move first → the row fails and the list scrolls), and a release more vertical than horizontal never commits; 72 pt commit unchanged. Tests: `swipe-row-config.test.ts` (the finding's path fails, straight swipes activate, thresholds), `SwipeRow.test.tsx` (config passed to the pan, release handling). Device re-check pending |
| 8 | Important (device) | Emulator, production bundle (`expo start --no-dev --minify`), 500 perf tasks, 24 flings on Today: frame time p50 40 / p90 125 / p95 150 / p99 250 ms, 34.7 % janky, 177 slow UI-thread frames — about 3× the Android Settings baseline (p95 46 ms, 15.4 % janky; software GLES, so the emulator cannot show 60 fps at all) | coordinator (emulator) | Per-row cost cut: `SwipeRow` mounts its panels only on first touch (`onBegin`) and has one animated style instead of three; `SectionList` tuned (`LIST_TUNING`); sections, header renderer and `keyExtractor` stable. Guards: `SwipeRow.test.tsx` (panels absent until touched), `TaskListScreen.render.test.tsx` (scrolling mounts new rows but re-renders none already mounted). FlashList proposed to the owner (spec D11). Device re-measure pending |
| 6 | Nit | No test that swipe panels are hidden from accessibility; device-only coverage not stated | reviewer agent (PR #17) | Test "hides the swipe panels from assistive tech"; "What only the device can check" in Manual / E2E |

Independent reviewer pass (medium risk): done by the coordinator on draft PR #17, nothing blocking; findings 5–6 fixed. `dragOffsetFromLeft/Right` left unchanged pending the coordinator's device check.

## Known limitations & follow-ups
- No haptics on swipe (needs `expo-haptics`, a native module → new dev build). Follow-up ticket suggested.
- No undo for complete/reschedule from a swipe (delete keeps its TB-26 undo).
- Completed groups show up to the 100 most recent completions overall (TB-26 board limit), split by tab; open tasks beyond 500 are not shown (TB-63).
- 60 fps is not provable in Jest; Jest only proves virtualisation. If the release-build check fails, try FlashList (new JS dependency).
- `pnpm install` on Windows without Visual Studio needs `--ignore-scripts` (better-sqlite3 build script; see TB-26).
- The real `SwipeRow` gesture never runs in Jest (screens use a stand-in; `SwipeRow.test.tsx` stubs gesture-handler/Reanimated); actual touch arbitration with the list, springs and feel are covered by Manual steps 3–4 only.

## Completion
- [ ] All AC met with evidence (AC2, AC3 device steps pending)
- [x] Gates green locally
- [ ] Gates green in CI
- [x] No open Blocking findings
- [ ] Jira updated (In Review → Done)
