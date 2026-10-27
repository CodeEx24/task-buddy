# Task Buddy — Wave Plan

> **Status:** APPROVED by the project owner on 2026-10-27, with all recommendations accepted (see "Decisions" at the bottom).
> **Source of truth:** Jira project [TB](https://stratyge.atlassian.net/jira/software/projects/TB) owns ticket identity, status, priority and dependency links. This file is the version-controlled *execution* plan derived from it. If they disagree, Jira wins and this file is re-generated.
> **Generated:** 2026-10-27 by `/plan-waves` from Jira (81 issues read: 14 epics, 67 stories) reconciled against `docs/TaskBuddy_Delivery_Workbook.xlsx`. Reconciliation details: [`reconciliation-2026-10-27.md`](reconciliation-2026-10-27.md).

## Summary

- **67 stories, 279 pts, 6 waves.** Waves come from the Jira `wave-N` labels (the existing convention). Planning **did not move any ticket between waves**: the graph check found no backward dependencies.
- **Dependency graph:** 67 nodes. Every `is blocked by` link in Jira matches the workbook `Blocked By` column exactly. **No cycles. No dangling links. No dependency on a later wave.**
- **Critical path (47 pts):** TB-15 → TB-17 → TB-18 → TB-26 → TB-43 → TB-68 → TB-71 → TB-74 → TB-76
  (scaffold → design system → app shell → task CRUD → offline sync → shared spaces → realtime lists → @buddy agent → workload proposals). A slip on any of these slips Phase 3. TB-43 (sync, 8 pts) and TB-74 (shared agent, 8 pts) are the riskiest links.
- **Ready now:** only **TB-15**. Every other story except TB-54 (privacy policy, no dependencies) is blocked by it directly or transitively. TB-54 waits only for its wave gate (now Wave 3).
- **Readiness in Jira:** the `ready` label marks stories that meet the Definition of Ready (TB-15..TB-32 as of 2026-10-27).

## How to read the tables

A **wave** is a band of tickets that can start only after every earlier wave is done. A **batch** (A, B, C…) is a step inside a wave. Tickets in the same batch can run **in parallel worktrees**. Batch B starts when the batch-A tickets it depends on are merged. `¹` marks a dependency inside the same wave. **Ready?** is the workbook's Definition-of-Ready flag. Jira has every ticket at `To Do` and doesn't record readiness (see reconciliation).

## Waves

### Wave 1 — Foundations (7 stories, 19 pts)

| Batch | Ticket | Blueprint | Title | Pri | Pts | Depends on | Ready? |
|---|---|---|---|---|---|---|---|
| A | [TB-15](https://stratyge.atlassian.net/browse/TB-15) | US-001 | Scaffold Expo app (TypeScript, Router, lint, aliases) | P0 | 3 | — | Ready |
| B | [TB-16](https://stratyge.atlassian.net/browse/TB-16) | US-002 | CI pipeline and EAS build profiles | P0 | 3 | TB-15¹ | Ready |
| B | [TB-17](https://stratyge.atlassian.net/browse/TB-17) | US-003 | Design system: theme tokens and UI primitives | P0 | 3 | TB-15¹ | Ready |
| B | [TB-19](https://stratyge.atlassian.net/browse/TB-19) | US-005 | Supabase projects, env config and RLS baseline | P0 | 2 | TB-15¹ | Ready |
| B | [TB-21](https://stratyge.atlassian.net/browse/TB-21) | US-007 | Local SQLite schema, migrations and repositories | P0 | 3 | TB-15¹ | Ready |
| C | [TB-18](https://stratyge.atlassian.net/browse/TB-18) | US-004 | App shell: tab navigation and task modal | P0 | 2 | TB-17¹ | Ready |
| D | [TB-20](https://stratyge.atlassian.net/browse/TB-20) | US-006 | Email OTP sign-in with secure session | P0 | 3 | TB-19¹, TB-18¹ | Ready |

### Wave 2 — AI gateway + core tasks (7 stories, 26 pts)

| Batch | Ticket | Blueprint | Title | Pri | Pts | Depends on | Ready? |
|---|---|---|---|---|---|---|---|
| A | [TB-22](https://stratyge.atlassian.net/browse/TB-22) | US-008 | AI gateway Edge Function with JWT auth | P0 | 5 | TB-19, TB-20 | Ready |
| A | [TB-26](https://stratyge.atlassian.net/browse/TB-26) | US-012 | Task CRUD with due date and priority | P0 | 5 | TB-21, TB-18 | Ready |
| B | [TB-23](https://stratyge.atlassian.net/browse/TB-23) | US-009 | Per-user AI rate limits and token quotas | P0 | 3 | TB-22¹ | Ready |
| B | [TB-24](https://stratyge.atlassian.net/browse/TB-24) | US-010 | AI output schemas, validation and repair retry | P0 | 3 | TB-22¹ | Ready |
| B | [TB-25](https://stratyge.atlassian.net/browse/TB-25) | US-011 | Prompt-injection and input hardening | P0 | 2 | TB-22¹ | Ready |
| B | [TB-27](https://stratyge.atlassian.net/browse/TB-27) | US-013 | Today and Inbox screens with swipe actions | P0 | 5 | TB-26¹ | Ready |
| B | [TB-28](https://stratyge.atlassian.net/browse/TB-28) | US-014 | Task detail screen with notes and subtasks | P0 | 3 | TB-26¹ | Ready |

### Wave 3 — AI capture, planning, beta, privacy policy (12 stories, 45 pts)

| Batch | Ticket | Blueprint | Title | Pri | Pts | Depends on | Ready? |
|---|---|---|---|---|---|---|---|
| A | [TB-29](https://stratyge.atlassian.net/browse/TB-29) | US-015 | Quick-add with AI parse preview | P0 | 5 | TB-26, TB-24, TB-23 | Ready |
| A | [TB-30](https://stratyge.atlassian.net/browse/TB-30) | US-016 | Natural-language parser: dates, priority, timezone | P0 | 3 | TB-24, TB-25 | Ready |
| A | [TB-31](https://stratyge.atlassian.net/browse/TB-31) | US-017 | AI task breakdown into subtasks with estimates | P1 | 5 | TB-28, TB-24, TB-23 | Ready |
| A | [TB-32](https://stratyge.atlassian.net/browse/TB-32) | US-018 | Settings screen shell and preference registry | P1 | 2 | TB-18 | Ready |
| A | [TB-37](https://stratyge.atlassian.net/browse/TB-37) | US-023 | Crash reporting with Sentry and source maps | P1 | 2 | TB-15, TB-16 | Draft |
| A | [TB-54](https://stratyge.atlassian.net/browse/TB-54) | US-040 | Privacy policy, terms and AI disclosure | P0 | 2 | — | Draft (moved from Wave 4 on 2026-10-27) |
| B | [TB-33](https://stratyge.atlassian.net/browse/TB-33) | US-019 | Work hours and daily capacity settings | P1 | 3 | TB-32¹ | Draft |
| B | [TB-36](https://stratyge.atlassian.net/browse/TB-36) | US-022 | Edit and undo AI-created tasks | P1 | 2 | TB-29¹ | Draft |
| B | [TB-38](https://stratyge.atlassian.net/browse/TB-38) | US-024 | TestFlight and Play beta builds with OTA updates | P1 | 3 | TB-16, TB-37¹, TB-27, TB-54¹ (added 2026-10-27) | Draft |
| C | [TB-34](https://stratyge.atlassian.net/browse/TB-34) | US-020 | AI daily plan generation | P1 | 8 | TB-24, TB-33¹, TB-26, TB-23 | Draft |
| D | [TB-35](https://stratyge.atlassian.net/browse/TB-35) | US-021 | Daily plan view with reorder and accept | P1 | 5 | TB-34¹, TB-27 | Draft |
| D | [TB-39](https://stratyge.atlassian.net/browse/TB-39) | US-025 | AI eval harness with golden sets and CI gate | P1 | 5 | TB-30¹, TB-31¹, TB-34¹ | Draft |

### Wave 4 — Reminders, sync, engagement, data rights (14 stories, 61 pts)

| Batch | Ticket | Blueprint | Title | Pri | Pts | Depends on | Ready? |
|---|---|---|---|---|---|---|---|
| A | [TB-40](https://stratyge.atlassian.net/browse/TB-40) | US-026 | Local due-date reminders | P1 | 3 | TB-26 | Draft |
| A | [TB-42](https://stratyge.atlassian.net/browse/TB-42) | US-028 | Re-plan on missed or finished tasks | P1 | 3 | TB-35 | Draft |
| A | [TB-43](https://stratyge.atlassian.net/browse/TB-43) | US-029 | Offline-first sync across devices | P1 | 8 | TB-21, TB-20, TB-26 | Draft |
| A | [TB-44](https://stratyge.atlassian.net/browse/TB-44) | US-030 | Lists, tags and filters | P2 | 5 | TB-26 | Draft |
| A | [TB-45](https://stratyge.atlassian.net/browse/TB-45) | US-031 | Recurring tasks (RRULE) | P2 | 5 | TB-26 | Draft |
| A | [TB-50](https://stratyge.atlassian.net/browse/TB-50) | US-036 | Sign in with Apple and Google | P2 | 3 | TB-20 | Draft |
| A | [TB-52](https://stratyge.atlassian.net/browse/TB-52) | US-038 | Maestro E2E flows for critical paths | P1 | 5 | TB-27, TB-29, TB-16 | Draft |
| B | [TB-41](https://stratyge.atlassian.net/browse/TB-41) | US-027 | Notification permission flow and quiet hours | P1 | 3 | TB-32, TB-40¹ | Draft |
| B | [TB-48](https://stratyge.atlassian.net/browse/TB-48) | US-034 | Detect repeatedly postponed tasks | P2 | 3 | TB-28, TB-40¹ | Draft |
| B | [TB-53](https://stratyge.atlassian.net/browse/TB-53) | US-039 | Data export and account deletion | P0 | 5 | TB-43¹, TB-20 | Draft |
| C | [TB-46](https://stratyge.atlassian.net/browse/TB-46) | US-032 | Push token registration and server sender | P1 | 5 | TB-20, TB-22, TB-41¹ | Draft |
| C | [TB-49](https://stratyge.atlassian.net/browse/TB-49) | US-035 | AI 10-minute starter step | P2 | 3 | TB-48¹, TB-24, TB-23 | Draft |
| C | [TB-51](https://stratyge.atlassian.net/browse/TB-51) | US-037 | Onboarding flow (hours, quiet hours, tone) | P1 | 5 | TB-41¹, TB-33, TB-32 | Draft |
| D | [TB-47](https://stratyge.atlassian.net/browse/TB-47) | US-033 | Buddy check-ins with quick-reply actions | P1 | 5 | TB-46¹, TB-34, TB-23 | Draft |

### Wave 5 — Buddy chat, media, quality, v1.0 submission (12 stories, 49 pts)

| Batch | Ticket | Blueprint | Title | Pri | Pts | Depends on | Ready? |
|---|---|---|---|---|---|---|---|
| A | [TB-55](https://stratyge.atlassian.net/browse/TB-55) | US-041 | Buddy chat with confirmed actions | P1 | 8 | TB-24, TB-23, TB-25, TB-26 | Draft |
| A | [TB-57](https://stratyge.atlassian.net/browse/TB-57) | US-043 | Voice capture via speech recognition | P1 | 5 | TB-29, TB-30 | Draft |
| A | [TB-58](https://stratyge.atlassian.net/browse/TB-58) | US-044 | Photo-to-tasks (vision extraction) | P2 | 5 | TB-22, TB-24, TB-29 | Draft |
| A | [TB-60](https://stratyge.atlassian.net/browse/TB-60) | US-046 | Weekly completion statistics | P2 | 3 | TB-27 | Draft |
| A | [TB-62](https://stratyge.atlassian.net/browse/TB-62) | US-048 | Accessibility: labels, dynamic type, touch targets | P1 | 3 | TB-27, TB-28, TB-29 | Draft |
| A | [TB-63](https://stratyge.atlassian.net/browse/TB-63) | US-049 | Performance budgets for startup and lists | P2 | 3 | TB-27 | Draft |
| A | [TB-65](https://stratyge.atlassian.net/browse/TB-65) | US-051 | Consent-gated product analytics | P2 | 3 | TB-18, TB-32 | Draft |
| A | [TB-66](https://stratyge.atlassian.net/browse/TB-66) | US-052 | Filipino and English UI localization | P3 | 3 | TB-18, TB-32 | Draft |
| B | [TB-56](https://stratyge.atlassian.net/browse/TB-56) | US-042 | Buddy tone and language (English/Taglish) | P3 | 3 | TB-55¹, TB-32 | Draft |
| B | [TB-59](https://stratyge.atlassian.net/browse/TB-59) | US-045 | Media upload limits, consent and auto-deletion | P1 | 3 | TB-58¹, TB-57¹ | Draft |
| B | [TB-61](https://stratyge.atlassian.net/browse/TB-61) | US-047 | AI weekly review and suggestion | P2 | 5 | TB-60¹, TB-24, TB-23 | Draft |
| B | [TB-64](https://stratyge.atlassian.net/browse/TB-64) | US-050 | v1.0 App Store and Google Play submission | P0 | 5 | TB-38, TB-54, TB-53, TB-51, TB-62¹, TB-52 | Draft |

### Wave 6 — Shared spaces, agent, billing (15 stories, 79 pts)

| Batch | Ticket | Blueprint | Title | Pri | Pts | Depends on | Ready? |
|---|---|---|---|---|---|---|---|
| A | [TB-67](https://stratyge.atlassian.net/browse/TB-67) | US-053 | Full-text task search (FTS5) | P2 | 3 | TB-44 | Draft |
| A | [TB-68](https://stratyge.atlassian.net/browse/TB-68) | US-054 | Shared spaces: membership, roles, RLS | P1 | 5 | TB-43, TB-20 | Draft |
| A | [TB-77](https://stratyge.atlassian.net/browse/TB-77) | US-063 | Pro subscription via RevenueCat | P2 | 8 | TB-20, TB-23 | Draft |
| A | [TB-79](https://stratyge.atlassian.net/browse/TB-79) | US-065 | Calendar-aware planning (busy times only) | P3 | 5 | TB-34, TB-32 | Draft |
| A | [TB-80](https://stratyge.atlassian.net/browse/TB-80) | US-066 | Home-screen Today widget | P3 | 5 | TB-27, TB-35 | Draft |
| A | [TB-81](https://stratyge.atlassian.net/browse/TB-81) | US-067 | Experimental on-device parsing | P3 | 8 | TB-30, TB-24, TB-39 | Draft |
| B | [TB-69](https://stratyge.atlassian.net/browse/TB-69) | US-055 | Agent scopes and confirmations (server-enforced) | P1 | 5 | TB-68¹, TB-22 | Draft |
| B | [TB-70](https://stratyge.atlassian.net/browse/TB-70) | US-056 | Space invites by link or code | P1 | 5 | TB-68¹ | Draft |
| B | [TB-71](https://stratyge.atlassian.net/browse/TB-71) | US-057 | Realtime shared lists | P1 | 8 | TB-68¹, TB-26, TB-43 | Draft |
| B | [TB-78](https://stratyge.atlassian.net/browse/TB-78) | US-064 | Tier-based AI quotas | P2 | 3 | TB-77¹, TB-23 | Draft |
| C | [TB-72](https://stratyge.atlassian.net/browse/TB-72) | US-058 | Task assignment and comments | P2 | 5 | TB-71¹ | Draft |
| C | [TB-73](https://stratyge.atlassian.net/browse/TB-73) | US-059 | Space notifications and muting | P2 | 3 | TB-71¹, TB-46 | Draft |
| C | [TB-74](https://stratyge.atlassian.net/browse/TB-74) | US-060 | Shared AI agent via @buddy in spaces | P1 | 8 | TB-71¹, TB-69¹, TB-24, TB-23, TB-55 | Draft |
| D | [TB-75](https://stratyge.atlassian.net/browse/TB-75) | US-061 | Agent action audit log | P1 | 3 | TB-69¹, TB-74¹ | Draft |
| D | [TB-76](https://stratyge.atlassian.net/browse/TB-76) | US-062 | AI workload-balancing proposals | P2 | 5 | TB-74¹, TB-72¹ | Draft |

## Worktree assignments and conflict hotspots

Parallel tickets each get one Orca worktree on branch `<type>/tb-<n>/<slug>` (see [`docs/workflow/README.md`](../workflow/README.md#4-build--parallel-worktrees)). The playbook advice is to start with **2–3 parallel sessions**, so the first waves are capped at 3 concurrent workers.

### Wave 1

| Step | Worktrees (parallel) | Owns (may edit) | Must not edit |
|---|---|---|---|
| 1 | `feat/tb-15/scaffold-expo-app` (solo) | everything: creates the skeleton, `package.json`, configs. Note: its AC item "`docs/tickets/_TEMPLATE.md` exists" is already satisfied by the workflow PR | — |
| 2 | `ci/tb-16/ci-and-eas-profiles` | `.github/workflows/**`, `eas.json`, README build section | `app/**`, `src/**` |
| 2 | `feat/tb-17/design-system` | `src/theme/**`, `src/components/ui/**`, `tailwind.config.*`, `global.css`, NativeWind entries in `babel.config.js` / `metro.config.js` | `src/db/**`, `supabase/**` |
| 2 | `feat/tb-21/local-sqlite-schema` | `src/db/**`, `src/features/*/repo/**`, `drizzle.config.ts` | `src/theme/**`, `src/components/**` |
| 2′ | `feat/tb-19/supabase-env-rls` (starts when a worker frees up) | `supabase/**`, `src/lib/env.ts`, `src/lib/supabase.ts`, `.env.example` | `src/db/**` |
| 3 | `feat/tb-18/app-shell` | `app/(tabs)/**`, `app/task/[id].tsx`, `app/_layout.tsx` | — |
| 4 | `feat/tb-20/email-otp-sign-in` | `app/(auth)/**`, `src/features/auth/**` | — |

**Hotspots and coordination rules (Wave 1):**
1. `package.json` / `pnpm-lock.yaml`: all of step 2 adds dependencies. **Never hand-merge the lockfile.** Rebase on `main` and run `pnpm install` to regenerate it.
2. `babel.config.js` / `metro.config.js`: TB-17 (NativeWind) and TB-21 (Drizzle needs the `.sql` inline-import plugin and the metro `sql` extension) both edit them. **Merge order: TB-17 first, then TB-21 rebases.**
3. `app/_layout.tsx`: TB-17 may add a ThemeProvider and TB-18 owns the layout. TB-17 exports a provider only. TB-18 wires it in.
4. Merge order for step 2: **TB-16 → TB-17 → TB-21 → TB-19**. CI comes first so the other PRs run against it.

### Wave 2

| Step | Worktrees (parallel) | Owns | Note |
|---|---|---|---|
| 1 | `feat/tb-22/ai-gateway`, `feat/tb-26/task-crud` | gateway: `supabase/functions/ai-gateway/**`, `packages/schemas/**` · tasks: `src/features/tasks/**` | Independent stacks |
| 2 | `feat/tb-23/ai-rate-limits`, `feat/tb-24/ai-output-schemas`, `feat/tb-27/today-inbox-screens` | each its own middleware file / schema / screen | **TB-22 must define a middleware-pipeline contract** so TB-23 and TB-25 each add one file plus one registration line |
| 3 | `feat/tb-25/prompt-injection-hardening`, `feat/tb-28/task-detail` | | TB-25 rebases after TB-23 (same request-guard stage) |

**Cross-cutting rules (all waves):**
- **Drizzle migrations:** only one open branch may generate a local SQLite migration at a time. A later branch rebases and runs `pnpm db:generate` again. Never renumber migrations by hand.
- **Supabase migrations:** timestamped, so they rarely collide. Every new table still needs RLS plus a `supabase/tests` test in the same PR.
- **`packages/schemas`:** a shared contract. A change there requires every consumer's tests to pass in that PR.

### Waves 3–6

Batches are listed in the tables above. Worktree assignments will be fixed when each wave is re-planned at its entry gate, because most of these stories are still `Draft`.

## Entry / exit criteria per wave

| Wave | Delivers | Entry criteria | Exit criteria (all required) |
|---|---|---|---|
| 1 | Bootable app, CI, design system, Supabase baseline, sign-in | This plan approved | All 7 tickets Done in Jira. PRs merged with green CI. A fresh clone boots on iOS and Android. RLS baseline test passes. Sign-in → restart → still signed in, demonstrated on a device or simulator |
| 2 | AI gateway with guardrails; tasks CRUD, Today and Inbox | Wave 1 exit met; TB-22..28 still `Ready` | Gateway rejects unauthenticated calls, rate-limits, validates output (tests). Injection test set passes. CRUD works offline (local DB). **Integration check:** app → gateway call with a real JWT on staging |
| 3 | AI quick-add, breakdown, daily plan, Sentry, beta builds, eval harness | Wave 2 exit; Draft stories promoted to Ready with AC reviewed | `pnpm eval` baseline stored and CI gate active. TestFlight/Play internal build installed. Undo for AI-created tasks verified |
| 4 | Reminders, sync, lists, recurring, check-ins, onboarding, E2E, privacy | Wave 3 exit; stories Ready | Two-device sync conflict tests pass. Maestro critical flows green in CI. Export and account deletion verified end to end. Privacy policy published |
| 5 | Buddy chat, voice, photo, weekly review, a11y, perf, **store submission** | Wave 4 exit | AI never changes data without confirmation (tests and E2E). Media consent and auto-delete verified. Store submission approved by a human (release gate) |
| 6 | Shared spaces, realtime, @buddy agent, audit log, billing, extras | Wave 5 exit | Cross-user RLS isolation tests pass. Agent scopes enforced on the server (tests). Every agent action audit-logged. RevenueCat webhook verified in sandbox |

**Every wave also requires:** integrated `main` passes `pnpm lint && pnpm typecheck && pnpm test` (plus `pnpm eval` from Wave 3, plus `pnpm e2e` from Wave 4). Each ticket has `docs/tickets/TB-###/verification.md`. No open blocking review findings. Jira statuses match merged PRs (run `/wave-status`).

## Problems found

- **None in the graph:** no cycles, backward dependencies or dangling links. All 67 stories have acceptance criteria in Jira.
- **Data discrepancies** (sprints, story points, readiness): see the [reconciliation report](reconciliation-2026-10-27.md#discrepancies). None of them changes the wave order.

## Judgement calls (please read)

1. **Eval baseline vs. AI tickets before TB-39.** The Definition of Done says "AI eval baseline not regressed", but the eval harness (TB-39) lands in Wave 3, after the AI tickets TB-22..25 (Wave 2) and TB-29..31/34 (Wave 3). **Proposal:** each earlier AI ticket commits its golden examples to `evals/` (as JSON) and verifies them by hand. TB-39 then turns them into the stored baseline. No wave change.
2. **Privacy policy (TB-54) vs. beta builds (TB-38).** External beta testers will send task text to an AI provider, and store beta programmes may ask for a privacy-policy URL. **Resolved 2026-10-27:** TB-54 moved to Wave 3 and linked `TB-54 blocks TB-38` in Jira.
3. **Guardrails ship with their feature.** TB-59 (media limits and consent) must not be released before TB-57/TB-58 (voice/photo). TB-75 (agent audit log) must not be released before TB-74 (shared agent). They are already in the same wave and linked, but **release gating** applies: no beta or OTA update ships the feature without its guardrail.
4. **Parallelism cap of 3** for Waves 1–2, though Wave 1 step 2 has 4 eligible tickets. TB-19 waits for a free worker. This trades about half a day for less merge-conflict risk while there is still no code. It can be raised once CI exists.

## What applying would change in Jira

**Applied 2026-10-27 (verified by re-reading Jira):**
- Story point estimates set on all 67 stories from their `pts-N` labels (total 279).
- `ready` label added to the 18 Ready stories (TB-15..TB-32).
- TB-54: `wave-4` → `wave-3`. Link created: `TB-54 blocks TB-38`.

Status transitions happen per ticket during `/implement-ticket`, not here.

## Decisions

| Date | Decision | Decided by |
|---|---|---|
| 2026-10-27 | Wave plan approved as written | Project owner |
| 2026-10-27 | Judgement call 1: AI tickets before TB-39 commit golden examples and verify them by hand | Project owner (accepted recommendation) |
| 2026-10-27 | Judgement call 2: TB-54 moves to Wave 3 and blocks TB-38 | Project owner (accepted recommendation) |
| 2026-10-27 | Sprints: Jira wins. All 67 stories were placed in the active `TB Sprint 1` (2026-10-27 → 11-10) by the owner on the board. Workbook sprint dates are superseded | Project owner |
| 2026-10-27 | Readiness marker: `ready` label | Project owner (accepted recommendation) |
