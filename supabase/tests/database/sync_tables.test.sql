-- TB-43 (https://stratyge.atlassian.net/browse/TB-43): lists / tasks / subtasks sync tables.
-- RLS isolation between users, sync_push as the only write path (owner forced, last-writer-wins
-- on clock-corrected updated_at), tombstones, and the 30-day purge. Runs in one transaction that
-- is rolled back, so it leaves no data.
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

insert into auth.users (id, email) values
  ('aaaaaaaa-4343-4000-8000-00000000000a', 'tb43-user-a@example.test'),
  ('bbbbbbbb-4343-4000-8000-00000000000b', 'tb43-user-b@example.test');

-- Test helpers (temporary, dropped with the transaction).
create function pg_temp.now_ms() returns bigint language sql as
  $$ select floor(extract(epoch from clock_timestamp()) * 1000)::bigint $$;
create function pg_temp.task(p_id text, p_updated bigint, p_title text,
                             p_deleted bigint default null, p_list text default null)
returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'id', p_id, 'created_at', 1, 'updated_at', p_updated, 'deleted_at', p_deleted,
    'list_id', p_list, 'title', p_title, 'notes', null, 'status', 'open', 'priority', 1,
    'due_at', null, 'completed_at', null, 'sort_order', 0))
$$;
create function pg_temp.subtask(p_id text, p_task text, p_updated bigint, p_title text,
                                p_deleted bigint default null)
returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'id', p_id, 'created_at', 1, 'updated_at', p_updated, 'deleted_at', p_deleted,
    'task_id', p_task, 'title', p_title, 'is_done', false, 'sort_order', 0))
$$;
create function pg_temp.list(p_id text, p_updated bigint, p_name text, p_deleted bigint default null)
returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'id', p_id, 'created_at', 1, 'updated_at', p_updated, 'deleted_at', p_deleted,
    'name', p_name, 'color', null, 'sort_order', 0))
$$;
grant execute on all functions in schema pg_temp to authenticated, anon;

-- A fixed "device clock" for user A: 1,000,000 ms. Edits at 990,000 / 995,000 / 980,000 are 10 s,
-- 5 s and 20 s before the push, wherever the device clock really is.
-- ---------------------------------------------------------------------------------------------
-- Structure and privileges
select policies_are('public', 'lists', array['lists_select_own'], 'lists: only the own-row select policy');
select policies_are('public', 'tasks', array['tasks_select_own'], 'tasks: only the own-row select policy');
select policies_are('public', 'subtasks', array['subtasks_select_own'], 'subtasks: only the own-row select policy');

select ok(
  not exists (
    select 1 from unnest(array['public.lists', 'public.tasks', 'public.subtasks']) as t(name),
                  unnest(array['insert', 'update', 'delete', 'truncate']) as p(priv),
                  unnest(array['anon', 'authenticated']) as r(role)
    where has_table_privilege(r.role, t.name, p.priv)),
  'no client role can insert, update, delete or truncate the sync tables directly'
);
select ok(
  not has_table_privilege('anon', 'public.tasks', 'select')
  and not has_table_privilege('anon', 'public.lists', 'select')
  and not has_table_privilege('anon', 'public.subtasks', 'select'),
  'anon cannot read the sync tables'
);
select ok(
  has_function_privilege('authenticated', 'public.sync_push(text, jsonb, bigint)', 'execute')
  and not has_function_privilege('anon', 'public.sync_push(text, jsonb, bigint)', 'execute'),
  'signed-in users can call sync_push; anon cannot'
);
select ok(
  not has_function_privilege('authenticated', 'public.sync_purge_tombstones(timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.sync_purge_tombstones(timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.sync_purge_tombstones(timestamptz)', 'execute'),
  'only the service role can run the purge'
);
select results_eq(
  $$ select schedule, command, active from cron.job where jobname = 'tb43-purge-sync-tombstones' $$,
  $$ values ('17 3 * * *'::text, 'select public.sync_purge_tombstones()'::text, true) $$,
  'AC3: the purge runs daily via pg_cron'
);
select results_eq(
  $$ select count(*) from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
       and tablename in ('lists', 'tasks', 'subtasks') $$,
  array[3::bigint],
  'AC1: the three tables publish changes to Realtime'
);

-- ---------------------------------------------------------------------------------------------
-- User A
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-4343-4000-8000-00000000000a","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.tasks (id, user_id, created_at, updated_at, title)
     values ('0190aaaa-0000-7000-8000-000000000099', 'aaaaaaaa-4343-4000-8000-00000000000a', 1, 1, 'x') $$,
  '42501', null,
  'a client cannot write the table directly, only through sync_push'
);

