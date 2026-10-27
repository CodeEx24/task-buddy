# TB-17 — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-17 · PR: (not opened yet) · Branch: `feat/tb-17/design-system`
> Record only what was actually run and observed. `node scripts/workflow/check-ticket-docs.mjs --branch <branch> --pr` fails the PR gate while any AC row is `not met`, `partial` or `TBD`.

## Commands run
All run in the Orca worktree `tb-17-design-system` on Windows 11, Node 24.21.0, pnpm 10.17.1, on 2026-10-27.

| Command | Result | Notes |
|---|---|---|
| `pnpm install` | pass | Clean install from the lockfile |
| `pnpm expo install react-native-reanimated react-native-gesture-handler react-native-worklets react-native-safe-area-context` | pass | SDK 58 picks: reanimated 4.7.1, gesture-handler 3.3.0, worklets 0.13.0 (safe-area already present) |
| `pnpm add nativewind@4.2.7 @gorhom/bottom-sheet@^5.2.14 react-native-css-interop@0.2.7` + `pnpm add -D tailwindcss@^3.4` | pass | tailwindcss 3.4.19 |
| `pnpm lint` | pass | 0 errors, 0 warnings |
| `pnpm typecheck` | pass | `tsc --noEmit`, strict + `noUncheckedIndexedAccess` |
| `pnpm test` | pass | 11 suites, 72 tests (69 before the review fixes) |
| `npx expo export --platform android --platform web` | pass | Android Hermes bundle `entry-….hbc` (4.1 MB, 1796 modules). Web: static `index.html` contains `home-screen`, "Try the buddy", `role="checkbox"`, "Mark as done", "Open sheet"; the generated CSS has `.bg-surface{…background-color:rgb(var(--color-surface) / …)}` and the page sets `--color-surface:255 255 255` |
| `npx expo-doctor` | pass | 20/20 checks |
| `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-17/design-system` | pass | `workflow check: ok`. With `--pr` it fails only on the AC1 `partial` row (expected until the coordinator adds device evidence) |

Negative checks (each reverted afterwards):
- Light `textMuted` set to `#A0AEC0` → `contrast.test.ts`: **2 failed** (`textMuted on background`, `textMuted on surface`).
- `UiProvider` hard-coded to `themeVars.light` → the live-switch tests: **2 failed** (`UiProvider` swap test and the `HomeScreen` live-switch test).
- `use-theme.test.tsx` without restoring the real `useColorScheme` → the live-follow test failed (the React Native Jest preset stubs the hook to `'light'`).
- Every primitive test file and the `HomeScreen` test was run first without the implementation (`Cannot find module` / 3 failed), then passed.

Failures hit during the build, and their fixes:
1. Metro: `Unable to resolve module react-native-css-interop/jsx-runtime` (pnpm doesn't hoist NativeWind's dependency) → added `react-native-css-interop@0.2.7` as a direct dependency.
2. `tsc`: `TS2882: Cannot find module or type declarations for side-effect import of '../global.css'` (TypeScript 6) → `src/theme/css.d.ts` declares `*.css`.
3. Jest: `SyntaxError` parsing `global.css` → `\.css$` mapped to `src/components/ui/testing/css-stub.ts`.
4. NativeWind's Metro plugin rewrote `tsconfig.json` (added `nativewind-env.d.ts`, dropped the final newline) → restored it and set `disableTypeScriptGeneration: true`.
5. `expo lint` crashed (`could not find plugin "@typescript-eslint"`) on a `.js` file under `src/`. The repo's `eslint.config.js` applies `@typescript-eslint/no-explicit-any` to every file, but the plugin is only registered for TS files → made the stub `.ts`. The latent config issue is a follow-up (`eslint.config.js` is outside TB-17's paths).
6. RNTL 14: `toHaveAccessibilityState` and `UNSAFE_getByType` no longer exist, and `fireEvent` is async ("overlapping act() calls") → `toBeBusy()`/`toBeDisabled()`/`toBeChecked()`, a spinner `testID`, and `await fireEvent…`.
7. RN 0.88 `TextInput` refs need `TextInputInstance` (not `TextInput`) for `Ref<…>`.
8. `vars()` returns opaque, structurally empty objects → tests compare by identity (`toContain`/`toBe`), not deep equality.

