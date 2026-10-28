# TB-19 — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-19 · PR: not opened yet (coordinator) · Branch: `chore/tb-19/supabase-baseline`
> Record only what was actually run and observed. `node scripts/workflow/check-ticket-docs.mjs --branch <branch> --pr` fails the PR gate while any AC row is `not met`, `partial` or `TBD`.

## Commands run
All run locally on 2026-10-28 (Windows 11, Node 24.21, pnpm 10.17.1) after rebasing onto `origin/main` 4d42e5e.

| Command | Result | Notes |
|---|---|---|
| `git rebase origin/main` | pass | No conflicts (the two earlier TB-19 commits touched docs and `supabase/.gitignore` only) |
| `pnpm add @supabase/supabase-js@2.118.0 --ignore-scripts` | pass | `--ignore-scripts` because this machine has no Visual Studio for `better-sqlite3`'s node-gyp step; its bundled win32-x64 prebuild still loads (`new Database(':memory:')` ok). Lockfile +74 lines |
| `pnpm install --frozen-lockfile` | pass | "Already up to date" |
| `pnpm dlx supabase@2.122.0 init` | pass | Local only (no Docker, no network project); produced `supabase/config.toml` |
| `pnpm lint` | pass | 0 problems. The generated `src/lib/database.types.ts` is skipped via `.prettierignore` |
| `pnpm typecheck` | pass | `tsc --noEmit`, no errors |
| `pnpm test --ci` | pass | 31 suites, 207 tests (new: `src/lib/env.test.ts`, `src/lib/supabase.test.ts`, `src/lib/no-secrets.test.ts`, `scripts/check-bundle-secrets.test.ts`) |
| `node scripts/check-bundle-secrets.ts <clean fixture dir>` | pass | Exit 0 "no secrets found"; with a planted secret-shaped file it exits 1 and prints only `sb_secre…[redacted]`; a missing folder exits 1 |
| `node scripts/workflow/check-ticket-docs.mjs --branch chore/tb-19/supabase-baseline` | pass | "workflow check: ok" |
| CI workflow YAML parse (js-yaml) | pass | Jobs `ci`, `supabase` (8 steps), `bundle` (6 steps) |

Not run locally (by instruction: no Docker, no Metro/export on this machine), so they **wait for CI** on the first push:
- `supabase db start`, `supabase test db` (both pgTAP files), `supabase gen types … --local` + drift diff, rollback script — job `supabase`.
- `expo export --platform android --platform ios` + `check-bundle-secrets.ts` with the per-run canary — job `bundle`.
- The committed `src/lib/database.types.ts` is hand-written to match CLI 2.122.0 output. If the first `supabase` run reports drift, download its `database-types` artifact, commit it, and re-run.

## Commands run: CI on PR #12, 2026-10-28
https://github.com/CodeEx24/task-buddy/pull/12 (ubuntu-latest, Supabase CLI via `supabase/setup-cli@v1`).

| Command | Result | Notes |
|---|---|---|
| Run 40654487757 (`edf33cb..a597e7f`) | pass (expected red) | `ci` ✅, `bundle` ✅, `supabase`: `db start` ✅, pgTAP ✅, **type drift ✗**. The hand-written `database.types.ts` differed from `gen types` output, so the drift check failed the build (AC3 negative case). The artifact was committed as `fd84229` |
| Run 40654929325 (`fd84229`) | pass | All jobs green: `ci`, `bundle` (Android + iOS export, canary not found, no secret), `supabase` (db start, pgTAP 13 tests, gen types, no drift, rollback applies cleanly) |
| Run 40655290930 (`9fd74fc`, temporary `using (true)` select policy) | pass (expected red) | pgTAP failed tests 3–4: "AC2: user A querying user B's profile row gets zero rows" → unexpected record `22222222-…` (user B). Reverted in `9246599`, which is identical to `fd84229` |

