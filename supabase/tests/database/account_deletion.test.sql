-- TB-53 (https://stratyge.atlassian.net/browse/TB-53): account deletion removes every server row a
-- user owns. The delete-account Edge Function hard-deletes the auth.users row (Auth admin API);
-- Postgres must then cascade to every user-owned table in the same transaction. This file:
--   1. guards the schema: every foreign key from schema public to auth.users is ON DELETE
--      CASCADE, and every public table with a user_id / id-is-the-user column has one, so a
--      future table that forgets it fails CI instead of silently keeping a deleted user's data;
--   2. deletes a seeded user and checks nothing of theirs remains while another user is intact.
-- Runs in one transaction that is rolled back, so it leaves no data.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- ---------------------------------------------------------------------------------------------
-- 1. Schema guards

select is_empty(
  $$
    select c.conrelid::regclass::text || ' (' || c.conname || ')'
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_namespace n on n.oid = (select relnamespace from pg_catalog.pg_class where oid = c.conrelid)
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and n.nspname = 'public'
      and c.confdeltype <> 'c'
  $$,
  'every foreign key from public to auth.users is ON DELETE CASCADE'
);

select is_empty(
  $$
    select t.table_name::text
    from information_schema.columns t
    where t.table_schema = 'public'
      and t.column_name = 'user_id'
      and not exists (
        select 1
        from pg_catalog.pg_constraint c
        where c.contype = 'f'
          and c.conrelid = format('public.%I', t.table_name)::regclass
          and c.confrelid = 'auth.users'::regclass
      )
  $$,
  'every public table with a user_id column references auth.users (so deletion reaches it)'
);

select ok(
  exists (
    select 1 from pg_catalog.pg_constraint c
    where c.contype = 'f' and c.conrelid = 'public.profiles'::regclass
      and c.confrelid = 'auth.users'::regclass and c.confdeltype = 'c'
  ),
  'profiles.id references auth.users ON DELETE CASCADE'
);

-- ---------------------------------------------------------------------------------------------
-- 2. Delete one user; the other keeps everything

insert into auth.users (id, email) values
  ('aaaaaaaa-5353-4000-8000-00000000000a', 'tb53-user-a@example.test'),
  ('bbbbbbbb-5353-4000-8000-00000000000b', 'tb53-user-b@example.test');

-- Same shape for both users: a list, a task in it, an Inbox task, a subtask, a tombstone,
-- two ledger rows and both counter kinds.
create function pg_temp.seed(p_user uuid, p_tag text) returns void language plpgsql as $$
declare
  v_list uuid := gen_random_uuid();
  v_task uuid := gen_random_uuid();
begin
  insert into public.lists (id, user_id, created_at, updated_at, name)
    values (v_list, p_user, 1, 1, 'List ' || p_tag);
  insert into public.tasks (id, user_id, created_at, updated_at, list_id, title)
    values (v_task, p_user, 1, 1, v_list, 'Task ' || p_tag),
           (gen_random_uuid(), p_user, 1, 1, null, 'Inbox ' || p_tag);
  insert into public.tasks (id, user_id, created_at, updated_at, deleted_at, title)
    values (gen_random_uuid(), p_user, 1, 2, 2, 'Tombstone ' || p_tag);
  insert into public.subtasks (id, user_id, created_at, updated_at, task_id, title)
    values (gen_random_uuid(), p_user, 1, 1, v_task, 'Step ' || p_tag);
  perform public.ai_record_usage(p_user, 'req-' || p_tag || '-1', 'parse', 'm', 10, 5, 0.001, 'ok');
  perform public.ai_record_usage(p_user, 'req-' || p_tag || '-2', 'plan', 'm', 20, 5, 0.002, 'ok');
  perform public.ai_consume_call(p_user, 30, 50000);
end;
$$;

select pg_temp.seed('aaaaaaaa-5353-4000-8000-00000000000a', 'A');
select pg_temp.seed('bbbbbbbb-5353-4000-8000-00000000000b', 'B');

-- Rows the user owns in every public table that has a user_id column, plus their profile.
create function pg_temp.owned_rows(p_user uuid) returns bigint language plpgsql as $$
declare
  v_table text;
  v_count bigint;
  v_total bigint := 0;
begin
  for v_table in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'user_id'
  loop
    execute format('select count(*) from public.%I where user_id = $1', v_table)
      into v_count using p_user;
    v_total := v_total + v_count;
  end loop;
  select v_total + count(*) into v_total from public.profiles where id = p_user;
  return v_total;
end;
$$;

-- Seed check: 3 tasks + 1 list + 1 subtask + 2 ledger + 2 counters (hour, day) + 1 profile = 10.
select is(pg_temp.owned_rows('aaaaaaaa-5353-4000-8000-00000000000a'), 10::bigint, 'user A is seeded (10 rows)');
select is(pg_temp.owned_rows('bbbbbbbb-5353-4000-8000-00000000000b'), 10::bigint, 'user B is seeded (10 rows)');

-- What the Auth admin API's hard delete does to the database.
select lives_ok(
  $$ delete from auth.users where id = 'aaaaaaaa-5353-4000-8000-00000000000a' $$,
  'deleting user A from auth.users succeeds (no foreign key blocks it)'
);

select is(pg_temp.owned_rows('aaaaaaaa-5353-4000-8000-00000000000a'), 0::bigint,
  'nothing of user A remains in any user-owned public table');
select is((select count(*) from public.tasks where user_id = 'aaaaaaaa-5353-4000-8000-00000000000a'), 0::bigint, 'A: tasks gone (tombstones included)');
select is((select count(*) from public.subtasks where user_id = 'aaaaaaaa-5353-4000-8000-00000000000a'), 0::bigint, 'A: subtasks gone');
select is((select count(*) from public.lists where user_id = 'aaaaaaaa-5353-4000-8000-00000000000a'), 0::bigint, 'A: lists gone');
select is((select count(*) from public.ai_usage_ledger where user_id = 'aaaaaaaa-5353-4000-8000-00000000000a'), 0::bigint, 'A: AI usage ledger rows gone');
select is((select count(*) from public.ai_usage_counters where user_id = 'aaaaaaaa-5353-4000-8000-00000000000a'), 0::bigint, 'A: AI usage counters gone');

select is(pg_temp.owned_rows('bbbbbbbb-5353-4000-8000-00000000000b'), 10::bigint,
  'user B keeps all 10 rows');
select is(
  (select count(*) from public.tasks where user_id = 'bbbbbbbb-5353-4000-8000-00000000000b' and list_id is not null),
  1::bigint,
  'user B''s task still points at their list'
);

select * from finish();
rollback;
