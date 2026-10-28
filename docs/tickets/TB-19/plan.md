# TB-19 — Implementation plan

> Jira: https://stratyge.atlassian.net/browse/TB-19 · Spec: [spec.md](spec.md) · Intent: [intent.md](intent.md)
> Status: **Accepted** by the owner on 2026-10-28 (spec D1–D4 answered). Tasks 1–6 built; Task 7 waits on the owner action.
> Bar: an engineer who has never seen the conversation could implement the change from this plan alone.

## Branch & worktree
`chore/tb-19/supabase-baseline` · Orca worktree `tb-19-supabase-baseline` · Merge order: last in Wave 1 batch B (TB-16 → TB-17 → TB-21 → TB-19). The wave plan's suggested name was `feat/tb-19/supabase-env-rls`; the coordinator created `chore/…` (valid per CLAUDE.md §5).

- **Owns:** `supabase/**`, `src/lib/env.ts`, `src/lib/supabase.ts`, `src/lib/database.types.ts` (D5), `.env.example`, `docs/tickets/TB-19/**`, `docs/actions/supabase-projects.md`, `scripts/check-bundle-secrets.mjs` (+ its test).
- **Shared (coordinator OK needed, minimal diff):** `package.json` / `pnpm-lock.yaml` (add `@supabase/supabase-js`, `zod`; regenerate the lockfile with `pnpm install`, never hand-merge), `.github/workflows/ci.yml` (two new jobs; the existing `ci` job is not changed), `eas.json` (`environment` per profile), `.prettierignore` / `eslint.config.js` (ignore the generated types), `.gitattributes` (LF for the generated file), `docs/actions/README.md` (one table row).
- **Must not edit:** `src/db/**` (TB-21), `src/theme/**`, `src/components/**`, `src/app/**`, `packages/schemas/**`.

## Dependencies
Blocked by: TB-15 (Done). Owner action [`docs/actions/supabase-projects.md`](../../actions/supabase-projects.md) must be finished before Task 7 (real-environment check); Tasks 1–6 need **no** Supabase project and no secrets. Re-check Jira status and the `ready` label at dispatch.

## Tasks

### Task 1 — Supabase project scaffold (local files only)
- [ ] `npx supabase@2.122.0 init` in the repo root (purely local: creates `supabase/config.toml` and `supabase/.gitignore`; decline the editor-settings prompts). Keep the existing `README.md` files.
- [ ] `config.toml`: `project_id = "task-buddy"`; `[db] major_version` matching the hosted projects (read from the dashboard after the owner action; default from `init` until then); `[auth] site_url` / redirect URLs left for TB-20.
- [x] `supabase/.gitignore` (`.branches`, `.temp`) added in the design commit: `supabase/.temp/cli-latest` is the CLI's version-check cache, written by any `npx supabase …` run. If `init` wants to overwrite it, keep the existing entries.
- **Verify:** `git status` shows only `config.toml` + `.gitignore`; `npx supabase@2.122.0 --help` runs from the repo root without errors.

### Task 2 — Migration: `profiles` + RLS baseline (+ rollback)
- [ ] `npx supabase@2.122.0 migration new profiles_rls_baseline` → write the SQL from spec "Data changes": table, RLS, revokes/grants, two policies, `public.set_updated_at()` + trigger, `public.handle_new_user()` (`security definer`, `set search_path = ''`) + `on_auth_user_created` trigger.
- [ ] `supabase/rollback/<same-ts>_profiles_rls_baseline.down.sql`: drop trigger(s), functions, policies, table — reverse order, `if exists`.
- [ ] Update `supabase/migrations/README.md`: naming, "RLS + test in the same PR", the rollback-folder convention.
- **Verify:** runs in CI only (Task 4). Second-model review of the SQL (AGENTS.md routing: RLS = top-tier + second pass).

