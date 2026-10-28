# TB-37 — Intent

> Jira: https://stratyge.atlassian.net/browse/TB-37 · Blueprint: US-023 · Epic EP-14 · Feature FT-43 (Observability) · Wave 3 · Risk: Medium
> Status: Draft. Decisions taken by the worker agent under the coordinator's brief (2026-10-28) and recorded in [spec.md](spec.md#decisions); pending owner review at PR time.

## Problem
When the app crashes or throws on a tester's phone, nobody finds out unless the tester tells us, and even then there is no stack trace. Release builds are minified Hermes bytecode, so a raw stack is unreadable without source maps.

## Desired outcome
- A JS error or a native crash in a preview (or production) build shows up in Sentry with a readable, symbolicated stack trace.
- Sentry's release health shows crash-free sessions per build.
- Crash reports never carry task titles, notes, emails, OTP codes or tokens.
- With no Sentry DSN configured (local dev, CI, forks), the app runs exactly as before: no SDK start, no network.

## Affected users
Developers (the owner and agents) who read Sentry. End users only indirectly: their crashes get fixed; their data must not leave the device in a report.

## Constraints
- CLAUDE.md: no secrets client-side; vendors behind interfaces; validate external input (env) at the boundary; logs carry no task text.
- The DSN is public and ships in the app (`EXPO_PUBLIC_SENTRY_DSN`). The Sentry auth token (source-map upload) is a secret: EAS secret only, never the repo or bundle.
- PostHog / analytics is a separate, consent-gated ticket.
- `@sentry/react-native` is a native module: a new EAS dev build is needed.
- Blocked by US-001 / US-002 (scaffold, CI): both done.

## Out of scope
- Performance tracing, profiling, session replay, Sentry Logs, user feedback widget.
- Alert rules, Slack/email notifications, Sentry dashboards (owner's Sentry settings).
- Routing handled DB errors (`src/db/db-errors.ts`) to Sentry (follow-up; `src/db` is being edited by TB-32).
- A production Sentry environment build (production EAS env arrives with TB-38).

## Open questions
| # | Question | Why it matters | Answer (who, date) |
|---|---|---|---|
| 1 | Turn on tracing later? | Costs quota; adds URLs/route names to data | Not now (worker, 2026-10-28; spec D4). Revisit with real traffic |
| 2 | One Sentry project for all environments? | Quota and filtering | Yes, one project, split by `environment` (spec D2) |
