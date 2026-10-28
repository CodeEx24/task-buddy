-- TB-19 AC2 (https://stratyge.atlassian.net/browse/TB-19): given users A and B, when A queries B's
-- profile row, RLS returns zero rows. Also covers the rest of the own-row posture. Runs in one
-- transaction that is rolled back, so it leaves no data.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- Users A and B. The on_auth_user_created trigger creates their profile rows.
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'tb19-user-a@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'tb19-user-b@example.test');

select results_eq(
  $$ select count(*) from public.profiles
     where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222') $$,
  array[2::bigint],
  'signing up creates one profile row per user (trigger)'
);

select policies_are(
  'public', 'profiles',
  array['profiles_select_own', 'profiles_update_own'],
  'profiles has only the own-row select and update policies'
);

-- Act as user A.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select is_empty(
  $$ select id from public.profiles where id = '22222222-2222-4222-8222-222222222222' $$,
  'AC2: user A querying user B''s profile row gets zero rows'
);

select results_eq(
  $$ select id from public.profiles $$,
  $$ values ('11111111-1111-4111-8111-111111111111'::uuid) $$,
  'user A sees exactly their own profile row'
);

select lives_ok(
  $$ update public.profiles set display_name = 'hacked'
     where id = '22222222-2222-4222-8222-222222222222' $$,
  'updating user B''s row runs but matches nothing (checked below)'
);

select lives_ok(
  $$ update public.profiles set display_name = 'Alice', timezone = 'Asia/Manila'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  'user A can update display_name and timezone on their own row'
);

select throws_ok(
  $$ insert into public.profiles (id) values ('22222222-2222-4222-8222-222222222222') $$,
  '42501', null,
  'user A cannot insert profile rows'
);

select throws_ok(
  $$ update public.profiles set id = '33333333-3333-4333-8333-333333333333'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', null,
  'user A cannot change the id column, even on their own row'
);

select throws_ok(
  $$ update public.profiles set deleted_at = now()
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', null,
  'user A cannot change deleted_at, even on their own row'
);

select throws_ok(
  $$ delete from public.profiles where id = '22222222-2222-4222-8222-222222222222' $$,
  '42501', null,
  'user A cannot delete profile rows'
);

-- Back to the test owner to check what actually changed.
reset role;

select is(
  (select display_name from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  null,
  'user B''s row was not changed by user A'
);

select is(
  (select display_name from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'Alice',
  'user A''s own update was applied'
);

-- Anonymous caller (publishable key, no session).
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select throws_ok(
  $$ select id from public.profiles $$,
  '42501', null,
  'anon cannot read profiles at all'
);

reset role;
select * from finish();
rollback;
