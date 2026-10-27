# Create the Supabase projects and set their EAS variables

> Related: TB-19 (https://stratyge.atlassian.net/browse/TB-19) | Wave 1 | Unblocks TB-20, TB-22 and every later backend ticket
> Status: Open · Created by: Claude Code (TB-19 worker) on 2026-10-27
> Facts checked 2026-10-27: Supabase docs (API keys, billing FAQ, managing environments), Expo EAS environment-variable docs, Supabase CLI 2.122.0.

## Purpose
TB-19 needs real Supabase projects so the app has somewhere to sign in (TB-20) and an AI gateway to call (TB-22). Creating projects uses your Supabase account and may cost money, so only you can do it. You'll also put each project's **URL** and **publishable key** into EAS as environment variables, so builds pick up the right backend per profile.

Everything you copy into EAS in this guide is **public by design** (it ships inside the app). The things you must **never** paste into EAS, the repo, `.env.example` or a chat are listed under Prerequisites.

Before starting, answer TB-19 spec decisions **D1** (how many projects now) and **D4** (region). This guide assumes the recommendation, **D1 (b): `taskbuddy-dev` and `taskbuddy-staging` now on the Free plan, `taskbuddy-prod` later** (at release time, TB-38). If you chose three projects now, do steps 2–4 three times and upgrade the organization to Pro first.

## Prerequisites
- A Supabase account (https://supabase.com/dashboard), with an organization where you are Owner. Free plan allows **two active free projects**; Pro is needed for a third always-on project (Supabase's own example: about $45/month for three Micro projects).
- The EAS CLI signed in as `codeex24` (done in TB-16). Check with `npx eas-cli whoami`.
- A password manager.
- **Secrets — names only, never share the values:**
  - Database password of each project (you choose it in step 2).
  - Each project's **secret key** (`sb_secret_…`, formerly `service_role`). **Not needed for this ticket. Never put it in EAS, the repo or the app.** It bypasses all security rules.
  - A Supabase personal access token (`SUPABASE_ACCESS_TOKEN`), only later, for the migration deploy pipeline.

## Steps
**Create the projects**
1. Open https://supabase.com/dashboard and pick (or create) your organization. Free plan is fine for D1 (b).
2. **New project** → Name `taskbuddy-dev` → **Database password**: click *Generate*, save it in your password manager under "Task Buddy · Supabase dev DB" → **Region**: the one chosen in D4 (if most users are in the Philippines / South-East Asia: *Southeast Asia (Singapore)*). Region can't be changed later, so use the same one for every project → **Create new project**. Wait until it shows as healthy (a couple of minutes).
3. Repeat step 2 for `taskbuddy-staging` (its own new password, same region).
4. For **each** project, note two values on a scratch note on your own machine (not in chat):
   - **Project URL**: click **Connect** at the top of the project (or *Project Settings → Data API*). It looks like `https://<project-ref>.supabase.co`. The `<project-ref>` part is not secret; you'll tell Claude the refs in step 10.
   - **Publishable key**: *Project Settings → API Keys* → tab **Publishable and secret API keys** → copy the key that starts with **`sb_publishable_`**. If the tab shows a *Create new API keys* button, click it first. **Do not** copy the legacy `anon` key (a long `eyJ…` string; retired at the end of 2026) and **never** the `sb_secret_…` key.

**Put the values into EAS** (run in a terminal at the repo root; type the values yourself)

EAS environment `development` → dev project, `preview` → staging project, `production` → prod project (later). "staging" is the EAS `preview` environment because custom environment names need a paid EAS plan.

5. Development (dev project):
   ```
   npx eas-cli env:set --name EXPO_PUBLIC_APP_ENV --value development --environment development --visibility plaintext
   npx eas-cli env:set --name EXPO_PUBLIC_SUPABASE_URL --value https://<dev-ref>.supabase.co --environment development --visibility plaintext
   npx eas-cli env:set --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <dev sb_publishable_ key> --environment development --visibility plaintext
   ```
6. Preview / staging (staging project):
   ```
   npx eas-cli env:set --name EXPO_PUBLIC_APP_ENV --value staging --environment preview --visibility plaintext
   npx eas-cli env:set --name EXPO_PUBLIC_SUPABASE_URL --value https://<staging-ref>.supabase.co --environment preview --visibility plaintext
   npx eas-cli env:set --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <staging sb_publishable_ key> --environment preview --visibility plaintext
   ```
7. Production: **skip for now** under D1 (b). When `taskbuddy-prod` exists, run the same three commands with `--environment production` and `EXPO_PUBLIC_APP_ENV` = `production`. Until then a production build fails at startup with a clear "missing EXPO_PUBLIC_SUPABASE_URL" error, which is intended.
8. For local development (optional, after TB-19 merges): `npx eas-cli env:pull --environment development` writes the dev values into a git-ignored `.env*` file.

**GitHub and CI**
9. **No GitHub secrets are needed for TB-19.** Its database tests and type generation run against a throwaway database inside GitHub Actions. After the TB-19 PR's first CI run, add the two new checks **`supabase`** and **`bundle`** as required status checks on `main` (*GitHub → Settings → Branches → main → Require status checks*), or tell Claude "add the supabase and bundle required checks" and it will do it with `gh api`.
   - Later, for the migration deploy pipeline (a follow-up ticket), you'll add these Actions secrets (names from Supabase's guide): `SUPABASE_ACCESS_TOKEN`, `STAGING_PROJECT_ID`, `STAGING_DB_PASSWORD`, `PRODUCTION_PROJECT_ID`, `PRODUCTION_DB_PASSWORD`. Don't add them yet.

**Hand back to Claude**
10. Tell Claude: "Supabase projects done", the **project refs** (not secret), the region, and the **Postgres version** shown in *Project Settings → Infrastructure* (so `supabase/config.toml` matches). Nothing else.
11. When TB-19's migration is ready, Claude will ask you to run `npx supabase@2.122.0 login`, `npx supabase@2.122.0 link --project-ref <dev-ref>` and `npx supabase@2.122.0 db push` yourself (the CLI asks for the DB password; type it, don't paste it into chat). Then the same for staging.

