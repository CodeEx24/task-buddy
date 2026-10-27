# Task Buddy — Delivery Workflow (AI-native SDLC)

How work moves from a Jira ticket to production in this repo. It extends the user-level skills `/plan-waves`, `/implement-ticket`, `/verify-ticket`, `/merge-ticket` and `/wave-status`. Those skills read this file and follow it over their generic defaults.

It follows Anthropic's [AI-native SDLC playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook):
- Every stage commits an artifact the next stage reads.
- Humans own every judgement gate.
- Deterministic checks run first, and AI review is an extra layer on top.
- Parallel work runs in isolated worktrees.
- Repeated mistakes feed back into instructions, checks and hooks.

## 1. Sources of truth

| What | Owner | Notes |
|---|---|---|
| Ticket identity, AC, priority, status, dependencies, comments | **Jira** [TB](https://stratyge.atlassian.net/jira/software/projects/TB) | Site `stratyge.atlassian.net`, cloudId `db54a41b-b837-432b-b361-a2f0b8cfbe7a`. Never duplicate the backlog in the repo |
| Delivery-planning input (blueprint, sprints, data model, API contracts) | `docs/TaskBuddy_Delivery_Workbook.xlsx` | Reconciled against Jira before every plan. Discrepancies are reported, never silently resolved |
| Wave plan, worktree assignments, wave gates | `docs/waves/` | Derived from Jira. Re-generated when Jira changes |
| Intent, spec, plan, verification per ticket | `docs/tickets/TB-###/` | Every file links its Jira issue |
| Review rules | `docs/workflow/REVIEW.md` | |
| Things the human must do | `docs/actions/` | Step-by-step, no secrets |
| Code, tests, decisions, history | Git | The PR links Jira. Jira gets the PR link back |

The mapping from workbook IDs to Jira keys (`US-001` → `TB-15`) is the `Blueprint ID:` line in each Jira description.

## 2. Stages at a glance

| Stage | Run | Commits | Gate: who decides |
|---|---|---|---|
| **Plan** | `/plan-waves` | `docs/waves/wave-plan.md`, `reconciliation-<date>.md` | **Human approves the plan.** Jira is written only after an explicit go |
| **Design** | `/implement-ticket TB-###` phases 1–5 | `intent.md` → `spec.md` → `plan.md` (or a compact `README.md`) | **Human answers the open decisions and accepts the spec and plan** before code (medium/high risk) |
| **Build** | Same skill, phase 6, in an Orca worktree | Code and tests on `<type>/tb-<n>/<slug>` | None for routine work. A scope change beyond the spec goes back to the human |
| **Verify** | Phases 7–11 (+ `/verify-ticket`) | `verification.md` | Deterministic gates must be green. Independent review for medium/high risk |
| **Review / PR** | Phase 12 | PR (body restates the AC, links Jira and the ticket docs) | **Human go before push.** Merge needs human approval and green CI |
| **Merge / close** | `/merge-ticket TB-###` | Jira comment, status `Done` | Refuses on red CI or a failed deploy. `main` is protected (since TB-16): required check `ci`, branch up to date, 1 approval, linear history. A solo owner can't approve their own PR, so the owner merges with the admin bypass, or explicitly tells the agent to use `gh pr merge --squash --admin` |
| **Deploy** | EAS Build / Update / Submit | Release notes and an action guide in `docs/actions/` | **A named human authorizes every store submission and production OTA update** |
| **Maintain** | Incident or regression | New Jira bug + `docs/tickets/TB-###/intent.md` + a regression test | Same pipeline as any ticket |

## 3. Plan: `/plan-waves`

1. Read every TB issue (paginate) with: summary, issuetype, status, priority, labels, parent, issuelinks, description, `customfield_10016` (points), `customfield_10020` (sprint).
2. Save the raw JSON result to the session scratchpad, then run
   `python scripts/workflow/reconcile_workbook.py <export.json>`.
   It maps Blueprint IDs to keys and compares title, priority, wave label, parent and blockers. It checks cycles, dangling links and backward dependencies, and prints the batches inside each wave and the critical path. Exit 1 means stop and report.
3. Write `docs/waves/reconciliation-<date>.md` and update `docs/waves/wave-plan.md`. The plan includes waves, batches, worktree assignments with owned paths, conflict hotspots and merge order, per-wave entry and exit criteria, judgement calls, and the exact Jira changes that applying would make.
4. Stop for approval. Waves are expressed in Jira as `wave-N` labels. Do not invent a second convention.

## 4. Build — parallel worktrees

One **coordinator** session (where you talk to Claude) runs the wave. **Workers** are Orca worktrees with their own agent. Use the `orca-cli` skill for worktree and terminal control, and the `orchestration` skill for dispatch, `worker_done` waits and escalations. Don't hand-roll `git worktree`.

**A ticket may enter a worktree only when all of these hold:**
1. Every `is blocked by` issue is `Done` in Jira. Re-read Jira at dispatch time; the plan file is not enough.
2. The story carries the `ready` label in Jira (Definition of Ready met). If it doesn't, stop and ask; don't start it.
3. Its design artifacts are committed and, for medium/high risk, accepted by the human.
4. The wave plan gives it owned paths that no other running worker owns.

**Concurrency:** at most 3 workers until CI exists (TB-16), then up to the wave plan's limit.

**Worker brief** (the coordinator writes it; the worker reads nothing else to start):
- Jira key and URL, plus the paths to `intent.md`, `spec.md`, `plan.md`.
- **Owns:** the paths it may edit. **Must not edit:** the paths it may not touch. Shared files (`package.json`, lockfile, `babel.config.js`, `metro.config.js`, `src/app/_layout.tsx`, `packages/schemas/**`) are listed explicitly, together with the coordination rule from the wave plan.
- The gates to run, and the instruction to stop before `git push`.
- **Report format** (`worker_done` payload): changed files; gate results with the commands run; AC status table; deviations from the plan; open concerns.

**Rules for workers:**
- Stay inside the ticket and the owned paths. A needed change outside them is an escalation, not an edit.
- A design change discovered mid-build: update `spec.md` / `plan.md` with a "Deviation" note and escalate if it changes behaviour, contracts or scope.
- Lockfile conflicts: rebase and run `pnpm install`. Never hand-merge.
- Drizzle migrations: one in-flight branch at a time. Later branches rebase and regenerate.
- Don't answer your own escalations. Don't ask the human what the spec already answers.

**Integration:** the coordinator merges in the wave plan's merge order. After each merge, the remaining workers rebase and re-run their gates. When a batch finishes, the coordinator runs the full gates on `main` and records the result in the wave plan.

## 5. Risk tiers: how much ceremony

| Tier | When | Ticket docs | Review |
|---|---|---|---|
| **Low** | ≤ 2 pts and touches none of the high-risk areas below | Compact `README.md` (copy `docs/tickets/_TEMPLATE.md`) + `verification.md` | Self-review (phase 8) |
| **Medium** | Everything else | `intent.md`, `spec.md`, `plan.md`, `verification.md` (copy `docs/tickets/_template/`) | Self-review + independent reviewer subagent with fresh context, given spec + diff + `REVIEW.md` |
| **High** | Auth, RLS / Postgres policies, AI gateway, rate limits / quotas, prompt handling, sync conflict rules, agent scopes, billing, account deletion / export, migrations on synced tables | Full set; spec lists threats and abuse cases | Medium + security pass (`senior-security` / `security-review`) + top-tier model (see AGENTS.md model routing) + **human reads the spec before code** |

## 6. Jira synchronization

TB workflow (verified 2026-10-27): `To Do` →(21) `In Progress` →(2) `In Review` →(31) `Done`. Always read the transitions first; don't hard-code IDs blindly.

| Event | Jira update |
|---|---|
| Design starts | Transition to **In Progress**. Comment: link to `docs/tickets/TB-###/` on the branch |
| Human accepts spec/plan | Comment: decisions made (one line each) |
| PR opened | Transition to **In Review**. Comment: PR link, AC status, gates run, known limitations |
| PR merged + CI green | `/merge-ticket` → **Done** with a merge comment |
| Blocked | Comment with the blocker and the `docs/actions/` guide if the human must act. Status stays put |

Comments are idempotent: update or skip instead of repeating. Never report a Jira write as done without re-reading the issue.

## 7. Human actions and approvals

When the human must act (credentials, console settings, store forms, paid builds, approvals), write `docs/actions/<kebab-name>.md` from `docs/actions/_TEMPLATE.md` and link it from the Jira comment.

Ask the human (batched, with a recommendation first) whenever a choice changes behaviour, architecture, security, cost, external commitments or production. Proceed on your own for routine, reversible, low-risk work.

## 8. Definition of Done

**Ticket:**
- The CLAUDE.md §7 Done list holds.
- `docs/tickets/TB-###/verification.md` records real commands, outputs, AC evidence and review findings.
- Blocking findings are resolved.
- The PR has human approval and green CI.
- Jira shows `Done` with the PR link.
- Remaining limitations and follow-ups are recorded in the ticket docs, with new Jira issues proposed for them.

**Wave:** every ticket is Done, the wave's exit criteria in `docs/waves/wave-plan.md` are met on integrated `main`, and `/wave-status` shows no out-of-sync tickets.

## 9. Deterministic checks

| Check | Command | Runs |
|---|---|---|
| Jira ↔ workbook reconciliation, graph validity | `python scripts/workflow/reconcile_workbook.py <export.json>` | `/plan-waves` |
| Ticket docs link Jira; folder layout; action-guide structure; branch name | `node scripts/workflow/check-ticket-docs.mjs [--branch <b>] [--pr]` | Before every PR (`--pr`). Runs in CI (`ci` job) on every non-draft PR |
| Lint, typecheck, unit/integration tests | `pnpm lint && pnpm typecheck && pnpm test` | Every task (fast subset) and before every PR. CI (`.github/workflows/ci.yml`, job `ci`) on every PR and push to `main` |
| AI evals | `pnpm eval` | AI-touching PRs from TB-39. Before that, per-ticket golden examples (wave plan, judgement call 1) |
| E2E | `pnpm e2e` | Critical paths from TB-52 |

Existing hooks: `protected-paths-guard`, `secret-redactor`, `npm-to-pnpm-rewriter` (`.claude/skills/*/hooks`). Anything that must always hold belongs in a check or a hook, not only in a skill.

## 10. Feedback loop

- The same mistake twice → a rule. Put it in `REVIEW.md` or a check now, and promote it to `CLAUDE.md` at the next Epic boundary (CLAUDE.md §8).
- Repeated review findings → a new `REVIEW.md` item or a lint rule.
- An incident or regression → a Jira bug, `intent.md`, a failing test committed first, then the fix. For AI quality problems, also add a golden-set case.
- At each wave exit, write a short retro in the wave plan: what slowed the wave, what to automate next.
