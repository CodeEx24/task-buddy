# TB-15 — Spec: Scaffold Expo app

> Jira: https://stratyge.atlassian.net/browse/TB-15 · Intent: [intent.md](intent.md)
> Status: **Accepted by the owner on 2026-10-27** (spec and plan)

## Acceptance criteria (verbatim from Jira)
- [ ] Given a fresh clone, when I run `pnpm install && pnpm start`, then the app boots on an iOS simulator and an Android emulator with a placeholder home route
- [ ] Given the repo, when I run `pnpm lint && pnpm typecheck`, then both pass with zero errors in strict mode
- [ ] The folder structure matches CLAUDE.md section 3 and `docs/tickets/_TEMPLATE.md` exists
- [ ] Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated

## Behaviour
- Launching the app shows a placeholder home screen with the text "Task Buddy" and a test ID `home-screen`. There is no network access, no permissions prompt, and no console errors.
- An unknown route shows Expo Router's not-found screen (`src/app/+not-found.tsx`).

## Technical design
- **Scaffold:** `pnpm create expo-app` with the SDK 58 default template. Example screens, components and assets that the product doesn't use are removed. Expo Router config, the typed-routes setup and `expo-env.d.ts` are kept as generated.
- **Routes (thin):** `src/app/_layout.tsx` (root Stack) and `src/app/index.tsx` (placeholder home), plus `src/app/+not-found.tsx`. Tab and auth groups are TB-18 / TB-20 (decision Q3).
- **Start script:** `"start": "expo start"` for Expo Go (decision Q2). No `expo-dev-client` dependency yet.
- **TypeScript:** `tsconfig.json` extends `expo/tsconfig.base` with `strict: true` and `noUncheckedIndexedAccess: true`. Paths: `@/*` → `./src/*`.
- **Lint and format:** ESLint flat config `eslint-config-expo/flat` + `eslint-plugin-prettier/recommended`. `@typescript-eslint/no-explicit-any: error`. Prettier config committed.
- **Tests:** Jest via the `jest-expo` preset + `@testing-library/react-native`. One smoke test renders the home route and asserts `home-screen`.
- **Scripts:** `start`, `ios`, `android`, `web`, `lint`, `typecheck` (`tsc --noEmit`), `test`, `format`. Names follow CLAUDE.md §9.
- **Folder skeleton (CLAUDE.md §3):** `src/{features,components/ui,db,lib,stores,theme}`, `packages/schemas`, `supabase/{migrations,functions,tests}`, `evals`, `.maestro`. Each empty folder gets a one-line `README.md` stating its purpose and owning ticket, instead of a `.gitkeep`, so the purpose is discoverable.
- **pnpm:** `packageManager` field pinned. Use pnpm's default linker unless Metro resolution fails; if it does, fall back to `node-linker=hoisted` in `.npmrc` and record it as a deviation.
- **Versions:** record expo, react-native and react in CLAUDE.md §2.

## Edge cases
| Case | Expected |
|---|---|
| Fresh clone on Windows | `pnpm install` succeeds with no postinstall that needs a Mac |
| `any` added anywhere | `pnpm lint` fails |
| Unused template assets | Removed; no dead imports |

## Security, privacy & AI cost
No network calls, secrets or AI usage. `.gitignore` covers `.env*`, `node_modules`, `.expo`, native build folders and `__pycache__`. Existing deny rules in `.claude/settings.json` are untouched.

## Decisions
| Decision | Options considered | Choice | Decided by / date |
|---|---|---|---|
| Expo SDK | latest stable (58) | SDK 58 (CLAUDE.md §2: "latest stable SDK at scaffold") | Docs (CLAUDE.md) |
| Device verification (Q1) | Android emulator + iPhone Expo Go; macOS CI later; owner's Mac | Android emulator verified locally (owner installs Android Studio: [action guide](../../actions/android-emulator-setup.md)). iOS: owner opens the app in Expo Go on a physical iPhone. AC1's iOS-simulator part is recorded as **partial (verified on device)**; iOS-simulator boot job is a TB-16 follow-up | Owner, 2026-10-27 |
| `pnpm start` target (Q2) | Expo Go now; dev client now | `pnpm start` = `expo start` (Expo Go). TB-16 switches it to `--dev-client` with the development build | Owner, 2026-10-27 |
| Placeholder scope (Q3) | Home route only; four tabs now | Home route + not-found only. Tabs belong to TB-18. SETUP_PROMPT updated to match | Owner, 2026-10-27 |

## Deviations (added during build)
| Date | Change | Reason | Approved by |
|---|---|---|---|
| 2026-10-27 | Routes in root `app/`, not the SDK 58 template's `src/app` | CLAUDE.md §3 is authoritative; Expo Router supports both | Within spec (no behaviour change) |
| 2026-10-27 | Reversed: routes moved to `src/app/` | Owner decision: keep all code under one `src/` folder, matching the SDK 58 template. Expo Router finds `src/app` on its own, so no config change | Within spec (no behaviour change). CLAUDE.md §3, README and docs updated |
| 2026-10-27 | `eslint` pinned to `^9` | `eslint-config-expo` 58 plugins require ESLint ≤ 9 | Within spec |
| 2026-10-27 | `tsconfig` `"types": ["jest"]` | TypeScript 6 no longer loads `@types/*` automatically | Within spec |
| 2026-10-27 | Kept the template's `@/assets/*` alias (Jest mapping added) | Asset imports later; keeps tsc and Jest consistent | Within spec |
| 2026-10-27 | Added `home-route.test.tsx` (router-level) next to the component test | Reviewer finding: the component test didn't guard the route | Within spec |
| 2026-10-27 | `web.output: "static"` (template had `"server"`) | No server host is planned | Within spec |
