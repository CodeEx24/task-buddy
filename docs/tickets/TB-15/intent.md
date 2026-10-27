# TB-15 — Intent: Scaffold Expo app

> Jira: https://stratyge.atlassian.net/browse/TB-15 · Blueprint: US-001 · Wave 1, batch A (solo) · Risk: Medium
> Status: Open questions answered by the owner on 2026-10-27 (see the Decisions table in [spec.md](spec.md))

## Problem
The repo has docs and no app. TB-16, TB-17, TB-19, TB-21 and TB-37 are all blocked until one consistent, buildable base exists. Everything after this inherits its conventions: SDK version, folder layout, aliases, lint and test setup.

## Desired outcome
A fresh clone runs `pnpm install && pnpm start` and shows a placeholder home route on a device or emulator. `pnpm lint`, `pnpm typecheck` and `pnpm test` pass with zero errors under strict TypeScript. The folder skeleton matches CLAUDE.md §3, so later tickets add files in known places instead of inventing structure.

## Affected users
Developers and agents working on every later ticket. No end-user behaviour beyond a placeholder screen.

## Constraints
- Stack is locked by CLAUDE.md §2: Expo (latest stable SDK; npm shows **SDK 58**, expo 58.0.19), React Native, TypeScript strict, Expo Router, pnpm.
- Folder structure and naming: CLAUDE.md §3–§4. Routes stay thin. `@/*` → `src/*`.
- No secrets. No `EXPO_PUBLIC_*` values are needed yet.
- Shared files this ticket creates (`package.json`, lockfile, `babel.config.js`, `metro.config.js`, `src/app/_layout.tsx`) become hotspots for Wave 1 batch B. Keep them minimal and conventional so TB-16/17/19/21 extend them cleanly.
- Record the exact Expo SDK / React Native / React versions in CLAUDE.md §2 (the one CLAUDE.md edit this ticket allows).

## Out of scope
- CI and EAS profiles (TB-16), design system and NativeWind (TB-17), the tab shell and task modal (TB-18), Supabase (TB-19), SQLite and Drizzle (TB-21).

## Open questions
| # | Question | Why it matters | Answer (who, date) |
|---|---|---|---|
| 1 | How do we verify "boots on an iOS simulator and an Android emulator"? This Windows machine has no Android SDK or Java, and iOS simulators only run on macOS | AC1 can't be fully demonstrated here as written | Android emulator (after Android Studio install) + Expo Go on iPhone; simulator part partial, follow-up in TB-16 (owner, 2026-10-27) |
| 2 | Should `pnpm start` target Expo Go now, or the dev client (CLAUDE.md §9 says dev client)? | A dev client needs a native build, and EAS profiles come in TB-16 | Expo Go now; dev client in TB-16 (owner, 2026-10-27) |
| 3 | Should TB-15 create the four placeholder tabs (as SETUP_PROMPT says) or only a placeholder home route (AC1), leaving tabs to TB-18? | Avoids overlapping scope and merge conflicts with TB-18 | Home route only; tabs in TB-18 (owner, 2026-10-27) |
