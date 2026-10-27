# TB-15 — Implementation plan

> Jira: https://stratyge.atlassian.net/browse/TB-15 · Spec: [spec.md](spec.md)
> Bar: an engineer who has never seen the conversation could implement the change from this plan alone.

## Branch & worktree
`feat/tb-15/scaffold-expo-app`, in the main checkout (solo ticket, Wave 1 batch A). It is stacked on `docs/ai-native-sdlc-workflow` (PR #3) until that merges, then rebased onto `main`.
**Owns:** everything (creates the skeleton). **Must not change:** `docs/workflow/**`, `docs/waves/**` (except a status note), `.claude/**`.

## Dependencies
Blocked by: none (verified in Jira 2026-10-27). Story has the `ready` label.

## Tasks

### Task 1 — Generate the template
- [ ] `pnpm create expo-app@latest <scratchpad>/tb15-template --template default@sdk-58 --no-install` (the repo is not empty, so generate outside it).
- [ ] Copy into the repo: `app.json`, `package.json`, `tsconfig.json`, `eslint.config.js`, `expo-env.d.ts`, `.gitignore` (merge with ours: add `__pycache__/`, `.env*` except `.env.example`), `assets/` (icon, splash, adaptive icon, favicon only), and the `src/app/` router files needed. Do not copy the template README, `scripts/reset-project.js`, or example components, hooks and constants.
- [ ] `app.json`: name "Task Buddy", slug `task-buddy`, scheme `taskbuddy` (TB-18's deep-link AC uses `taskbuddy://`), `experiments.typedRoutes: true` if the template sets it.
- Verify: `pnpm install` succeeds; `git status` shows no template junk.

### Task 2 — Thin routes
- [ ] `src/app/_layout.tsx`: root `<Stack />`.
- [ ] `src/app/index.tsx`: re-exports the home screen (see Task 5).
- [ ] `src/app/+not-found.tsx`: minimal not-found screen with a link home.
- Verify: `pnpm typecheck`.

### Task 3 — TypeScript strict + alias
- [ ] `tsconfig.json`: extends `expo/tsconfig.base`; `strict: true`, `noUncheckedIndexedAccess: true`; `paths: { "@/*": ["./src/*"] }`.
- [ ] `src/lib/app-info.ts` exports `APP_NAME = 'Task Buddy'`. The home screen imports it via `@/lib/app-info`, which proves the alias works at runtime and in tests.
- Verify: `pnpm typecheck`; the smoke test (Task 5) resolves the alias.

### Task 4 — ESLint + Prettier
- [ ] Dev deps: `eslint`, `eslint-config-expo`, `prettier`, `eslint-plugin-prettier`, `eslint-config-prettier`.
- [ ] `eslint.config.js`: `eslint-config-expo/flat` + `eslint-plugin-prettier/recommended`. Add rule `@typescript-eslint/no-explicit-any: 'error'`. Ignore `dist/*`, `.expo/*`, `scripts/workflow/*`.
- [ ] `.prettierrc` (singleQuote, trailingComma all, printWidth 100), `.prettierignore`.
- Verify: `pnpm lint` passes. A temporary `const x: any` makes it fail (checked, then reverted).

### Task 5 — Home screen + Jest/RNTL smoke test
- [ ] `src/features/home/components/HomeScreen.tsx`: `<View testID="home-screen"><Text>{APP_NAME}</Text></View>`. `src/app/index.tsx` re-exports it, which keeps routes thin (CLAUDE.md §3). Tests can't live in `src/app/`, because Expo Router treats files there as routes.
- [ ] Dev deps: `jest`, `jest-expo`, `@testing-library/react-native`, `@types/jest`. Use the versions `npx expo install` picks for SDK 58.
- [ ] `jest.config.js`: preset `jest-expo`, plus a `moduleNameMapper` for `^@/(.*)$`.
- [ ] `src/features/home/components/HomeScreen.test.tsx`: renders and asserts `home-screen` and the text "Task Buddy".
- Verify: `pnpm test` → 1 passing test; it fails if the `testID` is removed (checked, then reverted).

### Task 6 — Scripts and package metadata
- [ ] `package.json` scripts: `start: expo start`, `ios: expo start --ios`, `android: expo start --android`, `web: expo start --web`, `lint: expo lint`, `typecheck: tsc --noEmit`, `test: jest`, `format: prettier --write .`.
- [ ] `"packageManager": "pnpm@10.17.1"`, `"private": true`, `"name": "task-buddy"`.
- [ ] `npx expo install --check` reports no version mismatches.
- Verify: each script runs.

### Task 7 — Folder skeleton (CLAUDE.md §3)
- [ ] Create one-line `README.md` files (purpose + owning ticket) in: `src/components/ui/` (TB-17), `src/db/` (TB-21), `src/stores/`, `src/theme/` (TB-17), `packages/schemas/` (TB-24), `supabase/migrations/`, `supabase/functions/` (TB-19/22), `supabase/tests/` (TB-19), `evals/` (TB-39), `.maestro/` (TB-52).
- Verify: the tree matches CLAUDE.md §3 (manual check recorded in verification.md).

### Task 8 — Docs
- [ ] Root `README.md`: prerequisites, `pnpm install && pnpm start`, Android emulator / Expo Go, scripts table, and links to CLAUDE.md and `docs/workflow/README.md`.
- [ ] CLAUDE.md §2: record the exact `expo`, `react-native` and `react` versions (the one CLAUDE.md edit allowed).
- [ ] `docs/tickets/TB-15/verification.md`.

## Test strategy
| AC | Test (layer) | File / evidence |
|---|---|---|
| AC1 boot + placeholder | Smoke render (unit) + manual on the Android emulator + Expo Go on iPhone | `HomeScreen.test.tsx`; screenshots in verification.md |
| AC2 lint + typecheck strict | Gates | `pnpm lint`, `pnpm typecheck` output |
| AC3 structure + template | Manual tree check + `check-ticket-docs.mjs` | verification.md |
| AC4 done gates | `pnpm test`, review, ticket docs | verification.md, PR |

## Risks & rollback
- **pnpm + Metro resolution issues** → fall back to `node-linker=hoisted` in `.npmrc` (recorded as a deviation).
- **Expo Go version mismatch with SDK 58** → the action guide says to update Expo Go.
- **The Android emulator isn't available yet** (the owner still has to install it) → finish everything else and record AC1 as pending device verification. Don't open the PR as "all met".
- **Rollback:** the branch only adds files. Revert the PR.
