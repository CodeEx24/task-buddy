# Deploy account deletion and update the privacy policy's deletion section

> Related: TB-53 (https://stratyge.atlassian.net/browse/TB-53), TB-54, TB-64 | Wave 4 | legal, Supabase
> Status: Open · Created by: Claude Code on 2026-10-28

## Purpose
TB-53 adds **Settings → Account → Delete account** and **Export my data**. Deletion calls a new Edge Function, `delete-account`, which deletes the Supabase Auth user; Postgres then removes everything the user owns (profile, lists, tasks, steps, AI usage records). Three things only you can do:
1. **Deploy the function** to the hosted projects. Until then, tapping Delete on a device pointed at dev/staging shows "Something went wrong and nothing was deleted" (the function URL returns 404). Nothing breaks otherwise.
2. **Install a new dev build**: the export uses two new native modules (`expo-sharing`, `expo-file-system`). On an older build the app still starts, but Export shows "Couldn't create the export".
3. **Update the privacy policy's "Deleting your account" section** (`legal-site/privacy.html#delete-account`). It still says the in-app option is "coming in a future update". Legal wording is your call, so Claude didn't change the page. App Store review checks that the in-app path exists; Google Play also needs a **web** path, and that page (with the email route) is it.

No new secrets: Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` into every Edge Function. No database migration: the cascades already exist (TB-19, TB-23, TB-43 migrations must be pushed first, see [supabase-db-push.md](supabase-db-push.md) and [supabase-sync-deploy.md](supabase-sync-deploy.md)).

## Prerequisites
- The TB-53 PR merged to `main`.
- Supabase CLI logged in (`npx supabase@2.122.0 login`) with access to dev (`wsmjplylzphwecxlbbbv`) and staging (`lqjofqtxhrkdsefupkfp`).
- The TB-19, TB-23 and TB-43 migrations pushed to both projects.
- EAS access for the dev build.
- Credentials needed (names only): none beyond your Supabase login.

## Steps
1. **Deploy to dev**, from the repo root on `main`:
   ```bash
   npx supabase@2.122.0 functions deploy delete-account --project-ref wsmjplylzphwecxlbbbv
   ```
   `supabase/config.toml` already sets `verify_jwt = false` for this function (it checks the user's token itself, like `ai-gateway`).
2. **Deploy to staging**: same command with `--project-ref lqjofqtxhrkdsefupkfp`.
3. **New dev build** (Android, and iOS when you test there):
   ```bash
   eas build --profile development --platform android
   ```
   Install it on the emulator/phone before the TB-53 device check.
4. **Privacy policy §9 "Deleting your account"**: replace the paragraph with something like:
   > In the app, go to **Settings → Account → Delete account** and confirm. This deletes your account at once, together with your synced tasks, lists and steps, your profile and your AI usage records on our servers, and removes your data from the device. It can't be undone; use **Settings → Account → Export my data** first if you want a copy. If you can't use the app, email us from the address you sign in with and we will delete your account within 30 days and confirm by email. Copies in our provider's backups are overwritten within 30 days; security logs kept by our authentication provider (such as sign-in events) expire under its log retention.

   Also: in §9 "Your choices and rights" add "Export your tasks as a file (Settings → Account → Export my data)" and "Delete your account in the app". Change the date at the top. Optionally ask Claude to draft the PR and re-check the wording against `docs/tickets/TB-53/spec.md`.
5. **Store forms** (when you reach TB-64): App Store Connect needs nothing extra beyond the in-app path. In Google Play Console → App content → Data safety → "Data deletion", give the URL `https://<your legal site>/privacy#delete-account` and tick that users can request deletion in the app and on the web.

## Expected result
- `npx supabase@2.122.0 functions list --project-ref <ref>` shows `delete-account` ACTIVE on both projects.
- On the new dev build: Settings → Account shows **Export my data** and **Delete account**.
- The published privacy page describes the in-app deletion.

## Verify
Without a token the function must refuse (Claude can run this for you; no key needed):
```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<ref>.supabase.co/functions/v1/delete-account -d '{"confirm":"DELETE"}'
```
prints `401`. On the device, with a **throwaway** account only: create a task, Settings → Delete account → Delete → the sign-in screen appears; in the Supabase dashboard (Authentication → Users) that user is gone, and Table Editor → `tasks` has no rows with its id.

## Completion checklist
- [ ] `delete-account` deployed to dev; unauthenticated curl → 401
- [ ] `delete-account` deployed to staging; unauthenticated curl → 401
- [ ] New dev build installed; Export and Delete checked with a throwaway account
- [ ] Privacy policy §9 "Deleting your account" and "Your choices and rights" updated and published
- [ ] (TB-64) Play Console data-deletion URL set to the privacy page anchor
- [ ] Status above set to Done

## If it fails
- **Delete shows "Something went wrong and nothing was deleted":** the function isn't deployed to the project the build points at (`functions list`), or it was deployed before the TB-19/23/43 migrations. Deploy (step 1/2). The function log line has `outcome` and, for admin failures, `adminStatus` (401/403 = the service-role key was rejected: tell Claude).
- **Delete shows "Your session has expired":** sign out, sign in again, retry.
- **Export shows "Couldn't create the export":** you are on a build from before TB-53; install the new dev build (step 3).
- **`functions deploy` can't resolve `../ai-gateway/auth.ts` or `packages/schemas/...`:** tell Claude; the fix is moving the shared files under `supabase/functions/_shared/` (same as the ai-gateway's plan risk 1).
- **Never test deletion on a real or shared account**: it is permanent.
