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
