# TB-27 — Implementation plan

> Jira: https://stratyge.atlassian.net/browse/TB-27 · Spec: [spec.md](spec.md)
> Bar: an engineer who has never seen the conversation could implement the change from this plan alone.

## Branch & worktree
`feat/tb-27/today-inbox-swipe` (Orca worktree `tb-27-today-inbox`, from `main` ceb46ab).
- Owns: `src/features/tasks/{task-sections,task-actions,task-routes}*`, `components/{TaskListScreen,TaskRow,SwipeableTaskRow,NewTaskModal,PerfTasksDevScreen}*`, `hooks/use-task-quick-action.ts`, `repo/perf-seed*`, `src/app/(tabs)/{index,inbox}.tsx`, `src/app/dev/{ui-showcase,perf-tasks}.tsx`, `src/features/showcase/`.
- Must not edit: `TaskDetailModal*`, `src/app/task/[id].tsx` (TB-28 runs in parallel), lint/format configs.
- Shared files touched: `src/components/ui/Checkbox.tsx` (2 optional props), `src/components/ui/testing/jest-setup.ts` (+ `swipeable-mock.tsx`), `src/features/navigation/*.test.tsx`, `docs/guides/beginner-mobile-guide.md` (paths only).

## Dependencies
Blocked by: TB-26 (US-012), merged to `main` as ceb46ab (PR #14). Uses TB-21 repositories and TB-18 navigation.

## Tasks
### Task 1 — Grouping
- [x] `task-sections.ts`: `screenFor`, `dueGroupFor`, `groupTodayTasks`, `groupInboxTasks`; drop `groupTaskBoard` / `openSectionFor`.
- Verify: `task-sections.test.ts`.

### Task 2 — Quick actions
- [x] `task-actions.ts` (pure) and `hooks/use-task-quick-action.ts` (optimistic update + announcement).
- Verify: `task-actions.test.ts` (including gesture-handler's real `SwipeDirection` values).

### Task 3 — Screens and rows
- [x] `TaskListScreen({ kind })` with per-tab config, prefixed testIDs and empty states; `SwipeableTaskRow`; accessibility actions on `TaskRow`'s checkbox (`Checkbox` pass-through props).
- [x] Routes: Today and Inbox tabs render `TaskListScreen`; showcase moves to `/dev/ui-showcase`.
- [x] `NewTaskModal` reads `?due=today`.
- Verify: `TaskListScreen.test.tsx`, `NewTaskModal.test.tsx`, `Checkbox.test.tsx`, `task-crud-routes.test.tsx`, `app-shell-routes.test.tsx`, `root-routes.test.tsx`.

### Task 4 — Performance check tooling
- [x] `repo/perf-seed.ts` + `/dev/perf-tasks`.
- Verify: `perf-seed.test.ts`, `root-routes.test.tsx`; device measurement by the coordinator.

### Task 5 — Gates and docs
- [x] lint, typecheck, test, drizzle-kit check, ticket-docs check; `verification.md`.

## Test strategy
| AC | Test (layer) | File |
|---|---|---|
| AC1 | Unit grouping; component (both tabs on one cache); routes (add on Today and Inbox) | `task-sections.test.ts`, `TaskListScreen.test.tsx`, `task-crud-routes.test.tsx` |
| AC2 | Unit (direction → action, patch); component (swipe stand-in releases, accessibility actions, announcements); routes (accessibility action through the real app) | `task-actions.test.ts`, `TaskListScreen.test.tsx`, `task-crud-routes.test.tsx`, `Checkbox.test.tsx` |
| AC3 | Component (empty-state copy, 500 rows virtualised); dev seed; device release build | `TaskListScreen.test.tsx`, `perf-seed.test.ts`, `root-routes.test.tsx`, verification "Manual / E2E" |
| AC4 | Full suite, no regressions | `pnpm test --ci` |

## Risks & rollback
- Gesture conflicts with vertical scrolling or the tab navigator: feel-check on device (verification steps). Rollback: revert the PR (no migration, no native change).
- Accidental commits from a swipe: 72 pt threshold; tune `SWIPE_COMMIT_DISTANCE` if the device check finds it too eager.
- 60 fps not reached: switch to FlashList (new JS dependency) as a follow-up.
