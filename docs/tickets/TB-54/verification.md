# TB-54 — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-54 · PR: https://github.com/CodeEx24/task-buddy/pull/21 · Branch: `feat/tb-54/privacy-terms-ai-disclosure`
> Record only what was actually run and observed. `node scripts/workflow/check-ticket-docs.mjs --branch <branch> --pr` fails the PR gate while any AC row is `not met`, `partial` or `TBD`.

## Commands run
Windows 11, Node 24, pnpm 10.17.1, 2026-10-28, Orca worktree `tb-54-legal`. Final runs are on the branch after merging `origin/main` at `01fccc8` (includes TB-20 sign-in `522445f`, the TB-26 flake fix `abc74da` and TB-22 `01fccc8`). No emulator or dev build was started (low-memory machine; no native change). The coordinator runs the emulator check.

| Command | Result | Notes |
|---|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts` | pass | Lockfile unchanged by this ticket (no new dependencies) |
| `pnpm lint` | pass | exit 0, 0 problems |
| `pnpm typecheck` | pass | exit 0 (`tsc --noEmit`) |
| `pnpm test --ci --maxWorkers=2` | pass | 61 suites, 473 tests, after the second `origin/main` merge and the sign-in wiring |
| `pnpm exec jest src/features/legal --maxWorkers=2` | pass | 4 suites, 24 tests (after the review fixes) |
| `pnpm exec jest src/features/legal src/features/auth --maxWorkers=2` | pass | 14 suites, 101 tests (TB-20's auth suites still green with the link on the sign-in screen) |
| `pnpm exec prettier --check legal-site src/features/legal src/features/navigation/components` | pass | |
| `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-54/privacy-terms-ai-disclosure --pr` | pass | `workflow check: ok` |
| `npx eas-cli@latest deploy --export-dir legal-site --alias legal --dev-domain task-buddy --non-interactive` | pass | First deployment `task-buddy--fcd3i3hyt7`; alias URL `https://task-buddy--legal.expo.app` |
| Redeploys after edits (`deploy … --alias legal`; once `deploy:alias --alias legal --id 29jw9f6k9d`) | pass | Latest deployment `task-buddy--4v4sqxupbg` (after the review fixes) |
| `curl` each published page vs `legal-site/*` (`diff -q`, cache-busting query) | pass | `/`, `/privacy`, `/terms`, `/ai`, `/styles.css` byte-identical to the committed files; `200 text/html` / `text/css` |

Failures hit during the build, and their fixes:
1. `tsc`: `mockResolvedValue(true)` on `Linking.openURL` (returns `Promise<void>`) → `mockResolvedValue(undefined)`.
2. A route test timed out at 5 s on a cold transform cache (each route test loads every route) → explicit 30 s timeout, the same pattern as TB-20's `sign-in-routes.test.tsx`.
3. Before the `origin/main` merge, `task-repo.test.ts › surfaces driver failures as DB_FAILURE without task text` failed in some full runs. The file was untouched by this ticket, and it also failed with `src/features/legal` excluded. Fixed on `main` by PR #23 (`abc74da`), which this branch now includes; not seen since.
4. After the second deploy the `legal` alias kept serving the first deployment. `eas deploy:alias --alias legal --id 29jw9f6k9d` fixed it, and later deploys moved the alias on their own. Documented in `docs/actions/legal-owner-facts.md` → If it fails.
5. Merge conflicts with `origin/main` (two merges, no rebase or force-push). In `SettingsScreen.tsx`, TB-20's `<SignOutButton />` was kept and `<LegalLinks />` placed after it. In `docs/actions/README.md`, the to-do lists from TB-20, TB-22 and TB-54 were all kept.

## Commands run: published site checks, 2026-10-28
| Check | Result | Notes |
|---|---|---|
| Headless Edge screenshot of `/privacy` | pass | `web-privacy.png` (900 px wide, dark scheme): nav, policy sections, owner placeholders highlighted |
| Headless Edge screenshot of `/ai` | pass | `web-ai.png`: "what is sent / not sent" table, retention, sources |
| Anthropic facts re-read at the source | pass | Commercial terms: "Anthropic may not train models on Customer Content from Services". Retention article: "we automatically delete inputs and outputs on our backend within 30 days of receipt or generation"; Usage Policy flags "up to 2 years" |
| Policy vs the merged AI gateway (`supabase/functions/ai-gateway`) | pass | JWT auth first; key server-side only; log line has no user text, output or user ID; nothing stored. Usage limits and the ledger are TB-23, covered by the "released in stages" note in §3 |

