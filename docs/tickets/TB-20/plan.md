# TB-20 — Implementation plan

> Jira: https://stratyge.atlassian.net/browse/TB-20 · Spec: [spec.md](spec.md) · Intent: [intent.md](intent.md)
> Status: **Accepted** by the owner on 2026-10-28 (spec D1–D9 all option A). Tasks 1–6 and 8 built on this branch; Task 6's CI job awaits the owner (protected workflow file); Task 7 is the device run. Deviations: [spec.md § Deviations](spec.md#deviations-added-during-build).
> Bar: an engineer who has never seen the conversation could implement the change from this plan alone.

## Branch & worktree
`feat/tb-20/email-otp-sign-in` · Orca worktree `tb-20-email-otp` · from `origin/main` @ `4f6c699`.

- **Owns:** `src/app/(auth)/**`, `src/features/auth/**`, `docs/tickets/TB-20/**`, `docs/actions/supabase-auth-email-otp.md`, `supabase/templates/**` (new).
- **Shared (coordinator OK, minimal diff):** `src/lib/supabase.ts` + `src/lib/supabase.test.ts` (TB-19: storage + auto-refresh options), `src/app/_layout.tsx` (provider + guard), `src/features/navigation/components/SettingsScreen.tsx` (one sign-out button), `package.json` / `pnpm-lock.yaml` (`expo-secure-store` via `npx expo install`; rebase and `pnpm install` on conflict, never hand-merge), `app.json` (config plugin), `supabase/config.toml` (`[auth]` sections only), `.github/workflows/ci.yml` (`supabase` job steps), `docs/actions/README.md`.
- **Must not edit:** `src/db/**` (unless D7 = B/C, then coordinate with the TB-21 area owner), `src/components/ui/**` (reuse only), `supabase/migrations/**` (no schema change with D4-A), `packages/schemas/**`.
- **Rebase note:** TB-26 (PR #14) touches `src/app/_layout.tsx` and adds TanStack Query / RHF / Zustand. Rebase on `main` after it merges, before Task 4.

## Dependencies
- Blocked by TB-19 and TB-18 — both **Done** in Jira (read 2026-10-28). Re-check status and the `ready` label at dispatch.
- **Task 0 (owner):** `supabase db push` on dev and staging ([`supabase-db-push.md`](../../actions/supabase-db-push.md)) and the dashboard settings in [`supabase-auth-email-otp.md`](../../actions/supabase-auth-email-otp.md). Tasks 1–6 don't need them (they run against mocks and the CI-local stack); Task 7 (device run) does.
- **New EAS dev build** after Task 1 (native module). Owner runs `eas build --profile development --platform android` (and `ios` — simulator build per `eas.json`); about 15–25 min each on EAS.

## Tasks

### Task 1 — Install expo-secure-store
- [ ] `npx expo install expo-secure-store` (picks the SDK 58-compatible version; pin it exactly in `package.json` like the other deps).
- [ ] `app.json` plugins: `["expo-secure-store", { "configureAndroidBackup": true }]`.
- [ ] `jest.setup` / `__mocks__`: an in-memory `expo-secure-store` mock (Map-backed) for unit tests.
- Files: `package.json`, `pnpm-lock.yaml`, `app.json`, Jest mock.
- Verify: `pnpm typecheck && pnpm test`; `npx expo config --type public` shows the plugin. Flag to owner: **new dev build required**.

### Task 2 — Secure storage adapter *(D1)*
- [ ] `src/features/auth/session/secure-store-adapter.ts`: `createSecureStoreAdapter(store: SecureStoreLike, opts?)` → `{ getItem, setItem, removeItem }` (async, matches supabase-js `SupportedStorage`).
  - D1-A: chunk size 1,800 bytes (UTF-8 byte length, not `.length`); keys `<key>.<i>`; manifest `<key>.manifest = { v: 1, count }` written **after** all chunks; read requires manifest + all chunks else `null` + cleanup; `removeItem` deletes manifest first, then chunks (including stale higher-index chunks from a longer previous value).
  - Keys sanitized to SecureStore's allowed charset (`[A-Za-z0-9._-]`); supabase-js's default key `sb-<ref>-auth-token` already fits.
  - Options: `keychainAccessible: AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`.
  - Any thrown native error → log `auth.storage_error` (no values), return `null` / swallow on remove.
- [ ] `first-run` reinstall guard: on first launch (no kv-store marker), remove the adapter's keys, then set the marker.
- Tests (`secure-store-adapter.test.ts`): round-trip small and 6 KB values (incl. multi-byte chars); missing chunk → `null`; manifest missing → `null`; shrink from 4 chunks to 2 removes chunks 3–4; remove clears everything; native throw → `null` and no value in logs.

### Task 3 — Client + auto refresh
- [ ] `src/lib/supabase.ts`: `auth: { storage: secureStoreAdapter, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }`. Comment updated (TB-20).
- [ ] `src/features/auth/session/app-state-refresh.ts`: `registerAutoRefresh(auth, AppState)` → listener calling `startAutoRefresh()` on `active`, `stopAutoRefresh()` otherwise; idempotent (second call is a no-op); returns `remove()`.
- Tests: `supabase.test.ts` asserts the new auth options and the adapter instance; `app-state-refresh.test.ts` with a fake AppState (active → start, background → stop, registered once).

### Task 4 — Auth API, schemas and session provider
- [ ] `schema.ts`: `emailSchema` (trim, lowercase, `z.email()`, max 254), `otpCodeSchema` (strip non-digits, `/^\d{6}$/`), `maskEmail()`.
- [ ] `api/auth-api.ts`: `requestCode`, `verifyCode`, `signOut` (`scope: 'local'`), mapping `AuthError` → `AuthResult` kinds (`invalid_code`, `rate_limited`, `network`, `unknown`). `shouldCreateUser: true` *(D9)*.
- [ ] `session/session-provider.tsx`, `session/use-session.ts`: initial `getSession()`, one `onAuthStateChange` subscription, `isLoading`, cleanup; on `SIGNED_OUT` clear the TanStack Query cache (if present).
- Tests: schema table tests; `auth-api.test.ts` with a mocked client for every error mapping (codes `otp_expired`, `over_email_send_rate_limit`, `over_request_rate_limit`, `AuthRetryableFetchError`); `signOut` with a rejecting fetch still leaves storage empty; provider test: loading → session → signed out.

### Task 5 — Sign-in UI, guard and sign-out entry *(D2, D3, D5, D7)*
- [ ] `src/app/(auth)/_layout.tsx`, `src/app/(auth)/sign-in.tsx` (thin).
- [ ] `SignInScreen` (email step ↔ code step), `ResendCountdown` (30 s from `sentAt`, recomputed on focus/AppState), copy in `copy.ts` (run `design:ux-copy` over it).
- [ ] `src/app/_layout.tsx`: `SessionProvider` inside `UiProvider`/`DbGate`; `Stack.Protected guard={isSignedIn}` around `(tabs)` and `task/*`, `Stack.Protected guard={!isSignedIn}` around `(auth)`; splash held while `isLoading`. Keep `unstable_settings.anchor = '(tabs)'`.
- [ ] Settings: "Sign out" `Button` + confirm dialog → `signOut()`; D7-A keeps local DB.
- [ ] Accessibility: labels on both inputs, errors announced (`accessibilityLiveRegion="polite"` / `AccessibilityInfo.announceForAccessibility`), touch targets ≥ 44 pt.
- Tests (RNTL): invalid email disables send; send → code step with masked email; wrong code → inline error, field keeps value; resend disabled until 30 s (fake timers) then calls `requestCode` again; success → navigates to Today (router mock); signed-in launch skips sign-in; sign-out returns to sign-in; no `console.*` with token/code/email (static test).

### Task 6 — CI: real Auth + Mailpit integration test *(D8)*
- [ ] `supabase/config.toml`: `[auth.email.template.magic_link]` (+ `confirmation`) → `supabase/templates/magic-link.html` containing only `{{ .Token }}` copy; `otp_length = 6`; `otp_expiry = 600`; `[auth.rate_limit] email_sent` high enough for the test; `max_frequency` per D5.
- [ ] `src/features/auth/auth.integration.test.ts` (Node env, skipped unless `SUPABASE_AUTH_IT=1`): `signInWithOtp` → poll Mailpit `GET http://127.0.0.1:54324/api/v1/messages` / message body for `\d{6}` → wrong code fails with `invalid_code` → correct code returns a session → `profiles` select returns exactly the user's row → `signOut` → `getSession()` is `null`. Uses an in-memory storage (the SecureStore adapter is covered by unit tests).
- [ ] `.github/workflows/ci.yml` `supabase` job: after the pgTAP step, `supabase start -x studio,storage-api,imgproxy,realtime,edge-runtime,logflare,vector,supavisor,postgres-meta` (exact service names checked against `supabase start --help` for CLI 2.122.0), export the local publishable key from `supabase status -o env`, run `SUPABASE_AUTH_IT=1 pnpm jest src/features/auth/auth.integration.test.ts` (job needs pnpm/node setup steps added). Keep `timeout-minutes` ≤ 15.
- Verify: CI green; one deliberate negative run (template without `{{ .Token }}` → test fails) recorded in `verification.md`, then reverted.

### Task 7 — Device verification (needs Task 0 + new dev build)
- [ ] Android emulator (dev build) and iOS simulator (dev build), dev project: sign in with a real inbox; time tap→Today (screen recording timestamps); kill and relaunch → still on Today; airplane mode relaunch → Today, tasks usable; wrong code → inline error; resend disabled 30 s; sign out → sign-in screen; relaunch → still signed out.
- [ ] Screenshots into `docs/tickets/TB-20/`.

### Task 8 — Docs and review
- [ ] `verification.md` (commands, AC table, device evidence, review findings).
- [ ] Independent reviewer subagent (spec + diff + `REVIEW.md`) and a security pass (`senior-security` / `security-review`) — high-risk tier.
- [ ] `docs/actions/supabase-auth-email-otp.md` status updated; follow-up tickets proposed: custom SMTP (D6-A), CAPTCHA if abused (T3), TB-43 note for D7.

## Test strategy
| AC | Test (layer) | File |
|---|---|---|
| AC1 land on Today | RNTL flow test (mocked API) + CI integration (real Auth) + device timing | `SignInScreen.test.tsx`, `auth.integration.test.ts`, `verification.md` |
| AC1 survives restart | Provider test (stored session → signed in) + adapter round-trip + device relaunch | `session-provider.test.tsx`, `secure-store-adapter.test.ts` |
| AC2 inline error | RNTL wrong-code test + integration wrong-code case | `SignInScreen.test.tsx`, `auth.integration.test.ts` |
| AC2 resend after 30 s | RNTL fake-timer test + device check | `ResendCountdown.test.tsx` |
| AC3 SecureStore | `supabase.test.ts` asserts the adapter is the `storage`; adapter unit tests | `src/lib/supabase.test.ts` |
| AC3 refresh automatically | AppState listener test + device: resume after > `jwt_expiry` (or a short local `jwt_expiry` in CI integration: refresh succeeds) | `app-state-refresh.test.ts` |
| AC3 sign-out clears | `signOut` test asserts SecureStore mock is empty (incl. failing network) + integration | `auth-api.test.ts` |
| AC4 | `pnpm lint && pnpm typecheck && pnpm test`, CI `ci` + `supabase` + `bundle` jobs | — |

RLS: no new tables or grants (D4-A); existing `profiles_rls.test.sql` keeps passing. No E2E (Maestro is TB-52). No AI evals (no AI calls).

## Risks & rollback
| Risk | Detect | Mitigation / rollback |
|---|---|---|
| Session > SecureStore limit on some iOS versions | Adapter tests with 6 KB values; device run on iOS | D1-A chunking |
| Dev build not rebuilt → `Cannot find native module 'ExpoSecureStore'` | App crashes at launch on old dev client | Owner rebuilds (plan Dependencies); documented in the action guide |
| Resend 429 because dashboard interval is still 60 s | Device run / integration test | Owner action step; error copy handles 429 |
| Built-in SMTP cap hit during testing | "Too many requests" on send | Ration sends; D6-B if it blocks |
| Users signed in before `db push` have no profile | Integration test asserts the row; `auth.profile_missing` log | Backfill SQL in spec Edge cases |
| Guard misconfigured → app stuck on splash or sign-in loop | RNTL guard tests; device run | Revert the `_layout.tsx` change (single commit) |

**Rollback:** revert the PR. No Postgres migration; SecureStore keys orphaned on devices are harmless (the reverted client doesn't persist sessions). Because a native module is added, an OTA update can't roll back across the dev-build boundary — rollback for installed builds = previous build or a JS update that simply stops using the adapter.