select is(
  jsonb_array_length(public.sync_push('lists',
    pg_temp.list('0190aaaa-0000-7000-8000-0000000000a1', 990000, 'Home'), 1000000) -> 'rows'),
  1, 'A pushes a list'
);
select is(
  jsonb_array_length(public.sync_push('tasks',
    pg_temp.task('0190aaaa-0000-7000-8000-000000000001', 990000, 'edit at -10s',
                 null, '0190aaaa-0000-7000-8000-0000000000a1'), 1000000) -> 'rows'),
  1, 'A pushes task T1 (edited 10 s before the push) into the list'
);
select ok(
  (public.sync_push('subtasks',
     pg_temp.subtask('0190aaaa-0000-7000-8000-0000000000b1', '0190aaaa-0000-7000-8000-000000000001',
                     990000, 'step'), 1000000) -> 'rows' -> 0) ?& array['id', 'updated_at', 'server_updated_at']
  and not ((public.sync_push('subtasks',
     pg_temp.subtask('0190aaaa-0000-7000-8000-0000000000b1', '0190aaaa-0000-7000-8000-000000000001',
                     990000, 'step'), 1000000) -> 'rows' -> 0) ? 'user_id'),
  'the reply carries the stored row (with server_updated_at) and never user_id'
);

select ok(
  abs((select updated_at from public.tasks where id = '0190aaaa-0000-7000-8000-000000000001')
      - (pg_temp.now_ms() - 10000)) < 5000,
  'clock correction: an edit made 10 s before the push is stored ~10 s before server now, '
  'although the device clock reads 1970'
);

-- AC2: a later edit wins; an older edit that arrives later loses.
select lives_ok(
  $$ select public.sync_push('tasks',
       pg_temp.task('0190aaaa-0000-7000-8000-000000000001', 995000, 'edit at -5s',
                    null, '0190aaaa-0000-7000-8000-0000000000a1'), 1000000) $$,
  'A pushes a later edit of T1'
);
select is(
  (select title from public.tasks where id = '0190aaaa-0000-7000-8000-000000000001'),
  'edit at -5s', 'AC2: the later updated_at wins'
);
select is(
  (public.sync_push('tasks',
     pg_temp.task('0190aaaa-0000-7000-8000-000000000001', 980000, 'edit at -20s',
                  null, '0190aaaa-0000-7000-8000-0000000000a1'), 1000000) -> 'rows' -> 0 ->> 'title'),
  'edit at -5s',
  'AC2: an older edit pushed later is ignored, and the reply hands back the winning row'
);
select is(
  (select count(*) from public.tasks where id = '0190aaaa-0000-7000-8000-000000000001'),
  1::bigint, 'AC2: pushing the same id again never duplicates the task'
);
select is(
  (public.sync_push('tasks',
     pg_temp.task('0190aaaa-0000-7000-8000-000000000002', 990000, 'twice', null, null)
     || pg_temp.task('0190aaaa-0000-7000-8000-000000000002', 995000, 'twice, later', null, null),
     1000000) -> 'rows' -> 0 ->> 'title'),
  'twice, later',
  'the same id twice in one batch keeps the later version (no "row affected twice" error)'
);

select lives_ok(
  $$ select public.sync_push('tasks',
       pg_temp.task('0190aaaa-0000-7000-8000-000000000003', pg_temp.now_ms() + 31536000000, 'fast clock'),
       pg_temp.now_ms()) $$,
  'A pushes an edit stamped a year ahead of the device''s own clock'
);
select ok(
  (select updated_at from public.tasks where id = '0190aaaa-0000-7000-8000-000000000003') <= pg_temp.now_ms(),
  'a future updated_at is capped at server time, so it cannot win every later edit'
);
select pg_sleep(0.01); -- the next edit happens a few ms later in real time
select is(
  public.sync_push('tasks',
    pg_temp.task('0190aaaa-0000-7000-8000-000000000003', 1000000, 'normal edit after it'),
    1000000) -> 'rows' -> 0 ->> 'title',
  'normal edit after it', 'an ordinary later edit still beats the capped one'
);

-- AC3: a delete syncs as a tombstone (the row stays, with deleted_at).
select is(
  (public.sync_push('tasks',
     pg_temp.task('0190aaaa-0000-7000-8000-000000000002', 999000, 'twice, later', 999000), 1000000)
     -> 'rows' -> 0 ->> 'deleted_at'),
  '999000', 'AC3: a soft delete is stored as a tombstone, not removed'
);
select lives_ok(
  $$ select public.sync_push('subtasks',
       pg_temp.subtask('0190aaaa-0000-7000-8000-0000000000b2', '0190aaaa-0000-7000-8000-000000000002',
                       999000, 'step of deleted task', 999000), 1000000) $$,
  'a subtask tombstone of the deleted task syncs too'
);