## Expected result
- Two healthy projects (`taskbuddy-dev`, `taskbuddy-staging`) in the same region; prod planned for TB-38 (or three projects if you chose D1 (a)).
- EAS environments `development` and `preview` each hold `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- No secret key or DB password anywhere outside Supabase and your password manager.

## Verify
- `npx eas-cli env:list --environment development` and `npx eas-cli env:list --environment preview` each list the three variable names, with `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` starting with `sb_publishable_`.
- Neither list contains a name with `SECRET` or `SERVICE_ROLE` in it, and no value starts with `sb_secret_` or `eyJ`.
- In the Supabase dashboard, both projects show as healthy in the chosen region.
- After TB-19 merges: the `supabase` and `bundle` checks show "Required" on a PR.

## Completion checklist
- [ ] D1 (project count) and D4 (region) answered in `docs/tickets/TB-19/spec.md`
- [ ] `taskbuddy-dev` created, DB password in password manager
- [ ] `taskbuddy-staging` created, DB password in password manager
- [ ] (D1 (a) only) organization on Pro and `taskbuddy-prod` created
- [ ] EAS `development` variables set (3)
- [ ] EAS `preview` variables set (3)
- [ ] (D1 (a) only) EAS `production` variables set (3)
- [ ] Project refs, region and Postgres version sent to Claude
- [ ] Migration pushed to dev and staging (step 11, after the migration is ready)
- [ ] `supabase` and `bundle` added as required checks on `main` (after the first CI run)

## If it fails
- **"You've reached the maximum number of free projects"**: the Free limit is two *active* projects per organization, counted across every Owner/Admin. Pause or delete an unused project, or choose D1 (a) (Pro). Paused projects don't count.
- **No "Publishable and secret API keys" tab / only `anon` and `service_role` shown**: on *Project Settings → API Keys*, click *Create new API keys*. Don't fall back to the legacy `anon` key without telling Claude (the app's env check rejects it on purpose).
- **`eas env:set` asks to log in or says the project isn't linked**: run it from the repo root (where `app.json` has `extra.eas.projectId`) and check `npx eas-cli whoami` shows `codeex24`.
- **`eas env:set` says the variable exists**: it updates in place in current EAS CLI; if an older CLI refuses, run `npx eas-cli env:delete` for that name and environment, then set it again.
- **You pasted a secret key somewhere by mistake** (EAS, a file, a chat): in *Project Settings → API Keys*, **revoke that secret key** and create a new one, then remove the leaked copy. For a leaked DB password: *Project Settings → Database → Reset database password*. Tell Claude what leaked (not the value) so it can check the repo history.
- **A free project got paused for inactivity**: restore it from the dashboard; consider Pro before real users depend on it.
