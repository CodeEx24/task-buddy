# Task Buddy

Local-first to-do app (Expo + React Native) with an AI buddy. Product, stack and rules: [CLAUDE.md](CLAUDE.md). How work is planned and delivered: [docs/workflow/README.md](docs/workflow/README.md). Backlog: Jira project [TB](https://stratyge.atlassian.net/jira/software/projects/TB).

## Prerequisites

- Node.js LTS (≥ 20) and pnpm 10 (`corepack enable` picks the version pinned in `package.json`)
- Android: Android Studio with an emulator ([setup guide](docs/actions/android-emulator-setup.md))
- iOS: a Mac with Xcode for the simulator, or **Expo Go** on an iPhone

## Run it

```bash
pnpm install
pnpm start        # Expo dev server for the development build. Press "a" for Android, "w" for web
```

`pnpm start` targets the **development build** (dev client) since TB-16. Install it once per device:

- **Android emulator:** `npx eas-cli@26 build:run -p android --latest` downloads the latest `development` build from EAS and installs it.
- **New dev build** (after adding a native module): `npx eas-cli@26 build --profile development --platform android`.
- **Expo Go** still works for JS-only checks: `npx expo start --go`. It can't load native modules that Expo Go doesn't ship.

**Expo login on Windows:** if Expo asks you to sign in, use `npx expo login --no-browser`, because the browser login crashes there with Expo CLI 58.1.15.

## Scripts

| Command | What it does |
|---|---|
| `pnpm start` | Start the Expo dev server for the development build |
| `pnpm android` / `pnpm ios` / `pnpm web` | Start and open on that platform |
| `pnpm lint` | ESLint (Expo flat config + Prettier; `any` is an error) |
| `pnpm typecheck` | `tsc --noEmit` in strict mode |
| `pnpm test` | Jest (`jest-expo`) + React Native Testing Library |
| `pnpm format` | Prettier write |

## Build & CI

- **CI** (`.github/workflows/ci.yml`): every PR to `main` and every push to `main` runs install → lint → typecheck → tests → ticket-docs gate. Job `ci` is the required check on `main`, with an 8-minute timeout.
- **iOS simulator** (`.github/workflows/ios-simulator.yml`): manual only (Actions tab → *Run workflow*). It builds and boots the app on a macOS runner and uploads a screenshot. macOS minutes cost more, so it never runs on PRs.
- **EAS** (`eas.json`): profiles `development` (dev client, Android APK, iOS simulator), `preview` (internal) and `production`. Project `@codeex24/task-buddy`; app id `com.codeex24.taskbuddy`.

Before opening a PR: `pnpm lint && pnpm typecheck && pnpm test` and `node scripts/workflow/check-ticket-docs.mjs --branch <branch> --pr`.

## Layout

Routes live in `src/app/` and stay thin. Feature code lives in `src/features/*`, and `@/*` maps to `src/*`. The full structure is in CLAUDE.md §3. Each placeholder folder has a README saying what belongs there and which ticket fills it.
