# TB-17 — Plan

> Jira: https://stratyge.atlassian.net/browse/TB-17 · Spec: [spec.md](spec.md)
> Branch: `feat/tb-17/design-system` · Orca worktree `tb-17-design-system` · Merge order: **2nd** (after TB-16; before TB-21, which rebases onto its babel/metro config)
> Status: Draft

## Goal
Token theme + five accessible primitives that follow the system theme live, with contrast proven by a test and every primitive used on the home screen.

## Owned paths
`src/theme/**`, `src/components/ui/**`, `src/features/home/**`, `tailwind.config.js`, `global.css`, `nativewind-env.d.ts`, `babel.config.js`, `metro.config.js` (TB-17 creates both; TB-21 appends later), `docs/tickets/TB-17/**`. Shared: `package.json`/lockfile; **one** allowed touch in `app/_layout.tsx` (import `global.css` + wrap in `UiProvider`), recorded in the PR because TB-18 owns the layout.

### Task 1 — NativeWind 4.2.7 setup
- [ ] `pnpm expo install nativewind react-native-reanimated react-native-safe-area-context` + `pnpm add -D tailwindcss@^3.4` (NativeWind v4 needs Tailwind v3). `react-native-worklets` if Reanimated 4 asks for it.
- [ ] `tailwind.config.js` (`presets: [require('nativewind/preset')]`, content globs `app/**`, `src/**`, `darkMode: 'media'` behaviour via CSS variables), `global.css`, `babel.config.js` (`babel-preset-expo` with `jsxImportSource: 'nativewind'` + `nativewind/babel`), `metro.config.js` (`withNativeWind(config, { input: './global.css' })`), `nativewind-env.d.ts`.
- [ ] Jest: confirm `jest-expo` transforms NativeWind; add `transformIgnorePatterns` entries only if needed.
- **Verify:** `pnpm typecheck`, `pnpm test`, `npx expo export -p android` bundles. **Stop rule:** if v4.2.7 can't build on SDK 58 / RN 0.88 / Reanimated 4, stop and report to the coordinator (owner decision: no silent switch to v5).

### Task 2 — Tokens and contrast test
- [ ] `src/theme/tokens.ts`: semantic colours (`background, surface, border, text, textMuted, primary, onPrimary, danger, onDanger, success`) × light/dark, plus spacing, radius, font sizes. Calm neutral + one accent.
- [ ] `src/theme/contrast.ts` (WCAG relative luminance + ratio, pure) and `contrast.test.ts` asserting ≥ 4.5:1 for every body-text pair in both themes; unit tests for the ratio function against known values (black/white = 21).
- [ ] CSS variables generated from `tokens.ts` (NativeWind `vars()` for light/dark in `src/theme/theme-vars.ts`), Tailwind colours mapped to `rgb(var(--color-…))`.
- **Verify:** contrast test passes; a deliberately low-contrast token makes it fail (then revert).

### Task 3 — Primitives (TDD, one at a time)
- [ ] `Button`, `Input`, `Card`, `Checkbox`, `Sheet` + `UiProvider` + `index.ts`, each with exported `…Props` and a co-located `*.test.tsx` (render, a11y role/state, press/change handlers, disabled/loading/error states).
- [ ] `@gorhom/bottom-sheet@^5` + `react-native-gesture-handler` via `pnpm expo install`; mock Reanimated/gesture-handler per their Jest docs.
- **Verify:** each test file first fails, then passes; `pnpm lint && pnpm typecheck && pnpm test`.

### Task 4 — Use on a screen + live theme switch
- [ ] `HomeScreen` shows Card + Input + Checkbox + primary Button (opens Sheet) + ghost Button; keeps `testID="home-screen"` and the "Task Buddy" heading.
- [ ] Test: mocked colour scheme flip changes resolved colour of a primitive without remount.
- [ ] Emulator: `adb shell cmd uimode night yes` / `no` with the app open → screenshots `light.png`, `dark.png`, and the Sheet open.
- **Verify:** screenshots in `docs/tickets/TB-17/`; no reload between them (same process id from `adb shell pidof`).

### Task 5 — Review and verification
- [ ] Independent reviewer subagent (medium risk) with spec + diff + `docs/workflow/REVIEW.md`; a11y lens.
- [ ] `verification.md`; `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-17/design-system --pr`.

## Risks and rollback
- NativeWind v4 vs Reanimated 4 / RN 0.88 compatibility → stop rule above.
- Expo Go: Reanimated 4 is in Expo Go for SDK 58; if a native mismatch appears, verify in the TB-16 dev client instead.
- Rollback: revert the PR; no data involved.