select results_eq(
  $$ select count(*) from public.tasks $$, array[3::bigint],
  'A sees exactly their three tasks (live and tombstone)'
);

-- Input validation
select throws_ok($$ select public.sync_push('profiles', '[]'::jsonb, 1000000) $$, '22023', null,
  'sync_push rejects a table outside the sync set');
select throws_ok($$ select public.sync_push('tasks', '{}'::jsonb, 1000000) $$, '22023', null,
  'sync_push rejects rows that are not an array');
select throws_ok(
  $$ select public.sync_push('tasks',
       (select jsonb_agg(pg_temp.task(gen_random_uuid()::text, 1, 't') -> 0) from generate_series(1, 501)),
       1000000) $$,
  '22023', null, 'sync_push rejects a batch over 500 rows');
select throws_ok($$ select public.sync_push('tasks', '[]'::jsonb, null) $$, '22023', null,
  'sync_push rejects a missing client time');
select throws_ok(
  $$ select public.sync_push('tasks', pg_temp.task('0190aaaa-0000-7000-8000-000000000004', 1, ''), 1000000) $$,
  '23514', null, 'table checks still apply (empty title)');

-- ---------------------------------------------------------------------------------------------
-- User B: isolation
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-4343-4000-8000-00000000000b","role":"authenticated"}', true);

select is_empty($$ select id from public.tasks $$, 'B sees none of A''s tasks');
select is_empty($$ select id from public.subtasks $$, 'B sees none of A''s subtasks');
select is_empty($$ select id from public.lists $$, 'B sees none of A''s lists');

select is(
  public.sync_push('tasks',
    pg_temp.task('0190aaaa-0000-7000-8000-000000000001', 999999, 'hijack'), 1000000) -> 'rows',
  '[]'::jsonb,
  'B pushing A''s task id changes nothing and gets nothing back'
);
select is(
  public.sync_push('subtasks',
    pg_temp.subtask('0190bbbb-0000-7000-8000-0000000000b9', '0190aaaa-0000-7000-8000-000000000001',
                    999999, 'sneak in'), 1000000) -> 'rows',
  '[]'::jsonb,
  'B cannot add a subtask under A''s task'
);
select is(
  public.sync_push('tasks',
    pg_temp.task('0190bbbb-0000-7000-8000-000000000001', 990000, 'mine',
                 null, '0190aaaa-0000-7000-8000-0000000000a1'), 1000000) -> 'rows' -> 0 -> 'list_id',
  'null'::jsonb,
  'B''s task cannot point at A''s list (stored in the Inbox instead)'
);

-- anon
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.sync_push('tasks', '[]'::jsonb, 1000000) $$, '42501', null,
  'anon cannot call sync_push');

-- ---------------------------------------------------------------------------------------------
-- Checks as the owner of the data
reset role;

select is(
  (select title || '/' || user_id from public.tasks where id = '0190aaaa-0000-7000-8000-000000000001'),
  'edit at -5s/aaaaaaaa-4343-4000-8000-00000000000a',
  'A''s task is untouched by B; user_id comes from the JWT, never from the payload'
);
select ok(
  (select bool_and(server_updated_at = now()) from public.tasks),
  'server_updated_at is stamped by the server on every write'
);

-- AC3: purge
set local role service_role;
select results_eq(
  $$ select lists_purged, tasks_purged, subtasks_purged from public.sync_purge_tombstones() $$,
  $$ values (0, 0, 0) $$,
  'AC3: tombstones younger than 30 days are kept'
);
select results_eq(
  $$ select lists_purged, tasks_purged, subtasks_purged
     from public.sync_purge_tombstones(now() + interval '1 second') $$,
  $$ values (0, 1, 1) $$,
  'AC3: past the cutoff, the task tombstone and its subtask tombstone are purged'
);
reset role;
select results_eq(
  $$ select id::text from public.tasks where user_id = 'aaaaaaaa-4343-4000-8000-00000000000a' order by id $$,
  $$ values ('0190aaaa-0000-7000-8000-000000000001'), ('0190aaaa-0000-7000-8000-000000000003') $$,
  'AC3: live tasks are never purged'
);
select is(
  (select count(*) from public.subtasks where id = '0190aaaa-0000-7000-8000-0000000000b1'),
  1::bigint, 'AC3: the live subtask of a live task stays'
);

select * from finish();
rollback;
