# TB-18 — Spec

> Jira: https://stratyge.atlassian.net/browse/TB-18 · Intent: [intent.md](intent.md)
> Status: **Draft — awaiting owner acceptance.** Implementation starts only after the owner answers D1–D4 and accepts this spec (medium risk).

## Acceptance criteria (verbatim from Jira)
- [ ] Given the app is open, when I tap each tab, then the matching screen renders in under 300 ms
- [ ] Given the deep link `taskbuddy://task/<id>`, when opened, then the task detail modal is shown
- [ ] The Android back gesture and iOS swipe-back close the modal without losing state
- [ ] Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated

## Behaviour
- **Tabs (AC1):** four tabs in this order: **Today** (URL `/`), **Inbox** (`/inbox`), **Buddy** (`/buddy`), **Settings** (`/settings`). Each has a label and an icon (D1), with active/inactive colours from the theme tokens (`primary` / `text-muted` on `surface`) in light and dark. Tapping a tab shows its screen. Tapping the active tab again does nothing harmful. Each tab keeps its own state while you switch away and back.
  - Screens: **Today** shows the current `HomeScreen` showcase (D4). **Inbox, Buddy, Settings** show a shared placeholder (`header` title plus a one-line "Coming in TB-27 / TB-55 / TB-32" note) built from the TB-17 primitives.
  - Timing: from the tab press to the first frame of the target screen, under 300 ms at p95 (method in D2).
- **Task modal (AC2):** route `/task/[id]`, presented over the tabs (D3). The deep link `taskbuddy://task/<id>` opens it on a cold start and when the app is already running. On a cold start the tabs load underneath (root-stack `anchor: '(tabs)'`), so closing the modal lands on Today rather than exiting the app.
  - Content before TB-26/TB-28 exist: a placeholder (D4) with the heading "Task", the id shown as text, and a **Close** button. TB-28 replaces the screen component.
  - Invalid id (empty, longer than 64 characters, or containing anything other than `[A-Za-z0-9-]`): show "This link doesn't point to a task" plus Close. Never crash.
  - The id is never logged or sent to analytics.
- **Dismissal (AC3):** Android hardware back and the back gesture close the modal. On iOS, the interactive dismiss gesture of the chosen presentation closes it (swipe down for `modal`/`formSheet`, edge swipe for `card`, see D3). The Close button calls `router.back()` (or `router.dismiss()` if there is nothing to go back to). After dismissal the screen underneath is unchanged: same tab, same scroll position, and same uncommitted input (for example, text typed into the Today showcase `Input`), because the screen underneath stays mounted.
- **Not found:** unknown routes still show `+not-found` with a link to `/` (Today).

## Technical design
- **Routes (thin, `src/app/`):**

  | File | Role |
  |---|---|
  | `_layout.tsx` (edit) | Root `Stack` (`headerShown: false`), with `Stack.Screen name="(tabs)"` and `Stack.Screen name="task/[id]" options={{ presentation: … }}` (D3). Exports `unstable_settings = { anchor: '(tabs)' }`. Keeps `global.css`, `UiProvider` and `StatusBar` as they are |
  | `(tabs)/_layout.tsx` (new) | Tab navigator (D1). Reads the tab list from `src/features/navigation/tabs.ts` |
  | `(tabs)/index.tsx` (moved from `src/app/index.tsx`) | Today: re-exports the `HomeScreen` showcase (D4) |
  | `(tabs)/inbox.tsx`, `(tabs)/buddy.tsx`, `(tabs)/settings.tsx` (new) | One-line re-exports of feature screens |
  | `task/[id].tsx` (new) | Re-exports `TaskDetailModal` |
  | `+not-found.tsx` | Unchanged |

  `src/app/index.tsx` is removed, because `(tabs)/index.tsx` now serves `/`. Two routes for `/` would conflict.