## Contrast (AC2)
Computed with `src/theme/contrast.ts` from `src/theme/tokens.ts`. Text pairs need ≥ 4.5, `outline` (UI boundary) needs ≥ 3.

| Pair | Light | Dark |
|---|---|---|
| `text` on `background` | 17.06 | 17.19 |
| `text` on `surface` | 17.85 | 13.35 |
| `textMuted` on `background` | 7.24 | 7.34 |
| `textMuted` on `surface` | 7.58 | 5.71 |
| `onPrimary` on `primary` | 5.47 | 9.78 |
| `onDanger` on `danger` | 6.47 | 8.51 |
| `primary` on `background` | 5.23 | 12.73 |
| `primary` on `surface` | 5.47 | 9.89 |
| `danger` on `background` | 6.18 | 9.92 |
| `danger` on `surface` | 6.47 | 7.71 |
| `outline` on `background` | 4.55 | 7.34 |
| `outline` on `surface` | 4.76 | 5.71 |

## Acceptance criteria
| AC (verbatim) | Status | Evidence (test name, file:line, screenshot, observed result) |
|---|---|---|
| Given the system theme changes, when the app is open, then all primitives (Button, Input, Card, Checkbox, Sheet) switch theme without a reload | partial | **Unit (done):** `HomeScreen.test.tsx` "switches theme live without remounting, even with the Sheet open" flips the system scheme through the real `useColorScheme` subscription. The theme variables swap at the `UiProvider` root and inside the Sheet; the Sheet background and Input placeholder colours swap; typed text, the checkbox state and the open Sheet survive (no remount). `UiProvider.test.tsx` checks that the children mount once. Token classes resolve through those variables (`theme-vars.test.ts`; web export CSS). **Device evidence: pending coordinator emulator check** (`adb shell cmd uimode night yes/no` with the app open, same PID, screenshots light/dark/Sheet open) |
| Colour tokens meet 4.5:1 contrast for body text in both themes | met | `src/theme/contrast.test.ts`: 10 text pairs × 2 themes ≥ 4.5 and 2 boundary pairs × 2 themes ≥ 3; WCAG formula checked against known values (black/white = 21, `#777` on white ≈ 4.48). Negative check above. Ratios table above |
| Each primitive has a typed props interface and is used by at least one screen (reuse-first) | met | `ButtonProps`, `InputProps`, `CardProps`, `CheckboxProps`, `SheetProps` (+ `UiProviderProps`) exported from `src/components/ui/index.ts`. `HomeScreen` renders Card + Input + Checkbox + primary Button (opens the Sheet) + ghost Button + Sheet (with a secondary Button); "uses every primitive" test in `HomeScreen.test.tsx` |
| Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated | met | 9 new or changed test files; 72/72 pass, including the TB-15 route tests (`home-route.test.tsx`). Independent review done (findings below); the human PR review happens at merge. `spec.md` deviations and this file updated |

## Manual / E2E
- **Static web export (proxy, not an AC target):** see the Commands table. The primitives render server-side and the token CSS resolves through variables.
- **Android emulator: pending (coordinator).** What to check:
  1. `pnpm android` (Expo Go or the TB-16 dev client). The home screen shows "Task Buddy", the "Try the buddy" card with "Task name" input, "Mark as done" checkbox, "Open sheet" (primary) and "Clear" (ghost).
  2. `adb shell pidof host.exp.exponent` (or the dev-client package), then `adb shell cmd uimode night yes`. Everything re-themes in place (dark slate background, teal accent `#5EEAD4`). `pidof` shows the same PID → screenshot `dark.png`. `adb shell cmd uimode night no` → `light.png`.
  3. Tap "Open sheet" → the bottom sheet "Your buddy" slides up → screenshot `sheet-open.png`. With it open, flip `uimode night yes`; the sheet background and text re-theme and the sheet stays open. Close it via the backdrop, a swipe down, the **hardware Back** key (`adb shell input keyevent 4`) and the "Close" button.
  4. Watch Metro/logcat for gesture-handler 3 / bottom-sheet 5 / Reanimated 4 errors (the risk recorded in the spec deviations). Check that the sheet animates and the swipe-down works.
  5. Tap "Close" in the sheet and immediately "Open sheet" again: the sheet must stay open (review finding 7).

