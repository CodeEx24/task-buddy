-- TB-23: per-user AI rate limits, daily token quotas and the usage ledger
-- (https://stratyge.atlassian.net/browse/TB-23).
-- Written only by the ai-gateway Edge Function with the service role, through the two functions
-- below. Clients can read their own ledger rows and nothing else.
-- Rollback: supabase/rollback/20261028180000_ai_usage_limits.down.sql (never auto-applied).

-- One row per provider call (AC2). Append-only; holds no prompt, input or output text.
-- Not a locally-synced table, so a server-generated uuid id and no updated_at/deleted_at.
create table public.ai_usage_ledger (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  request_id    text not null check (char_length(request_id) between 1 and 64),
  route         text not null check (route ~ '^[a-z][a-z0-9-]{0,31}$'),
  model         text not null check (char_length(model) between 1 and 100),
  input_tokens  integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  -- Estimate from the gateway's price table (supabase/functions/ai-gateway/config.ts), not a bill.
  cost_usd      numeric(12, 6) not null check (cost_usd >= 0),
  outcome       text not null
                check (outcome in ('ok', 'timeout', 'upstream', 'bad_response', 'exception')),
  created_at    timestamptz not null default now()
);

comment on table public.ai_usage_ledger is
  'One row per AI provider call: user, route, model, tokens, estimated cost (TB-23). '
  'Written by the ai-gateway via ai_record_usage(); users can read only their own rows.';
comment on column public.ai_usage_ledger.cost_usd is
  'Estimated USD cost from the gateway price table at write time. Not an invoice amount.';
comment on column public.ai_usage_ledger.output_tokens is
  'Provider-reported for outcome ok. For timeout / bad_response (possibly billed, usage unknown) '
  'input and output tokens are the gateway''s upper-bound estimate; upstream / exception record 0.';

create index ai_usage_ledger_user_created_idx
  on public.ai_usage_ledger (user_id, created_at desc);

-- Counters behind the limits. 'hour' rows count calls per UTC clock hour (AC1, fixed window);
-- 'day' rows sum tokens per UTC day (AC3, resets at 00:00 UTC). Server-only.
create table public.ai_usage_counters (
  user_id      uuid not null references auth.users (id) on delete cascade,
  window_kind  text not null check (window_kind in ('hour', 'day')),
  window_start timestamptz not null,
  calls        integer not null default 0 check (calls >= 0),
  tokens       bigint not null default 0 check (tokens >= 0),
  updated_at   timestamptz not null default now(),
  primary key (user_id, window_kind, window_start)
);

comment on table public.ai_usage_counters is
  'Per-user AI call/token counters per UTC hour and day (TB-23). Service role only.';

alter table public.ai_usage_ledger enable row level security;
alter table public.ai_usage_counters enable row level security;

-- Deny by default, then grant back only own-row reads of the ledger. No client writes at all.
revoke all on table public.ai_usage_ledger from anon, authenticated;
revoke all on table public.ai_usage_counters from anon, authenticated;
grant select on table public.ai_usage_ledger to authenticated;

create policy ai_usage_ledger_select_own on public.ai_usage_ledger
  for select to authenticated
  using ((select auth.uid()) = user_id);
-- ai_usage_counters: RLS on, no policies, no grants: only the service role (bypasses RLS) uses it.

-- AC1 + AC3 check, in one call. Order: daily quota first (a refused call is not counted), then
-- the hourly limit as a single atomic upsert: `on conflict ... do update ... where calls < limit`
-- takes the row lock, so concurrent requests can never push the count past the limit.
-- The quota is checked against tokens already recorded; a call in flight is counted when it
-- finishes, so a user can overshoot the quota by at most the calls already admitted.
-- p_now is for tests; the gateway never passes it, so the database clock decides.
create or replace function public.ai_consume_call(
  p_user_id        uuid,
  p_calls_per_hour integer,
  p_tokens_per_day bigint,
  p_now            timestamptz default now()
)
returns table (
  allowed             boolean,
  reason              text,
  retry_after_seconds integer,
  calls_this_hour     integer,
  tokens_today        bigint
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_hour   timestamptz := date_trunc('hour', p_now, 'UTC');
  v_day    timestamptz := date_trunc('day', p_now, 'UTC');
  v_tokens bigint;
  v_calls  integer;
begin
  if p_user_id is null or p_calls_per_hour is null or p_calls_per_hour < 1
     or p_tokens_per_day is null or p_tokens_per_day < 1 then
    raise exception 'ai_consume_call: invalid arguments' using errcode = '22023';
  end if;

  select c.tokens into v_tokens
  from public.ai_usage_counters c
  where c.user_id = p_user_id and c.window_kind = 'day' and c.window_start = v_day;
  v_tokens := coalesce(v_tokens, 0);

  if v_tokens >= p_tokens_per_day then
    return query select
      false,
      'quota_exceeded'::text,
      greatest(1, ceil(extract(epoch from (v_day + interval '1 day' - p_now))))::integer,
      null::integer,
      v_tokens;
    return;
  end if;

  insert into public.ai_usage_counters as c (user_id, window_kind, window_start, calls)
  values (p_user_id, 'hour', v_hour, 1)
  on conflict (user_id, window_kind, window_start)
  do update set calls = c.calls + 1, updated_at = now()
  where c.calls < p_calls_per_hour
  returning c.calls into v_calls;

  if v_calls is null then
    return query select
      false,
      'rate_limited'::text,
      greatest(1, ceil(extract(epoch from (v_hour + interval '1 hour' - p_now))))::integer,
      p_calls_per_hour,
      v_tokens;
    return;
  end if;

  return query select true, null::text, null::integer, v_calls, v_tokens;
end;
$$;

-- AC2 + AC3 bookkeeping: the ledger row and the daily token total in one transaction.
create or replace function public.ai_record_usage(
  p_user_id       uuid,
  p_request_id    text,
  p_route         text,
  p_model         text,
  p_input_tokens  integer,
  p_output_tokens integer,
  p_cost_usd      numeric,
  p_outcome       text,
  p_now           timestamptz default now()
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.ai_usage_ledger
    (user_id, request_id, route, model, input_tokens, output_tokens, cost_usd, outcome, created_at)
  values
    (p_user_id, p_request_id, p_route, p_model, p_input_tokens, p_output_tokens, p_cost_usd,
     p_outcome, p_now);

  insert into public.ai_usage_counters as c (user_id, window_kind, window_start, calls, tokens)
  values (p_user_id, 'day', date_trunc('day', p_now, 'UTC'), 1, p_input_tokens + p_output_tokens)
  on conflict (user_id, window_kind, window_start)
  do update set calls = c.calls + 1, tokens = c.tokens + excluded.tokens, updated_at = now();
end;
$$;

-- Not client API: only the gateway (service role) may run them.
revoke execute on function public.ai_consume_call(uuid, integer, bigint, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.ai_record_usage(uuid, text, text, text, integer, integer, numeric, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.ai_consume_call(uuid, integer, bigint, timestamptz) to service_role;
grant execute on function public.ai_record_usage(uuid, text, text, text, integer, integer, numeric, text, timestamptz)
  to service_role;
