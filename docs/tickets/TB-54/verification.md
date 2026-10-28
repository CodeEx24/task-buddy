# TB-54 — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-54 · PR: https://github.com/CodeEx24/task-buddy/pull/21 (draft) · Branch: `feat/tb-54/privacy-terms-ai-disclosure`
> Record only what was actually run and observed. `node scripts/workflow/check-ticket-docs.mjs --branch <branch> --pr` fails the PR gate while any AC row is `not met`, `partial` or `TBD`.

## Commands run
Windows 11, Node 24, pnpm 10.17.1, 2026-10-28, Orca worktree `tb-54-legal` (base `main` 1a00ccf). No emulator or dev build was started (low-memory machine; no native change).

| Command | Result | Notes |
|---|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts` | pass | Lockfile unchanged (no new dependencies) |
| `pnpm lint` | pass | 0 problems |
| `pnpm typecheck` | pass | `tsc --noEmit` (after fixing 2 test type errors, see failures) |
| `pnpm test --ci --maxWorkers=2` | pass | 47 suites, 321 tests (final run). See failure 3 for one flaky run of an untouched suite |
| `pnpm exec jest src/features/legal --maxWorkers=2` | pass | 3 suites, 22 tests |
| `pnpm exec prettier --check legal-site src/features/legal src/features/navigation/components` | pass | |
| `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-54/privacy-terms-ai-disclosure` | pass | `workflow check: ok` (without `--pr`; the `--pr` gate fails on the AC1/AC4 rows below, by design) |
| `npx eas-cli@latest deploy --export-dir legal-site --alias legal --dev-domain task-buddy --non-interactive` | pass | Deployment `task-buddy--fcd3i3hyt7`, alias URL `https://task-buddy--legal.expo.app` |
| Redeploy after formatting / text fixes (`deploy … --alias legal`, then `deploy:alias --alias legal --id 29jw9f6k9d`) | pass | Latest deployment `task-buddy--m73csbfdo0`; alias serves it (see failure 4) |
| `curl` each published page vs `legal-site/*` (`diff -q`) | pass | `/`, `/privacy`, `/terms`, `/ai`, `/styles.css` byte-identical to the committed files; all `200 text/html` (`text/css`) |

Failures hit during the build, and their fixes:
1. `tsc`: `mockResolvedValue(true)` on `Linking.openURL` (returns `Promise<void>`) → `mockResolvedValue(undefined)`.
2. The single route test timed out at 5 s on a cold transform cache (it alone loads every route) → explicit 30 s timeout for that test.
3. One full run failed `task-repo.test.ts › surfaces driver failures as DB_FAILURE without task text` (`dbError` had no `code`). The file is untouched by this ticket; it also failed once in a full run with `src/features/legal` excluded, passed 3/3 when run alone, and the final full run was 321/321. Pre-existing flake under parallel load; proposed follow-up below.
4. After the second deploy, the `legal` alias kept serving the first deployment (`md5` of `/privacy` unchanged, cache-busting query too). `eas deploy:alias --alias legal --id 29jw9f6k9d` fixed it; the third deploy moved the alias on its own. Documented in `docs/actions/legal-owner-facts.md` → If it fails.

## Commands run: published site checks, 2026-10-28
| Check | Result | Notes |
|---|---|---|
| Headless Edge screenshot of `/privacy` | pass | `web-privacy.png` (900 px wide, dark scheme): nav, policy sections, owner placeholders highlighted |
| Headless Edge screenshot of `/ai` | pass | `web-ai.png`: what is sent / not sent table, retention, sources |
| Anthropic facts re-read at the source | pass | Commercial terms: "Anthropic may not train models on Customer Content from Services". Retention article: "we automatically delete inputs and outputs on our backend within 30 days of receipt or generation"; Usage Policy flags "up to 2 years" |

