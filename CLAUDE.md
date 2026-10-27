# CLAUDE.md — Task Buddy Engineering Guide

Working memory for the Task Buddy codebase. Read before writing code.
> PM project: Task Buddy (key `TB`). Every branch, commit and PR references `TB-###`.

## 1. Product

Task Buddy is a local-first React Native (Expo) to-do app with an AI "buddy". Users turn sentences, voice and photos into structured tasks, break big tasks into steps, get a realistic daily plan, and receive gentle check-ins. Later phases add Shared Spaces where people and an AI agent collaborate. Core constraints: works offline for core task use; the LLM API key never ships in the app; every AI call is rate-limited, schema-validated and cost-logged; AI never changes data without user confirmation.

## 2. Tech stack (locked — no swaps without an ADR)

| Layer | Choice |
|---|---|
| App | Expo SDK 58 (`expo` 58.0.19) + React Native 0.88.0 + React 19.3.0, TypeScript 6.0 strict, Expo Router 58 (scaffolded in TB-15) |
| UI | NativeWind (Tailwind for RN), token theme, light/dark |
| State & data fetching | Zustand (UI state), TanStack Query (async/server state) |
| Forms & validation | React Hook Form + Zod (shared schemas in `packages/schemas`) |
| Local DB | expo-sqlite + Drizzle ORM (FTS5 for search) |
| Backend | Supabase: Auth (email OTP, Apple, Google), Postgres + RLS, Realtime, Storage, Edge Functions |
| AI | Claude through the `ai-gateway` Edge Function only; cheaper model for parse/check-ins, stronger model for plan/review/chat |
| Voice | expo-speech-recognition (on-device where available) feeding the normal parser |
| Notifications | expo-notifications (local reminders) + Expo Push (server check-ins) |
| Billing | RevenueCat + webhook to Supabase (Phase 3) |
| Observability | Sentry (crashes), PostHog (consent-gated analytics) |
| Testing | Jest + React Native Testing Library, Maestro (E2E), `evals/` runner (AI quality) |
| CI/CD | GitHub Actions + EAS Build / Submit / Update |

## 3. Folder structure

```
taskbuddy/
├─ app/                          # Expo Router routes (thin: compose features only)
│  ├─ (tabs)/                    # today, inbox, buddy, settings
│  ├─ (auth)/                    # sign-in
│  ├─ task/[id].tsx              # task detail modal
│  └─ _layout.tsx
├─ src/
│  ├─ features/                  # feature-first modules
│  │  ├─ tasks/                  # components/ hooks/ repo/ schema.ts
│  │  ├─ capture/                # quick-add, voice, photo
│  │  ├─ ai/                     # gateway client, request/response types
│  │  ├─ plan/  buddy/  review/  notifications/  spaces/  auth/  settings/  billing/
│  ├─ components/ui/             # design-system primitives (reuse-first)
│  ├─ db/                        # drizzle schema, migrations, client
│  ├─ lib/                       # supabase client, env, dates, logger
│  ├─ stores/                    # zustand stores
│  └─ theme/                     # tokens
├─ packages/schemas/             # shared Zod schemas (app + edge functions)
├─ supabase/
│  ├─ migrations/
│  ├─ functions/ai-gateway/  functions/send-checkins/  functions/revenuecat-webhook/
│  └─ tests/                     # RLS and SQL tests
├─ evals/                        # golden sets + eval runner
├─ .maestro/                     # E2E flows
├─ docs/
│  ├─ tickets/                   # _TEMPLATE.md (compact), _template/ (full), TB-###/ per ticket
│  ├─ waves/                     # wave plan + Jira↔workbook reconciliation
│  ├─ actions/                   # step-by-step guides for things the human must do
│  └─ workflow/                  # delivery workflow (README.md) and REVIEW.md
├─ scripts/workflow/             # deterministic workflow checks
├─ CLAUDE.md
└─ AGENTS.md
```

Rules:
- Routes stay thin; logic lives in `src/features/*`.
- All local data access goes through repositories in `features/*/repo`; no raw SQL in components.
- The app never calls an LLM directly. All AI goes through `supabase/functions/ai-gateway`.
- Vendors (LLM, push, billing, analytics) sit behind interfaces so they can be swapped.
- Server-only code lives in `supabase/functions`; never import it into `app/` or `src/`.

## 4. Coding standards & naming conventions

| Thing | Convention | Example |
|---|---|---|
| Component files | PascalCase `.tsx` | `TaskRow.tsx` |
| Route files | Expo Router convention (lowercase, `[param]`) | `today.tsx`, `[id].tsx` |
| Hook/util/repo files | kebab-case | `use-tasks.ts`, `task-repo.ts` |
| Components | PascalCase | `TaskRow` |
| Hooks | camelCase, `use` prefix | `useTasks()` |
| Functions | camelCase, verb-first | `createTask()` |
| Variables | camelCase | `activePlan` |
| Booleans | `is/has/should/can` prefix | `isOverdue` |
| Constants | UPPER_SNAKE_CASE | `MAX_AI_CALLS_PER_HOUR` |
| Types/interfaces | PascalCase, no `I` prefix | `Task`, `PlanBlock` |
| Zod schemas | camelCase + `Schema` | `parsedTasksSchema` |
| Env vars | UPPER_SNAKE_CASE; app-visible ones prefixed `EXPO_PUBLIC_` and never secret | `EXPO_PUBLIC_SUPABASE_URL` |
| Postgres tables/columns | snake_case, plural tables | `ai_usage_ledger`, `updated_at` |
| Drizzle fields | camelCase mapped to snake_case columns | `dueAt` |
| Edge function folders | kebab-case | `ai-gateway` |
| Tests | `*.test.ts(x)` beside the code | `task-repo.test.ts` |

