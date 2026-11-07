-- TB-23 rollback for supabase/migrations/20261028180000_ai_usage_limits.sql
-- (https://stratyge.atlassian.net/browse/TB-23). Never auto-applied. On a hosted project: run it
-- with psql, then `supabase migration repair --status reverted 20261028180000`.
-- WARNING: drops the usage ledger (cost history). Export it first if you need it.

drop function if exists public.ai_record_usage(uuid, text, text, text, integer, integer, numeric, text, timestamptz);
drop function if exists public.ai_consume_call(uuid, integer, bigint, timestamptz);
-- Dropping the tables also drops their policies and indexes.
drop table if exists public.ai_usage_counters;
drop table if exists public.ai_usage_ledger;
