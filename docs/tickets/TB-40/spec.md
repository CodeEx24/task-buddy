# TB-40 — Spec

> Jira: https://stratyge.atlassian.net/browse/TB-40 · Intent: [intent.md](intent.md) · Plan: [plan.md](plan.md)
> Status: Draft → **Decisions taken by the implementing agent on 2026-10-28** (orchestrator brief: no human available, pick the recommended option and record it here). Reviewed by the human at the PR.

## Acceptance criteria (verbatim from Jira)
- [ ] AC1 Given a task with a due time, then a local notification fires within 60 seconds of that time with the app closed
- [ ] AC2 Completing or deleting the task cancels its pending notification
- [ ] AC3 Editing the due time reschedules the notification
- [ ] AC4 Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated

## Behaviour
- **Due time in the task form** (add modal and the autosaving detail screen). Under the date field: "Time (optional)", `HH:MM` 24-hour (`task-form-due-time`), helper "24-hour time. You get a reminder at this time." Errors under the field: "Use a 24-hour time as HH:MM" (not a time), "00:00 means no time. Use 00:01 or later" (D1), "Pick a due date for this time" (time without a date). Picking the "No date" chip clears the time. A stored due time shows in the form and in the task row's label (`Today, 3:30 PM`, `Overdue · Oct 27, 8:15 AM`).
- **Which tasks get a reminder.** Live (`deleted_at` NULL), open tasks whose `due_at` has a time of day (not local midnight) and is in the future. Date-only, undated, done, deleted and past tasks get none.
- **Reminder** (AC1). A local notification at `due_at` exactly: title = task title, body = "Due at 3:30 PM", Android channel "Task reminders" (high importance: sound + heads-up). It is scheduled with the OS, so it fires with the app closed (swiped away) and offline; Android re-arms it after a reboot (expo-notifications' boot receiver).
- **Keeping reminders right.** The pending reminders are reconciled with the tasks (idempotently: computed from the DB, diffed against what is pending, keyed by task id):
  - after every successful task write (create, edit, complete, un-complete, delete, undo) (AC2, AC3);
  - after a sync cycle pulls changed rows (another device edited, completed or deleted the task);
  - on app start (signed in) and every time the app returns to the foreground.
- **Cap.** At most the nearest 60 reminders are pending (iOS keeps 64 per app). Completing or passing one lets the next in line in at the next reconcile.
- **Permission** (minimal; TB-41 does the full flow). The OS prompt shows at most once: the first time the user saves a task while a reminder is needed and permission is still undetermined. Start, foreground and sync never prompt. Denied (now or later in system settings): nothing is scheduled, pending reminders are cancelled, no error is shown, the app never re-asks. Granted later in settings: the next foreground schedules everything.
- **Tap** opens the task's detail modal (`/task/<id>`, the route behind `taskbuddy://task/<id>`), also when the tap launched the app.
- **Sign-out / account switch.** Every pending reminder is cancelled; the next account's reminders are scheduled from its own DB. A tap on a reminder while signed out does nothing (it was cancelled at sign-out anyway).
- **Offline.** Nothing here uses the network.

## Technical design
- **Surfaces**
  - `src/features/notifications/reminder-scheduler.ts`: the `ReminderScheduler` interface (`getPermission`, `requestPermission`, `listScheduled`, `schedule`, `cancel`, `cancelAll`, `subscribeToOpens`), `Reminder` type, identifiers (`task-reminder:<taskId>`), notification `data` schema (`{ kind: 'task-reminder', taskId, fireAt, url }`, Zod-validated when read back), `MAX_SCHEDULED_REMINDERS = 60`, channel id/name.
  - `expo-reminder-scheduler.ts`: the expo-notifications implementation (the only importer of the library). `scheduler-factory.ts`: the app's singleton; Jest maps it to an in-memory fake (`testing/jest-setup.ts`).
  - `reminder-plan.ts` (pure): `planReminders(tasks, from, cap)` and `diffReminders(desired, pending, now)`.
  - `reconcile-reminders.ts`: reads `listUpcomingTimedTasks`, checks/requests permission, applies the diff.
  - `reminder-session.ts`: one session per signed-in account; an app-wide serial queue (a previous account's cancel-all always runs before the next account's first reconcile); requests coalesce while one waits. `requestReminderReconcile()` for sync.
  - `components/RemindersProvider.tsx`: mounted by the root layout inside `DbGate`, keyed by user id, only while signed in. Triggers: mount, `AppState` → active, TanStack mutation success (prompt allowed), tap → `router.push(taskHref(id))`; unmount → `stop()` (cancel all).
  - Task repository: `listUpcomingTimedTasks(db, { after, limit })` (live, open, timed, `due_at > after`, soonest first; skips date-only rows in JS, paging over `tasks_live_status_due_sort_idx`).
  - `src/lib/dates.ts`: `hasTimeOfDay`, `parseTimeInput`, `toTimeInput`, `atLocalTime`; `formatDueLabel` appends the time.
  - Task form (`task-form.ts`, `TaskFormFields.tsx`): `dueTime` field.
  - `SyncProvider`: calls `requestReminderReconcile()` when a cycle changed rows.
  - `app.json`: `expo-notifications` plugin (`icon` = monochrome icon, `color`, `enableRemoteNotifications: false`), `android.permissions: ["android.permission.SCHEDULE_EXACT_ALARM"]`. The library's manifest adds `POST_NOTIFICATIONS` and `RECEIVE_BOOT_COMPLETED`.
- **Interfaces & contracts:** no API or server change. `taskFormSchema` gains `dueTime` (defaults to `''`). Notification identifiers and `data` are app-internal.
- **Data changes:** none. No migration; `due_at` keeps its meaning (epoch ms), now any minute of the day (D1).
- **Reuse:** TB-21 repository + Zod boundary; TB-26 form/chips and `taskHref`; TB-43 provider pattern (mount in `DbGate`, mutation-cache subscription, `AppState`), remote-factory-style Jest mapping; `formatTime`.

## Edge cases
| Case | Expected |
|---|---|
| Date-only task (any existing task) | No reminder |
| Due time already past when saved | Saved; no reminder |
| Reconcile runs while a reminder is being delivered (≤ 60 s after its time) | Kept, not cancelled (`DUE_NOW_GRACE_MS`) |
| Due time changed to one already past | Old reminder cancelled; none scheduled |
| Title edited | Reminder replaced with the new title |
| 65 timed tasks | Nearest 60 pending; the rest follow as earlier ones fire or complete |
| Permission undetermined, app start | Nothing scheduled, no prompt |
| Permission denied / revoked | Nothing pending; no prompt; no error |
| Delete, then Undo within 5 s | Cancelled, then scheduled again |
| Another device completes / moves the task | Next sync cycle reconciles (cancel / reschedule) |
| Sign out, or switch account | All pending reminders cancelled before the next account's are set |
| Android 14+ without "Alarms & reminders" allowed | Still delivered, but Android may delay it (inexact alarm). See D3, limitations |
| Force-stop (Settings → Force stop, `adb shell am force-stop`) | Android itself cancels a force-stopped app's alarms until it is opened again; the next start reconciles. Swiping the app away does not cancel them |
| Device time zone changes | `due_at` is an instant; the reminder fires at that instant. A date-only task created at local midnight in one zone looks timed in another zone (D1 limitation) |
| Scheduler/OS call fails | Logged as `[reminders] <job> failed { name }` (no task content); later jobs still run |

## Security, privacy & AI cost
No AI, no network, no server data. The task title is shown in the notification (on the lock screen too, per the user's OS settings); it is the user's own local data. Nothing about tasks is logged: failures log only the error name. Notification `data` and the tapped task id are validated (UUIDv7) before navigating. New permissions: `POST_NOTIFICATIONS` (runtime, Android 13+), `SCHEDULE_EXACT_ALARM` (special access, Android 12+), `RECEIVE_BOOT_COMPLETED` (re-arm after reboot); iOS asks for alert + sound. iOS remote-notification entitlement is not added (`enableRemoteNotifications: false`) until server push (TB-46).

## Decisions
| # | Decision | Options considered | Choice | Decided by / date |
|---|---|---|---|---|
| D1 | How to store a due time next to date-only due dates | (a) local midnight = date-only, any other minute = due time, no migration; (b) new `has_due_time` / `due_time` column (local + Postgres migration on a synced table, sync mapping) | **(a)**. Every existing task stays date-only and nothing in sync changes. Cost: 00:00 can't be picked as a time (form explains), and a date-only task viewed in another time zone reads as timed (already true of its date label) | Agent (recommended), 2026-10-28 |
| D2 | Time input | (a) `HH:MM` text field like the TB-26 date field; (b) `@react-native-community/datetimepicker` (another native module) | **(a)**, matching TB-26 D4 (JS-only form inputs). A native picker can come with the design pass | Agent, 2026-10-28 |
| D3 | Android exact alarms | (a) `SCHEDULE_EXACT_ALARM`; (b) `USE_EXACT_ALARM` (auto-granted, but Google Play only allows it for apps whose core function is an alarm clock or calendar); (c) none (inexact) | **(a)**, `delivery: 'bestEffort'` (`setExactAndAllowWhileIdle` when allowed). (b) risks a Play rejection for a to-do app; (c) can miss AC1 by minutes in Doze. On Android 12–13 the permission is granted on install; on 14+ the user must allow "Alarms & reminders" — until then expo-notifications falls back to an inexact alarm. Sending the user to that settings screen (with an explanation) is TB-41. `'alarmClock'` delivery rejected: it shows an alarm icon in the status bar | Agent, 2026-10-28 |
| D4 | Android channel | Default channel vs own | Own channel `task-reminders`, "Task reminders", importance HIGH (sound + heads-up), created before the permission prompt and before scheduling | Agent, 2026-10-28 |
| D5 | When to ask for notification permission | (a) after a user task write, only when a reminder is needed, once; (b) on app start; (c) a custom explainer screen | **(a)**. Minimal by design: TB-41 owns the explainer, re-asking and settings. Denied → nothing scheduled, no re-prompt | Agent, 2026-10-28 |
| D6 | How to keep reminders in sync with tasks | (a) idempotent full reconcile keyed by task id on every trigger; (b) schedule/cancel per event in each mutation | **(a)**. One code path covers create/edit/complete/delete/undo, sync pulls, start/foreground and the 64 cap; a missed event heals at the next trigger. Bounded cost: one indexed query (≤ 60 rows) + one OS listing per reconcile | Agent, 2026-10-28 |
| D7 | Notification content | Title only; title + time; generic text | Title = task title, body "Due at 3:30 PM". Local only; never logged or sent anywhere | Agent, 2026-10-28 |
| D8 | Tap target | `Linking.openURL('taskbuddy://task/<id>')` vs `router.push` | `router.push('/task/<id>')` (same route, no URL round trip); the URL is stored in `data.url` for reference | Agent, 2026-10-28 |
| D9 | Sign-out | Leave reminders vs cancel | Cancel all of this app's reminders when the signed-in provider unmounts (sign-out, account switch); serialized so the previous account's cancel finishes first | Agent, 2026-10-28 |
| D10 | expo-notifications version | `npx expo install` picked 58.1.7 (published 2026-10-28) | **58.1.6** (`~58.1.6`, the SDK 58 bundled range; one week old). Skips a same-day release | Agent, 2026-10-28 |
| D11 | Reminder settings (TB-32 registry) | Add an on/off preference now vs later | Later (TB-41, with quiet hours) | Agent, 2026-10-28 |
| D12 | iOS remote notifications | Plugin default (adds `aps-environment`) vs off | Off (`enableRemoteNotifications: false`): local notifications only; avoids a push entitlement until TB-46 | Agent, 2026-10-28 |

## Deviations (added during build)
| Date | Change | Reason | Approved by |
|---|---|---|---|
