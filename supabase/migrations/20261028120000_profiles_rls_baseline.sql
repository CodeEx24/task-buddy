-- TB-19: profiles table + RLS baseline (https://stratyge.atlassian.net/browse/TB-19)
-- Deny by default: RLS on, every API grant revoked, then only own-row select/update granted back.
-- Rollback: supabase/rollback/20261028120000_profiles_rls_baseline.down.sql (never auto-applied).

-- Reusable trigger function: keeps updated_at current on every update (reuse on later tables).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1:1 with auth.users. id is the auth user id (not a UUIDv7): profiles is not a locally-synced table.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  timezone     text not null default 'UTC' check (char_length(timezone) <= 64),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

comment on table public.profiles is
  'One row per auth user. RLS: a user can read and update only their own row (TB-19).';

alter table public.profiles enable row level security;

-- Supabase's default privileges grant everything to anon/authenticated; take it all back first.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
-- Column-level: a user can never change id, created_at, updated_at or deleted_at through the API.
grant update (display_name, timezone) on table public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (true);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No insert/delete policies: rows are created by the trigger below; account deletion is TB-53.

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Creates the profile row when Supabase Auth creates a user. security definer so it can insert
-- despite RLS; empty search_path + fully-qualified names so it can't be hijacked.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger functions are not API surface: nobody calls them directly.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
