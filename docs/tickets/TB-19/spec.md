# TB-19 — Spec

> Jira: https://stratyge.atlassian.net/browse/TB-19 · Intent: [intent.md](intent.md) · Plan: [plan.md](plan.md)
> Status: **Draft — awaiting owner acceptance.** High risk: the owner reads this spec and answers D1–D4 before any code.
> Facts checked 2026-10-27 against Supabase docs (search_docs), Expo/EAS docs (Context7) and the Supabase CLI `2.122.0` help output.

## Acceptance criteria (verbatim from Jira)
- [ ] Given three Supabase projects, then URLs and anon keys are injected through EAS env and no service-role key exists in the client bundle
- [ ] Given users A and B, when A queries B's profile row, then RLS returns zero rows (automated test)
- [ ] TypeScript types are generated from the schema in CI and the build fails on drift
- [ ] Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated

> AC1 wording note: "anon key" is read as **the client-safe Supabase key**. Supabase now issues a *publishable* key (`sb_publishable_…`) as the replacement for `anon`, and retires legacy `anon`/`service_role` keys at the end of 2026. "Service-role key" covers both the legacy `service_role` JWT and the new *secret* key (`sb_secret_…`). See D3.

## Behaviour

### AC1 — environments and EAS env
| EAS build profile | EAS environment | Supabase project | `EXPO_PUBLIC_APP_ENV` |
|---|---|---|---|
| `development` | `development` | `taskbuddy-dev` | `development` |
| `preview` | `preview` | `taskbuddy-staging` | `staging` |
| `production` | `production` | `taskbuddy-prod` | `production` |

