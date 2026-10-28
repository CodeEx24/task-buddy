# TB-20 — Spec

> Jira: https://stratyge.atlassian.net/browse/TB-20 · Intent: [intent.md](intent.md) · Plan: [plan.md](plan.md)
> Status: **Accepted** by the owner on 2026-10-28 (D1–D9 all option A, relayed by the coordinator session). High risk.
> Facts checked 2026-10-28 against Supabase docs (`search_docs`: passwordless email, email templates, rate limits, production checklist, `startAutoRefresh`), supabase-js `2.118.0` (Context7 + the installed `@supabase/auth-js` 2.118.0 type definitions), Expo SecureStore docs (Context7, unversioned) and the installed `expo-router` 58 (`Protected` component).

## Acceptance criteria (verbatim from Jira)
- [ ] AC1 Given a valid email and correct code, when I submit, then I land on Today within 3 seconds and the session survives an app restart
- [ ] AC2 Given a wrong or expired code, then an inline error is shown and I can request a new code after 30 seconds
- [ ] AC3 Sessions are stored in expo-secure-store and refresh automatically; sign-out clears them
- [ ] AC4 Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated

> Reading of AC1 "within 3 seconds": measured from tapping **Verify** to the Today tab being visible, on a dev build with a normal network. It covers one `verifyOtp` round trip, the session write to SecureStore and one navigation. It is not a guarantee on a slow network; the screen shows a spinner and stays responsive.

## Behaviour

### Flow (assuming the recommended options)
1. **Email step** — `(auth)/sign-in`. One email `Input` (TB-17) with `keyboardType="email-address"`, `autoComplete="email"`, `textContentType="emailAddress"`. **Send code** is disabled until the value passes `emailSchema` (Zod: trimmed, lower-cased, `z.email()`, ≤ 254 chars). On tap: `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })` (D9). Success → code step. The UI never says whether the email already has an account.
2. **Code step** — same route, second state (no extra route needed). Copy: "We sent a 6-digit code to j•••@example.com". One `Input` with `keyboardType="number-pad"`, `textContentType="oneTimeCode"` (iOS autofill), `autoComplete="one-time-code"` (Android), `maxLength={6}`. **Verify** is enabled when the value matches `/^\d{6}$/` (`otpCodeSchema`); a pasted 6-digit code auto-submits once. On tap: `supabase.auth.verifyOtp({ email, token, type: 'email' })`.
3. **Success** — supabase-js writes the session to storage (SecureStore adapter, D1) and emits `SIGNED_IN`. The session provider updates, the route guard (D2) flips, and the app shows Today (`/(tabs)`, i.e. `src/app/(tabs)/index.tsx`). `router.replace`, so Back doesn't return to the code screen.
4. **Restart** — on launch the provider calls `supabase.auth.getSession()` (reads SecureStore). While it is loading, the splash screen stays up (no flash of the sign-in screen). A stored session → Today directly.
5. **Refresh** — client created with `autoRefreshToken: true, persistSession: true, detectSessionInUrl: false`. Supabase docs: "On non-browser platforms the refresh process works continuously in the background … hook into your platform's foreground indication mechanism", so one module-level `AppState` listener calls `startAutoRefresh()` on `active` and `stopAutoRefresh()` otherwise (registered once, removable for tests).
6. **Sign-out** — entry in the Settings tab (TB-18 placeholder screen gets one `Button`; TB-32 replaces the screen later). Confirm dialog → `supabase.auth.signOut({ scope: 'local' })` (this device only). Afterwards the adapter's storage keys are gone (verified by test), TanStack Query cache is cleared (if TB-26 has landed), and the guard shows sign-in. Local task data handling: D7.