## Acceptance criteria
| AC (verbatim) | Status | Evidence (test name, file:line, screenshot, observed result) |
|---|---|---|
| Privacy policy and terms are published at stable URLs and linked in Settings and on sign-in | partial | **Published:** `https://task-buddy--legal.expo.app/privacy`, `/terms`, `/ai` (EAS Hosting alias, curl 200 + byte-identical). **Settings:** linked (`SettingsScreen.tsx`); `settings-legal-links-route.test.tsx` presses all three links on the real `/settings` route → `Linking.openURL` with the published URLs. **Sign-in: not yet**: the sign-in screen (TB-20, PR #18) is not on `main`. `LegalLinks context="sign-in"` is built and tested (`LegalLinks.test.tsx` "shows the agreement line only on sign-in"); the one-line wiring is in README → "Wiring still needed" |
| The policy states what text/audio/images are sent to an AI provider, retention, and deletion | met | `privacy.html` §4 (text, voice transcript only, chosen photo; only on AI use; server gateway only), §8 retention, §9 `#delete-account`; `ai.html`. Tests: `legal-config.test.ts` › "privacy policy content (TB-54 AC2)" (5 tests: provider + gateway + only-when-used; text/voice/images; training + 30 days + provider link; deletion anchor; PH/GDPR/CCPA + opt-in analytics). `web-privacy.png`, `web-ai.png` |
| App Store privacy labels and Play data-safety form drafts are prepared | met | `app-store-privacy-labels.md`, `play-data-safety.md` in this folder: each data type (email, user ID, photos, other user content, audio, crash, diagnostics, analytics, device ID, purchases) with collected / linked / tracking / purpose, encryption in transit, deletion URL; match `privacy.html` |
| Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated | partial | Tests added (3 suites, 22 tests) and passing; full suite 47 / 321 green, lint, typecheck green; self-review done (below); `docs/tickets/TB-54/` written. **PR review pending** (draft PR) |

## Manual / E2E
- **Published site:** opened in headless Edge (screenshots above). Unknown paths fall back to the legal home page (EAS Hosting static behaviour).
- **App:** not run on a device in this session (no emulator on this machine; JS-only change, no new native module, so the existing dev build + Metro is enough). For the coordinator: dev build → Settings tab → three links "Privacy Policy", "Terms of Use", "How AI uses your data" below the card; each opens the browser at the matching URL. Turn on airplane mode and tap one: the browser shows its own offline page (the in-app error line only appears if no browser can be opened at all).

## Review findings
Self-review (low risk: no independent reviewer required by `docs/workflow/README.md` §5).

| # | Severity | Finding (file:line) | Source (self / reviewer agent / human) | Resolution |
|---|---|---|---|---|
| 1 | Important | `privacy.html` §8 first said deleted tasks "are then removed"; the repo soft-deletes (`deleted_at`) and never purges | self | Reworded: marked deleted on the device, never leaves it, removed on uninstall |
| 2 | Nit | `PlaceholderScreen.tsx` doc comment mentions TB-20's sign-out button | self | Kept on purpose: the hunk is byte-identical to PR #18 so the two branches merge cleanly |
| 3 | Nit | Policy describes features not built yet (AI capture, voice, photos, analytics, check-ins, account deletion) | self | Stated in README → Known limitations; follow-ups list which ticket must re-check the text |
| 4 | Important | Operator name / contact are placeholders on a live page | self | By decision D1 (never invent); `legal-config.test.ts` fails if an email appears before `IS_OPERATOR_CONFIRMED`; owner guide `docs/actions/legal-owner-facts.md` |

## Known limitations & follow-ups
- Sign-in wiring (after TB-20) and Settings-shell wiring (after TB-32): see README.
- Operator facts and counsel review: owner action.
- Flaky `task-repo.test.ts` "surfaces driver failures as DB_FAILURE" under parallel load: propose a Jira bug (TB-21/TB-26 area).

## Completion
- [ ] All AC met with evidence (AC1 sign-in link and AC4 review pending)
- [x] Gates green locally; CI on the PR
- [x] No open Blocking findings
- [ ] Jira updated (In Review → Done)
