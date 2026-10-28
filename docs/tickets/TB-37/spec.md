# TB-37 — Spec

> Jira: https://stratyge.atlassian.net/browse/TB-37 · Intent: [intent.md](intent.md)
> Status: Draft (worker agent, 2026-10-28). Pending owner review at PR time.
> Facts checked 2026-10-28 via Context7: Sentry React Native docs (Expo guide, source maps for Expo, troubleshooting) and the `getsentry/sentry-react-native` repo (Expo plugin source, `expo-upload-sourcemaps` README). Installed `@sentry/react-native` 8.28.0 (the version `expo install` picks for SDK 58).

## Acceptance criteria (verbatim from Jira)
- [ ] AC1 Given a forced JS error and a forced native crash in a preview build, then both appear in Sentry with readable stack traces
- [ ] AC2 PII (task titles, notes) is scrubbed from breadcrumbs and events
- [ ] AC3 Release health shows crash-free sessions per build
- [ ] AC4 Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated

## Behaviour
- **Start-up.** `src/app/_layout.tsx` calls `initCrashReporting()` at module load, before the first render, and exports `wrapRoot(RootLayout)`.
- **No / invalid DSN** (missing, empty, not `https://<32 hex>@host/<project id>`, has a password part, looks like an auth token): crash reporting is off. The SDK is never initialised, `captureException` is a no-op, `wrapRoot` returns the component unchanged. Never throws.
- **Valid DSN:** Sentry starts with `environment` = `EXPO_PUBLIC_APP_ENV` (`development` / `staging` / `production`, or `unknown`), PII off, session tracking on, every event and breadcrumb passed through the scrubber.
- **Unhandled JS error** → Sentry's global handler reports it (fatal) and the session is marked crashed. **Native crash** → the native SDK writes it and uploads on next launch.
- **Test trigger:** route `/dev/crash-test` (`taskbuddy://dev/crash-test`) with three buttons: send a handled error, throw a JS error, crash the native layer. Shown when `__DEV__` or `EXPO_PUBLIC_APP_ENV` is `development` or `staging` (so the preview build has it); production shows Not Found.
- **Source maps:** `metro.config.js` uses `getSentryExpoConfig` (adds a debug ID to every bundle and map). The `@sentry/react-native` config plugin adds the upload step to the native build. On an EAS release build (preview/production) the bundle and map upload with `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` from EAS env. Development builds skip the upload (JS is served by Metro).

## Technical design
- **Surfaces:**
  - `src/lib/crash-reporting.ts`: vendor-neutral API: `CrashReporter` interface, `initCrashReporting`, `captureException`, `wrapRoot`, `isCrashReportingEnabled`, `isTestCrashAvailable`, `triggerTestCrash`.
  - `src/lib/sentry-reporter.ts`: the Sentry implementation (only importer of `@sentry/react-native`).
  - `src/lib/crash-scrubber.ts`: pure `scrubEvent` / `scrubBreadcrumb` / `scrubText` / `scrubValue` / `scrubUrl`.
  - `src/lib/env.ts`: `parseCrashReportingEnv` / `getCrashReportingEnv` + `sentryDsnSchema` (Zod).
  - `src/app/dev/crash-test.tsx`: test trigger route (renders only).
  - `src/lib/testing/sentry-stub.ts` + one `jest.config.js` mapper line: Jest stand-in for the SDK.
  - Config: `app.json` plugin `@sentry/react-native` (no org/project in the repo), `metro.config.js`, `eas.json` build env, `.env.example`.
  - `scripts/check-bundle-secrets.ts`: new rules for Sentry auth tokens and the `SENTRY_AUTH_TOKEN` name.
- **Interfaces & contracts:** `CrashReporter { init({dsn, environment}); captureException(error, tags?); wrapRoot(C); nativeCrash() }`. Tags are low-cardinality fixed values only.
- **Data changes:** none (no tables, no migrations).
- **Reuse:** env validation pattern from TB-19 (`src/lib/env.ts`, Zod, values never in errors); dev-route pattern from TB-21 (`src/app/dev/db-benchmark.tsx` + Not Found fallback); privacy rule from `src/db/db-errors.ts` (no messages that can embed bound values); runtime-built prefixes against the Hermes string-packing false positive (TB-20).

## Edge cases
| Case | Expected |
|---|---|
| No DSN (local, CI, Jest) | Disabled, no network, app unchanged |
| DSN pasted with whitespace / newline | Trimmed, accepted |
| Auth token pasted into the DSN variable | Rejected → disabled (and the bundle scanner fails CI) |
| Supabase env missing but DSN set | Crash reporting still starts (separate parse from `getEnv()`) |
| `EXPO_PUBLIC_APP_ENV` missing / unknown | Reports with environment `unknown` |
| `initCrashReporting` called twice | Second call is a no-op |
| Native crash with reporting off | Button throws a JS error instead (nothing to crash into) |
| Preview build before the owner sets the token | Build still succeeds (`SENTRY_ALLOW_FAILURE`), stacks stay minified until the token is set |

