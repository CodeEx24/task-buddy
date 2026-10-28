# TB-18 — Implementation plan

> Jira: https://stratyge.atlassian.net/browse/TB-18 · Spec: [spec.md](spec.md)
> Status: **Accepted by the owner on 2026-10-28** (recommended options D1-A, D2-A, D3-A, D4-A; Medium tier).
> Bar: an engineer who has never seen the conversation could implement the change from this plan alone.

## Branch & worktree
`feat/tb-18/app-shell` · Orca worktree `tb-18-app-shell` · based on `main` @ `6fb9238` (TB-17 merged).

- **Owns:** `src/app/(tabs)/**`, `src/app/task/[id].tsx`, `src/app/_layout.tsx`, `src/app/index.tsx` (removed; moved into `(tabs)`), `src/features/navigation/**` (new), `src/features/home/**` (one added button and the route-test update), `docs/tickets/TB-18/**`.
- **Must not edit:** `src/db/**`, `src/features/*/repo/**` (TB-21), `supabase/**`, `src/lib/env.ts` / `supabase.ts` (TB-19), `src/components/ui/**` and `src/theme/**` (TB-17; reuse only, and escalate if a primitive needs a change), `babel.config.js`, `metro.config.js`, `tailwind.config.js`, `jest.config.js`.
- **Shared-file rules:** `package.json` / `pnpm-lock.yaml`: one dependency added under D1-A (`pnpm expo install @expo/vector-icons`). On a conflict, rebase and run `pnpm install`; never hand-merge. `src/app/_layout.tsx`: keep the diff to the `unstable_settings` export plus `Stack.Screen` children inside the existing `<Stack>`, so TB-21's `<DbGate>` wrap rebases cleanly. Whichever of TB-18/TB-21 merges second rebases.

## Dependencies
Blocked by TB-17: Done (per the coordinator's dispatch, 2026-10-27; this worker didn't read Jira). TB-18 blocks TB-20, TB-26, TB-32, TB-65 and TB-66.

## Tasks

### Task 1 — Task-id parsing (TDD)
- [ ] `src/features/navigation/task-id.test.ts` first: accepts a UUIDv7 and `sample-task`. Rejects `undefined`, `''`, arrays with more than one value, 65+ chars, `%00`, spaces and emoji. Takes the first element of a one-element array.
- [ ] `src/features/navigation/task-id.ts`: `parseTaskIdParam` (pure) and `TASK_ID_PATTERN`.
- Verify: `pnpm test src/features/navigation/task-id` fails first, then passes.

### Task 2 — Tab config and placeholder screens
- [ ] `src/features/navigation/tabs.ts`: `APP_TABS` (Today `index`, Inbox `inbox`, Buddy `buddy`, Settings `settings`) with Ionicons names (outline/filled pairs, for example `today-outline`/`today`, `file-tray-outline`/`file-tray`, `chatbubble-ellipses-outline`/`chatbubble-ellipses`, `settings-outline`/`settings`). Check the names exist in the installed `@expo/vector-icons` glyph map; a type check against `keyof typeof Ionicons.glyphMap` does this.
- [ ] `components/PlaceholderScreen.tsx` (+ test: title is a header, note rendered, testID), and `InboxScreen`, `BuddyScreen`, `SettingsScreen` wrappers (testIDs `inbox-screen`, `buddy-screen`, `settings-screen`).
- [ ] `pnpm expo install @expo/vector-icons` (D1-A).
- *If D1 = B:* icons become `{ sf, md }` pairs, `pnpm expo install expo-symbols`, and the owner schedules a new EAS dev build before the on-device check.
- Verify: unit tests; `pnpm typecheck`.

### Task 3 — Routes and layouts
- [ ] `src/app/(tabs)/_layout.tsx`: `Tabs` with `screenOptions` from `useTheme()` tokens (`tabBarActiveTintColor` = primary, inactive = textMuted, background = surface, border = border), `headerShown: false`, `lazy: false`. One `Tabs.Screen` per `APP_TABS` entry with `title`, `tabBarIcon`, `tabBarAccessibilityLabel` and `tabBarButtonTestID: 'tab-<name>'`.
- [ ] Move `src/app/index.tsx` → `src/app/(tabs)/index.tsx` (same one-line re-export). Add `inbox.tsx`, `buddy.tsx` and `settings.tsx` as one-line re-exports.
- [ ] `src/app/task/[id].tsx` → re-export `TaskDetailModal`.
- [ ] `src/app/_layout.tsx`: `export const unstable_settings = { anchor: '(tabs)' };` and inside the existing `<Stack>`: `<Stack.Screen name="(tabs)" />`, `<Stack.Screen name="task/[id]" options={{ presentation: 'modal' }} />`. Nothing else changes.
- Verify: `pnpm typecheck` (typed routes regenerate `/task/[id]`); `pnpm lint`.

### Task 4 — Task detail modal + demo entry
- [ ] `src/features/navigation/components/TaskDetailModal.tsx`: valid id → `Card` with heading "Task", the id as text, and a `Button` "Close" (`router.canGoBack() ? router.back() : router.replace('/')`). Invalid id → the "This link doesn't point to a task" text + Close. Safe-area padding. testIDs `task-detail-modal`, `task-detail-invalid`.
- [ ] `HomeScreen`: add a secondary `Button` "Open sample task" → `router.push('/task/sample-task')` (D4-A). Update the doc comment (TB-27 replaces it).
- Verify: component test for both states and for Close calling the router.

