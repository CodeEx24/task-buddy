-- TB-19 baseline (https://stratyge.atlassian.net/browse/TB-19): every table in schema public has
-- RLS enabled. Any later migration that forgets `enable row level security` fails CI here.
begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

select is_empty(
  $$
    select c.relname::text
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  $$,
  'every table in schema public has row level security enabled'
);

select * from finish();
rollback;