## Security, privacy & AI cost
- **What leaves the device:** stack frames, error type and scrubbed message, device model/OS/app version, release/dist, environment, scrubbed breadcrumbs, session start/end/crash. Never: task titles, notes, emails, OTP codes, tokens, device name, IP-derived user, request bodies/headers/cookies, query strings.
- **Scrubber rules** (`src/lib/crash-scrubber.ts`):
  - Free text (event message, exception values, breadcrumb messages): emails → `[email]`, `Bearer …`, JWTs, `sb_<kind>_…` keys and Sentry tokens → `[token]`, 6-digit codes → `[code]`, Drizzle's `params: …` suffix (bound values = task text) → `params: [redacted]`.
  - Keys `title, notes, note, text, body, description, content, prompt, label, email, phone, otp, *token, password, secret, authorization, cookie(s), apikey, params` → `[redacted]` anywhere in `extra`, `contexts`, `tags` and breadcrumb `data` (case/`_`/`-` insensitive, depth-capped).
  - Touch breadcrumbs: `label` removed from every path entry; message rebuilt from the component name. Plus `extractTextFromChildren: false` on the root touch boundary, so the SDK does not copy on-screen text (the pressed row's task title) in the first place. Found by reading `touchevents.js`: it defaults to true.
  - Console breadcrumbs: only a leading `[tag]` survives (`[db] [redacted]`), `data.arguments` dropped.
  - Event: `user` reduced to `{ id }` (dropped if no id), `request` reduced to its URL without query, `server_name` and `contexts.device.name` removed.
- **Native crash events** are written by the native SDK and do not pass through JS `beforeSend`. Mitigation: `sendDefaultPii: false` is passed to the native SDK (it then omits device name and IP-derived user), JS breadcrumbs are scrubbed by `beforeBreadcrumb` before they are synced to the native scope, screenshots and view hierarchy are off, `reportAccessibilityIdentifier: false`.
- **Secrets:** the DSN is public (can only send events). `SENTRY_AUTH_TOKEN` exists only as an EAS **secret** used at build time by the upload step; nothing in `src/` references it, and the bundle scanner now fails on a Sentry token shape or the variable name. Org/project slugs are not secret but are kept out of the repo as EAS env (`SENTRY_ORG`, `SENTRY_PROJECT`), the plugin's documented env fallback.
- **AI cost:** none.

## Decisions
| Decision | Options considered | Choice | Decided by / date |
|---|---|---|---|
| D1 Vendor boundary | Call Sentry directly from `_layout` · interface in `src/lib` | `CrashReporter` interface in `src/lib/crash-reporting.ts`; Sentry only in `sentry-reporter.ts` (CLAUDE.md "vendors behind interfaces") | Worker, 2026-10-28 |
| D2 Environments | Separate Sentry projects per env · one project + `environment` | One project; `environment` = `EXPO_PUBLIC_APP_ENV` (`development`, `staging` for the preview build, `production`) | Worker, 2026-10-28 |
| D3 Release / dist naming | Custom `release` from `expo-constants` · SDK default | SDK default: native app id `@` version `+` build number, dist = build number. It matches what the build-time upload tags the source maps with, so no mismatch risk; release health groups by it ("per build") | Worker, 2026-10-28 |
| D4 Tracing / profiling / replay / logs | On at 100% (Sentry wizard default) · low sample · off | Off for now: not in the AC, uses free quota, adds URLs and route names to the data surface. Error events and sessions only | Worker, 2026-10-28 |
| D5 PII | `sendDefaultPii: true` (wizard default) · false + scrubber | `sendDefaultPii: false`, `beforeSend` + `beforeBreadcrumb` scrubber, touch text extraction off, no screenshots / view hierarchy | Worker, 2026-10-28 |
| D6 Sample rate for errors | default 1.0 · lower | 1.0 (default). Small tester base; revisit at launch | Worker, 2026-10-28 |
| D7 DSN reading | Add to `getEnv()` · separate total parser | Separate `getCrashReportingEnv()` in `env.ts`: `getEnv()` throws when Supabase vars are missing, which must not stop crash reporting or crash the app at start-up | Worker, 2026-10-28 |
| D8 Org / project config | Hard-code slugs in `app.json` · `app.config.ts` · EAS env | Plugin listed without `organization`/`project`; `SENTRY_ORG` / `SENTRY_PROJECT` from EAS env (documented fallback; the plugin prints a "Missing config … Environment variables will be used" warning at prebuild, expected) | Worker, 2026-10-28 |
| D9 Upload per profile | Upload everywhere · skip dev · strict preview | `development`: `SENTRY_DISABLE_AUTO_UPLOAD=true` (Sentry docs). `preview`: `SENTRY_ALLOW_FAILURE=true` so a preview build before owner setup still succeeds. `production`: strict (an upload failure fails the build) | Worker, 2026-10-28 |
| D10 Test trigger exposure | `__DEV__` only · dev + staging | `__DEV__` or APP_ENV development/staging: AC1 needs it in the preview build; production shows Not Found | Worker, 2026-10-28 |
| D11 Jest | Transform Sentry's ESM · stub | `moduleNameMapper` stub (`src/lib/testing/sentry-stub.ts`): `@sentry/core` ships ESM that jest-expo's transform skips under pnpm, and the SDK never starts without a DSN anyway | Worker, 2026-10-28 |

## Deviations (added during build)
| Date | Change | Reason | Approved by |
|---|---|---|---|
| 2026-10-28 | `src/lib/env.ts`: `SECRET_KEY_PREFIX` built at runtime (same line as TB-20 PR #18) | Adding Sentry made Hermes place the literal `sb_secret_` next to `INTERNAL_safeMathRandom…`, which the bundle scanner flagged (false positive). Identical text to TB-20's change, so the two merge cleanly | Pending owner review |
| 2026-10-28 | Read the DSN via `getCrashReportingEnv()`, not `getEnv()` | See D7 | Pending owner review |
