# TB-20 — Intent

> Jira: https://stratyge.atlassian.net/browse/TB-20 · Blueprint: US-006 · Epic TB-2 (Auth & Accounts) · Wave 1 · Risk: **High** (auth, session secrets)
> Status: **Accepted** by the owner on 2026-10-28 (D1–D9 option A, see [spec.md § Decisions](spec.md#decisions))

## Problem
Task Buddy has a Supabase backend (TB-19) but nobody can sign in. The client in `src/lib/supabase.ts` deliberately runs with `persistSession: false, autoRefreshToken: false`, so there is no user, no JWT and no `profiles` row. Everything server-side that comes next needs a signed-in user: the AI gateway checks a JWT (TB-22), sync (TB-43), push tokens (TB-46), shared spaces (TB-68), billing (TB-77), and account deletion/export (TB-53). Apple/Google sign-in (TB-50) builds on the same session layer.

## Desired outcome
- A user types their email, gets a **6-digit code** by email, types it in, and lands on **Today within 3 seconds** of submitting.
- The session **survives an app restart** and **refreshes on its own** while the app is in the foreground.
- The session (access + refresh token) is stored in **expo-secure-store** (iOS Keychain / Android Keystore-backed), never in plain AsyncStorage, SQLite or logs.
- A wrong or expired code shows an **inline error**; the user can ask for a new code **after 30 seconds**.
- **Sign-out** clears the stored session.
- One `features/auth` module owns the session (`useSession()`, `signOut()`), so later tickets reuse it instead of talking to `supabase.auth` directly.

## Affected users
- Every end user (first-run and returning). Free and Pro alike; shared-space roles don't exist yet.
- Developers on every later backend ticket (they consume the session hook and the authenticated client).
- The owner: dashboard settings (email template, OTP length/expiry, rate limits, SMTP) are owner-only actions — [`docs/actions/supabase-auth-email-otp.md`](../../actions/supabase-auth-email-otp.md).

## Constraints
- **No secrets client-side.** The app keeps using the publishable key; tokens are user-scoped secrets and live only in secure storage. Never log tokens, codes or full emails (CLAUDE.md §4).
- **Validate at the boundary** (Zod): the email and the 6-digit code before any network call; Supabase responses are typed by supabase-js.
- **RLS stays deny-by-default.** `profiles` rows are created by the TB-19 trigger `on_auth_user_created`; TB-20 adds no client insert path unless D4 says so.
- **Local-first:** core task use must keep working offline (CLAUDE.md §1). How that squares with sign-in is decision D2.
- **New native module:** `expo-secure-store` is not installed today. Adding it means a **new EAS development build** for Android and iOS before device testing (the current dev client can't load it).
- **Owner machine has no Docker.** Any test that needs the local Supabase stack (Auth + Mailpit) runs in GitHub Actions only.
- **Prerequisite owner action:** the `profiles` migration is not yet pushed to dev/staging ([`supabase-db-push.md`](../../actions/supabase-db-push.md)). Until it is, a real sign-in on dev creates an `auth.users` row with **no** profile row (the trigger doesn't exist there yet).
- Wave plan owned paths: `src/app/(auth)/**`, `src/features/auth/**`. Shared files touched (coordinator OK needed): `src/lib/supabase.ts`, `src/app/_layout.tsx`, `package.json` / lockfile, `app.json` (config plugin), `supabase/config.toml`, `.github/workflows/ci.yml`.

## Out of scope
- Apple and Google sign-in (TB-50).
- Account deletion and data export (TB-53).
- Sync of local tasks to the server and attaching local rows to a user (TB-43).
- Profile editing UI (display name, timezone) and the real Settings screen (TB-32). TB-20 only adds a sign-out entry point.
- Biometric unlock / `requireAuthentication` on SecureStore.
- Maestro E2E in CI (TB-52 owns the Maestro setup); TB-20 adds an API-level integration test instead (D8).
- Custom SMTP provider set-up beyond what D6 decides.

## Open questions
| # | Question | Why it matters | Answer (who, date) |
|---|---|---|---|
| 1 | D1–D9 in [spec.md](spec.md#open-decisions) | They change security posture, UX, native modules, cost and CI | Owner, 2026-10-28: all option A |
| 2 | Has `supabase db push` run on dev and staging? | Without it, sign-in works but no `profiles` row is created | Owner, pending |
| 3 | AC says "resend after 30 seconds"; Supabase's default per-user OTP send interval is **60 s** | Either the dashboard setting changes or the AC does (D5) | Owner, 2026-10-28: dashboard set to 30 s (D5-A) |