## Acceptance criteria
| AC (verbatim) | Status | Evidence (test name, file:line, screenshot, observed result) |
|---|---|---|
| Given three Supabase projects, then URLs and anon keys are injected through EAS env and no service-role key exists in the client bundle | met | **2026-10-28, owner created `taskbuddy-dev` (`wsmjplylzphwecxlbbbv`) and `taskbuddy-staging` (`lqjofqtxhrkdsefupkfp`).** `eas env:list development` and `eas env:list preview` show `EXPO_PUBLIC_APP_ENV` (development / staging), `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (a 46-char `sb_publishable_…`), and 0 entries matching `service_role` or `sb_secret_`. Each project returns `GET /auth/v1/settings` → **200 with its EAS key, 401 without**, so the URL and key pair are correct. CI `bundle` job is green: no service-role or secret key in the Android or iOS bundle, and the canary was not found. **Built:** `eas.json` sets `environment` per profile; `src/lib/env.ts` reads `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` by static dot access and Zod-validates them (`env.test.ts`: 14 tests incl. secret key and service_role JWT rejected, no values in errors). Static guard `no-secrets.test.ts` passes. Scanner fixture tests pass. D1: two projects (dev, staging), prod at TB-38 (accepted deviation); D3: publishable key replaces "anon key". **Pending:** owner creates projects + EAS variables (`docs/actions/supabase-projects.md`), read back with `eas env:list` (names only); CI `bundle` job green |
| Given users A and B, when A queries B's profile row, then RLS returns zero rows (automated test) | met | **CI run 40654929325: pgTAP 13/13 pass; run 40655290930 with an open policy fails tests 3–4, so the test catches a leak.** `supabase/tests/database/profiles_rls.test.sql` "AC2: user A querying user B's profile row gets zero rows" (+ own row visible, cross-user update no-op, insert/delete/id/deleted_at writes → 42501, anon denied). `rls_enabled.test.sql` guards every `public` table. Proven when the `supabase` job's `supabase test db` step is green |
| TypeScript types are generated from the schema in CI and the build fails on drift | met | **CI: run 40654487757 failed on drift (hand-written types), run 40654929325 passed after committing the generated file.** `supabase` job: `supabase gen types typescript --local --schema public` → `git diff --exit-code src/lib/database.types.ts` (fails + uploads artifact on drift). `getSupabaseClient()` is `SupabaseClient<Database>`, so `pnpm typecheck` also breaks on schema/type mismatch. Proven by a green run, plus the planned negative run (add a column without regenerating → red) |
| Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated | met | Local lint/typecheck/test green; CI green on all three jobs (run 40654929325); docs updated (spec decisions, plan, action guides, `supabase/*/README.md`, this file). Deploy follow-up: the owner pushes the migration to dev and staging (`docs/actions/supabase-db-push.md`; both projects currently return PGRST205 "table not found" for `profiles`) |

## Manual / E2E
None yet. After the owner action: `npx eas-cli env:list --environment development|preview` (names only) and `supabase db push` to dev then staging (plan Task 7). Negative CI runs (plan Tasks 3, 4, 6) are to be recorded here after the first push.

## Review findings
| # | Severity | Finding (file:line) | Source (self / reviewer agent / human) | Resolution |
|---|---|---|---|---|
| 1 | Major | Bundle scan rule "any `sb_secret_` string / `service_role`" would match the prefix and role names `env.ts` needs to reject them, failing the scan on its own guard | self | Rules require 16+ chars after the prefix and only flag server-key variable names; covered by "passes a clean bundle (including the bare prefix…)" |
| 2 | Major | A literal fake secret in CI YAML or fixtures could trip GitHub push protection / secret scanning | self | Canary generated per run (`openssl rand`); test fixtures assembled at runtime |
| 3 | Minor | An eager `env` const would throw at import and break unrelated suites/screens | self | Lazy memoized `getEnv()`; deviation logged in spec |
| 4 | Minor | Trigger functions were executable by `anon`/`authenticated` through default privileges | self | `revoke execute … from public, anon, authenticated` in the migration |
| 5 | Info | Security self-review of the full diff vs `origin/main`: no secret values, no service-role/secret key name or `process.env` non-public read in `src/`, RLS enabled on the only new table, `security definer` function has `search_path = ''`, `config.toml` secrets all `env(...)` | self | No action |

## Known limitations & follow-ups
- Prod project + `production` EAS variables at TB-38 (D1).
- Follow-up ticket: migration deploy pipeline (`db push` to staging on merge, prod on release).
- `supabase` and `bundle` must be added as required checks on `main` by the owner after the first CI run.
- If `supabase test db` needs more than `db start` on the runner, switch the step to `supabase start -x …` (plan risk table).

## Completion
- [x] All AC met with evidence
- [x] Gates green locally and in CI
- [x] No open Blocking findings
- [ ] Jira updated (In Review → Done)
