# TB-15 — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-15 · PR: (not opened yet) · Branch: `feat/tb-15/scaffold-expo-app`
> Record only what was actually run and observed. `node scripts/workflow/check-ticket-docs.mjs --branch <branch> --pr` fails the PR gate while any AC row is `not met`, `partial` or `TBD`.

## Commands run
All run on Windows 11, Node 24.21.0, pnpm 10.17.1, on 2026-10-27.

| Command | Result | Notes |
|---|---|---|
| `pnpm install` | pass | Clean install from `pnpm-lock.yaml` |
| `pnpm lint` | pass | 0 errors. Negative check: a temporary `const bad: any` gave `error Unexpected any @typescript-eslint/no-explicit-any` (file removed) |
| `pnpm typecheck` | pass | `tsc --noEmit`, strict + `noUncheckedIndexedAccess` |
| `pnpm test` | pass | 2 suites, 3 tests. Negative checks: changing the `testID` → 1 failed; moving `app/index.tsx` away → 1 failed (both restored) |
| `npx expo-doctor` | pass | 20/20 checks passed |
| `npx expo export --platform android --platform web` | pass | Android Hermes bundle `entry-….hbc` (2.5 MB). Static web `index.html` contains `<h1 role="heading">Task Buddy` |
| `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-15/scaffold-expo-app` | pass | `workflow check: ok` |

Failures hit during the build, and their fixes:
1. `tsc`: `Cannot find name 'describe'`. TypeScript 6 no longer loads `@types/*` automatically → added `"types": ["jest"]` to `tsconfig.json`.
2. Jest: "`render` function has not been called". RNTL 14 made `render()` async → the tests `await render(...)`.
3. Jest picked up `.claude/skills/secret-redactor/tests` → added `/.claude/` (and `/supabase/`) to `testPathIgnorePatterns`.
4. `pnpm expo install` added ESLint 10, but `eslint-config-expo` 58's plugins require ESLint ≤ 9 (peer warnings) → pinned `eslint@^9`.
5. The route test first used `node:path`/`__dirname`, which needs Node types in app code → switched to `renderRouter('./app')`, which resolves from the Jest rootDir.

## Acceptance criteria
| AC (verbatim) | Status | Evidence |
|---|---|---|
| Given a fresh clone, when I run `pnpm install && pnpm start`, then the app boots on an iOS simulator and an Android emulator with a placeholder home route | partial | Route-level test renders the real `app/` at `/` → `home-screen` (`src/features/home/home-route.test.tsx`). The Android bundle exports. The web dev server (`expo start --web`) served `/` with HTTP 200 and the `home-screen` / "Task Buddy" markup, and `/does-not-exist` showed the not-found screen. **Not yet observed on a device:** Android emulator pending the owner's Android Studio install ([action](../../actions/android-emulator-setup.md)); iOS via Expo Go on the owner's iPhone. The iOS *simulator* part is partial by decision (Windows machine; follow-up in TB-16) |
| Given the repo, when I run `pnpm lint && pnpm typecheck`, then both pass with zero errors in strict mode | met | Both exit 0 (table above). `strict: true` + `noUncheckedIndexedAccess`; `any` is a lint error |
| The folder structure matches CLAUDE.md section 3 and `docs/tickets/_TEMPLATE.md` exists | met | `app/`, `src/{features,components/ui,db,lib,stores,theme}`, `packages/schemas`, `supabase/{migrations,functions,tests}`, `evals`, `.maestro`, `docs/tickets/` all exist; placeholder folders have purpose READMEs. `docs/tickets/_TEMPLATE.md` exists (from the workflow PR #3, which this branch is stacked on) |
| Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated | partial | Tests added and passing (3). No prior code, so no regressions possible. Ticket docs written (intent, spec, plan, this file). **PR not opened or reviewed yet** |

## Manual / E2E
- **Web (proxy, not an AC target):** `CI=1 npx expo start --web --port 8081` → `curl http://localhost:8081/` returned 200 with `data-testid="home-screen"` and `<h1 role="heading">Task Buddy`; `curl /does-not-exist` contained "This screen does not exist." A browser screenshot wasn't possible: Chrome isn't installed for the DevTools driver.
- **Android emulator:** pending (owner action).
- **iPhone (Expo Go):** pending (owner action).

## Review findings
| # | Severity | Finding (file:line) | Source | Resolution |
|---|---|---|---|---|
| 1 | Important | `verification.md` missing; AC4 docs not updated | reviewer agent | Fixed (this file) |
| 2 | Important | `jest.config.js` maps all `@/` to `src/` but tsconfig also has `@/assets/*` → Jest would fail on asset imports | reviewer agent | Fixed: `^@/assets/(.*)$` mapping added first |
| 3 | Important | `HomeScreen.test.tsx` renders the component directly and doesn't guard the route | reviewer agent | Fixed: `home-route.test.tsx` uses `renderRouter('./app')` for `/` and an unknown route; proven by the negative check |
| 4 | Nit | `@/assets/*` alias not in the spec | reviewer agent | Kept (template default, used for assets later); recorded as a deviation in spec.md |
| 5 | Nit | `app.json` `web.output: "server"` needs a server host | reviewer agent | Fixed: `"static"` |
| 6 | Nit | `.gitignore` doesn't cover `.claude/settings.local.json`; stray `example` line | reviewer agent | Fixed |
| 7 | Nit | `.vscode/settings.json` `source.sortMembers` causes noisy diffs | reviewer agent | Fixed: removed |
| 8 | — | Self-review: no secrets, network calls or `any`; no TB-16/17/18 scope; no `babel.config.js`/`metro.config.js` created (left for TB-17/TB-21) | self | — |

## Known limitations & follow-ups
- AC1 device boot is not yet observed (see above). Will be completed after the owner's action, then this file is updated.
- **TB-16 follow-ups:** switch `pnpm start` to `--dev-client`; add an iOS-simulator boot job (macOS runner); wire `check-ticket-docs.mjs` into CI.
- `"types": ["jest"]` makes Jest globals visible to app files typewise. A separate test tsconfig can tighten this later.

## Completion
- [ ] All AC met with evidence (AC1 device boot and AC4 PR review pending)
- [x] Gates green locally (CI arrives in TB-16)
- [x] No open Blocking findings
- [ ] Jira updated (In Review → Done)
