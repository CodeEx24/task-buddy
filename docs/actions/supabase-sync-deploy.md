# Turn on sync in the hosted Supabase projects

> Related: TB-43 (https://stratyge.atlassian.net/browse/TB-43) | Wave 4 | offline-first sync
> Status: Open · Created by: Claude Code on 2026-10-28

## Purpose
TB-43 adds the cloud copy of lists, tasks and subtasks, the `sync_push` function the app writes through, a daily job that purges deleted tasks after 30 days, and Realtime change notifications. Until the migration is in a hosted project, a dev build pointed at that project shows "Offline…" in Settings and keeps everything on the phone (nothing breaks, nothing is lost). The migration itself enables Realtime for the three tables and schedules the purge job, so there are no dashboard switches to flip.

## Prerequisites
- The TB-43 PR merged to `main`; a terminal at the repo root.
- Done first: [Push the database migration to Supabase](supabase-db-push.md) (TB-19) and the TB-23 migration step in [ai-gateway-deploy.md](ai-gateway-deploy.md). `db push` applies every pending migration in order anyway.
- Your Supabase account and each project's **database password** (from your password manager; never paste it into chat).
- Project refs (not secret): dev `wsmjplylzphwecxlbbbv`, staging `lqjofqtxhrkdsefupkfp`.

## Steps
1. Push to **dev**:
   ```bash
   npx supabase@2.122.0 link --project-ref wsmjplylzphwecxlbbbv
   npx supabase@2.122.0 db push
   ```
   Confirm `20261028181639_offline_sync_tables.sql` when asked.
2. Same for **staging** with `--project-ref lqjofqtxhrkdsefupkfp`.
3. In each project's dashboard, open **Integrations → Cron** (or **Database → Extensions** and search `pg_cron`): `pg_cron` is enabled and a job `tb43-purge-sync-tombstones` runs `17 3 * * *`.
4. In **Database → Publications → supabase_realtime**, the tables `lists`, `tasks` and `subtasks` are listed.
5. Optional, recommended: paste the CI job below into `.github/workflows/ci.yml` (agents can't edit workflow files). It proves the TB-43 rollback on every PR, like TB-19's step:
   ```yaml
         - name: TB-43 rollback applies cleanly
           run: |
             psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/rollback/20261028181639_offline_sync_tables.down.sql
             gone=$(psql "$LOCAL_DB_URL" -tAc "select to_regclass('public.tasks') is null and to_regclass('public.lists') is null and to_regclass('public.subtasks') is null and not exists (select 1 from cron.job where jobname = 'tb43-purge-sync-tombstones')")
             test "$gone" = "t" || { echo "::error::TB-43 rollback left objects behind"; exit 1; }
   ```
   Put it in the `supabase` job **before** the existing "Rollback applies cleanly" step.
6. Tell Claude "sync deploy done".

## Expected result
Both projects have `public.lists`, `public.tasks`, `public.subtasks` (RLS on), the functions `sync_push` and `sync_purge_tombstones`, the cron job, and the three tables in the Realtime publication. A dev build signed in to dev shows "All changes backed up." in Settings.

## Verify
- Claude checks with the publishable key only: `GET /rest/v1/tasks?select=id&limit=1` returns `200 []` (RLS hides rows from an anonymous caller) instead of `404`.
- On a phone: create a task, wait for "All changes backed up." in Settings, then in the dashboard **Table Editor → tasks** shows one row for your user.

## Completion checklist
- [ ] dev: `db push` applied `20261028181639_offline_sync_tables.sql`
- [ ] staging: same
- [ ] Cron job `tb43-purge-sync-tombstones` visible in both
- [ ] `lists`, `tasks`, `subtasks` in the `supabase_realtime` publication in both
- [ ] (Optional) CI rollback step pasted
- [ ] Claude told; its `200 []` check passed
- [ ] Status above set to Done

## If it fails
- **`extension "pg_cron" is not available` / permission denied:** enable it in **Database → Extensions → pg_cron**, then run `db push` again.
- **`publication "supabase_realtime" does not exist`:** the migration skips that step without the publication; enable Realtime for the three tables in **Database → Publications** by hand.
- **Settings stays "Offline…" on a dev build:** check the build's `EXPO_PUBLIC_SUPABASE_URL` points at the project you pushed, and that you're signed in.
- **Need to undo:** run `supabase/rollback/20261028181639_offline_sync_tables.down.sql` with psql against the project, then `npx supabase@2.122.0 migration repair --status reverted 20261028181639`. This deletes the cloud copy; phones keep their tasks.
