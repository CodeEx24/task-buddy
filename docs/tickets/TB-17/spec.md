# TB-17 — Spec

> Jira: https://stratyge.atlassian.net/browse/TB-17 · Intent: [intent.md](intent.md)
> Status: **Accepted by the owner on 2026-10-27** ("accept all")

## Acceptance criteria (verbatim from Jira)
- [ ] Given the system theme changes, when the app is open, then all primitives (Button, Input, Card, Checkbox, Sheet) switch theme without a reload
- [ ] Colour tokens meet 4.5:1 contrast for body text in both themes
- [ ] Each primitive has a typed props interface and is used by at least one screen (reuse-first)
- [ ] Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated

## Behaviour
- **Theme switching (AC1):** tokens are CSS variables with light values and dark overrides (NativeWind `vars()` in v4, or `@media (prefers-color-scheme: dark)` in v5). `app.json` already has `userInterfaceStyle: "automatic"`. Changing the device appearance re-renders every primitive with the new token values while the app stays open. Proof: a test toggles the mocked colour scheme and asserts the resolved style changes, plus an emulator check with `adb shell cmd uimode night yes|no` and before/after screenshots.
- **Contrast (AC2):** `src/theme/tokens.ts` is the single source of hex values. `src/theme/contrast.test.ts` computes the WCAG 2.x contrast ratio for every text/background pair used for body text (`text` on `background`, `text` on `surface`, `textMuted` on `background`, `onPrimary` on `primary`), in both themes, and fails below 4.5:1.
- **Primitives (AC3):** each lives in `src/components/ui/<Name>.tsx` with an exported `<Name>Props` type, a co-located test and an `index.ts` barrel.
  - `Button`: variants `primary | secondary | ghost | destructive`, sizes `sm | md`, `loading` and `disabled`, `accessibilityRole="button"`, min height 44.
  - `Input`: `label` (required, used as the accessibility label), `error` text, `helperText`, forwards `TextInput` props and ref.
  - `Card`: surface container with optional `title`. A pressable variant if `onPress` is given.
  - `Checkbox`: controlled `checked` and `onCheckedChange`, `label`, `accessibilityRole="checkbox"`, `accessibilityState.checked`.
  - `Sheet`: bottom sheet with `open`, `onOpenChange`, `title` and `children`. Uses `@gorhom/bottom-sheet` 5.x (`BottomSheetModal`) on react-native-reanimated 4 and gesture-handler. Closes on backdrop press and the hardware back button.
- **Used by a screen:** `HomeScreen` (in `src/features/home`, not `app/`) shows a Card with a sample Input, a Checkbox, a primary Button that opens a Sheet, and a ghost Button. It stays as a placeholder until TB-18/TB-27 replace it.

## Technical design
- **Owned paths:** `src/theme/**`, `src/components/ui/**`, `tailwind.config.*`, `global.css`, `nativewind-env.d.ts`, the NativeWind entries in `babel.config.js` / `metro.config.js`, `src/features/home/**` (screen usage). Shared: `package.json`/lockfile (rebase and reinstall), and a single `global.css` import line plus the providers the Sheet needs (`GestureHandlerRootView`, `BottomSheetModalProvider`) exported as `UiProvider` from `src/components/ui/UiProvider.tsx`. The one-line wiring into `app/_layout.tsx` is recorded as an allowed touch, since TB-18 owns the rest of the layout.
- **Interfaces:** `export type ButtonProps`, etc. Tailwind class names reference semantic tokens only (`bg-surface`, `text-muted`), never raw hex.
- **Data changes:** none.
- **Reuse:** `APP_NAME` from `src/lib/app-info.ts`. The existing `HomeScreen` test IDs (`home-screen`) are kept.

## Edge cases
| Case | Expected |
|---|---|
| Theme flips while the Sheet is open | Sheet background and text update. The Sheet stays open |
| Button `loading` | Shows a spinner, ignores presses, `accessibilityState.busy` |
| Input with `error` | Error colour border plus error text announced via `accessibilityHint`/live region |
| Large font scale (accessibility) | Text wraps and the minimum touch target is kept |
| Web (`expo start --web`) | Primitives render. The Sheet falls back to the library's web behaviour (not an AC target) |

## Security, privacy & AI cost
None. Pure UI, no data, network or AI.

## Decisions
| Decision | Options considered | Choice | Decided by / date |
|---|---|---|---|
| NativeWind version | 4.2.7 stable · 5.0.0-rc.0 | **4.2.7 stable**. If it fails on SDK 58 / RN 0.88, stop and ask (no silent switch to v5) | Owner, 2026-10-27 |
| Sheet library | @gorhom/bottom-sheet 5 · expo-router formSheet (routes only) · @expo/ui | @gorhom/bottom-sheet 5: an inline primitive, cross-platform, styleable | proposed |
| Palette | owner-provided · Claude proposes | Claude proposes a calm neutral + one accent, all AA | proposed |

