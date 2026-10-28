# supabase/tests

RLS and SQL tests (pgTAP), run with the Supabase CLI. Owner: TB-19 (https://stratyge.atlassian.net/browse/TB-19).

- `database/*.test.sql`: each file is one transaction (`begin; ... select * from finish(); rollback;`), so it leaves no data.
- Run: `supabase db start && supabase test db` (needs Docker). In CI this is the `supabase` job in `.github/workflows/ci.yml`, on every PR.
- `rls_enabled.test.sql` asserts every table in `public` has RLS on; keep it passing.
- For each new table, test as `authenticated` with `set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true)`: another user's rows return zero rows, own rows are visible, forbidden writes fail with `42501`, and `anon` is denied.