## Review findings
| # | Severity | Finding (file:line) | Source (self / reviewer agent / human) | Resolution |
|---|---|---|---|---|
| 1 | — | Self-review: roles, labels, `accessibilityState` (checked, disabled, busy) and 44pt minimum heights on every interactive primitive. Pressed state via `active:opacity-80`. No secrets, network, AI or `any`. Only owned paths plus the one recorded `app/_layout.tsx` touch | self | — |
| 2 | Important | `Sheet.tsx` `BottomSheetModal`: the library defaults to `accessible=true`, role "adjustable", label "Bottom Sheet" → on iOS VoiceOver can't reach the header, body or Close button | reviewer agent | Fixed: `accessible={false}`; `onAccessibilityEscape` closes the sheet. New tests in `Sheet.test.tsx` (red first, then green) |
| 3 | Important | `testing/bottom-sheet-mock.tsx` dropped the a11y props, hiding finding 2 | reviewer agent | Fixed: the mock mirrors the library's a11y defaults on the content container |
| 4 | Important | `verification.md` untracked | reviewer agent | Fixed: committed |
| 5 | Important | `accessibilityViewIsModal` on `BottomSheetView` doesn't trap screen-reader focus (app content is a sibling branch); Android has no trap at all | reviewer agent | Misleading prop removed and the limit documented on `Sheet`. **Follow-up proposed:** `UiProvider` hides app content from assistive tech while a sheet is open |
| 6 | Nit | `Sheet.tsx` controlled contract: a parent that ignores `onOpenChange(false)` leaves `open` stuck at true | reviewer agent | Documented on `SheetProps.onOpenChange` |
| 7 | Unverified risk | `Sheet.tsx` close-then-quick-reopen: a late `onDismiss` could close the reopened sheet | reviewer agent | Added to the emulator checklist (step 5). Fix with a presentation counter if it reproduces |
| 8 | Nit | `Button.tsx` label overflows at large font scales | reviewer agent | Fixed: `flex-shrink text-center` |
| 9 | Nit | `Input.tsx` live region is Android-only; iOS doesn't announce `role="alert"` | reviewer agent | Fixed: `AccessibilityInfo.announceForAccessibility(error)` when the error changes, with a test |
| 10 | Nit | `Card.tsx` pressable label defaults to `title`, so the body isn't read and interactive children are unreachable | reviewer agent | Kept the default (a pressable row needs a concise name); documented "no interactive children" and how to describe the body |
| 11 | Unverified risk | `babel.config.js`: the worklets plugin runs twice (`babel-preset-expo` + `nativewind/babel`) | reviewer agent | This is the standard NativeWind v4 setup, and both bundles build. Emulator step 4 checks the sheet animation and swipe. Fallback: `babel-preset-expo` `worklets: false` |
| 12 | Unverified risk | gesture-handler 3.3 with bottom-sheet 5.2.14 | reviewer agent | Already a spec deviation; emulator steps 3–4 |
| 13 | Nit | Bottom-sheet mock called `onDismiss` inside a state updater (not StrictMode-safe) | reviewer agent | Fixed: a ref plus a call outside the updater |
| 14 | Nit | `tailwind.config.js` `touch` sizes hard-coded `44px` | reviewer agent | Fixed: derived from `MIN_TOUCH_TARGET` |
| 15 | Nit | A `className` override on Button/Input conflicts unpredictably with variant classes | reviewer agent | Documented as layout-only |

## Known limitations & follow-ups
- AC1 device evidence is pending the coordinator's emulator run.
- `eslint.config.js` applies a `@typescript-eslint` rule to all files, so any future `.js` file under `src/` or `app/` crashes `expo lint`. Scope the rule to `**/*.{ts,tsx}` (owner: TB-16 or a chore ticket).
- Screen-reader focus isn't trapped inside an open Sheet (review finding 5). Proposed follow-up: `UiProvider` hides app content from assistive tech while a sheet is open.
- `@gorhom/bottom-sheet` 5.2.14 runs on gesture-handler 3.3.0 through GH 3's legacy `Gesture.*` API (deprecated upstream). Watch for a bottom-sheet release that targets GH 3.
- Unit tests prove the variable swap, not each class's resolved colour (see spec deviations); the device check closes that gap.

## Completion
- [ ] All AC met with evidence (AC1 device check pending)
- [x] Gates green locally (CI arrives in TB-16)
- [x] No open Blocking findings
- [ ] Jira updated (In Review → Done)
