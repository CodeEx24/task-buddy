# Set the AI provider key and deploy the AI gateway

> Related: TB-22 (https://stratyge.atlassian.net/browse/TB-22) | Wave 2 (exit check: app → gateway with a real JWT on staging)
> Status: Open · Created by: Claude Code on 2026-10-28

## Purpose
TB-22 adds the `ai-gateway` Edge Function, the only place the app's AI requests go. It needs the Anthropic API key as an **Edge Function secret** (never in the app, EAS or the repo), and the function deployed to `taskbuddy-dev` and `taskbuddy-staging`. Without the key, signed-in calls get `AI_NOT_CONFIGURED`; nothing else breaks. Do this when you have a key and before the first AI feature (TB-29) is tested on a device. About 10 minutes.

## Prerequisites
- The TB-22 PR merged to `main`.
- Supabase CLI logged in (`npx supabase@2.122.0 login`) with access to both projects (refs `wsmjplylzphwecxlbbbv` dev, `lqjofqtxhrkdsefupkfp` staging).
- Credentials needed (names only): `ANTHROPIC_API_KEY` from the Anthropic Console (console.anthropic.com → API keys). Set a monthly spend limit on that key's workspace until TB-23 (rate limits) ships.

## Steps
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

## Expected result
- `npx supabase@2.122.0 secrets list --project-ref <ref>` shows `ANTHROPIC_API_KEY` (as a digest, never the value).
- `npx supabase@2.122.0 functions list --project-ref <ref>` shows `ai-gateway` as ACTIVE.

## Verify
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
- [ ] Status above set to Done

## If it fails
- **Deploy says a module outside `supabase/functions` can't be found** (`packages/schemas/src/ai-gateway.ts`): tell Claude. The fix is to move that file under `supabase/functions/_shared/` and re-export it from `packages/schemas` (plan risk 1). Local `functions serve` resolved it fine.
- **Signed-in calls return 500 `AI_NOT_CONFIGURED`:** the secret isn't set on that project, or the function was deployed before the secret. Re-run step 1, then step 2.
- **Signed-in calls return 502 `AI_PROVIDER_ERROR`:** the key is wrong, revoked, or out of credit. Check the Anthropic Console; the gateway never logs the key or the provider's error body.
- **Unauthenticated curl returns something other than 401:** stop and tell Claude before using the app with AI.