### Task 3 — pgTAP tests
- [ ] `supabase/tests/database/rls_enabled.test.sql`: `create extension if not exists pgtap with schema extensions;` `plan(1)`; `is_empty($$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity $$, …)`.
- [ ] `supabase/tests/database/profiles_rls.test.sql`: `begin; plan(N)`; insert users A and B into `auth.users`; `set local role authenticated; set local request.jwt.claims = '{"sub":"<A>","role":"authenticated"}'`; assertions from spec AC2 (B's row → zero rows; own row → one; update B → zero rows; insert for B → `throws_ok … '42501'`; update own `id` → permission error); `reset role; set local role anon` → zero rows / denied; `select * from finish(); rollback;`.
- [ ] Update `supabase/tests/README.md` (how to run: `supabase test db`; CI job name).
- **Verify:** `supabase` CI job green; then a **negative run**: a temporary commit that drops `profiles_select_own`'s `using` clause to `true` must turn the job red (recorded in `verification.md`, then reverted).

### Task 4 — CI job `supabase` (tests + type drift + rollback)
- [ ] In `.github/workflows/ci.yml`, add job `supabase` (`ubuntu-latest`, `timeout-minutes: 10`, `permissions: contents: read`): checkout → `supabase/setup-cli@v1` with `version: 2.122.0` → `supabase db start` → `supabase test db` → `supabase gen types typescript --local --schema public > src/lib/database.types.ts` → `git diff --ignore-space-at-eol --exit-code src/lib/database.types.ts` (on failure: print diff and `actions/upload-artifact` the file) → apply the rollback SQL with `psql` (connection string from `supabase status -o env`) and assert `to_regclass('public.profiles') is null`.
- [ ] Commit the first generated `src/lib/database.types.ts` (download the CI artifact on the first run, since it can't be generated locally on this machine).
- [ ] `.prettierignore` + `eslint.config.js` ignore the generated file; `.gitattributes`: `src/lib/database.types.ts text eol=lf`.
- **Verify:** job green on the PR; negative run: add a column to the migration without regenerating → job red with the diff (recorded, reverted). Record job duration.

### Task 5 — `src/lib/env.ts` + `src/lib/supabase.ts` (TDD)
- [ ] `pnpm add @supabase/supabase-js zod` (check current versions and RN compatibility in the docs first; URL polyfill only if the docs still require it).
- [ ] Tests first, `src/lib/env.test.ts`: valid dev/staging/prod inputs; each missing var named in `EnvError.issues`; `http:` URL rejected outside development; `sb_secret_…` rejected; a service-role-shaped JWT rejected; legacy anon JWT rejected (wrong prefix); error message contains no input values.
- [ ] `src/lib/env.ts` per spec contract; static `process.env.EXPO_PUBLIC_*` reads only.
- [ ] `src/lib/supabase.ts`: lazy memoized `getSupabaseClient()` → `createClient<Database>(…, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })`. Test: the client is created once; nothing is created at import time.
- [ ] `src/lib/no-secrets.test.ts` (static guard): walks `src/**/*.{ts,tsx}`; fails on `process.env.<name>` where `<name>` isn't `EXPO_PUBLIC_*` / `NODE_ENV`, or on `SERVICE_ROLE`, `SECRET_KEY`, `sb_secret_`.
- [ ] `.env.example`: the three variable names with placeholder text (`https://<project-ref>.supabase.co`, `sb_publishable_<from-dashboard>`), comment pointing to `eas env:pull`.
- [ ] `eas.json`: `"environment": "development" | "preview" | "production"` on the three profiles.
- **Verify:** `pnpm lint && pnpm typecheck && pnpm test` green locally (no Metro needed).

### Task 6 — Bundle secret scan (CI job `bundle`)
- [ ] `scripts/check-bundle-secrets.mjs <dir>`: recursive scan; rules from spec AC1; prints file + rule, **never the matched value** (prints a redacted 8-char prefix only); exit 1 on any hit.
- [ ] `scripts/check-bundle-secrets.test.mjs` (or `.test.ts` under Jest): fixtures in a temp dir — clean passes; `sb_secret_x…` fails; a JWT with `{"role":"service_role"}` fails; a JWT with `{"role":"anon"}` passes.
- [ ] CI job `bundle` (`timeout-minutes: 10`): checkout → pnpm/node → install → `npx expo export --platform android --platform ios --output-dir dist-bundle-check` with env `EXPO_PUBLIC_APP_ENV=development`, `EXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_dummy`, and canary `SUPABASE_SECRET_KEY=sb_secret_TB19CANARY_not_a_real_key` → `node scripts/check-bundle-secrets.mjs dist-bundle-check`.
- **Verify:** job green; negative run: temporarily reference `process.env.EXPO_PUBLIC_LEAK_TEST` set to `sb_secret_…` in a source file → job red (recorded, reverted). Never run `expo export` on the owner's machine (memory).

### Task 7 — Real-environment check (after the owner action)
- [ ] Owner has finished `docs/actions/supabase-projects.md` (projects per D1, EAS variables, migrations pushed to dev/staging).
- [ ] Agent reads back **names only**: `npx eas-cli env:list --environment development` / `preview` / `production` shows the three `EXPO_PUBLIC_*` names (values are plaintext and public; don't paste them into docs or chat anyway).
- [ ] Owner (or agent with an explicit go) runs `npx supabase@2.122.0 db push` against dev, then staging (needs the DB password, typed by the owner).
- [ ] Optional smoke test on dev: with two test users created in the dev dashboard, a Node script using the publishable key signs in as A and selects B's profile → `[]`. Delete the test users after.
- **Verify:** recorded in `verification.md` (names, not values; push output; smoke result).

### Task 8 — Docs, review, PR
- [ ] `verification.md` (commands, CI run links and durations, AC table, negative runs, review findings).
- [ ] Self-review against `REVIEW.md`; independent reviewer subagent; **security pass** (`security-review`); second top-tier pass on the SQL/RLS.
- [ ] Owner adds `supabase` and `bundle` as required checks on `main` (action guide step 9).
- [ ] Jira: follow-up issues — (1) migration deploy pipeline (`db push` to staging on merge, prod on release), (2) create prod project at TB-38 if D1 = (b).

## Test strategy
| AC | Test (layer) | File |
|---|---|---|
| AC1 env injection | Unit: `parseEnv` valid/invalid cases | `src/lib/env.test.ts` |
| AC1 no service-role key | CI bundle scan with canary + scanner fixture tests + static guard | job `bundle`, `scripts/check-bundle-secrets.test.mjs`, `src/lib/no-secrets.test.ts` |
| AC1 three projects | Read-back of EAS variable names per environment; dashboard check by owner | `verification.md` (Task 7) |
| AC2 RLS zero rows | pgTAP | `supabase/tests/database/profiles_rls.test.sql` |
| AC2 baseline | pgTAP | `supabase/tests/database/rls_enabled.test.sql` |
| AC3 types + drift | CI `supabase` job diff step + typed client in `pnpm typecheck` | `.github/workflows/ci.yml` |
| AC4 done gates | `pnpm lint && pnpm typecheck && pnpm test`, all CI jobs green | `verification.md` |

## Risks & rollback
| Risk | Detect | Mitigation / rollback |
|---|---|---|
| `supabase db start` slow or flaky on runners | Job duration > 5 min, intermittent failures | Cache Docker images later; job is separate so `ci` stays under 8 min |
| `supabase test db` needs more than Postgres (e.g. a missing image) | First CI run | Fall back to `supabase start -x` with everything excluded except what the error names; record as deviation |
| `expo export` in CI exceeds 10 min | Job duration | Export one platform per job (matrix), or android only + document |
| Generated types differ between CLI versions | Drift failures after a CLI bump | CLI version pinned in CI and in docs; bump deliberately with a regenerated file |
| Owner can't create 3 projects on Free | Dashboard refuses the third | D1 decision; deviation recorded |
| Bad RLS reaches a hosted project | Tests are the gate before `db push`; pushes are manual in TB-19 | Apply the rollback SQL; projects hold no real user data yet |
| New deps conflict with TB-21 / TB-24 lockfile changes | Rebase conflict | Rebase, `pnpm install`, never hand-merge |

Whole-ticket rollback: revert the squash commit; run the rollback SQL on any project the migration was pushed to; delete the EAS variables (`eas env:delete`) if the projects are abandoned.
