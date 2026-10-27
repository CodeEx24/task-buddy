# AGENTS.md — Task Buddy

Rules for all coding agents working in this repo. `CLAUDE.md` is canonical; this file mirrors the must-follow rules so every agent complies.

## Non-negotiables

- Follow the folder structure and naming conventions in `CLAUDE.md` (sections 3 and 4).
- **AI goes through the gateway only.** The app never calls an LLM directly and no provider key may appear in app code, config or the bundle.
- **No AI-proposed change is applied without explicit user confirmation.** Server code never executes actions from user text.
- **Validate AI output** with the shared Zod schema before using or storing it. On failure return `AI_BAD_OUTPUT`; never persist unvalidated output.
- Every Postgres table has RLS. Add or change policies together with a test in `supabase/tests`.
- Synced tables keep `id (UUIDv7)`, `updated_at`, `deleted_at`. Deletes are soft deletes.
- **Reuse-first:** before creating a component, hook, utility or pattern, check for a shared component, a utility, or an existing pattern. Do not duplicate solutions.
- **Do not bloat CLAUDE.md.** Never edit it per ticket. Update it only when an Epic completes or a decision becomes stable and reusable. Per-ticket notes go in `docs/tickets/TB-###.md`.
- Strict TypeScript, no `any`. No secrets client-side (`EXPO_PUBLIC_*` is for non-secret values only).
- Keep task text and notes out of logs, Sentry breadcrumbs and analytics events.

## Workflow

1. Read the ticket (`TB-###`), its acceptance criteria and `docs/tickets/TB-###.md` if present.
2. Branch: `<type>/tb-<ticket>/<short-kebab-title>`. Commits: Conventional Commits with `(TB-###)`.
3. Write or update tests from the acceptance criteria first or alongside the code.
4. Run `pnpm lint && pnpm typecheck && pnpm test`. If you touched prompts, models or schemas, run `pnpm eval` and do not regress the baseline.
5. Self-review the diff for security, performance and correctness before opening the PR. The PR restates the AC.
6. Update `docs/tickets/TB-###.md` (copy `_TEMPLATE.md`).

## Skills to consult

Expo skills (`expo-router`, `expo-native-ui`, `expo-data-fetching`, `expo-dev-client`, `eas-update`) and Supabase agent skills. If a skill conflicts with a ticket's AC: AC wins for behavior, the skill wins for how it is coded. Check current library docs rather than relying on memory.

## Model routing for delegated agents

Simple questions and lookups: Sonnet-class. Feature development: Opus-class. Hard or critical implementations (sync conflict rules, RLS policies, gateway security, agent scope enforcement): top-tier model plus a second review pass.

## Definition of Done (short)

AC met and demoed; PR reviewed, CI green; tests pass; security/RLS tests pass where relevant; AI eval baseline not regressed; no new Sentry errors; ticket doc updated; migrations reversible.