### States and errors
| Situation | Shown | Notes |
|---|---|---|
| Invalid email format | Inline under the field: "Enter a valid email address." | No network call |
| Send fails: offline / network | Inline: "No connection. Check your internet and try again." | Button re-enabled |
| Send fails: `429` / `over_email_send_rate_limit` / `over_request_rate_limit` | Inline: "Too many requests. Try again in a minute." Countdown continues | Error *code* mapped, never the raw server message |
| Wrong code (`otp_expired` or "invalid" `403`) | Inline under the code field: "That code is wrong or has expired." Field keeps focus, value selected | Supabase returns the same error for wrong and expired; we don't distinguish |
| Too many verify attempts (`429`) | Inline: "Too many attempts. Wait a few minutes or request a new code." | Server limit: token verifications per IP per 5 min |
| Resend | "Resend code" link disabled with "Resend in 0:30" countdown, starting when a code is sent. Enabled at 0 → calls `signInWithOtp` again and restarts the countdown | 30 s is the AC; the server must allow it (D5) |
| Change email | "Use a different email" returns to step 1, keeping the typed email | |
| App backgrounded on code step | State kept (component state); countdown recomputed from a stored `sentAt` timestamp, not from ticking intervals | |
| Offline at launch with a stored session | App opens on Today. supabase-js keeps the session and retries refresh; it signs out only on a definitive refresh failure (revoked/invalid refresh token) | Local-first: core task use keeps working |
| Refresh token revoked server-side | `SIGNED_OUT` event → guard shows sign-in with a one-line banner "You've been signed out." | |
| SecureStore read throws (corrupt/locked keychain) | Treated as "no session": adapter returns `null`, clears its keys, logs `auth.storage_error` (no values) | User signs in again |

## Technical design

- **Surfaces**
  - `src/app/(auth)/_layout.tsx` (Stack, header hidden) and `src/app/(auth)/sign-in.tsx` (thin: renders `SignInScreen`).
  - `src/app/_layout.tsx`: wraps the Stack in `SessionProvider`; guard per D2 using expo-router's `Stack.Protected` (`guard: boolean`, `redirectTo?: Href` — confirmed in installed `expo-router/build/views/Protected.d.ts`). Keeps `SplashScreen` up until `isLoading` is false.
  - `src/features/auth/`
    - `components/SignInScreen.tsx`, `components/EmailStep.tsx`, `components/CodeStep.tsx`, `components/ResendCountdown.tsx`
    - `session/secure-store-adapter.ts` — the supabase-js `storage` adapter (D1). Pure logic over an injected `SecureStoreLike` interface, so it is unit-testable in Node.
    - `session/session-provider.tsx` + `session/use-session.ts` — `{ session, user, isLoading }`; subscribes to `onAuthStateChange` once; unsubscribes on unmount.
    - `session/app-state-refresh.ts` — `registerAutoRefresh(auth, appState)` returns an unsubscribe.
    - `api/auth-api.ts` — `requestCode(email)`, `verifyCode(email, code)`, `signOut()`; returns a typed `AuthResult` (`ok` | `{ kind: 'invalid_code' | 'rate_limited' | 'network' | 'unknown' }`) mapped from `AuthError.code`/`status`. Components never see raw `AuthError` messages.
    - `schema.ts` — `emailSchema`, `otpCodeSchema` (Zod), `maskEmail()`.
    - `copy.ts` — user-facing strings (one place, reviewed with `design:ux-copy`).
  - `src/lib/supabase.ts` (TB-19 file, shared): `createClient(url, key, { auth: { storage: secureStoreAdapter, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })`. No `lock` option: in 2.118 the default is lockless coordination and the migration note says a custom `processLock` is only for v2 back-compat (Context7: `auth-js/migrations/lockless-coordination.md`). The existing test "no session persistence" is updated, not deleted.
- **Interfaces & contracts**
  - `emailSchema`, `otpCodeSchema` live in `src/features/auth/schema.ts` (app-only; not needed by edge functions yet, so not in `packages/schemas`).
  - `useSession(): { session: Session | null; user: User | null; isLoading: boolean }`. `getAccessToken()` for TB-22's gateway client.
  - Error mapping table is the contract for UI copy (see States).
