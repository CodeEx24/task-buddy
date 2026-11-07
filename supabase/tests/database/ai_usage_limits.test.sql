-- TB-23 (https://stratyge.atlassian.net/browse/TB-23): ai_usage_ledger / ai_usage_counters RLS and
-- the limit functions. AC1: the 31st call in a UTC hour is refused with a Retry-After. AC2: the
-- ledger row carries user, route, model, tokens and cost. AC3: the daily token quota is enforced
-- and resets at 00:00 UTC. Runs in one transaction that is rolled back, so it leaves no data.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (id, email) values
  ('aaaaaaaa-2323-4000-8000-000000000001', 'tb23-user-a@example.test'),
  ('bbbbbbbb-2323-4000-8000-000000000002', 'tb23-user-b@example.test');

-- ---------------------------------------------------------------------------------------------
-- Structure and privileges
select policies_are(
  'public', 'ai_usage_ledger', array['ai_usage_ledger_select_own'],
  'ai_usage_ledger has only the own-row select policy'
);
select policies_are(
  'public', 'ai_usage_counters', array[]::name[],
  'ai_usage_counters has no policies (service role only)'
);
select ok(
  not has_function_privilege('authenticated', 'public.ai_consume_call(uuid, integer, bigint, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.ai_consume_call(uuid, integer, bigint, timestamptz)', 'execute'),
  'clients cannot execute ai_consume_call'
);
select ok(
  not has_function_privilege('authenticated', 'public.ai_record_usage(uuid, text, text, text, integer, integer, numeric, text, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.ai_record_usage(uuid, text, text, text, integer, integer, numeric, text, timestamptz)', 'execute'),
  'clients cannot execute ai_record_usage'
);
select ok(
  has_function_privilege('service_role', 'public.ai_consume_call(uuid, integer, bigint, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.ai_record_usage(uuid, text, text, text, integer, integer, numeric, text, timestamptz)', 'execute'),
  'the service role can execute both functions'
);

-- ---------------------------------------------------------------------------------------------
-- AC1: 30 calls per UTC hour, the 31st is refused. Run as the service role, like the gateway.
set local role service_role;

select is(
  (select count(*) from generate_series(1, 30) as s(n),
     -- p_now depends on n, so the function really runs once per row (10:14:30 .. 10:14:59).
     lateral public.ai_consume_call('aaaaaaaa-2323-4000-8000-000000000001', 30, 50000,
                                    '2026-10-28 10:14:29+00'::timestamptz + n * interval '1 second') as r
   where r.allowed),
  30::bigint,
  'AC1: calls 1-30 within the hour are allowed'
);

select results_eq(
  $$ select allowed, reason, retry_after_seconds, calls_this_hour
     from public.ai_consume_call('aaaaaaaa-2323-4000-8000-000000000001', 30, 50000,
                                 '2026-10-28 10:15:00+00') $$,
  $$ values (false, 'rate_limited'::text, 2700, 30) $$,
  'AC1: the 31st call is rate_limited with Retry-After = seconds to the next UTC hour (45 min)'
);

select is(
  (select calls from public.ai_usage_counters
   where user_id = 'aaaaaaaa-2323-4000-8000-000000000001' and window_kind = 'hour'
     and window_start = '2026-10-28 10:00:00+00'),
  30,
  'a refused call is not counted (the counter stays at the limit)'
);

select is(
  (select allowed from public.ai_consume_call('bbbbbbbb-2323-4000-8000-000000000002', 30, 50000,
                                              '2026-10-28 10:15:00+00')),
  true,
  'limits are per user: user B is unaffected by user A'
);

select is(
  (select allowed from public.ai_consume_call('aaaaaaaa-2323-4000-8000-000000000001', 30, 50000,
                                              '2026-10-28 11:00:00+00')),
  true,
  'the hourly window resets at the top of the next UTC hour'
);

select is(
  (select retry_after_seconds from public.ai_consume_call(
     'aaaaaaaa-2323-4000-8000-000000000001', 1, 50000, '2026-10-28 11:59:59.6+00')),
  1,
  'Retry-After is at least 1 second, rounded up'
);

select throws_ok(
  $$ select * from public.ai_consume_call('aaaaaaaa-2323-4000-8000-000000000001', 0, 50000) $$,
  '22023', null,
  'a non-positive limit is rejected'
);

-- ---------------------------------------------------------------------------------------------
-- AC2: ledger row fields; AC3: tokens add up per UTC day.
select lives_ok(
  $$ select public.ai_record_usage('aaaaaaaa-2323-4000-8000-000000000001', 'req-tb23-1', 'parse',
       'claude-haiku-5-5', 30000, 15000, 0.0105, 'ok', '2026-10-28 23:00:00+00') $$,
  'AC2: the service role records a ledger row'
);

select results_eq(
  $$ select user_id, request_id, route, model, input_tokens, output_tokens, cost_usd, outcome
     from public.ai_usage_ledger where request_id = 'req-tb23-1' $$,
  $$ values ('aaaaaaaa-2323-4000-8000-000000000001'::uuid, 'req-tb23-1'::text, 'parse'::text,
             'claude-haiku-5-5'::text, 30000, 15000, 0.010500::numeric(12, 6), 'ok'::text) $$,
  'AC2: the row has user, route, model, input/output tokens and the cost estimate'
);

select is(
  (select allowed from public.ai_consume_call('aaaaaaaa-2323-4000-8000-000000000001', 1000, 50000,
                                              '2026-10-28 23:30:00+00')),
  true,
  'AC3: 45,000 of 50,000 tokens used: still allowed'
);

select lives_ok(
  $$ select public.ai_record_usage('aaaaaaaa-2323-4000-8000-000000000001', 'req-tb23-2', 'plan',
       'claude-sonnet-5-5', 4000, 1000, 0.018, 'ok', '2026-10-28 23:31:00+00') $$,
  'a second call brings the day to 50,000 tokens'
);

select results_eq(
  $$ select allowed, reason, retry_after_seconds
     from public.ai_consume_call('aaaaaaaa-2323-4000-8000-000000000001', 1000, 50000,
                                 '2026-10-28 23:45:00+00') $$,
  $$ values (false, 'quota_exceeded'::text, 900) $$,
  'AC3: at the quota the call is quota_exceeded, Retry-After = seconds to 00:00 UTC (15 min)'
);

select is(
  (select calls from public.ai_usage_counters
   where user_id = 'aaaaaaaa-2323-4000-8000-000000000001' and window_kind = 'hour'
     and window_start = '2026-10-28 23:00:00+00'),
  1,
  'a quota refusal does not consume an hourly call'
);

select is(
  (select allowed from public.ai_consume_call('aaaaaaaa-2323-4000-8000-000000000001', 1000, 50000,
                                              '2026-10-29 00:00:00+00')),
  true,
  'AC3: the quota resets at 00:00 UTC'
);

select lives_ok(
  $$ select public.ai_record_usage('aaaaaaaa-2323-4000-8000-000000000001', 'req-tb23-3', 'plan',
       'claude-sonnet-5-5', 0, 0, 0, 'timeout', '2026-10-28 23:50:00+00') $$,
  'a failed provider call is recorded with zero tokens'
);

select throws_ok(
  $$ select public.ai_record_usage('aaaaaaaa-2323-4000-8000-000000000001', 'req-tb23-4', 'plan',
       'claude-sonnet-5-5', -1, 0, 0, 'ok') $$,
  '23514', null,
  'negative token counts are rejected by the ledger check constraint'
);

select lives_ok(
  $$ select public.ai_record_usage('bbbbbbbb-2323-4000-8000-000000000002', 'req-tb23-b', 'parse',
       'claude-haiku-5-5', 10, 10, 0.000006, 'ok') $$,
  'user B gets a ledger row too'
);

reset role;

-- ---------------------------------------------------------------------------------------------
-- RLS as user A: own ledger rows only, no writes, no counters.
set local role authenticated;
select set_config(
  'request.jwt.claims', '{"sub":"aaaaaaaa-2323-4000-8000-000000000001","role":"authenticated"}', true
);

select is(
  (select count(*) from public.ai_usage_ledger),
  3::bigint,
  'user A sees their own three ledger rows'
);

select throws_ok(
  $$ insert into public.ai_usage_ledger (user_id, request_id, route, model, input_tokens,
       output_tokens, cost_usd, outcome)
     values ('aaaaaaaa-2323-4000-8000-000000000001', 'forged', 'parse', 'm', 0, 0, 0, 'ok') $$,
  '42501', null,
  'user A cannot insert ledger rows (no client writes)'
);

select is_empty(
  $$ select id from public.ai_usage_ledger where user_id = 'bbbbbbbb-2323-4000-8000-000000000002' $$,
  'user A querying user B''s ledger rows gets zero rows'
);

select throws_ok(
  $$ update public.ai_usage_ledger set input_tokens = 0 where request_id = 'req-tb23-1' $$,
  '42501', null,
  'user A cannot update ledger rows, even their own'
);

select throws_ok(
  $$ delete from public.ai_usage_ledger where request_id = 'req-tb23-1' $$,
  '42501', null,
  'user A cannot delete ledger rows, even their own'
);

select throws_ok(
  $$ select * from public.ai_usage_counters $$,
  '42501', null,
  'user A cannot read the counters'
);

reset role;

-- Anonymous caller (publishable key, no session).
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select throws_ok(
  $$ select id from public.ai_usage_ledger $$,
  '42501', null,
  'anon cannot read the ledger at all'
);

reset role;
select * from finish();
rollback;