### Task 5 — Router-level AC tests (`expo-router/testing-library`)
File: `src/features/navigation/app-shell-routes.test.tsx`. It renders the real `./src/app` like `home-route.test.tsx` does, and the TB-15 test file is updated so `/` still shows `home-screen`.
- [ ] **AC1:** start at `/`, then for each `APP_TABS` entry `fireEvent.press(getByTestId('tab-<name>'))` (await it, RNTL 14) and expect `toHavePathname` plus the screen's testID on screen.
- [ ] **AC2:** `renderRouter('./src/app', { initialUrl: '/task/0190f3b2-…' })` shows `task-detail-modal` with the id. The tab bar route is in the history underneath (the anchor): pressing Close lands on `/` with `home-screen`. Also check whether `initialUrl: 'taskbuddy://task/<id>'` is accepted. Verify against the installed `expo-router/testing-library` source and docs first, and use whichever form works, noting it in the PR. Invalid id → `task-detail-invalid`.
- [ ] **AC3 (state):** on Today, type into the "Task name" `Input`, open the sample task, then go back with `router.back()` (what the Android back handler and the iOS gesture both call through the native stack). Expect the input to keep its text and the pathname to be `/`. If the tests can emit the hardware back event (`BackHandler` mock in the jest-expo preset), also drive it that way.
- [ ] **Timing guard (D2-A):** each tab's screen is mounted after the first render (`lazy: false`), so switching doesn't mount anything new.
- *If D1 = B:* first confirm that `NativeTabs` renders under `renderRouter`. If it doesn't, mock the navigator in this test only and record a deviation.
- Verify: `pnpm test`, all green. Temporarily removing the `anchor` makes the AC2 back-to-Today assertion fail (proves the test bites), then revert.

### Task 6 — Dev-only tab-switch timing (D2-A)
- [ ] `src/features/navigation/use-tab-switch-timing.ts`: a `__DEV__`-guarded module that stores the `tabPress` timestamp (wired via `Tabs` `screenListeners`), plus `useReportTabRender(name)` called in each tab screen's root `onLayout`, which logs `[tab-switch] <name> <ms>ms`. Logs contain no task data. Not active in release builds.
- [ ] Unit test with a fake clock: press → layout gives the elapsed value; a layout without a press logs nothing; nothing happens when `__DEV__` is false.
- Verify: unit test.

### Task 7 — Gates, review, verification
- [ ] `pnpm lint && pnpm typecheck && pnpm test`.
- [ ] Self-review against `docs/workflow/REVIEW.md`, then an independent reviewer subagent (medium risk) with the spec, the diff and REVIEW.md.
- [ ] `verification.md` (copy the template). `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-18/app-shell --pr`.
- [ ] **On-device evidence (coordinator/owner, not this worker; memory limits):** Android emulator with the dev client and a `--no-dev --minify` bundle: (1) tap each tab 20× and record p95 from the `[tab-switch]` logs (AC1); (2) `adb shell am start -a android.intent.action.VIEW -d "taskbuddy://task/0190f3b2-0000-7000-8000-000000000000"` cold and warm → modal shown, with a screenshot (AC2); (3) type on Today, open the modal, press back → text kept, with a screenshot (AC3). iOS: the owner checks the swipe-down dismiss on a device (TB-15 precedent). Until then AC rows stay `partial`.
- [ ] Stop before `git push`. No PR or Jira update from the worker.

## Test strategy
| AC | Test (layer) | File |
|---|---|---|
| AC1 tabs render, < 300 ms | Router integration (press each tab → screen visible); unit (timing hook); emulator p95 (proxy, D2) | `app-shell-routes.test.tsx`, `use-tab-switch-timing.test.ts`, `verification.md` |
| AC2 deep link → modal | Router integration (`initialUrl` `/task/<id>` and the scheme form if supported); unit (`parseTaskIdParam`); emulator `adb am start` | `app-shell-routes.test.tsx`, `task-id.test.ts` |
| AC3 back closes, state kept | Router integration (typed text survives open → back; Close → `/`); emulator back + iOS device swipe-down | `app-shell-routes.test.tsx`, `TaskDetailModal.test.tsx` |
| Regressions | TB-15 route test (`/` → `home-screen`, not-found); TB-17 HomeScreen and primitive tests unchanged | existing |

No RLS, eval or E2E work: no data or AI is involved, and Maestro arrives in TB-52.

## Risks & rollback
- **Rebase conflict with TB-21 or TB-20 in `_layout.tsx`.** Mitigation: the minimal diff above. The second to merge rebases and re-runs the gates.
- **`renderRouter` and the tab navigator in Jest** (`lazy`, `tabBarButtonTestID`, modal presentation under the jest-expo preset) may behave differently from a device. Mitigation: verify against the installed source and docs before writing assertions. The on-device checks are the AC evidence.
- **The 300 ms proxy is not a real phone.** This is recorded as an accepted proxy only if the owner picks D2-A.
- **D1-B chosen:** a new EAS dev build is needed before the device check (`expo-symbols`), which blocks AC evidence on build time and cost.
- **Typed routes:** moving `index.tsx` changes the generated route types. Run `pnpm typecheck` after each route change.
- **Rollback:** revert the squash commit. No data, migration or native change (under D1-A), so it's safe to roll back via an OTA update.
