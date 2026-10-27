# TB-19 — Intent

> Jira: https://stratyge.atlassian.net/browse/TB-19 · Blueprint: US-005 · Wave 1 (batch B) · Risk: **High** (auth, RLS, secrets)
> Status: **Draft — awaiting owner acceptance**

## Problem
The app has no backend yet. Every later backend ticket (TB-20 email OTP, TB-22 AI gateway, TB-43 sync, TB-68 shared spaces) needs a Supabase project to talk to, a safe way to give the app its URL and public key, and a database whose default posture is "deny unless a policy allows it". Without that baseline, the first table or the first key would set the pattern, and a mistake there (a table without RLS, a secret key in the bundle) is expensive to undo once real users exist.

## Desired outcome
- Separate Supabase environments for development, staging and production. Each EAS build profile gets the matching URL and public (publishable) key from **EAS environment variables**. Nothing is hard-coded in the repo.
- The app reads those values through one validated module (`src/lib/env.ts`, Zod). A missing or malformed value fails fast with a clear message instead of a half-working client.
- A **check proves** that no Supabase secret / service-role key ends up in the client bundle.
- The first table, `public.profiles`, ships with RLS and an automated test showing that user A can't read user B's profile row. A second test asserts that **every** table in `public` has RLS enabled, so later tickets can't forget it.
- TypeScript types for the database are generated from the migrations, committed, and CI fails when they drift.

## Affected users
- Developers and agents on every later backend ticket (they inherit the env module, the Supabase client, the migration and test layout, and the CI job).
- End users indirectly: their profile data is isolated from other users from the first commit.
- The owner: creates the Supabase projects and sets EAS / GitHub secrets (an owner action, see `docs/actions/supabase-projects.md`).

## Constraints
- **No secrets client-side** (CLAUDE.md §4). Only `EXPO_PUBLIC_*` values reach the bundle, and they must be non-secret: the project URL and the publishable key. The secret key (legacy name: `service_role`) never appears in `src/`, `app.json`, EAS env for app builds, or the bundle.
- **Every Postgres table has RLS** plus a test in `supabase/tests` (AGENTS.md).
- Supabase legacy `anon` / `service_role` keys stop working **at the end of 2026** (Supabase docs, "Migrating to publishable and secret API keys", read 2026-10-27). New work uses the publishable key (`sb_publishable_…`) in place of `anon`.
- Free plan: **two active free projects** per organization; free projects can pause when inactive. Three always-on projects need the Pro plan (see Decision D1).
- The owner's machine is low on memory: no local Docker / `supabase start`. Database tests and type generation must run in **GitHub Actions**.
- Creating projects, logging in and setting secrets are owner actions. Agents never handle key values.
- Wave plan owned paths: `supabase/**`, `src/lib/env.ts`, `src/lib/supabase.ts`, `.env.example`. Shared files touched: `package.json` / lockfile (new deps), `.github/workflows/ci.yml` (new job), `eas.json` (`environment` per profile). These need the coordinator's OK (see plan).

## Out of scope
- Sign-in UI, session storage (SecureStore), deep links: TB-20.
- Edge Functions and their secrets: TB-22.
- Sync tables (tasks etc.) and their RLS: TB-43. Shared-space RLS: TB-68.
- Migration deploy pipeline (`supabase db push` from CI to staging/prod): a follow-up ticket (proposed in plan).
- Sign in with Apple / Google provider config: TB-50.

## Open questions
| # | Question | Why it matters | Answer (who, date) |
|---|---|---|---|
| 1 | Three projects now (Pro plan, ≈ $45/month per Supabase's own example) or dev + staging on Free now and prod later? (spec D1) | Cost, and whether AC1 is met in full now | |
| 2 | Run RLS tests and type generation in GitHub Actions with an ephemeral local database (Docker on the runner)? (spec D2) | Where the security test actually runs; no secrets needed in CI | |
| 3 | Use the new publishable key (`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) instead of the legacy anon key the AC names? (spec D3) | Legacy keys are retired end of 2026 | |
| 4 | Region for the projects? (spec D4) | Latency for users; can't be changed after creation | |
