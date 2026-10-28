# TB-37 — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-37 · PR: #20 (draft) · Branch: `feat/tb-37/sentry-crash-reporting`
> Record only what was actually run and observed. `node scripts/workflow/check-ticket-docs.mjs --branch <branch> --pr` fails the PR gate while any AC row is `not met`, `partial` or `TBD`.

## Commands run
All rows re-run on the review-fix commit (lint, typecheck, test, drizzle-kit, frozen install, ticket-docs check, export + scan). Windows 11, Node 24.21.0, pnpm 10.17.1, 2026-10-28, Orca worktree `tb-37-sentry` (base `origin/main` 1a00ccf). No Metro dev server, emulator, EAS build or Sentry account was used (worker brief).

| Command | Result | Notes |
|---|---|---|
| `pnpm exec expo install @sentry/react-native -- --ignore-scripts` | pass | `@sentry/react-native ~8.28.0` (Expo SDK 58's pick), config plugin added to `app.json` |
| `pnpm install --frozen-lockfile --ignore-scripts` | pass | Lockfile consistent. `--ignore-scripts` because `better-sqlite3`'s node-gyp build needs Visual Studio on this machine (same as TB-26 note 1); its N-API prebuild loads fine |
| `pnpm rebuild better-sqlite3` | pass | Ran once after install; DB tests pass |
| `pnpm lint` | pass | 0 problems |
| `pnpm typecheck` | pass | `tsc --noEmit` |
| `pnpm test --ci` | pass | 49 suites, 378 tests after the security-review fixes (358 before; TB-37 adds 7 suites). One early full run had `use-theme.test.tsx` time out under load; it passed alone and in every later full run (pre-existing, not touched here) |
| `pnpm exec drizzle-kit check` | pass | "Everything's fine". No schema change |
| `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-37/sentry-crash-reporting` | pass | `workflow check: ok` |
| `pnpm exec expo export --platform android --output-dir <scratchpad>/tb37-export2` (re-run after review fixes: `tb37-export3`) | pass | Env: APP_ENV staging, dummy Supabase URL/key, dummy DSN. 1 bundle `entry-….hbc` (7.8 MB). Bundle contains `_sentryDebugIds` and a `sentry-dbid-<uuid>` (getSentryExpoConfig works) and the DSN (inlined as intended) |
| `node scripts/check-bundle-secrets.ts <scratchpad>/tb37-export2` and `…/tb37-export3` | pass | `29 files scanned, no secrets found` both times (after the env.ts fix below); `_sentryDebugIds` present in export3 |

Failures hit during the build, and their fixes:
1. All route tests failed: `Must use import to load ES Module … @sentry/core/build/esm/index.js`. jest-expo's transform skips `@sentry/core` under pnpm. Fix: `jest.config.js` maps `@sentry/react-native` to `src/lib/testing/sentry-stub.ts` (spec D11).
2. First `expo export` + scanner: `supabase secret key (sb_secre…[redacted])` in the `.hbc`. Not a key: Hermes packed the literal `sb_secret_` from `src/lib/env.ts` next to a Sentry string (`INTERNAL_safeMathRandom…`). Fix: build `SECRET_KEY_PREFIX` at runtime, the exact line TB-20 (PR #18) uses. Re-export: clean.
3. `Sentry.wrap` requires `P extends Record<string, unknown>`; the interface's `wrapRoot` generic now matches.

## Acceptance criteria
| AC (verbatim) | Status | Evidence (test name, file:line, screenshot, observed result) |
|---|---|---|
| Given a forced JS error and a forced native crash in a preview build, then both appear in Sentry with readable stack traces | partial — pending owner Sentry setup + new dev build | Code: `triggerTestCrash` (`src/lib/crash-reporting.ts`), route `src/app/dev/crash-test.tsx` (preview/staging + dev only: `crash-test-route.test.tsx`, `crash-test-route-release.test.tsx`), `Sentry.nativeCrash` forwarding (`sentry-reporter.test.ts` › "forwards handled errors…"). Source maps: debug ID present in the exported bundle (above), upload via config plugin + EAS env. Not yet observed in Sentry: needs [sentry-setup.md](../../actions/sentry-setup.md) and an EAS build |
| PII (task titles, notes) is scrubbed from breadcrumbs and events | met | `src/lib/crash-scrubber.test.ts` (touch labels, console, http, Drizzle `params:`, emails, OTP, tokens, user/device/server name, nested keys); `sentry-reporter.test.ts` › "hooks the scrubber into beforeSend and beforeBreadcrumb", "wraps the root without copying on-screen text"; `sendDefaultPii: false` asserted |
| Release health shows crash-free sessions per build | partial — pending owner Sentry setup + new dev build | `enableAutoSessionTracking: true`, release/dist left to the SDK (= build) asserted in `sentry-reporter.test.ts` › "initialises Sentry with PII off…". Releases page not yet observed |
| Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated | partial — pending PR review | Tests and gates above; ticket docs + owner guide written. PR review by coordinator / owner |

## Manual / E2E
Not run by the worker (no device, no Sentry project). Coordinator steps after the owner finishes `docs/actions/sentry-setup.md`:
1. New EAS **development** build (Sentry adds native code), and a **preview** build.
2. Preview build: open `taskbuddy://dev/crash-test` → status "Sentry is on".
3. "Throw a JS error" → app shows the crash → reopen. "Crash the native layer" → app closes → reopen.
4. Sentry → Issues (env `staging`): two "TB-37 test crash" issues; JS stack names `src/lib/crash-reporting.ts`.
5. Sentry → Releases: the build with crash-free sessions %.
6. Negative: open a task with a distinctive title, tap it, then crash; the event's breadcrumbs show `Touch event within element: <Component>` and no task title.

## Review findings
| # | Severity | Finding (file:line) | Source (self / reviewer agent / human) | Resolution |
|---|---|---|---|---|
| 1 | Blocking | Sentry's touch boundary copies children's text into breadcrumb labels by default (`extractTextFromChildren: true` in `touchevents.js`) → task titles in breadcrumbs | self (SDK source read) | `wrap(…, { touchEventBoundaryProps: { extractTextFromChildren: false } })` + scrubber drops `label` |
| 2 | Blocking | Drizzle query errors end with `params: <bound values>` (task text) | self | `scrubText` redacts everything after `params:` |
| 3 | Non-blocking | Native crash events bypass JS `beforeSend` | self | `sendDefaultPii: false` (native SDK omits device name / IP user), breadcrumbs scrubbed before native sync, screenshots/view hierarchy off. Documented in spec |
| 4 | Non-blocking | Secret scan: nothing under `src/` names the auth token; scanner now fails on a Sentry token shape or `SENTRY_AUTH_TOKEN` in the bundle | self | Added rules + tests |
| 5 | Medium | `initCrashReporting` / `Sentry.init` throwing would crash start-up | security review (PR #20) | `reporter.init` wrapped in try/catch in `crash-reporting.ts` (covers `Sentry.init`): stays off, warns with the error class only. Test "stays off and never throws when the vendor init throws" |
| 6 | Medium | Native network breadcrumbs bypass the JS scrubber with full URLs | security review | `enableNetworkBreadcrumbs: false`, `enableCaptureFailedRequests: false`; asserted in `sentry-reporter.test.ts` |
| 7 | Medium | URL queries / fragments and token params inside free text not redacted | security review | TEXT_RULES: URL-shaped substrings go through `scrubUrl` (`?[redacted]`); `token, token_hash, code, access_token, refresh_token, id_token, apikey, api_key, key` params redacted. Tests in `crash-scrubber.test.ts` › "security review fixes" |
| 8 | Low | `exception.type`, `mechanism.data`, `logentry`, `transaction`, `threads` not scrubbed | security review | All scrubbed (`logentry.params` fully redacted, `transaction` query dropped); test |
| 9 | Low | Missing keys `query, sql, value, arguments, subject, q, name` | security review | Added; `name` only for free-form bags (breadcrumb data, `extra`, mechanism data) so `contexts.os.name` and component names survive; test |
| 10 | Low | OTP with a space/hyphen separator | security review | `d{3}[ -]?d{3}`; tests |
| 11 | Low | Navigation breadcrumbs must keep only opaque ids | security review | Comment in `scrubBreadcrumb` + test (`/task/<uuid>?title=…` → `/task/<uuid>`) |
| 12 | Low | `triggerTestCrash` not self-gated | security review | Now a no-op unless `isTestCrashAvailable()`; test |
| 13 | Low | Scanner gap: legacy unprefixed Sentry user tokens | security review | Documented under Known limitations |

## Known limitations & follow-ups
- Bundle scanner gap: legacy Sentry user auth tokens are 64 hex characters with no `sntryu_` prefix, so `scripts/check-bundle-secrets.ts` cannot tell them from hashes and does not flag them. Mitigation: use an organization token (`sntrys_…`, as `docs/actions/sentry-setup.md` says); nothing in `src/` reads the token, and the `SENTRY_AUTH_TOKEN` name rule still catches the usual leak path.
- Native crash events bypass JS `beforeSend` (review finding 3); server-side Sentry data scrubbing is the second layer (owner guide step 7).
- Handled DB errors (`logDbError`) are not sent to Sentry yet; wire `captureException` with fixed tags after TB-32 lands (`src/db`).
- No production DSN until TB-38 creates the production EAS environment.
- Tracing / profiling off (spec D4).
- `app.json` plugin without org/project prints a "Missing config … Environment variables will be used" warning at prebuild (expected, D8).

## Completion
- [ ] All AC met with evidence
- [x] Gates green locally
- [ ] Gates green in CI
- [x] No open Blocking findings
- [ ] Jira updated (In Review → Done)
