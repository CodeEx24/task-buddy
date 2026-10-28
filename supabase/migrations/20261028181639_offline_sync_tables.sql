-- TB-43: offline-first sync of lists, tasks and subtasks (https://stratyge.atlassian.net/browse/TB-43).
-- Server copies of the device tables (src/db/schema.ts), owned by user_id, with RLS.
-- Design (docs/tickets/TB-43/spec.md):
--   * Clients only READ these tables directly (own rows, RLS). The only write path is
--     public.sync_push(), which forces user_id = auth.uid() and applies last-writer-wins (LWW) on
--     updated_at atomically in one INSERT ... ON CONFLICT DO UPDATE ... WHERE.
--   * created_at / updated_at / deleted_at are epoch milliseconds, exactly as on the device, so a
--     row round-trips without loss. updated_at is the LWW version: sync_push corrects it for the
--     device's clock offset and never lets it run ahead of the server clock (spec D3).
--   * server_updated_at is stamped by the server on every write and is the pull cursor.
--   * Tombstones (deleted_at set) sync like any row; sync_purge_tombstones() hard-deletes those
--     untouched for 30 days, daily via pg_cron.
-- Rollback: supabase/rollback/20261028181639_offline_sync_tables.down.sql (never auto-applied).

-- ---------------------------------------------------------------------------------------------
-- Tables

create table public.lists (
  id                uuid primary key,
  user_id           uuid not null references auth.users (id) on delete cascade,
  created_at        bigint not null check (created_at >= 0),
  updated_at        bigint not null check (updated_at >= 0),
  deleted_at        bigint check (deleted_at >= 0),
  server_updated_at timestamptz not null default now(),
  name              text not null check (char_length(name) between 1 and 100),
  color             text check (char_length(color) between 1 and 32),
  sort_order        double precision not null default 0,
  -- Target of the composite foreign key below: a task can only point at its owner's list.
  unique (id, user_id)
);

create table public.tasks (
  id                uuid primary key,
  user_id           uuid not null references auth.users (id) on delete cascade,
  created_at        bigint not null check (created_at >= 0),
  updated_at        bigint not null check (updated_at >= 0),
  deleted_at        bigint check (deleted_at >= 0),
  server_updated_at timestamptz not null default now(),
  list_id           uuid,
  title             text not null check (char_length(title) between 1 and 500),
  notes             text check (char_length(notes) <= 10000),
  status            text not null default 'open' check (status in ('open', 'done')),
  priority          smallint not null default 0 check (priority between 0 and 3),
  due_at            bigint,
  completed_at      bigint,
  sort_order        double precision not null default 0,
  unique (id, user_id),
  -- MATCH SIMPLE: a NULL list_id (Inbox) is not checked.
  foreign key (list_id, user_id) references public.lists (id, user_id)
);

create table public.subtasks (
  id                uuid primary key,
  user_id           uuid not null references auth.users (id) on delete cascade,
  created_at        bigint not null check (created_at >= 0),
  updated_at        bigint not null check (updated_at >= 0),
  deleted_at        bigint check (deleted_at >= 0),
  server_updated_at timestamptz not null default now(),
  task_id           uuid not null,
  title             text not null check (char_length(title) between 1 and 500),
  is_done           boolean not null default false,
  sort_order        double precision not null default 0,
  -- Purging a task tombstone also purges its subtasks.
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade
);

comment on table public.lists is
  'Synced copy of the device lists table (TB-43). Read own rows; write only via sync_push().';
comment on table public.tasks is
  'Synced copy of the device tasks table (TB-43). Read own rows; write only via sync_push().';
comment on table public.subtasks is
  'Synced copy of the device subtasks table (TB-43). Read own rows; write only via sync_push().';
comment on column public.tasks.updated_at is
  'LWW version, epoch ms: the device edit time corrected for clock offset, capped at server time.';
comment on column public.tasks.server_updated_at is
  'Server clock time of the last write (trigger). Pull cursor; also drives the 30-day purge.';

-- Pull query: own rows in (server_updated_at, id) order. Also serves the purge scan.
create index lists_user_cursor_idx on public.lists (user_id, server_updated_at, id);
create index tasks_user_cursor_idx on public.tasks (user_id, server_updated_at, id);
create index subtasks_user_cursor_idx on public.subtasks (user_id, server_updated_at, id);
create index tasks_list_id_idx on public.tasks (list_id) where list_id is not null;
create index subtasks_task_id_idx on public.subtasks (task_id);
create index lists_tombstone_idx on public.lists (server_updated_at) where deleted_at is not null;
create index tasks_tombstone_idx on public.tasks (server_updated_at) where deleted_at is not null;
create index subtasks_tombstone_idx on public.subtasks (server_updated_at)
  where deleted_at is not null;

-- ---------------------------------------------------------------------------------------------
-- server_updated_at: the server's clock decides the pull cursor, never the device's.

create or replace function public.sync_stamp_server_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.server_updated_at = now();
  return new;
end;
$$;

create trigger lists_stamp_server_updated_at
  before insert or update on public.lists
  for each row execute function public.sync_stamp_server_updated_at();
create trigger tasks_stamp_server_updated_at
  before insert or update on public.tasks
  for each row execute function public.sync_stamp_server_updated_at();
create trigger subtasks_stamp_server_updated_at
  before insert or update on public.subtasks
  for each row execute function public.sync_stamp_server_updated_at();

-- ---------------------------------------------------------------------------------------------
-- RLS: deny by default, then own-row SELECT only. No direct insert/update/delete for clients.

alter table public.lists enable row level security;
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;

revoke all on table public.lists from anon, authenticated;
revoke all on table public.tasks from anon, authenticated;
revoke all on table public.subtasks from anon, authenticated;
grant select on table public.lists to authenticated;
grant select on table public.tasks to authenticated;
grant select on table public.subtasks to authenticated;

create policy lists_select_own on public.lists
  for select to authenticated using ((select auth.uid()) = user_id);
create policy tasks_select_own on public.tasks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy subtasks_select_own on public.subtasks
  for select to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------------------------
-- Push: the only client write path.
--
-- p_table:      'lists' | 'tasks' | 'subtasks' (the client pushes parents before children).
-- p_rows:       JSON array of device rows (snake_case columns, epoch ms). user_id is ignored.
-- p_client_now: the device's Date.now() when it sent the batch. offset = server now - p_client_now
--               corrects every updated_at for the device's clock error, and the result is capped
--               at the server's now, so a fast clock can never win future edits.
-- LWW: an incoming row replaces the stored one only if its corrected updated_at is strictly
-- greater. On a tie the stored row stays (first to reach the server wins).
-- Returns the stored rows for every pushed id the caller owns (applied or not), so the device
-- adopts the winner. Rows it could not place are left out (another user's id; a subtask whose
-- task is not on the server).
create or replace function public.sync_push(
  p_table      text,
  p_rows       jsonb,
  p_client_now bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_now    bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_offset bigint;
  v_ids    uuid[];
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'sync_push: not authenticated' using errcode = '42501';
  end if;
  if p_table is null or p_table not in ('lists', 'tasks', 'subtasks') then
    raise exception 'sync_push: unknown table' using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'sync_push: rows must be an array of at most 500' using errcode = '22023';
  end if;
  if p_client_now is null or p_client_now <= 0 then
    raise exception 'sync_push: invalid client time' using errcode = '22023';
  end if;

  v_offset := v_now - p_client_now;
  select coalesce(array_agg(distinct (e ->> 'id')::uuid), '{}') into v_ids
  from jsonb_array_elements(p_rows) as e;

  if p_table = 'lists' then
    insert into public.lists as t
      (id, user_id, created_at, updated_at, deleted_at, name, color, sort_order)
    select distinct on (r.id)
      r.id, v_uid, r.created_at, least(r.updated_at + v_offset, v_now), r.deleted_at,
      r.name, r.color, coalesce(r.sort_order, 0)
    from jsonb_to_recordset(p_rows) as r(
      id uuid, created_at bigint, updated_at bigint, deleted_at bigint,
      name text, color text, sort_order double precision)
    order by r.id, r.updated_at desc
    on conflict (id) do update set
      updated_at = excluded.updated_at, deleted_at = excluded.deleted_at,
      name = excluded.name, color = excluded.color, sort_order = excluded.sort_order
    where t.user_id = v_uid and t.updated_at < excluded.updated_at;

    select coalesce(jsonb_agg(to_jsonb(l) - 'user_id'), '[]'::jsonb) into v_result
    from public.lists l where l.user_id = v_uid and l.id = any (v_ids);

  elsif p_table = 'tasks' then
    insert into public.tasks as t
      (id, user_id, created_at, updated_at, deleted_at, list_id, title, notes, status, priority,
       due_at, completed_at, sort_order)
    select distinct on (r.id)
      r.id, v_uid, r.created_at, least(r.updated_at + v_offset, v_now), r.deleted_at,
      -- A list that is not on the server for this user (purged, or never synced) → Inbox,
      -- the same thing deleting a list does on the device.
      case when exists (select 1 from public.lists l where l.id = r.list_id and l.user_id = v_uid)
           then r.list_id end,
      r.title, r.notes, coalesce(r.status, 'open'), coalesce(r.priority, 0),
      r.due_at, r.completed_at, coalesce(r.sort_order, 0)
    from jsonb_to_recordset(p_rows) as r(
      id uuid, created_at bigint, updated_at bigint, deleted_at bigint, list_id uuid,
      title text, notes text, status text, priority smallint, due_at bigint,
      completed_at bigint, sort_order double precision)
    order by r.id, r.updated_at desc
    on conflict (id) do update set
      updated_at = excluded.updated_at, deleted_at = excluded.deleted_at,
      list_id = excluded.list_id, title = excluded.title, notes = excluded.notes,
      status = excluded.status, priority = excluded.priority, due_at = excluded.due_at,
      completed_at = excluded.completed_at, sort_order = excluded.sort_order
    where t.user_id = v_uid and t.updated_at < excluded.updated_at;

    select coalesce(jsonb_agg(to_jsonb(x) - 'user_id'), '[]'::jsonb) into v_result
    from public.tasks x where x.user_id = v_uid and x.id = any (v_ids);

  else
    insert into public.subtasks as t
      (id, user_id, created_at, updated_at, deleted_at, task_id, title, is_done, sort_order)
    select distinct on (r.id)
      r.id, v_uid, r.created_at, least(r.updated_at + v_offset, v_now), r.deleted_at,
      r.task_id, r.title, coalesce(r.is_done, false), coalesce(r.sort_order, 0)
    from jsonb_to_recordset(p_rows) as r(
      id uuid, created_at bigint, updated_at bigint, deleted_at bigint, task_id uuid,
      title text, is_done boolean, sort_order double precision)
    -- Only under a task this user owns on the server; anything else is left out of the reply.
    where exists (select 1 from public.tasks p where p.id = r.task_id and p.user_id = v_uid)
    order by r.id, r.updated_at desc
    on conflict (id) do update set
      updated_at = excluded.updated_at, deleted_at = excluded.deleted_at,
      task_id = excluded.task_id, title = excluded.title, is_done = excluded.is_done,
      sort_order = excluded.sort_order
    where t.user_id = v_uid and t.updated_at < excluded.updated_at;

    select coalesce(jsonb_agg(to_jsonb(s) - 'user_id'), '[]'::jsonb) into v_result
    from public.subtasks s where s.user_id = v_uid and s.id = any (v_ids);
  end if;

  return jsonb_build_object('server_now', v_now, 'rows', v_result);
end;
$$;

comment on function public.sync_push(text, jsonb, bigint) is
  'TB-43: the only client write path for lists/tasks/subtasks. Owner forced to auth.uid(); '
  'last-writer-wins on clock-corrected updated_at; returns the stored rows for the pushed ids.';

revoke execute on function public.sync_push(text, jsonb, bigint) from public, anon;
grant execute on function public.sync_push(text, jsonb, bigint) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Tombstone purge (AC3): hard-delete tombstones the server has not touched for 30 days.
-- p_cutoff is for tests; the cron job uses the default. A deleted list is kept while any task
-- still points at it (the device moves tasks to the Inbox when it deletes a list).

create or replace function public.sync_purge_tombstones(
  p_cutoff timestamptz default now() - interval '30 days'
)
returns table (lists_purged integer, tasks_purged integer, subtasks_purged integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subtasks integer;
  v_tasks    integer;
  v_lists    integer;
begin
  delete from public.subtasks s
  where s.deleted_at is not null and s.server_updated_at < p_cutoff;
  get diagnostics v_subtasks = row_count;

  -- Cascades to the task's remaining subtasks.
  delete from public.tasks t
  where t.deleted_at is not null and t.server_updated_at < p_cutoff;
  get diagnostics v_tasks = row_count;

  delete from public.lists l
  where l.deleted_at is not null and l.server_updated_at < p_cutoff
    and not exists (select 1 from public.tasks t where t.list_id = l.id);
  get diagnostics v_lists = row_count;

  return query select v_lists, v_tasks, v_subtasks;
end;
$$;

revoke execute on function public.sync_purge_tombstones(timestamptz) from public, anon, authenticated;
grant execute on function public.sync_purge_tombstones(timestamptz) to service_role;
revoke execute on function public.sync_stamp_server_updated_at() from public, anon, authenticated;

-- Daily at 03:17 UTC. pg_cron ships with Supabase Postgres (preloaded); cron.schedule upserts by name.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'tb43-purge-sync-tombstones',
  '17 3 * * *',
  $$select public.sync_purge_tombstones()$$
);

-- ---------------------------------------------------------------------------------------------
-- Realtime: devices subscribe to changes on their own rows as a "pull now" signal (AC1).
-- Realtime applies the SELECT policies above to every subscriber.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.lists, public.tasks, public.subtasks;
  end if;
end;
$$;
