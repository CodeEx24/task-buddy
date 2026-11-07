# Set the AI provider key and deploy the AI gateway

> Related: TB-22 (https://stratyge.atlassian.net/browse/TB-22), TB-23 (https://stratyge.atlassian.net/browse/TB-23) | Wave 2 (exit check: app → gateway with a real JWT on staging)
> Status: Open · Created by: Claude Code on 2026-10-28

## Purpose
TB-22 adds the `ai-gateway` Edge Function, the only place the app's AI requests go. It needs the Anthropic API key as an **Edge Function secret** (never in the app, EAS or the repo), and the function deployed to `taskbuddy-dev` and `taskbuddy-staging`. Without the key, signed-in calls get `AI_NOT_CONFIGURED`; nothing else breaks. Do this when you have a key and before the first AI feature (TB-29) is tested on a device. About 10 minutes.

**TB-23 addition (rate limits, quotas, usage ledger):** the gateway now needs the `ai_usage_ledger` / `ai_usage_counters` tables and their two functions in each project's database. Push the migration **before** deploying the function: a TB-23 gateway without them refuses every signed-in AI call with 500 `INTERNAL` (it fails closed rather than run unmetered). Steps 0 and 5 below are the TB-23 parts; if you already did steps 1–4 for TB-22, do 0, then 2 (redeploy) and 3, then 5.

## Prerequisites
- The TB-22 PR merged to `main`.
- Supabase CLI logged in (`npx supabase@2.122.0 login`) with access to both projects (refs `wsmjplylzphwecxlbbbv` dev, `lqjofqtxhrkdsefupkfp` staging).
- The TB-23 PR merged to `main` (for steps 0 and 5).
- Each project's **database password** for `db push` (names only here, never values; same as [supabase-db-push.md](supabase-db-push.md)).
- Credentials needed (names only): `ANTHROPIC_API_KEY` from the Anthropic Console (console.anthropic.com → API keys). Set a monthly spend limit on that key's workspace until TB-23 (rate limits) ships.

## Steps
0. **(TB-23) Push the database migration** to dev and staging, the same way as [supabase-db-push.md](supabase-db-push.md):
   ```bash
   npx supabase@2.122.0 link --project-ref wsmjplylzphwecxlbbbv
   npx supabase@2.122.0 db push
   npx supabase@2.122.0 link --project-ref lqjofqtxhrkdsefupkfp
   npx supabase@2.122.0 db push
   ```
   Answer `Y` to `20261028180000_ai_usage_limits.sql` (and to TB-19's migration if it is still pending). Nothing to configure for the service-role key: Supabase injects `SUPABASE_SERVICE_ROLE_KEY` into Edge Functions automatically.
1. Create a file **outside the repo**, e.g. `%USERPROFILE%\tb-ai.env`, with one line: `ANTHROPIC_API_KEY=<your key>`. Then, in the repo root on `main`, for **dev**:
   ```bash
   npx supabase@2.122.0 secrets set --project-ref wsmjplylzphwecxlbbbv --env-file "%USERPROFILE%\tb-ai.env"
   ```
   Keep the file until step 3, then remove it. Never put the key on the command line, in the repo, or in EAS.
2. Deploy:
   ```bash
   npx supabase@2.122.0 functions deploy ai-gateway --project-ref wsmjplylzphwecxlbbbv
   ```
   `supabase/config.toml` already sets `verify_jwt = false` for this function (the function checks the JWT itself).
3. Repeat steps 1–2 with `--project-ref lqjofqtxhrkdsefupkfp` for **staging**.
4. Optional model overrides (only if Anthropic renames models): `secrets set AI_MODEL_CHEAP` / `AI_MODEL_STRONG`. Do **not** set `ANTHROPIC_BASE_URL` in hosted projects; it is for the local mock only.
5. **(TB-23) Optional limit overrides.** Defaults are 30 AI calls per user per hour and 50,000 tokens per user per day. To change them on a project, add `AI_CALLS_PER_HOUR=<n>` and/or `AI_TOKENS_PER_DAY=<n>` (positive whole numbers) to the env file from step 1 and run `secrets set` again, then redeploy (step 2). Leave them unset to keep the defaults. If you change model ids or Anthropic changes prices, ask Claude to update the price table in `supabase/functions/ai-gateway/config.ts` (it only affects the cost **estimate** in the ledger).
6. **(TB-23, optional CI hardening, about 5 minutes)** CI's `supabase` job proves only TB-19's rollback file. To prove TB-23's too, on a branch add these lines to the `Rollback applies cleanly` step in `.github/workflows/ci.yml`, **before** the TB-19 `psql ... -f` line (agents can't edit workflows):
   ```bash
   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/rollback/20261028180000_ai_usage_limits.down.sql
   gone23=$(psql "$LOCAL_DB_URL" -tAc "select to_regclass('public.ai_usage_ledger') is null and to_regclass('public.ai_usage_counters') is null and to_regproc('public.ai_consume_call') is null and to_regproc('public.ai_record_usage') is null")
   test "$gone23" = "t" || { echo "::error::TB-23 rollback left objects behind"; exit 1; }
   ```
   (Rollbacks run newest first, so TB-19's `profiles` drop still works afterwards.) Claude proved this rollback locally inside a transaction; see `docs/tickets/TB-23/verification.md`.

## Expected result
- `npx supabase@2.122.0 secrets list --project-ref <ref>` shows `ANTHROPIC_API_KEY` (as a digest, never the value).
- `npx supabase@2.122.0 functions list --project-ref <ref>` shows `ai-gateway` as ACTIVE.

## Verify
**TB-23 check (Claude can run it once you've done step 0):** the ledger exists and is protected. `GET https://<ref>.supabase.co/rest/v1/ai_usage_ledger?select=id&limit=1` with only the publishable key returns 401/403 (anon has no access), not 404 ("Could not find the table").

Without a token, the gateway must refuse (no key value is needed for this check):
```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<ref>.supabase.co/functions/v1/ai-gateway/parse -d '{"input":"x"}'
```
prints `401`. Claude can run this for you. The signed-in check (a real JWT → 200) is the Wave 2 exit integration check and runs once the app has sign-in (TB-20) and a gateway client (TB-29).

## Completion checklist
- [ ] `ANTHROPIC_API_KEY` set on dev
- [ ] `ai-gateway` deployed to dev, unauthenticated curl → 401
- [ ] `ANTHROPIC_API_KEY` set on staging
- [ ] `ai-gateway` deployed to staging, unauthenticated curl → 401
- [ ] Spend limit set on the Anthropic workspace
- [ ] (TB-23) `20261028180000_ai_usage_limits.sql` pushed to dev, then the function redeployed
- [ ] (TB-23) Same on staging
- [ ] (TB-23) Optional: limit overrides set, or defaults kept on purpose
- [ ] (TB-23) Optional: CI rollback lines added (step 6)
- [ ] Status above set to Done

## If it fails
- **(TB-23) Every signed-in AI call returns 500 `INTERNAL` and the function log shows `usage_check_failed`:** the migration isn't on that project (step 0), or the function was deployed before it. Push the migration, then redeploy. The log line has `status` (404 = the RPC function is missing, 401 = the service-role key was rejected).
- **(TB-23) Users get 429 sooner or later than expected:** check `AI_CALLS_PER_HOUR` / `AI_TOKENS_PER_DAY` with `secrets list`; an invalid value silently falls back to the default (30 / 50,000). The hour window is the UTC clock hour; the day resets at 00:00 UTC.
- **Deploy says a module outside `supabase/functions` can't be found** (`packages/schemas/src/ai-gateway.ts`): tell Claude. The fix is to move that file under `supabase/functions/_shared/` and re-export it from `packages/schemas` (plan risk 1). Local `functions serve` resolved it fine.
- **Signed-in calls return 500 `AI_NOT_CONFIGURED`:** the secret isn't set on that project, or the function was deployed before the secret. Re-run step 1, then step 2.
- **Signed-in calls return 502 `AI_PROVIDER_ERROR`:** the key is wrong, revoked, or out of credit. Check the Anthropic Console; the gateway never logs the key or the provider's error body.
- **Unauthenticated curl returns something other than 401:** stop and tell Claude before using the app with AI.
