# supabase/migrations

Postgres migrations, applied in filename order by the Supabase CLI (`supabase db start` / `db reset` locally and in CI, `supabase db push` to a hosted project). Owner: TB-19 (https://stratyge.atlassian.net/browse/TB-19).

Rules:
- Create files with `npx supabase@2.122.0 migration new <snake_case_name>`; never edit a migration that has been pushed to a hosted project, add a new one.
- Every table in `public` gets `enable row level security` **in the same migration**, plus own-row (or stricter) policies and a pgTAP test in `supabase/tests/database/` in the same PR. `rls_enabled.test.sql` fails CI otherwise.
- Deny by default: `revoke all ... from anon, authenticated`, then grant back only what the policies need (column-level `grant update (...)` for writable columns).
- `security definer` functions: `set search_path = ''` and fully-qualified names; revoke `execute` from `public, anon, authenticated` unless the function is meant to be an RPC.
- Use `(select auth.uid())` in policies (evaluated once per statement).
- Reuse `public.set_updated_at()` for `updated_at` triggers.
- Reversibility: the CLI has no down migrations. Put the matching rollback in `supabase/rollback/<same-timestamp>_<name>.down.sql` (never auto-applied); the `supabase` CI job applies it to the throwaway database.
- After a schema change, regenerate `src/lib/database.types.ts` (`supabase gen types typescript --local --schema public`), or download the `database-types` artifact from the failed `supabase` CI job.