General:
- Strict types, no `any`. Validate every external input at the boundary, **including AI output** (Zod).
- No secrets client-side. Only `EXPO_PUBLIC_*` non-secret values reach the bundle.
- Small, single-purpose functions. Prefer pure logic that is easy to unit test.
- Invariants on every relevant path: (1) AI calls pass auth, rate limit, quota and schema validation; (2) AI-proposed changes require explicit user confirmation; (3) every Postgres table has RLS; (4) synced tables carry `id (UUIDv7)`, `updated_at`, `deleted_at` (soft delete).
- **Reuse-first:** before creating a component, hook, utility or pattern, check whether it should be a shared component, a utility/helper, or an existing pattern to follow. Do not create duplicate solutions.

## 5. Git: branches, commits, PRs

- Branch: `<type>/tb-<ticket>/<short-kebab-title>` where type is `feat|fix|chore|refactor|docs|test|perf|build|ci`. Example: `feat/tb-015/quick-add-preview`.
- Commit (Conventional Commits): `feat(capture): add parse preview (TB-015)`.
- Trunk-based: short branch, PR, at least one review (human or agent review plus human merge) and green CI, then squash-merge. The PR restates the acceptance criteria and links `docs/tickets/TB-###/`.
- **Delivery workflow** (Jira as source of truth, waves, intent → spec → plan → verification, Orca worktrees for parallel tickets, Jira status sync, human gates): `docs/workflow/README.md`. Review rules: `docs/workflow/REVIEW.md`.

## 6. Best-practice skills (consult when building features)

When developing any feature, load and follow these as the authority for framework best practices. If a skill and a ticket's acceptance criteria conflict: the AC wins for behavior, the skill wins for how it is coded.

- Expo skills (routing, data fetching, design system, dev client, upgrades, EAS Update/Workflows/app stores). Install: `claude plugin install expo@claude-plugins-official` (Claude Code) or `npx skills add expo/skills` (other agents). Most relevant: `expo-router`, `expo-native-ui`, `expo-data-fetching`, `expo-dev-client`, `expo-design-system`, `expo-upgrade`, `eas-update`, `eas-workflows`, `eas-app-stores`.
- Supabase agent skills (RLS, auth, security). Install: `npx skills add supabase/agent-skills`.
- Verify library APIs against current docs (for example via the Context7 MCP server) instead of relying on memory.

## 7. Definition of Ready / Done (short)

- Ready: AC testable; prerequisites done; 8 points or less; API contract or screen linked; security/privacy/AI-cost implications noted.
- Done: AC met and demoed; PR reviewed and merged with CI green; unit + integration pass (E2E on critical paths); RLS/security tests pass where relevant; AI eval baseline not regressed; no new Sentry errors; `docs/tickets/TB-###/` updated including `verification.md`; Jira status and PR link current; migrations reversible.

## 8. Documentation & knowledge management

CLAUDE.md is **not** updated per ticket or feature. Update it only for durable, project-wide knowledge: best practices, architectural decisions and patterns, validation and sanitization standards, coding conventions, shared workflows, reusable UI/API patterns, anti-duplication rules.

Cadence: update only when an Epic completes or a decision becomes stable and reusable.

Reuse-first applies before every new component, utility or pattern: shared component? utility? existing pattern to follow? something worth standardizing?

Per-ticket detail lives in `docs/tickets/TB-###/`, never in CLAUDE.md. Medium/high-risk tickets: `intent.md`, `spec.md`, `plan.md`, `verification.md` (copy `docs/tickets/_template/`). Low-risk tickets: a compact `README.md` (copy `docs/tickets/_TEMPLATE.md`: Overview · Implementation details · API changes · Database changes · Dependencies on other tickets · Known limitations · Testing notes · Follow-up tasks) plus `verification.md`. Every file links its Jira issue.

## 9. Commands

Scripts are created by TB-001 (scaffold) and TB-002 (CI); keep names stable.

```
pnpm start              # Expo dev server (dev client)
pnpm ios | pnpm android # run on simulator/emulator
pnpm lint && pnpm typecheck && pnpm test
pnpm eval               # AI golden-set evals (rate-limited, cost-capped)
pnpm e2e                # Maestro flows
pnpm db:generate        # Drizzle migration for local SQLite
supabase start          # local Supabase stack
supabase db push        # apply Postgres migrations
supabase functions serve ai-gateway
eas build --profile development --platform ios|android
eas update --channel preview
```

> Keep CLAUDE.md canonical; critical rules are mirrored in AGENTS.md.
