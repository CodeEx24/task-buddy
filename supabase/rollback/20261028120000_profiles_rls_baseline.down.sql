-- TB-19 rollback for supabase/migrations/20261028120000_profiles_rls_baseline.sql
-- (https://stratyge.atlassian.net/browse/TB-19). The Supabase CLI has no down migrations, so this
-- file lives outside migrations/ and is never auto-applied. On a hosted project: run it with psql,
-- then `supabase migration repair --status reverted 20261028120000`.
-- CI applies it to the throwaway database to prove it works.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
-- Dropping the table also drops its policies and the profiles_set_updated_at trigger.
drop table if exists public.profiles;
drop function if exists public.set_updated_at();
