# TB-40 — Implementation plan

> Jira: https://stratyge.atlassian.net/browse/TB-40 · Spec: [spec.md](spec.md)
> Bar: an engineer who has never seen the conversation could implement the change from this plan alone.

## Branch & worktree
`feat/tb-40/local-due-reminders` (Orca worktree `tb-40-reminders`, from `main` @ `e1a3e4e`).
Owns: `src/features/notifications/**`, `src/lib/dates*`, `src/features/tasks/{task-form*,schema.ts,repo/task-repo*,components/TaskFormFields.tsx,components/NewTaskModal.test.tsx}`, `docs/tickets/TB-40/**`, `docs/actions/android-exact-alarms.md`.
Shared files touched: `package.json` + `pnpm-lock.yaml` (adds `expo-notifications`; TB-53 / PR #29 adds other modules: whoever merges second re-runs `pnpm install`, never hand-merges the lockfile), `app.json` (plugin + permission), `jest.config.js` (one setup file), `src/app/_layout.tsx` (mount the provider), `src/features/sync/components/SyncProvider.tsx` (one call), `docs/actions/README.md`.

## Dependencies
Blocked by: TB-26 (task CRUD, Done). Uses TB-43 (sync, merged) and TB-20 (sign-out, merged). TB-41 follows this ticket.

## Tasks
### Task 1 — Due time in the model and form
- [x] `dates.ts`: `hasTimeOfDay`, `parseTimeInput`, `toTimeInput`, `atLocalTime`; `formatDueLabel` appends the time.
- [x] `task-form.ts`: `dueTime` (`HH:MM`, not 00:00, needs a date); `toTaskFields` / `toTaskFormValues`.
- [x] `TaskFormFields.tsx`: "Time (optional)" field; "No date" chip clears the time.
- Verify: `src/lib/dates.test.ts`, `src/features/tasks/task-form.test.ts`, `NewTaskModal.test.tsx` (TB-40 cases).

### Task 2 — Repository query
- [x] `listUpcomingTimedTasks(db, { after, limit })` + Zod input schema.
- Verify: `task-repo.test.ts` › `listUpcomingTimedTasks (TB-40 reminders)` (incl. 450 date-only rows before a timed one).

### Task 3 — Scheduler interface, expo implementation, fake
- [x] `npx expo install expo-notifications` → pinned 58.1.6 (spec D10); `app.json` plugin + `SCHEDULE_EXACT_ALARM`.
- [x] `reminder-scheduler.ts`, `expo-reminder-scheduler.ts`, `scheduler-factory.ts`, `testing/fake-reminder-scheduler.ts`, `testing/jest-setup.ts` (+ `jest.config.js`).
- Verify: `pnpm typecheck`, `pnpm lint`; `pnpm exec expo config --type introspect` shows the permission and notification icon.

### Task 4 — Plan, reconcile, session
- [x] `reminder-plan.ts` (pure), `reconcile-reminders.ts`, `reminder-session.ts`.
- Verify: `reminder-plan.test.ts`, `reconcile-reminders.test.ts` (create/edit/complete/uncomplete/delete/undo/past/date-only/cap/permission), `reminder-session.test.ts` (coalescing, sign-out, account-switch ordering, failure logging).

### Task 5 — Wire into the app
- [x] `RemindersProvider` in `src/app/_layout.tsx` (inside `DbGate`, `key={userId}`, signed in only).
- [x] `SyncProvider`: `requestReminderReconcile()` when a cycle changed rows.
- Verify: `RemindersProvider.test.tsx` (start, prompt-after-write, real mutations, foreground, unmount, tap); `SyncProvider.test.tsx` › TB-40 pulled change (fails with the call removed).

### Task 6 — Docs and owner action
- [x] `intent.md`, `spec.md`, `plan.md`, `verification.md`; `docs/actions/android-exact-alarms.md` + to-do list entry.
- Verify: `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-40/local-due-reminders`.

## Test strategy
| AC | Test (layer) | File |
|---|---|---|
| AC1 scheduled at the due time | Unit (DB + fake scheduler); hook-level through real mutations | `reconcile-reminders.test.ts`, `RemindersProvider.test.tsx` |
| AC1 fires within 60 s, app closed | **Device** (new dev build; steps in `verification.md`) | — |
| AC2 complete / delete cancel (+ un-complete, undo) | Unit + hook-level | `reconcile-reminders.test.ts`, `RemindersProvider.test.tsx` |
| AC3 edit reschedules (+ sync pull) | Unit + hook-level + provider integration with the fake sync server | `reconcile-reminders.test.ts`, `RemindersProvider.test.tsx`, `SyncProvider.test.tsx` |
| Sign-out / account switch | Unit + provider unmount | `reminder-session.test.ts`, `RemindersProvider.test.tsx` |
| Form | Unit + screen | `task-form.test.ts`, `NewTaskModal.test.tsx` |

## Risks & rollback
- **Native module:** needs a new dev build; an old dev client with the new JS would fail to load `expo-notifications`. Ship only with a build that includes it (EAS Update runtime version policy).
- **Android 14+ exact alarms** default to denied: reminders can be late until the user allows "Alarms & reminders" (spec D3, TB-41 follow-up).
- **Rollback:** revert the PR. No data migration; due times stay in `due_at` and display as times; reminders already scheduled by the OS would still fire once — a follow-up build without the module can't cancel them, so prefer fixing forward.
