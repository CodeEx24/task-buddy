# Setup prompt — Task Buddy repo kickoff

## Before you run it

Install and create:
- Node.js LTS, pnpm, Git, Xcode (iOS simulator) and/or Android Studio (emulator)
- GitHub account and an empty repo (for example `taskbuddy`)
- Expo account (for EAS), Supabase account, an Anthropic API key (used only as a Supabase Edge Function secret, never in the app)
- Later, before store release: Apple Developer Program ($99/year) and Google Play Console ($25 one-time). RevenueCat, Sentry and PostHog accounts are needed in later sprints.

Copy `CLAUDE.md`, `AGENTS.md` and `docs/tickets/_TEMPLATE.md` from `repo-files/` into the new repo root before running the prompt.

## Prompt (paste into Claude Code in the empty repo)

```
You are starting the Task Buddy project. Read CLAUDE.md and AGENTS.md first and follow them strictly (folder structure, naming, reuse-first, no secrets in the app, AI only through the gateway).

Do ONLY the first two stories of Sprint 1:

1. Scaffold (US-001): create an Expo app with TypeScript (strict) and Expo Router using the current stable Expo SDK and pnpm. Use `npx create-expo-app@latest` and check current Expo docs for the right template/flags. Set up ESLint + Prettier, path aliases (`@/*` to `src/*`), and the folder structure from CLAUDE.md section 3 with a placeholder home route (the tabs Today, Inbox, Buddy, Settings belong to TB-18). Add scripts: start, ios, android, lint, typecheck, test (Jest + React Native Testing Library with one passing smoke test).
   Acceptance: a fresh clone runs `pnpm install && pnpm start` and boots on the iOS simulator and the Android emulator; `pnpm lint && pnpm typecheck` pass with zero errors.

2. CI and builds (US-002): add a GitHub Actions workflow that runs lint, typecheck and unit tests on every PR and finishes in under 8 minutes; add `eas.json` with development, preview and production profiles (development uses the dev client).
   Acceptance: CI is green on a PR; `eas build --profile development` is documented in the README (do not run paid builds without asking).

Rules:
- Record the exact Expo SDK, React Native and React versions in CLAUDE.md section 2 (this is the only CLAUDE.md edit allowed in this task).
- Create `docs/tickets/TB-###/` notes for both stories (compact `README.md` from `docs/tickets/_TEMPLATE.md`, plus `verification.md` from `docs/tickets/_template/`). See `docs/workflow/README.md`.
- Use branches `feat/tb-<jira number>/<title>` and Conventional Commits; open PRs, do not push to main.
- Do not implement any other story. Stop after both are done and tell me how to verify them.
```

## Next prompts (one per sprint)

After Sprint 1 foundations, use the sprint goal in the workbook's *Sprint Backlog* tab and run `/implement-ticket <Jira key>` (it follows `docs/workflow/README.md`: ticket docs in `docs/tickets/<key>/`, one branch per story, parallel stories in Orca worktrees per `docs/waves/wave-plan.md`).