- **Feature code (`src/features/navigation/`, new, owned by TB-18):**
  - `tabs.ts`: `export const APP_TABS: readonly AppTab[]` with `{ name: 'index' | 'inbox' | 'buddy' | 'settings'; title: string; icon: … }`. One source of truth for the layout and the tests (and for TB-66 labels later).
  - `components/PlaceholderScreen.tsx`: `PlaceholderScreenProps { title: string; note: string; testID: string }`. Uses tokens and safe-area insets. Reused by the three placeholder tabs (reuse-first).
  - `components/InboxScreen.tsx`, `BuddyScreen.tsx`, `SettingsScreen.tsx`: thin wrappers around `PlaceholderScreen`, so TB-27/TB-32/TB-55 replace them without editing routes. (Alternative: put them in their eventual feature folders. That spreads TB-18 across folders other tickets own, so no.)
  - `task-id.ts`: `parseTaskIdParam(raw: string | string[] | undefined): { ok: true; id: string } | { ok: false }`. Pure, unit-tested. Accepts `[A-Za-z0-9-]{1,64}`, so it covers UUIDv7 (TB-21) without coupling to it.
  - `components/TaskDetailModal.tsx`: reads `useLocalSearchParams<{ id: string }>()`, calls `parseTaskIdParam`, renders the placeholder or the invalid state, and Close.
- **Data changes:** none. No DB access. TB-26/TB-28 add the lookup.
- **Dependencies:** D1 option A adds `@expo/vector-icons` (JS-only; its fonts load through `expo-font`, which is already in the dev client). Option B adds nothing for iOS `sf` icons, but Android `md` icons need `expo-symbols` (**native → new EAS dev build**) unless we ship PNG `src` icons.
- **Reuse:** `Button`, `Card` and the token classes from `@/components/ui` / `src/theme`. `useTheme` (TB-17) for the hex colours the tab bar needs. `APP_NAME`. The existing `HomeScreen` and its tests stay.
- **Interfaces other tickets rely on:** the URL contract `/`, `/inbox`, `/buddy`, `/settings`, `/task/<id>`. The `(tabs)` group name. `APP_TABS`. The root stack keeps one `Stack.Screen` per top-level group, so TB-20 adds `(auth)` with `Stack.Protected` and TB-21 wraps the `Stack` in `DbGate` without touching TB-18's lines.

## Edge cases
| Case | Expected |
|---|---|
| Cold-start deep link `taskbuddy://task/<id>` | Modal shown over Today. Close or back goes to Today, not out of the app |
| Deep link while the modal is already open for another id | The new id's modal is shown (pushed). Back returns to the previous one |
| `taskbuddy://task/` (no id) or `taskbuddy://task/a/b` | Not-found screen (no matching route) |
| Malformed id (`%00`, 500 chars, emoji) | "This link doesn't point to a task" + Close. No crash, nothing logged |
| Repeated tab taps / double tap | No duplicate screens, no crash |
| Theme flips while on a tab or with the modal open | Tab bar and modal recolour live (TB-17 tokens) |
| Android predictive back | `predictiveBackGestureEnabled: false` in `app.json` today, so the classic back event is used. Unchanged here |
| Web (`expo start --web`) | Tabs and modal render (not an AC target) |
| Large font scale | Tab labels truncate or wrap without overlapping; the modal content scrolls |

## Security, privacy & AI cost
No network, no AI, no data. The only external input is the deep-link `id`. It is validated by `parseTaskIdParam`, rendered only as `Text` (no HTML or eval surface in RN), never logged, and never used for navigation or queries until TB-26 adds a parameterized repo lookup. The scheme only opens in-app routes. There are no redirects to external URLs.

## Decisions
Recommended option first.