## Deviations (added during build)
| Date | Change | Reason | Approved by |
|---|---|---|---|
| 2026-10-27 | Added `react-native-css-interop@0.2.7` as a direct dependency (same version NativeWind 4.2.7 pins) | pnpm's strict `node_modules` hides it from Metro: `Unable to resolve module react-native-css-interop/jsx-runtime` | worker (dependency add, within ownership); coordinator to confirm |
| 2026-10-27 | `pnpm expo install` chose `react-native-gesture-handler` **3.3.0**, `react-native-reanimated` 4.7.1 and `react-native-worklets` 0.13.0 for SDK 58. `@gorhom/bottom-sheet` 5.2.14 was written against gesture-handler 2 | SDK-58-matched versions. Checked statically: GH 3 still exports `Gesture.*` (deprecated), `State` and `TextInput`, and its `GestureDetector` hands legacy gestures to the legacy detector. Peer range `>=2.16.1` is satisfied. **Runtime gesture behaviour still needs the emulator check** | worker; coordinator to verify on device |
| 2026-10-27 | Tokens add `outline` (input and checkbox boundaries, ≥ 3:1 per WCAG 1.4.11). The contrast test covers more pairs than listed: `textMuted`/`surface`, `primary` on `background`/`surface` (ghost and secondary labels), `danger` on both (input error) and `onDanger`/`danger` | Every text pair a primitive actually uses is checked, not only the four in the spec | worker |
| 2026-10-27 | Class names follow the token keys: `text` → `text-text`, `textMuted` → `text-text-muted`, `onPrimary` → `text-on-primary` (the spec's `text-muted` was illustrative) | One mechanical mapping from `tokens.ts`, generated in `tailwind.config.js` (Tailwind loads the TS tokens through jiti), so there is no second list to drift | worker |
| 2026-10-27 | AC1 unit tests assert that the theme **variables** swap (at the `UiProvider` root and inside the Sheet) and that the hex-driven props swap (`placeholderTextColor`, Sheet background, spinner). They don't assert the resolved colour of each class name | NativeWind's Jest helper compiles only class names on the top-level element and needs extra deps (`postcss`, `@tailwindcss/container-queries`). The class → variable mapping is covered by `theme-vars.test.ts` and by the web export CSS (`.bg-surface{…rgb(var(--color-surface)…)}`). The coordinator's emulator check covers the rendered result | worker |
| 2026-10-27 | Test infrastructure: `src/components/ui/testing/` (Jest setup with gesture-handler mocks, a stateful bottom-sheet mock, a CSS stub), `src/theme/testing/mock-appearance.ts`, and `jest.config.js` `setupFiles` + a `\.css$` mapper | The library's own bottom-sheet mock always renders children and ignores backdrops, so it can't prove open/close. The RN Jest preset stubs `useColorScheme` to `'light'` | worker (the jest.config change is within the brief) |
| 2026-10-27 | `src/theme/css.d.ts` (`declare module '*.css'`). `metro.config.js` sets `disableTypeScriptGeneration: true` | TypeScript 6 type-checks side-effect imports. NativeWind's Metro plugin rewrote `tsconfig.json` (not an owned path); `nativewind-env.d.ts` is committed and already covered by `**/*.ts` | worker |
| 2026-10-27 | The `HomeScreen` root is a `ScrollView` (same `testID="home-screen"`) | Large font scales must not clip the form (edge-case table) | worker |
| 2026-10-27 | `Sheet` re-applies the theme variables on its content view | The sheet renders through a portal. This avoids relying on the variable context crossing it | worker |
| 2026-10-27 | **`Sheet` no longer uses `BottomSheetModal`.** It renders the library's plain `BottomSheet` into a new `SheetHost` (`src/components/ui/SheetHost.tsx`) that `UiProvider` mounts instead of `BottomSheetModalProvider`. Mounted only while open or closing. `Sheet`'s props are unchanged | On the Android emulator the modal never appeared: `present()` ran and the portal registered, but the inner sheet never rendered (no `onAnimate`/`onChange`, no Reanimated hook warnings). The container measured fine (914 dp). The plain `BottomSheet` rendered inline opened and animated correctly, so the fault is in the modal's portal layer (`@gorhom/portal` 1.0.14 mutates its host's array in place; suspected, not proven). Patching the dependency was declined in favour of an owned host | Owner, 2026-10-27 ("Own sheet host") |
| 2026-10-27 | After rebasing on TB-15's routes move (PR #6), the root layout is `src/app/_layout.tsx`: the `global.css` import is `../../global.css` and Tailwind `content` scans `./src/**` only | The old relative path pointed at a non-existent `src/global.css` | coordinator |
