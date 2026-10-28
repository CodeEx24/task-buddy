-- TB-43 rollback for supabase/migrations/20261028181639_offline_sync_tables.sql
-- (https://stratyge.atlassian.net/browse/TB-43). Never auto-applied. On a hosted project: run it
-- with psql, then `supabase migration repair --status reverted 20261028181639`.
-- WARNING: drops the server copy of every user's lists, tasks and subtasks (the cloud backup).
-- Devices keep their local data and push it again once a fixed migration is deployed; export the
-- tables first if a device might be lost meanwhile.
-- The pg_cron extension is left installed (other jobs may use it); only this job is removed.

select cron.unschedule(jobid) from cron.job where jobname = 'tb43-purge-sync-tombstones';

drop function if exists public.sync_purge_tombstones(timestamptz);
drop function if exists public.sync_push(text, jsonb, bigint);
-- Dropping a table also drops its policies, triggers, indexes and Realtime publication entry.
drop table if exists public.subtasks;
drop table if exists public.tasks;
drop table if exists public.lists;
drop function if exists public.sync_stamp_server_updated_at();