| # | Decision | Options considered | Recommendation | Decided by / date |
|---|---|---|---|---|
| D1 | Tab bar implementation and icons | **A. JS `Tabs` (`expo-router` `Tabs`) + `@expo/vector-icons` (Ionicons).** JS-only, so **no new EAS build**. Fully themable with tokens. Works in Jest `renderRouter` and on web. Screens are lazy by default; we set `lazy: false` so all four mount at start, which keeps tab switches cheap. Con: a JS-drawn bar, not the platform's native one (no iOS 26 glass, no Material 3 motion). **B. `NativeTabs` from `expo-router/native-tabs`** (stable entry in SDK 58; `unstable-native-tabs` is now a deprecated alias). Platform-native bar on `react-native-screens` 4.30 (already in the build). iOS `sf` icons work with no new deps. **Android `md` icons require `expo-symbols` (native module → new EAS dev build)**, unless we draw PNG `src` icons instead. Limited styling. Jest support under `renderRouter` is unverified (react-native-screens mocks), so the AC tests may need to mock the navigator. Native tabs can't be nested and tabs can't change at runtime (fine for four fixed tabs). **C. A, now, with a follow-up ticket to switch to B** when the next native build happens (TB-38 beta builds). The switch is a one-file change in `(tabs)/_layout.tsx` plus `tabs.ts` icons | **A** (with C's follow-up noted). It keeps the critical path free of a native rebuild on a low-memory machine, and the tests prove AC1–AC3 in CI. The Expo `expo-native-ui` skill favours native tabs, which is why C is offered | |
| D2 | How AC1's "< 300 ms" is measured | **A. Emulator proxy plus a CI guard.** A `__DEV__`-only timing hook in `src/features/navigation/use-tab-switch-timing.ts`: it records `performance.now()` on the tab bar's `tabPress` (`screenListeners`) and logs elapsed time at the target screen's first `onLayout` after focus (no task data in the log). The coordinator or owner runs it on the Android emulator with a production-mode JS bundle (`expo start --dev-client --no-dev --minify`): 20 taps per tab, p95 < 300 ms recorded in `verification.md`. Same accepted-proxy pattern as TB-15 (iOS) and TB-21 (perf). A Jest test asserts each tab's screen is mounted and visible after the press (functional guard, not a timing claim). **B. Physical Android phone**, same method: real evidence, needs the owner's device. **C. Maestro flow with timing** (TB-52, Wave 4): automated, but too late for this ticket. **D. Jest render timing only**: cheap, but jsdom timing says nothing about device rendering | **A**, with B as a bonus if the owner has a phone at hand. The emulator run waits until the machine has memory to spare (this worker can't run it) | |
| D3 | Modal presentation | **A. `presentation: 'modal'`.** iOS: page sheet, dismissed by swiping down. Android: full-screen push, closed by back. Tabs stay mounted underneath, so state is kept. Reads AC3's "iOS swipe-back" as iOS's interactive dismiss gesture for a modal. **B. `formSheet`** with detents: a half-height sheet with the screen visible behind it, closed by swipe-down or back. Nicer for a quick view, but TB-28's detail screen (notes, subtasks) wants full height, and detent and keyboard edge cases add risk. **C. `card` (normal push)**: a literal iOS edge "swipe-back", but it's not a modal, which contradicts the ticket title | **A.** Record the "swipe-back = swipe-down dismiss on iOS" reading in the PR. If the owner means the edge swipe literally, choose C | |
| D4 | What Today and the pre-TB-26 modal show | **A. Today = the existing `HomeScreen` showcase** (moved to `(tabs)/index.tsx`), plus an "Open sample task" `Button` that pushes `/task/sample-task` to demo the modal. This keeps TB-17's AC ("each primitive used by at least one screen") and gives AC3 a stateful screen to prove "without losing state". TB-27 replaces it. Modal = a placeholder showing the validated id. **B. Today = an empty placeholder like the others, with the showcase moved to Settings**: cleaner Today, but Settings belongs to TB-32 and moving the showcase churns TB-17's tests. **C. Delete the showcase**: breaks TB-17's AC3 (primitives used by a screen) | **A** | |
| — | Today's URL | `(tabs)/index.tsx` → `/` · `(tabs)/today.tsx` → `/today` plus a redirect from `/` | `index.tsx` (`/`): no redirect hop at launch, and TB-15's `/` route test keeps passing. Proposed without a separate question | proposed |
| — | Risk tier | Low (table) · Medium | Medium (see intent) | |

## Deviations (added during build)
| Date | Change | Reason | Approved by |
|---|---|---|---|