- **Data changes**
  - **None in Postgres** if D4 = A (TB-19's `on_auth_user_created` trigger already inserts `profiles(id)`).
  - **Local SQLite: none.** (D7 options B/C would add a "wipe local data" repo function in `src/db`, owned by TB-21's area.)
  - `supabase/config.toml` (local stack + CI only; hosted projects are set in the dashboard): `[auth.email.template.magic_link]` with a `{{ .Token }}` template file `supabase/templates/magic-link.html` (and `confirmation` if confirmations are on), `[auth.email] otp_length = 6`, `otp_expiry` per D5, `max_frequency` per D5, `[auth] site_url = "taskbuddy://"` (unused by code flow, set for safety), `[auth.rate_limit] email_sent` raised for the CI test.
  - `app.json`: add the `expo-secure-store` config plugin with `configureAndroidBackup: true` (excludes SecureStore data from Android Auto Backup; restored Keystore-encrypted values can't be decrypted on a new device). No `faceIDPermission` (biometrics out of scope).
- **Reuse:** `Input`, `Button`, `Card`, `UiProvider` from `src/components/ui` (TB-17); `getSupabaseClient()` and `getEnv()` (TB-19); TanStack Query client from TB-26 (only `queryClient.clear()` on sign-out); React Hook Form + `@hookform/resolvers/zod` from TB-26 if merged (otherwise two controlled inputs — no new form library).

### SecureStore facts that drive D1
- Expo docs (SecureStore, "Storage limits"): Expo imposes no hard limit, but "some iOS versions have restricted values to approximately 2048 bytes"; handle native storage failures. Supabase's own Expo sample warns at `value.length > 2048`.
- A Supabase session JSON (access-token JWT + refresh token + expiry + the full `user` object with identities and metadata) is routinely **over 2 KB**, so a naive adapter is a real risk.
- supabase-js 2.118 has an **experimental** `userStorage` option: `storage` then holds only tokens + metadata, and the user object goes to `userStorage` under `storageKey + '-user'` (installed `auth-js` types). Useful to shrink the secure payload, but it's experimental.
- iOS Keychain items survive app uninstall; on first launch after a reinstall we clear any stale keys (a `first-run` marker in expo-sqlite kv-store), so a reinstall starts signed-out.
- Keychain accessibility: `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` — readable by background tasks after the first unlock (later check-ins/push), never migrated to another device via backup.
- `expo-secure-store` is a **native module** that isn't in the project yet → **new EAS development build** for Android and iOS (and new preview builds) before anything can be tested on device. JS-only OTA updates can't add it.

## Edge cases
| Case | Expected |
|---|---|
| Email with uppercase / spaces | Trimmed and lower-cased before send and verify (same value both times) |
| User requests a code, then requests again before using the first | Only the latest code is valid (Supabase behaviour); copy says "use the latest code" |
| Code pasted with spaces ("123 456") | Non-digits stripped before validation |
| Verify tapped twice quickly | Second tap ignored while pending (button `loading`) |
| Session older than `jwt_expiry` when the app resumes | AppState `active` → `startAutoRefresh()` refreshes before the next API call; `getSession()` returns the refreshed session |
| App killed during a token refresh | Adapter writes are all-or-nothing per key set (D1-A: manifest written last); a half-written set reads as `null` → sign-in again, never a crash |
| Sign-out while offline | Local session removed regardless (`scope: 'local'` clears storage even if the revoke call fails — verified by a test with a failing fetch); server refresh token expires on its own |
| Reinstall on iOS | Stale Keychain session cleared on first run (see above) |
| Same email on two devices | Two independent sessions; local sign-out on one doesn't affect the other |
| `profiles` migration not yet pushed on the target project | Sign-in still works; no profile row. Owner action must run first (plan Task 0). Users created before the push get a backfill (`insert … select id from auth.users on conflict do nothing`) — only needed if the owner signs in on dev before pushing |

## Security, privacy & AI cost

**Threats and mitigations (high risk)**
| # | Threat / abuse case | Mitigation |
|---|---|---|
| T1 | Token theft from device storage (rooted device, backup extraction) | Tokens only in SecureStore (Keychain/Keystore); `THIS_DEVICE_ONLY`; Android backup excluded via config plugin; never in AsyncStorage, SQLite, MMKV, logs, Sentry breadcrumbs or analytics |
| T2 | OTP brute force | 6 digits (10⁶) + Supabase per-IP verification limit (default 30 / 5 min) + short expiry (D5). Client adds no retry loops |
| T3 | Email bombing / cost abuse (someone sends codes to a victim's address) | Server: per-user resend interval and hourly email cap (dashboard, D5/D6). Client: 30 s countdown. Follow-up: CAPTCHA (Supabase `auth.captcha`) if abuse appears — proposed as a later ticket, not built now |
| T4 | Account enumeration | `shouldCreateUser: true` makes "send code" behave the same for known and unknown emails; UI copy never says "account not found" |
| T5 | Phishing via magic link / open redirect | Code-only email (D3-A): no link, no redirect URL, no deep-link handler to hijack |
| T6 | Logging PII / secrets | Logger rule: never log email, code, tokens or the session object. Emails masked (`j•••@example.com`) where shown. A Jest test greps `src/features/auth` for `console.` calls that take `session`, `token` or `code` |
| T7 | Service-role key in the client | Unchanged from TB-19: publishable key only; bundle scan job `bundle` still runs |
| T8 | Stale session after server-side revoke | `SIGNED_OUT` / failed refresh → provider clears state, guard shows sign-in |
| T9 | Profile row write by another user | RLS from TB-19 (own-row select/update only, no insert/delete grant). TB-20 adds no grants (D4-A) |

**Data leaving the device:** the email address and the code, to Supabase Auth over HTTPS. Supabase stores the email in `auth.users`. No analytics event contains the email.

**AI cost:** none. No AI calls in this ticket.

## Open decisions

Answer each with its letter (for example "D1 A, D2 B, …"). The recommendation is first in each list.

### D1 — Where the session is stored
| Option | What it means | Consequences |
|---|---|---|
| **A. expo-secure-store with a chunking adapter (recommended)** | Our adapter splits the session JSON into ≤ 1,800-byte chunks under `tb.auth.<n>` keys plus a manifest key written last; reads reassemble, removes delete every chunk | Meets AC3 literally (the whole session is in SecureStore). No crypto code of our own. ~80 lines, fully unit-testable. Several Keychain reads at launch (a few ms). **New native module → new EAS dev build (Android + iOS).** |
| B. "LargeSecureStore" (Supabase's documented pattern): AES-256 key in SecureStore, encrypted session in expo-sqlite kv-store (already installed) or AsyncStorage | Supabase's sample uses `aes-js` (CTR mode) + AsyncStorage + `react-native-get-random-values` | Only a 32-byte key in SecureStore; session ciphertext elsewhere. We'd own crypto code (CTR with no MAC = no integrity check). Arguably weaker reading of AC3. `aes-js` is pure JS; AsyncStorage would be **a second new native module** (use kv-store to avoid it). **Still needs the new dev build** for SecureStore. |
| C. Plain SecureStore adapter + experimental `userStorage` | Tokens in SecureStore; the user object in expo-sqlite kv-store | Smallest code. Relies on an `@experimental` supabase-js option, and the access-token JWT alone can approach 2 KB as metadata grows. The user object (email) sits unencrypted in SQLite. **New dev build.** |
| D. AsyncStorage or `expo-sqlite/localStorage` (Supabase quickstart default) | Unencrypted session on disk | **Fails AC3** and CLAUDE.md "no secrets client-side" spirit. Listed only to reject it. |

**Recommendation: A** — the only option where every byte of the session is in the Keychain/Keystore without us writing crypto.

### D2 — Is sign-in required before using the app?
| Option | What it means | Consequences |
|---|---|---|
| **A. Required: route guard (recommended for Wave 1)** | Root `Stack.Protected guard={!!session}` wraps `(tabs)` and `task/*`; a second `Stack.Protected guard={!session}` wraps `(auth)`. First launch shows sign-in | Simplest, matches AC1 ("land on Today") and the Wave 1 exit criterion. Every local row created later belongs to a known user, which makes TB-43 sync simpler. **Cost:** a brand-new install needs a network connection once; after that the app works offline (session persists). |
| B. Optional: app works signed-out, sign-in from Settings or when a cloud feature (AI, sync) needs it | Guard only on cloud features | Best offline-first story. But TB-43 must later attach anonymous local data to an account (merge rules, two users on one device). More states to test now; AC1's "land on Today" happens from Settings instead. |
| C. Welcome screen with "Sign in" and "Continue without an account" | Mix of A and B; choice remembered | Same merge work as B plus one extra screen. Good long-term UX; more scope than 3 points. |

**Recommendation: A** — smallest correct scope for a 3-point story; B/C can be added later without changing the session layer.

### D3 — Code in the email, or a magic link?
| Option | What it means | Consequences |
|---|---|---|
| **A. 6-digit code only (recommended)** | Magic Link (and Confirm signup) templates contain `{{ .Token }}` and no link | Matches the AC ("emailed 6-digit code"). No deep links, redirect URLs or `token_hash` handling. iOS/Android code autofill works. Closes phishing/open-redirect surface (T5). |
| B. Code and a link in the same email | Template has `{{ .Token }}` plus a `taskbuddy://auth/confirm?token_hash={{ .TokenHash }}&type=email` link; app handles the deep link with `verifyOtp({ token_hash, type: 'email' })` | One-tap on the same phone. Needs redirect-URL allow-list, deep-link route, PKCE/`token_hash` tests, and fails when the email is opened on another device. ~2 extra points. |
| C. Magic link only | Supabase default | **Fails the AC.** |

**Recommendation: A.**

### D4 — How the `profiles` row is created
| Option | What it means | Consequences |
|---|---|---|
| **A. Keep TB-19's database trigger (recommended)** | `on_auth_user_created` (`security definer`, empty `search_path`) inserts `profiles(id)` when Auth creates the user | Already built and tested (pgTAP). No client insert grant, so RLS stays select/update-own only. Atomic with user creation. Needs `supabase db push` on dev/staging first. |
| B. Client upsert after `verifyOtp` | App calls `profiles.upsert({ id: user.id })` | Needs a new `insert` grant + `with check (auth.uid() = id)` policy and its RLS tests; can fail separately from sign-in (network) leaving users without a row. Duplicates the trigger. |
| C. Trigger + client "ensure" read on sign-in | Trigger creates; the app checks the row exists and reports `auth.profile_missing` if not | Catches the "migration not pushed" case loudly. Small extra query per sign-in. |

**Recommendation: A** (with the backfill note in Edge cases if anyone signed in before the push).

### D5 — OTP expiry and resend interval (dashboard values)
The AC needs "request a new code after 30 seconds". Supabase's default minimum interval between OTP sends to the same user is **60 seconds** (customizable); a resend at 30 s would get a `429`.
| Option | What it means | Consequences |
|---|---|---|
| **A. Set the server interval to 30 s; OTP expiry 600 s (10 min) (recommended)** | Owner changes *Authentication → Rate Limits* (OTP/magic-link send interval) to 30 s and *Email OTP Expiration* to 600 s on dev, staging, prod; same values in `config.toml` | Matches the AC exactly. Shorter expiry than the 3,600 s default narrows brute-force time (Supabase's checklist recommends ≤ 3,600 s). Slightly more email volume possible per user. |
| B. Keep Supabase's 60 s; change the AC to 60 s | App countdown 60 s | No dashboard change for the interval. **Needs a Jira AC edit by the owner.** |
| C. 30 s countdown in the app, keep server at 60 s | | User sees an enabled button that then fails. Not recommended. |

**Recommendation: A.**

### D6 — Who sends the emails (SMTP)
Supabase's built-in email service is for trying things out: a very small per-hour cap (changeable only with custom SMTP), best-effort delivery, generic sender. The production checklist says to use custom SMTP.
| Option | What it means | Consequences |
|---|---|---|
| **A. Built-in sender on dev for TB-20; custom SMTP as a follow-up ticket before the Wave 3 beta builds (recommended)** | No new vendor now | Free, no domain needed. Device testing must ration sends (a handful per hour). CI is unaffected (local Mailpit). Risk: staging testers hit the cap. |
| B. Custom SMTP now (Resend, Postmark, SendGrid, AWS SES …) on dev + staging | Owner creates the provider account, verifies a sending domain (DNS records), enters SMTP credentials in the dashboard | Realistic deliverability and limits from day one. Needs a domain you own and possibly a paid plan; credentials are owner-only (never in the repo). Adds ~30–60 min of owner work. |
| C. Custom SMTP only on prod, built-in on dev/staging | | Cheapest; staging never tests real deliverability. |

**Recommendation: A** — no cost or domain needed to finish TB-20; I'll draft the follow-up ticket text.

### D7 — What sign-out does to local data
Today all tasks live only in local SQLite (no sync until TB-43), and local rows have no owner column.
| Option | What it means | Consequences |
|---|---|---|
| **A. Clear the session and in-memory caches; keep the local database (recommended for now)** | Tasks stay on the device | No data loss before sync exists. With D2-A, the next person who signs in on the same device sees the previous user's local tasks — acceptable for a single-user phone in Wave 1; revisit in TB-43 when data is in the cloud. Record as a known limitation. |
| B. Clear the session and wipe the local database (confirm dialog warns) | `DELETE` all local rows (repo function in `src/db`) | Best privacy on shared devices. **Permanent data loss** until TB-43 sync exists. Touches TB-21's area. |
| C. Ask at sign-out: "Keep tasks on this device" / "Delete them" | | Most flexible; one more dialog and both code paths to test. |

**Recommendation: A**, with a Jira follow-up note on TB-43 to switch to B once sync backs data up.

### D8 — How sign-in is tested end to end
The owner's machine can't run Docker, so anything needing the local Supabase stack runs in CI.
| Option | What it means | Consequences |
|---|---|---|
| **A. CI integration test against local Supabase Auth + Mailpit, plus a manual device run (recommended)** | Extend the `supabase` CI job: `supabase start` with only db/auth/mailpit (exclude studio, storage, realtime, edge runtime …); a Node Jest test calls `signInWithOtp`, reads the 6-digit code from Mailpit's HTTP API (port 54324), calls `verifyOtp`, asserts a session, a `profiles` row (trigger), wrong-code error and `signOut`. Owner runs the device checklist on the dev project with a real inbox | Real Auth server behaviour proved on every PR. CI job ~1–2 min longer. Device run proves SecureStore + restart + 3 s on Android and iOS. |
| B. Unit tests with a mocked supabase-js only, plus the device run | | Fastest CI, but never exercises real GoTrue (template, rate limits, error codes). Weak for a high-risk ticket. |
| C. A + a Maestro flow now | | Maestro setup belongs to TB-52; would need an emulator in CI and an inbox reader. Defer. |

**Recommendation: A.**

### D9 — Same flow for new and existing users?
| Option | What it means | Consequences |
|---|---|---|
| **A. Yes: `shouldCreateUser: true` (recommended)** | First code to a new email creates the account | One screen, no separate sign-up story exists. Prevents account enumeration (T4). Anyone can create an account with any email they can read. |
| B. No: `shouldCreateUser: false` + separate sign-up | | Needs a sign-up story and UI that doesn't exist in the backlog; leaks whether an account exists unless carefully worded. |

**Recommendation: A.**

## Decisions
| Decision | Options considered | Choice | Decided by / date |
|---|---|---|---|
| D1 Session storage | A chunked SecureStore · B AES + kv-store · C SecureStore + `userStorage` · D AsyncStorage | A — expo-secure-store with a chunking adapter | owner, 2026-10-28 |
| D2 Sign-in required? | A guard · B optional · C welcome + skip | A — required, `Stack.Protected` route guard | owner, 2026-10-28 |
| D3 Code vs link | A code · B code + link · C link | A — 6-digit code only, no link | owner, 2026-10-28 |
| D4 Profile row | A trigger · B client upsert · C trigger + check | A — keep TB-19's `on_auth_user_created` trigger | owner, 2026-10-28 |
| D5 Expiry / resend | A 30 s + 600 s · B 60 s + AC edit · C mismatch | A — 30 s resend, 600 s expiry (dashboard + `config.toml`) | owner, 2026-10-28 |
| D6 SMTP | A built-in now, custom later · B custom now · C custom on prod only | A — built-in sender now; custom SMTP follow-up before the Wave 3 beta | owner, 2026-10-28 |
| D7 Sign-out local data | A keep · B wipe · C ask | A — clear session and caches, keep local tasks | owner, 2026-10-28 |
| D8 E2E testing | A CI Auth+Mailpit + device · B mocks + device · C + Maestro | A — CI test on local Supabase Auth + Mailpit, plus a manual device run | owner, 2026-10-28 |
| D9 New users | A create on first code · B separate sign-up | A — `shouldCreateUser: true`, one flow | owner, 2026-10-28 |

## Deviations (added during build)
| Date | Change | Reason | Approved by |
|---|---|---|---|
| 2026-10-28 | **No reinstall guard** (clearing a Keychain session that survived an iOS reinstall) | It needs a non-secure marker store; the only one available (expo-sqlite kv-store) may only be imported from `src/db` (TB-21 lint rule) and `src/db` is outside this ticket. The surviving session belongs to the same device owner. Logged as a follow-up | Pending coordinator |
| 2026-10-28 | **CI `auth` job not added to `.github/workflows/ci.yml`**; job YAML committed as [`ci-auth-job.yml`](ci-auth-job.yml) for the owner to paste | The repo's `protected-paths-guard` hook blocks agent edits to `.github/workflows/*.yml` | Pending owner |
| 2026-10-28 | Integration test runs with its own `jest.integration.config.js` (Node environment) | The jest-expo preset stubs `fetch`, so a real HTTP call to the local stack is impossible under it | Agent (no behaviour change) |
| 2026-10-28 | No console logging at all in auth code (spec said "log `auth.storage_error`") | Stricter than spec: storage failures read as "no session"; a static test forbids `console.*` in auth code. Sentry wiring can add a value-free event later | Agent (stricter) |
| 2026-10-28 | No "You've been signed out" banner after a server-side revoke | The guard returns to sign-in; banner deferred (UX polish, no AC) | Agent (minor) |
| 2026-10-28 | `expo-secure-store` config plugin kept in `app.json` with `configureAndroidBackup: true`, `faceIDPermission: false` | `npx expo install` adds it; it is not needed for the module to load, but it is what excludes SecureStore data from Android Auto Backup (threat T1). `faceIDPermission: false` stops it adding an unused Face ID usage string on iOS | Agent (security) |
| 2026-10-28 | Guard groups declare `redirectTo` (`/sign-in`, `/`) | Without it a guarded URL fell through to the not-found screen (anchor `(tabs)` is itself guarded) | Agent |
