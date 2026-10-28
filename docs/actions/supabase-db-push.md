# Push the database migration to Supabase

> Related: TB-19 (https://stratyge.atlassian.net/browse/TB-19) | Wave 1 | PR #12
> Status: Open · Created by: Claude Code on 2026-10-28

## Purpose
TB-19 adds the first database migration: the `profiles` table, protected by Row Level Security so each user sees only their own row. CI already proved it works, but on a throwaway database. Your two real projects don't have the table yet; on 2026-10-28 both answered "Could not find the table 'public.profiles'".

Claude can't push it for you: your Task Buddy projects are in a Supabase organization that Claude's tools can't reach, and pushing needs each project's database password, which should never go into chat.

This unblocks TB-20 (email sign-in), which writes to `profiles`.

## Prerequisites
- The repo on `main` (after PR #12 merges), in a terminal at the repo root.
- Your Supabase account (the one that owns `taskbuddy-dev` and `taskbuddy-staging`).
- Each project's **database password**, from your password manager (names only here, never values).
- Project refs (not secret):
  - dev: `wsmjplylzphwecxlbbbv`
  - staging: `lqjofqtxhrkdsefupkfp`

## Steps
1. Log in to the Supabase CLI. This opens a browser and stores a token on your machine only:
   ```bash
   npx supabase@2.122.0 login
   ```
2. Push to **dev**:
   ```bash
   npx supabase@2.122.0 link --project-ref wsmjplylzphwecxlbbbv
   npx supabase@2.122.0 db push
   ```
   When it asks for the database password, type it (don't paste it into chat). When it asks to apply `20261028120000_profiles_rls_baseline.sql`, answer `Y`.
3. Push to **staging**:
   ```bash
   npx supabase@2.122.0 link --project-ref lqjofqtxhrkdsefupkfp
   npx supabase@2.122.0 db push
   ```
4. Tell Claude "db push done".

## Expected result
Both projects have a `public.profiles` table with RLS enabled. In the Supabase dashboard, **Table Editor → profiles** shows the table, and **Authentication → Policies** shows `profiles_select_own` and `profiles_update_own`.

## Verify
Claude checks each project with its publishable key (no secrets). The REST call `GET /rest/v1/profiles?select=id&limit=1` should change from `404` ("Could not find the table") to `200` with `[]`. The result is empty because RLS hides every row from an anonymous caller.

## Completion checklist
- [ ] `supabase login` done
- [ ] dev: `db push` applied `20261028120000_profiles_rls_baseline.sql`
- [ ] staging: `db push` applied it
- [ ] Claude told, and Claude's check shows `200 []` on both
- [ ] Status above set to Done

## If it fails
- **`link` says the project isn't found:** you're logged in to a different Supabase account. Run `npx supabase@2.122.0 logout`, then `login` with the account that owns Task Buddy.
- **Password rejected:** reset it in *Project Settings → Database → Reset database password*, save the new one in your password manager, and retry.
- **"Remote database's Postgres version differs":** tell Claude the version shown in *Project Settings → Infrastructure*. `supabase/config.toml` assumes 17.
- **Migration error:** don't edit the SQL. Copy the error text (it contains no secrets) to Claude.
