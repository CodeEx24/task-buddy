# Task Buddy

Local-first to-do app (Expo + React Native) with an AI buddy. Product, stack and rules: [CLAUDE.md](CLAUDE.md). How work is planned and delivered: [docs/workflow/README.md](docs/workflow/README.md). Backlog: Jira project [TB](https://stratyge.atlassian.net/jira/software/projects/TB).

## Prerequisites

- Node.js LTS (≥ 20) and pnpm 10 (`corepack enable` picks the version pinned in `package.json`)
- Android: Android Studio with an emulator ([setup guide](docs/actions/android-emulator-setup.md))
- iOS: a Mac with Xcode for the simulator, or **Expo Go** on an iPhone

## Run it

```bash
pnpm install
pnpm start        # Expo dev server. Press "a" for Android, "w" for web, or scan the QR code with Expo Go
```

`pnpm start` targets Expo Go for now. It switches to the dev client when the development build lands (TB-16).

**Expo Go on iPhone:** scan the QR code with the Camera app (newer iOS Expo Go has no "Enter URL manually"). If Expo Go is signed in, the Expo CLI on your computer must be signed in to the same account. On Windows, log in with `npx expo login --no-browser`, because the browser login crashes there with Expo CLI 58.1.15.

## Scripts

| Command | What it does |
|---|---|
| `pnpm start` | Start the Expo dev server |
| `pnpm android` / `pnpm ios` / `pnpm web` | Start and open on that platform |
| `pnpm lint` | ESLint (Expo flat config + Prettier; `any` is an error) |
| `pnpm typecheck` | `tsc --noEmit` in strict mode |
| `pnpm test` | Jest (`jest-expo`) + React Native Testing Library |
| `pnpm format` | Prettier write |

Before opening a PR: `pnpm lint && pnpm typecheck && pnpm test` and `node scripts/workflow/check-ticket-docs.mjs --branch <branch> --pr`.

## Layout

Routes live in `app/` and stay thin. Feature code lives in `src/features/*`, and `@/*` maps to `src/*`. The full structure is in CLAUDE.md §3. Each placeholder folder has a README saying what belongs there and which ticket fills it.
