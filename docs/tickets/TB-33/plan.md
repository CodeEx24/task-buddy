# TB-33 — Implementation plan

> Jira: https://stratyge.atlassian.net/browse/TB-33 · Spec: [spec.md](spec.md)
> Bar: an engineer who has never seen the conversation could implement the change from this plan alone.

## Branch & worktree
`feat/tb-33/work-hours-capacity` (Orca worktree `tb-33-work-hours`, from main @ 8fe154d with TB-32) · Owns: `packages/schemas/src/planning*.ts`, `src/features/plan/`, `src/features/settings/{preferences,components,registry}` (new files + registry entries), `src/components/ui/Stepper*`, `docs/tickets/TB-33/` · Must not edit: the Settings screen, `src/app/` routes, `.github/workflows/` · Shared files: `packages/schemas/README.md` (one table row; TB-24's PR also edits it, resolve by keeping both rows), `src/components/ui/index.ts` (one export).

## Dependencies
Blocked by TB-32 (Done in Jira, checked 2026-10-28). Consumer: TB-34 (AI daily plan), TB-51 (onboarding).

## Tasks
### Task 1 — Shared schema
- [x] `packages/schemas/src/planning.ts`: clock-time, work-hours and planning-constraints schemas, defaults, helpers, messages.
- Verify: `packages/schemas/src/planning.test.ts` (valid 9–17/5 h, default valid, end before/equal start on `end`, capacity over span on `capacityMinutes`, off-step/12-hour/unknown-key rejected, helpers).

### Task 2 — Preference + planner accessor
- [x] `preferences/planning.ts` (`planner.constraints`), add to `PREFERENCES`.
- [x] `src/features/plan/planning-constraints.ts` (`getPlanningConstraints`), `hooks/use-planning-constraints.ts`.
- Verify: `src/features/plan/planning-constraints.test.ts` (defaults with nothing stored; save 9–17/5 h and read back; invalid writes throw; invalid stored row → defaults); `define-preference.test.ts` registry test.

### Task 3 — Stepper primitive
- [x] `src/components/ui/Stepper.tsx` (+ export), built from `Button`.
- Verify: `Stepper.test.tsx` (value + labels, clamp, disabled at bound, 44 pt).

### Task 4 — Work hours page
- [x] `components/WorkHoursSettings.tsx` (RHF + `zodResolver`, full re-validate on each change, explicit Save, save error).
- [x] Append `work-hours` to `SETTINGS_PAGES`.
- Verify: `WorkHoursSettings.test.tsx` (defaults; save 9–17/5 h → accessor and `usePlanningConstraints`; end before start inline error, not saved, clears; end = start; capacity over span blocked then fixed and saved; restore after restart; write failure); `settings-routes.test.tsx` "Settings → Work hours page from the registry …"; `pages.test.ts`.

### Task 5 — Docs and gates
- [x] intent, spec, plan, verification; `packages/schemas/README.md` row.
- Verify: `pnpm lint && pnpm typecheck && pnpm test --ci --maxWorkers=1`, `pnpm exec drizzle-kit check`, `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-33/work-hours-capacity --pr`.

## Test strategy
| AC | Test (layer) | File |
|---|---|---|
| AC1 | Save 9–17/5 h → `getPlanningConstraints` and `usePlanningConstraints` (component + DB); route test through `/settings` → `/settings/work-hours` | `WorkHoursSettings.test.tsx`, `planning-constraints.test.ts`, `settings-routes.test.tsx` |
| AC2 | End before start / equal → inline error, nothing stored (component); schema issue on `end` (unit) | `WorkHoursSettings.test.tsx`, `planning.test.ts` |
| AC3 | No row → defaults on page and accessor; invalid row → defaults | `WorkHoursSettings.test.tsx`, `planning-constraints.test.ts`, route test |
| AC4 | Full suite, lint, typecheck, drizzle, docs gate; independent reviewer | `verification.md` |

No E2E (Maestro) flow: not a critical path yet; device check by the coordinator.

## Risks & rollback
- Pure addition (new key, new page, new primitive); no migration. Rollback = revert the PR; a stored `planner.constraints` row is then ignored (no reader).
- Merge with TB-24 (PR #24): `packages/schemas/README.md` table row conflict only.
- Dev-bundle slowness on device (TB-32 finding: all tabs stay mounted) may make Save feel slow on the emulator; judge on a `--no-dev` bundle.