## Acceptance criteria
| AC (verbatim) | Status | Evidence (test name, file:line, screenshot, observed result) |
|---|---|---|
| Privacy policy and terms are published at stable URLs and linked in Settings and on sign-in | met | **Published:** https://task-buddy--legal.expo.app/privacy, `/terms`, `/ai` (EAS Hosting alias; curl 200, byte-identical to `legal-site/`). **Settings:** `SettingsScreen.tsx` renders `<LegalLinks testID="settings-legal-links" />` under TB-20's Sign out row. `settings-legal-links-route.test.tsx` presses all three links on the real `/settings` route and checks `Linking.openURL` gets the privacy, terms and AI URLs. **Sign-in:** `SignInScreen.tsx` renders `<LegalLinks context="sign-in" testID="sign-in-legal-links" />` below the email form. `sign-in-legal-links-route.test.tsx`, signed out: on `/sign-in` it shows the agreement line, and "Privacy Policy" calls `openURL(LEGAL_URLS.privacy)`; on `/settings` the guard shows sign-in, and "Terms of Use" calls `openURL(LEGAL_URLS.terms)`. Follow-up, not a blocker: move the Settings links into TB-32's shell when PR #19 merges |
| The policy states what text/audio/images are sent to an AI provider, retention, and deletion | met | `privacy.html` §4 (text, voice transcript only, the chosen photo; only when an AI feature is used; through our server only), §8 retention (including server request logs), §9 `#delete-account`; `ai.html`. Tests: `legal-config.test.ts` › "privacy policy content (TB-54 AC2)", 5 tests covering: provider, gateway and only-when-used; text, voice and images; training, 30 days and the provider link; the deletion anchor; PH, GDPR and CCPA plus opt-in analytics. Screenshots `web-privacy.png`, `web-ai.png` |
| App Store privacy labels and Play data-safety form drafts are prepared | met | `app-store-privacy-labels.md` and `play-data-safety.md` in this folder. Each data type (email, user ID, photos, other user content, audio, crash, diagnostics, analytics, device ID, purchases) has collected / linked / tracking / purpose answers, plus encryption in transit and the deletion URL. Reviewer confirmed the drafts agree with each other and with `privacy.html` |
| Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated | met | **Tests:** 4 suites and 24 tests added (`LegalLinks.test.tsx`, `legal-config.test.ts`, both route tests), all passing. **No regressions:** full suite 61 / 473 green, lint and typecheck green, TB-20's auth suites green. **PR reviewed:** an independent reviewer agent read the full diff against `REVIEW.md`; 1 Blocking (the uncommitted sign-in files, fixed by committing them) and 1 Important + 3 Nits, all resolved below. Human merge approval stays with the coordinator / owner. **Docs:** `docs/tickets/TB-54/` and `docs/actions/legal-owner-facts.md` written |

## Manual / E2E
- **Published site:** opened in headless Edge (screenshots above). Unknown paths fall back to the legal home page (EAS Hosting static behaviour).
- **App:** not run on a device in this session. For the coordinator, using the existing dev build plus Metro (JS-only change):
  1. Signed out, on the sign-in screen: below "Send code", check the agreement line and the three links "Privacy Policy", "Terms of Use" and "How AI uses your data". Each opens the browser at the matching URL.
  2. Signed in: Settings tab → Sign out row, then the same three links.

## Review findings
| # | Severity | Finding (file:line) | Source (self / reviewer agent / human) | Resolution |
|---|---|---|---|---|
| 1 | Important | `privacy.html` §8 first said deleted tasks "are then removed"; the repo soft-deletes (`deleted_at`) and never purges | self | Reworded: marked deleted on the device, never leaves it, removed on uninstall |
| 2 | Nit | `PlaceholderScreen.tsx` doc comment mentions TB-20's sign-out button | self | Moot: the hunk was identical to TB-20's and merged cleanly; that comment is now accurate on `main` |
| 3 | Important | The operator name and contact are placeholders on a live page | self | By decision D1 (never invent them). `legal-config.test.ts` fails if an email appears before `IS_OPERATOR_CONFIRMED`; owner guide `docs/actions/legal-owner-facts.md` |
| 4 | Blocking | `SignInScreen.tsx:169` and `sign-in-legal-links-route.test.tsx` were not committed when the reviewer looked | reviewer agent | Committed with the sign-in wiring commit |
| 5 | Important | The public policy states unbuilt features in the present tense: usage limits / ledger (TB-23), analytics toggle (TB-65), Sentry (TB-37), push | reviewer agent | Added a "released in stages" paragraph at the top of §3. README follow-ups track each owning ticket |
| 6 | Nit | The gateway's Supabase function log lines were not disclosed (`gateway.ts:217`) | reviewer agent | §8: "Server request logs" item (no content, email or account ID; deleted at the end of Supabase's log retention) |
| 7 | Nit | Philippine framing is hard-coded while the operator's country is a placeholder | reviewer agent | `legal-owner-facts.md` step 1 now asks the owner to confirm it, and to have the references reworked if the operator is based elsewhere |
| 8 | Nit | Route tests could time out on a very cold CI cache | reviewer agent | Kept the 30 s per-test timeout (TB-20's pattern); CI watched |

## Known limitations & follow-ups
- When TB-32 (PR #19) merges, move the Settings legal links into its Settings-shell registry.
- Operator facts and counsel review are owner actions.
- Features disclosed before they ship: see README → Known limitations and Follow-up tasks.

## Completion
- [x] All AC met with evidence
- [x] Gates green locally; CI on the PR
- [x] No open Blocking findings
- [ ] Jira Done (coordinator, after the emulator check and merge)
