# TB-37 — Implementation plan

> Jira: https://stratyge.atlassian.net/browse/TB-37 · Spec: [spec.md](spec.md)
> Bar: an engineer who has never seen the conversation could implement the change from this plan alone.

## Branch & worktree
`feat/tb-37/sentry-crash-reporting` (Orca worktree `tb-37-sentry`, from `origin/main` @ 1a00ccf) · Owns: `src/lib/crash-*`, `src/lib/sentry-reporter*`, `src/lib/testing/`, `src/app/dev/crash-test.tsx`, `docs/tickets/TB-37/`, `docs/actions/sentry-setup.md` · Shared-file edits kept small: `src/app/_layout.tsx` (+import, init call, default export via `wrapRoot`), `src/lib/env.ts` (appended block + TB-20's prefix line), `metro.config.js` (base config only), `app.json` (one plugin entry), `eas.json` (build `env` per profile), `jest.config.js` (one mapper line), `package.json` / `pnpm-lock.yaml` (one dependency), `.env.example`, `scripts/check-bundle-secrets*.ts`, `docs/actions/README.md` · Must not edit: `.github/workflows/*`, eslint / prettier configs, `src/db/*` (TB-32).

## Dependencies
Blocked by US-001 (scaffold) and US-002 (CI): both merged on `main`.

## Tasks
### Task 1 — Install the SDK
- [x] `pnpm exec expo install @sentry/react-native -- --ignore-scripts` → `~8.28.0`, plugin added to `app.json`.
- Verify: `pnpm install --frozen-lockfile --ignore-scripts`.

### Task 2 — Env
- [x] `parseCrashReportingEnv` / `getCrashReportingEnv` / `sentryDsnSchema` in `src/lib/env.ts`. Total (never throws).
- Verify: `src/lib/env.test.ts` › `parseCrashReportingEnv (TB-37)`.

### Task 3 — Scrubber
- [x] `src/lib/crash-scrubber.ts` (pure).
- Verify: `src/lib/crash-scrubber.test.ts`.

### Task 4 — Interface + Sentry implementation
- [x] `src/lib/crash-reporting.ts`, `src/lib/sentry-reporter.ts`.
- Verify: `src/lib/crash-reporting.test.ts`, `src/lib/sentry-reporter.test.ts`.

### Task 5 — Wire up
- [x] `_layout.tsx`: `initCrashReporting()` + `export default wrapRoot(RootLayout)`.
- [x] `metro.config.js`: `getSentryExpoConfig(__dirname)` replaces `getDefaultConfig`, keeps `sql` sourceExt + NativeWind.
- [x] `eas.json`: development `SENTRY_DISABLE_AUTO_UPLOAD`, preview `SENTRY_ALLOW_FAILURE`.
- [x] Jest stub + mapper.
- Verify: full `pnpm test --ci` (all route tests load the root layout).

### Task 6 — Test trigger route
- [x] `src/app/dev/crash-test.tsx`.
- Verify: `src/lib/crash-test-route.test.tsx`, `src/lib/crash-test-route-release.test.tsx`.

### Task 7 — Bundle safety
- [x] Scanner rules for Sentry tokens and the `SENTRY_AUTH_TOKEN` name (+ tests).
- [x] `expo export --platform android` + scanner → "no secrets found"; debug ID present in the bundle.

### Task 8 — Docs
- [x] Ticket docs, owner guide `docs/actions/sentry-setup.md`, to-do entry in `docs/actions/README.md`.

### Task 9 — Owner / coordinator (not this worker)
- [ ] Owner follows `docs/actions/sentry-setup.md`.
- [ ] Coordinator: new EAS **development** build (native module) and a **preview** build; on the preview build open `taskbuddy://dev/crash-test`, press "Throw a JS error", reopen, press "Crash the native layer", reopen; check both issues in Sentry show symbolicated frames (`src/lib/crash-reporting.ts` `triggerTestCrash`) and Releases shows crash-free sessions for the build.

## Test strategy
| AC | Test (layer) | File |
|---|---|---|
| AC1 | Wiring: init options, wrap, native crash forwarding (unit); test route renders / hidden in production (integration); debug ID in exported bundle (build). Real Sentry events: manual on a preview build | `sentry-reporter.test.ts`, `crash-reporting.test.ts`, `crash-test-route*.test.tsx`, verification.md |
| AC2 | Scrubber rules per field (unit); scrubber is hooked into `beforeSend`/`beforeBreadcrumb` (unit); touch text extraction off (unit) | `crash-scrubber.test.ts`, `sentry-reporter.test.ts` |
| AC3 | `enableAutoSessionTracking: true`, release left to the SDK (unit). Real release health: manual | `sentry-reporter.test.ts` |
| AC4 | Full gate run | verification.md |
| — | Disabled without / with invalid DSN, env validation | `crash-reporting.test.ts`, `env.test.ts` |

## Risks & rollback
- **EAS release build fails at the Sentry upload step** (missing token/org/project): preview tolerates it (`SENTRY_ALLOW_FAILURE`); production fails loudly. Fix the EAS env, or set `SENTRY_DISABLE_AUTO_UPLOAD=true` for that profile.
- **Metro config change breaks bundling:** detected by `expo export` (done locally) and CI's `bundle` job. Rollback: revert `metro.config.js` to `getDefaultConfig`.
- **PII leak via a new breadcrumb type:** scrubber is key- and pattern-based; new categories default to deep key redaction. Review any new `console.*` that interpolates user data.
- **Full rollback:** revert the PR; remove the EAS env vars. JS-only revert works over OTA, but removing the native module needs a new build.
