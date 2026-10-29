# TB-40 — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-40 · PR: (draft, link added when opened) · Branch: `feat/tb-40/local-due-reminders`
> Record only what was actually run and observed. Windows 11, Node 24, pnpm 10.17; jest always `--maxWorkers=1` (low memory). No Metro, emulator or EAS build was started by this agent: the on-device check of AC1 needs a new dev build (new native module) and is the coordinator's (steps below).

## Commands run
| Command | Result | Notes |
|---|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts` + `pnpm rebuild better-sqlite3` | pass | fresh worktree |
| `pnpm exec expo install expo-notifications` → `pnpm add expo-notifications@58.1.6` | pass | expo install picked 58.1.7 (published the same day); pinned to 58.1.6 = SDK bundled range `~58.1.6` (spec D10) |
| `pnpm lint` | pass | 0 problems (after switching two enum imports to named imports for `import/namespace`) |
| `pnpm typecheck` | pass | `tsc --noEmit` clean |
| `pnpm test --ci --maxWorkers=1` | pass | 88 suites, 740 tests |
| `pnpm exec drizzle-kit check` | pass | "Everything's fine" (no schema change) |
| `pnpm exec prettier --list-different .` | pass | none of the changed files listed (22 pre-existing files under `.claude/`, `drizzle/meta`, `tsconfig.json` are untouched) |
| `pnpm exec expo config --type introspect` | pass | manifest has `SCHEDULE_EXACT_ALARM`, the `notification_icon` + colour meta-data; template permissions unchanged |
| `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-40/local-due-reminders` | pass | `workflow check: ok` (draft PR, so without `--pr`: AC1's device part is pending) |

Negative check of a test: with `requestReminderReconcile()` commented out of `SyncProvider.tsx`, `SyncProvider.test.tsx` › "TB-40: a pulled change…" fails (1 failed); restored, it passes.

## Acceptance criteria
| AC (verbatim) | Status | Evidence (test name, file:line, screenshot, observed result) |
|---|---|---|
| Given a task with a due time, then a local notification fires within 60 seconds of that time with the app closed | pending device | Scheduling at exactly `due_at`: `reconcile-reminders.test.ts` › "AC1: schedules a reminder at the due time of a new task, with its title"; `RemindersProvider.test.tsx` › "follows create, edit, complete, delete and undo through the real task mutations". Delivery with the app closed is done by the OS (expo-notifications date trigger, exact alarm on Android when allowed): **pending the coordinator's device check** (steps below) |
| Completing or deleting the task cancels its pending notification | met | `reconcile-reminders.test.ts` › "AC2: completing cancels…", "AC2: deleting cancels… undo (restore) schedules it again"; `RemindersProvider.test.tsx` (real `useUpdateTask` / `useDeleteTask` / `useRestoreTask`); `SyncProvider.test.tsx` › completion on another device cancels |
| Editing the due time reschedules the notification | met | `reconcile-reminders.test.ts` › "AC3: editing the due time reschedules…", "AC3: changing to a date-only due date or removing it cancels…"; `RemindersProvider.test.tsx` (real `useUpdateTask`); `SyncProvider.test.tsx` › due time moved on another device is rescheduled |
| Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated | partial | Tests added (date helpers, form, repo query, plan, reconcile, session, provider, sync integration, add-task screen), full suite green; independent agent review below; these docs. Human PR review and merge pending |

## Manual / E2E
Not run by this agent (no device). **Coordinator device steps** (Android dev build that includes `expo-notifications`):

1. Install the new dev build, sign in, open Task Buddy once.
2. Android 14+: allow exact alarms — Settings → Apps → Task Buddy → Alarms & reminders → Allow (or `adb shell appops set com.codeex24.taskbuddy SCHEDULE_EXACT_ALARM allow`). See [`docs/actions/android-exact-alarms.md`](../../actions/android-exact-alarms.md).
3. **AC1.** Add task "TB-40 reminder", Due date **Today**, Time = now + 3 minutes (24-hour `HH:MM`), Save. Allow the notification prompt (shown now, once). Optional: `adb shell dumpsys alarm | grep -i -A3 taskbuddy` shows the pending alarm.
4. **Close the app by swiping it away from Recents** (or `adb shell am kill com.codeex24.taskbuddy` after pressing Home). **Do not use Force stop / `adb shell am force-stop`**: Android cancels a force-stopped app's alarms by design until it is opened again. Turn on airplane mode to show it works offline.
5. Watch the clock: the notification "TB-40 reminder · Due at h:mm" must appear within 60 s of the time (screenshot the shade with the status-bar clock). Tap it: the app opens on the task's detail.
6. **AC2 complete.** Task due now + 3 min → mark it complete → swipe the app away → wait until 1 min past the time: no notification. **AC2 delete.** Same with Delete (let the 5 s Undo pass). Optional: Delete then Undo → the reminder fires.
7. **AC3.** Task due now + 5 min → open it, change Time to now + 3 min (autosaves) → swipe away → it fires at the new time, and nothing at the old time.
8. **Sign-out.** Task due now + 3 min → Settings → Sign out → wait past the time: no notification.
9. **Denial (fresh install or after clearing app data).** Deny the prompt on the first timed save: the task saves normally, no error, no notification, no second prompt.

iOS (if checked): same steps; close by swiping up from the app switcher; the prompt asks for alerts and sounds.

## Review findings
| # | Severity | Finding (file:line) | Source (self / reviewer agent / human) | Resolution |
|---|---|---|---|---|
| 1 | Important | Reconcile checked (and could prompt for) permission for a reminder due within the last minute that was not pending, although it would never be scheduled | self (test "does not schedule past due times…") | Fixed: grace-window reminders count only when already pending (`reconcile-reminders.ts`) |
| 2 | Nit | One failing `schedule`/`cancel` call stops the rest of that reconcile (`reconcile-reminders.ts`) | self (second pass) | Accepted: logged without content; the next trigger (write, sync, foreground) retries the whole diff idempotently |
| 3 | Nit | A `due_at` with seconds (none can be written today: the form has minute precision) would be rounded by the detail form and autosaved on open | self (second pass) | Accepted; noted under limitations for future writers (AI quick-add) |
| 4 | — | Independent reviewer subagent (fresh context, REVIEW.md passes) was started but stopped on an API usage limit before reporting. A second self-review pass covered the four REVIEW.md passes instead: spec compliance (all ACs mapped, decisions D1–D12 recorded), correctness (queue ordering on account switch, coalescing, grace window, DST/midnight sentinel, permission mapping, identifier replacement), invariants (no task text logged — tested; expo-notifications only in one module; repo is the only DB path), tests (sync test proven to fail without the change) | self | **Human PR review still required** |

## Known limitations & follow-ups
- **Android 14+ exact alarms start denied**: until the user allows "Alarms & reminders", Android may deliver reminders late (inexact alarm). TB-41 should add the explanation + "Open settings" button (`requestExactAlarmPermissionsAsync`). Owner action: [`android-exact-alarms.md`](../../actions/android-exact-alarms.md).
- **Permission**: asked once; a denial is never re-asked here (TB-41).
- **00:00 can't be a due time** (it means date-only, spec D1); the form says so.
- **Time zones**: a date-only task created at local midnight in one zone reads as a timed task (and gets a reminder) on a device in another zone. Same root cause as the date label; revisit if travel becomes a use case (would need a `has_due_time` column + sync migration).
- **Force-stopped app (Android)**: alarms are cancelled by the OS until the next launch, which reconciles.
- **Any successful mutation triggers a reconcile** (not only task writes), so the one-time prompt could follow e.g. a settings change while a timed task exists. Harmless; TB-41 may narrow it.
- A `due_at` carrying seconds (not writable today) would be rounded to the minute if edited in the detail form.
- Time entry is a text field (`HH:MM`); a native time picker can come with a design pass.

## Completion
- [ ] All AC met with evidence (AC1 device check pending)
- [x] Gates green locally (CI pending on the PR)
- [x] No open Blocking findings (self-review; the independent agent review stopped on a usage limit, human review pending)
- [ ] Jira updated (In Review → Done)