- EAS supports exactly `development`, `preview`, `production` environments on our plan (custom names such as `staging` need an Enterprise/Production EAS plan), so **"staging" = the EAS `preview` environment**.
- `eas.json` sets `"environment"` explicitly on each build profile (today it relies on EAS's implicit default).
- Variables per environment, all **plaintext** visibility (they are public by design; "secret" visibility adds nothing for values embedded in the app, per Expo docs):
  - `EXPO_PUBLIC_APP_ENV`
  - `EXPO_PUBLIC_SUPABASE_URL` (`https://<ref>.supabase.co`)
  - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`)
- The owner creates them with `eas env:set --name … --value … --environment … --visibility plaintext` (verified current syntax; there is no secret value in any of them). Local dev pulls them with `eas env:pull --environment development` into a git-ignored `.env*` file.
- **No secret key is ever created as an EAS variable** for app builds. Secret keys live only in Supabase (Edge Function secrets, TB-22) and, if needed, GitHub Actions secrets.
- `src/lib/env.ts` reads each variable with **static dot access** (`process.env.EXPO_PUBLIC_SUPABASE_URL`). Expo only inlines that form; destructuring or bracket access silently yields `undefined` (Expo docs; `expo/no-env-var-destructuring` and `expo/no-dynamic-env-var` lint rules). It then validates with Zod:
  - `EXPO_PUBLIC_APP_ENV` ∈ `development | staging | production`.
  - `EXPO_PUBLIC_SUPABASE_URL`: a URL; `https:` required unless `APP_ENV = development` (allows a future local stack on `http://127.0.0.1` / `http://10.0.2.2`).
  - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: must start with `sb_publishable_`; **rejected** if it starts with `sb_secret_` or is a JWT whose payload `role` is `service_role` (defence in depth: a mis-pasted secret fails the app at startup instead of shipping).
  - Failure throws `EnvError` that lists the **names** of the bad variables and the rule they broke, never the values.
- The pure function `parseEnv(raw)` holds the logic (unit-testable); `env` is the parsed result of the static reads.

**Proving "no service-role key in the client bundle"** (three layers):
1. **Bundle scan in CI (the AC evidence).** `npx expo export --platform android` (and `ios`) with dummy `EXPO_PUBLIC_*` values, plus a **canary**: the export step's environment also has `SUPABASE_SECRET_KEY=sb_secret_TB19CANARY…` (a fake, non-`EXPO_PUBLIC_` name). `scripts/check-bundle-secrets.mjs` then scans every file in the export output and fails on:
   - any `sb_secret_` string (catches the canary leaking and any real secret);
   - any JWT-shaped string (`eyJ…​.eyJ…​.…`) whose decoded payload has `"role":"service_role"`;
   - the identifiers `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `service_role` appearing in app code.
   The script has its own unit test with fixtures (a clean bundle passes; a planted `sb_secret_…` and a planted service-role JWT fail), so the check itself is proven to catch a leak.
2. **Static guard.** A Jest test fails if any file under `src/` reads `process.env.X` where `X` doesn't start with `EXPO_PUBLIC_` (except `NODE_ENV`), or mentions `SERVICE_ROLE` / `SECRET_KEY` / `sb_secret_`.
3. **Runtime guard.** The Zod refinement above.

### AC2 — RLS: A can't read B's profile
- Migration creates `public.profiles` with RLS on (see Data changes). Policies allow an authenticated user to **select and update only their own row**. No insert/delete policies: rows are created by a trigger on `auth.users`; deletion is TB-53.
- pgTAP test `supabase/tests/database/profiles_rls.test.sql`, run by `supabase test db`:
  1. Inserts users A and B into `auth.users` inside the test transaction (the trigger creates both profile rows).
  2. As `authenticated` with JWT claims `sub = A`: selecting B's row **returns zero rows** (the AC); selecting own row returns exactly one (proves the test isn't passing because *everything* is denied); `update … where id = B` affects zero rows; inserting a row for B fails with `42501`.
  3. As `anon` (no JWT): selecting from `profiles` returns zero rows / permission denied.
  4. `rollback` — leaves no data.
- Baseline test `supabase/tests/database/rls_enabled.test.sql`: every table in schema `public` has `relrowsecurity = true`. This one keeps paying off: any later ticket that forgets RLS fails CI.

### AC3 — generated types with a drift check
- Types are generated from the **migrations** (not from a remote project): `supabase gen types typescript --local --schema public` → `src/lib/database.types.ts`, committed.
- CI regenerates after applying migrations to an ephemeral database and runs `git diff --exit-code src/lib/database.types.ts`. Any difference fails the job and prints the diff. On failure it also uploads the regenerated file as a workflow artifact, so a developer without Docker (the owner's machine) can download it instead of generating locally.
- The generated file is excluded from Prettier and ESLint so formatting can't cause false drift; `.gitattributes` keeps it `eol=lf`.
- `src/lib/supabase.ts` creates the client as `createClient<Database>(…)`, so a schema change without regenerated types also fails `pnpm typecheck` wherever the client is used.

### Where the checks run (CI)
`.github/workflows/ci.yml` gains two jobs next to `ci` (same workflow, per its header comment):

| Job | Steps | Needs secrets? |
|---|---|---|
| `supabase` | checkout → `supabase/setup-cli@v1` pinned to `2.122.0` → `supabase db start` (Postgres only, Docker on the GitHub runner) → `supabase test db` (AC2) → `supabase gen types typescript --local --schema public` + `git diff --exit-code` (AC3) | **No** |
| `bundle` | checkout → pnpm/node → install → `expo export` (android + ios) with dummy public values + canary → `node scripts/check-bundle-secrets.mjs dist-bundle-check` (AC1) | **No** |

The `ci` job additionally runs the new Jest tests (`parseEnv`, static guard, bundle-scanner fixtures). The owner adds `supabase` and `bundle` as required status checks on `main` (action guide step). No Docker, Metro or export runs on the owner's machine.

## Technical design
- **Surfaces:** `src/lib/env.ts`, `src/lib/supabase.ts`, `src/lib/database.types.ts` (generated), `supabase/config.toml` (from `supabase init`), `supabase/migrations/<ts>_profiles_rls_baseline.sql`, `supabase/rollback/<ts>_profiles_rls_baseline.down.sql`, `supabase/tests/database/*.test.sql`, `scripts/check-bundle-secrets.mjs` (+ test), `.env.example`, `eas.json`, `.github/workflows/ci.yml`.
- **Interfaces & contracts:**
  ```ts
  // src/lib/env.ts
  export type AppEnv = 'development' | 'staging' | 'production';
  export type Env = { appEnv: AppEnv; supabaseUrl: string; supabasePublishableKey: string };
  export class EnvError extends Error { readonly issues: readonly { name: string; rule: string }[] }
  export function parseEnv(raw: Record<string, string | undefined>): Env; // pure, throws EnvError
  export const env: Env; // parseEnv of the static process.env.EXPO_PUBLIC_* reads

  // src/lib/supabase.ts
  export function getSupabaseClient(): SupabaseClient<Database>; // lazy, memoized
  ```
  The client is created with `auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }`. TB-20 replaces this with SecureStore-backed session storage; nothing in TB-19 signs anyone in. Lazy creation keeps unrelated Jest tests from needing env values.
- **Data changes** (`supabase/migrations/<ts>_profiles_rls_baseline.sql`):
  ```sql
  create table public.profiles (
    id           uuid primary key references auth.users (id) on delete cascade,
    display_name text check (char_length(display_name) <= 80),
    timezone     text not null default 'UTC',
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    deleted_at   timestamptz
  );
  alter table public.profiles enable row level security;
  revoke all on public.profiles from anon;
  revoke all on public.profiles from authenticated;
  grant select on public.profiles to authenticated;
  grant update (display_name, timezone) on public.profiles to authenticated;

  create policy "profiles_select_own" on public.profiles
    for select to authenticated using ((select auth.uid()) = id);
  create policy "profiles_update_own" on public.profiles
    for update to authenticated
    using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

  -- public.set_updated_at(): reusable trigger fn (security invoker, search_path = '')
  -- public.handle_new_user(): security definer, set search_path = '', inserts the profile row
  -- trigger on_auth_user_created after insert on auth.users
  ```
  - `id` is the auth user id (UUID from Supabase Auth), not a UUIDv7: `profiles` is 1:1 with `auth.users` and isn't a locally-synced table, so the UUIDv7 invariant doesn't apply. `updated_at` / `deleted_at` are kept for consistency with synced tables.
  - `(select auth.uid())` instead of bare `auth.uid()` per Supabase RLS performance guidance (evaluated once per statement).
  - Column-level `grant update` stops a user changing `id`, `created_at` or `deleted_at` through the API even on their own row.
  - **Reversibility:** the Supabase CLI has no down migrations. The matching `supabase/rollback/<ts>_profiles_rls_baseline.down.sql` (outside `migrations/`, never auto-applied) drops the trigger, functions, policies and table. The `supabase` CI job applies it as its last step against the ephemeral DB (after tests and type generation) and asserts `public.profiles` and the trigger are gone; the run is recorded in `verification.md`.
- **Reuse:** existing CI job layout and pnpm setup (TB-16); `.env*` git-ignore rule already present; `src/lib/` is the CLAUDE.md home for env and Supabase client. `set_updated_at()` is meant to be reused by every later table.
- **New dependencies:** `@supabase/supabase-js` and `zod` (runtime). Zod is also what `packages/schemas` will use (TB-24); whichever ticket lands first adds it, the other rebases (shared-file rule). Supabase CLI is **not** a package dependency: CI pins it through `supabase/setup-cli`, local use is `npx supabase@2.122.0`. Whether supabase-js on RN 0.88 still needs a URL polyfill is checked against current docs during build.

## Edge cases
| Case | Expected |
|---|---|
| A build profile has no EAS variables (e.g. prod not created yet) | `parseEnv` throws `EnvError` at startup naming the missing variables; the bundle scan still passes (dummy values) |
| Owner pastes the secret key into `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The app refuses to start (`EnvError`). The CI bundle scan can't see this case because CI uses dummy values; the startup check and the action-guide warning are the guards. Residual risk (see Security) |
| Legacy anon JWT pasted instead of publishable key | Rejected (must start with `sb_publishable_`); action guide says which tab to copy from |
| `process.env` destructured in a future change | Value inlines as `undefined` → `EnvError`; Expo lint rules flag it |
| A later ticket adds a table without RLS | `rls_enabled.test.sql` fails in the `supabase` job |
| Migration changes but types aren't regenerated | `supabase` job fails with the diff; artifact holds the right file |
| Generated file reformatted by Prettier / CRLF on Windows | Excluded from Prettier/ESLint; `.gitattributes` forces LF |
| User's own row soft-deleted (`deleted_at` set) | Still readable by its owner (needed for restore/export); hiding it is TB-53's call |
| `auth.users` insert when profile insert fails | Trigger error aborts the sign-up (better than a user without a profile); trigger is minimal to make that unlikely |

## Security, privacy & AI cost
**Threats and abuse cases**
| # | Threat | Mitigation | Test |
|---|---|---|---|
| T1 | Secret / service-role key ships in the app → full DB access, RLS bypassed | Only `EXPO_PUBLIC_*` names in `src/`; no secret in EAS app env; Zod rejects secret-shaped keys; CI bundle scan with canary | bundle job, static-guard Jest test, `parseEnv` tests |
| T2 | Table created without RLS → readable by anyone with the publishable key | RLS enabled in the same migration; baseline test over all `public` tables | `rls_enabled.test.sql` |
| T3 | Horizontal access: A reads or edits B's profile | Own-row policies on select/update; no insert/delete policy | `profiles_rls.test.sql` |
| T4 | Privilege escalation through writable columns (`id`, `deleted_at`) | Column-level `grant update (display_name, timezone)` | update of `id` fails in test |
| T5 | `security definer` trigger hijacked through `search_path` | `set search_path = ''`, fully-qualified names | review item |
| T6 | Anonymous enumeration | `revoke all … from anon` | anon select test |
| T7 | Secrets leak via logs / CI output | `EnvError` reports names only; CI jobs need no secrets; action guide never asks for values in chat | review item |
| T8 | Prod data touched by tests | Tests only run against an ephemeral CI database; never `--linked` to prod | review item |

**Residual risks:** (a) the bundle scan proves the *code path* can't leak; a human could still paste a secret into an EAS variable — the startup Zod check catches the obvious shapes, and the action guide calls it out. (b) Publishable keys are public by design; abuse protection is RLS plus later rate limits (TB-23).

**Privacy:** `profiles` holds a display name and timezone only; no task text. **AI cost:** none.

## Decisions
| # | Decision | Options considered | Recommendation | Decided by / date |
|---|---|---|---|---|
| D1 | How many Supabase projects now | (a) dev + staging + prod now on **Pro** (≈ $25 plan + ~$10 per project compute, minus $10 credit ≈ $45/mo per Supabase's billing FAQ; no pausing, backups); (b) **dev + staging on Free now** (Free allows 2 active projects; may pause when idle), prod created at release time (TB-38) on Pro; (c) dev only now | **(b)**. Meets the safety goal today at $0; prod isn't needed until the first store build, and a Free prod would pause anyway. AC1's "three projects" becomes partial → recorded as an accepted deviation with a follow-up tied to TB-38. Pick (a) if you want AC1 literally met now and accept the monthly cost | |
| D2 | Where RLS tests and type generation run | (a) **GitHub Actions with an ephemeral DB** (`supabase db start` on the runner); (b) Node/supabase-js tests against the remote dev project (needs secret key + DB password in CI, slower, pollutes dev data); (c) local only (impossible on this machine: no Docker) | **(a)**: hermetic, no secrets in CI, tests the migrations themselves, types derive from migrations. Two new jobs (`supabase`, `bundle`) the owner adds as required checks | |
| D3 | Which client key | (a) **publishable key** `sb_publishable_…` as `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; (b) legacy `anon` JWT as `EXPO_PUBLIC_SUPABASE_ANON_KEY` (matches AC wording) | **(a)**: legacy keys stop working at the end of 2026 (about two months away) and can't be rotated independently | |
| D4 | Region | Singapore (`ap-southeast-1`), Tokyo, US East, EU (Frankfurt) … | **The region closest to most expected users** (if that's the Philippines / SE Asia: Singapore). All projects in the same region. Can't be changed after creation | |
| D5 | Generated types location | `src/lib/database.types.ts` · `packages/schemas/` · `supabase/types/` | `src/lib/database.types.ts` (next to the client that uses it; Edge Functions in TB-22 can import it by relative path or get their own copy). Small extension of the wave-plan owned paths | proposed (coordinator) |

## Deviations (added during build)
| Date | Change | Reason | Approved by |
|---|---|---|---|
