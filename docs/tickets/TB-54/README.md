# TB-54 — Privacy policy, terms and AI disclosure

> Jira: https://stratyge.atlassian.net/browse/TB-54 · Blueprint: US-040 · Epic EP-13 / FT-37 Compliance · Wave 3 (Jira label) · Risk: Low (2 pts, no auth/RLS/gateway/billing code)
> Branch: `feat/tb-54/privacy-terms-ai-disclosure` · Verification: [verification.md](verification.md) · Store drafts: [app-store-privacy-labels.md](app-store-privacy-labels.md), [play-data-safety.md](play-data-safety.md)

> **Not legal advice.** The policy, terms and store answers were drafted by an AI agent from the app's actual data flows and the providers' published terms. Have a lawyer review them before the first store submission (TB-64). Owner actions: [docs/actions/legal-owner-facts.md](../../actions/legal-owner-facts.md).

## Overview / intent
Store review (TB-38 beta, TB-64 submission) needs a privacy policy and terms at stable public URLs, a clear statement of what goes to the AI provider, and answers for Apple's privacy "nutrition labels" and Google Play's data-safety form. This ticket writes those documents from what the app really does, publishes them, links them in the app, and drafts the store answers so they match the policy.

## Acceptance criteria (verbatim from Jira)
- [ ] Privacy policy and terms are published at stable URLs and linked in Settings and on sign-in
- [x] The policy states what text/audio/images are sent to an AI provider, retention, and deletion
- [x] App Store privacy labels and Play data-safety form drafts are prepared
- [ ] Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated

AC1: published and linked in Settings; the sign-in link waits for the sign-in screen (TB-20, PR #18) to reach `main`. AC4: PR review pending. See [verification.md](verification.md).

## Published URLs
| Page | URL |
|---|---|
| Legal home | https://task-buddy--legal.expo.app/ |
| Privacy Policy | https://task-buddy--legal.expo.app/privacy |
| Terms of Use | https://task-buddy--legal.expo.app/terms |
| AI disclosure | https://task-buddy--legal.expo.app/ai |
| Account deletion (for Play) | https://task-buddy--legal.expo.app/privacy#delete-account |

EAS Hosting, project `@codeex24/task-buddy`, alias `legal` (first deployment `task-buddy--fcd3i3hyt7`, 2026-10-28). The alias URL stays the same across redeploys: `eas deploy --export-dir legal-site --alias legal` moves it to the new deployment.

## Decisions
No human was available; the coordinator gave the recommended option for each owner question (2026-10-28). Each needs the owner's confirmation in [legal-owner-facts.md](../../actions/legal-owner-facts.md).

| Decision | Options considered | Choice | Why | Decided by / date |
|---|---|---|---|---|
| D1 Operator and contact | (a) invent a company / domain; (b) use the owner's personal email; (c) visible placeholders + owner guide | (c) Service name "Task Buddy"; operator = the individual developer; name, country and contact email are visible `[… to be confirmed by owner]` placeholders | Never publish an invented or personal identity. One config place: `src/features/legal/legal-config.ts` (`LEGAL_OPERATOR`, `IS_OPERATOR_CONFIRMED`) plus the page source; a test keeps them in sync and fails if an email appears before confirmation | Coordinator (recommended), 2026-10-28 |
| D2 Launch countries / laws | (a) PH only; (b) PH first, worldwide availability | (b) Philippines Data Privacy Act 2012 (NPC), GDPR / UK GDPR and CCPA/CPRA, in generic language | The app is distributed worldwide from day one | Coordinator, 2026-10-28 |
| D3 Analytics | (a) not mentioned until TB-65; (b) disclosed now as optional | (b) PostHog, consent-gated, off by default | Store forms must match what the shipped app can do; disclosing the optional, opt-in analytics now avoids a policy change at TB-65 | Coordinator, 2026-10-28 |
| D4 Billing | (a) omit; (b) future-tier note | (b) Free today; a future paid tier would be sold through the App Store / Google Play with RevenueCat, and the policy and terms are updated before it ships | Honest about today, no surprise later | Coordinator, 2026-10-28 |
| D5 AI provider wording | (a) generic "AI provider"; (b) name Anthropic with verified retention facts | (b) Anthropic (Claude) via our server gateway only; text, voice transcript (never audio) and chosen photos, only when an AI feature is used; no training; deleted within 30 days, up to 2 years if flagged for Usage Policy violations, longer if the law requires | Verified 2026-10-28 against [Anthropic commercial terms](https://www.anthropic.com/legal/commercial-terms) ("Anthropic may not train models on Customer Content from Services") and the [commercial data retention article](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data) ("we automatically delete inputs and outputs on our backend within 30 days of receipt or generation"; Usage Policy flags: "up to 2 years") | Coordinator + agent research, 2026-10-28 |
| D6 Hosting | (a) EAS Hosting production (`task-buddy.expo.app`); (b) EAS Hosting alias `legal`; (c) GitHub Pages | (b) `https://task-buddy--legal.expo.app` | Same Expo account the project already uses, free tier, no new vendor. An alias instead of the production slot, so a future `eas deploy --prod` of the web app can't replace the legal pages | Agent, 2026-10-28 |
| D7 Link opening | (a) add `expo-web-browser`; (b) `Linking.openURL` | (b) | `expo-web-browser` is not installed, and a new native module would need a new dev build | Agent, 2026-10-28 |
| D8 Own retention periods | (a) none stated; (b) concrete periods | (b) Account until deletion (+≤30 days backups); AI usage records ≤13 months; crash reports ≤90 days (Sentry plan); analytics ≤13 months; account deletion within 30 days of an email request | Stores and GDPR expect concrete periods. These are commitments later tickets must implement (follow-ups below); the owner confirms them | Agent proposal, owner to confirm |

## Implementation details
- `legal-site/` (`index.html`, `privacy.html`, `terms.html`, `ai.html`, `styles.css`): plain HTML/CSS, no scripts, fonts, images or trackers; light/dark via `prefers-color-scheme`. Owner placeholders are `<span class="owner-confirm" data-owner-confirm="…">`.
- `src/features/legal/legal-config.ts`: base URL, page paths, `LEGAL_URLS`, `ACCOUNT_DELETION_URL`, `LEGAL_LAST_UPDATED`, `LEGAL_OPERATOR`, `IS_OPERATOR_CONFIRMED`. Plain constants (public, fixed URLs: no `EXPO_PUBLIC_*` variable).
- `src/features/legal/components/LegalLinks.tsx`: reusable; three ghost `Button`s (design-system primitive, 44 pt targets, "Opens in your browser" hint). `context="sign-in"` adds the "By continuing you agree…" line. If the browser can't open, it shows the URL instead of failing silently.
- Settings (current placeholder on `main`): `SettingsScreen` renders `<LegalLinks testID="settings-legal-links" />` as a child of `PlaceholderScreen`. The `children` prop added to `PlaceholderScreen` is byte-identical to TB-20's (PR #18) change, so that file merges cleanly.

### Wiring still needed (after TB-20 / TB-32 merge)
- **Sign-in (TB-20, `src/features/auth/components/SignInScreen.tsx`):** below the email form, `<LegalLinks context="sign-in" testID="sign-in-legal-links" />` (import from `@/features/legal/components/LegalLinks`), plus a test pressing "Privacy Policy" on the real `/sign-in` route.
- **Settings shell (TB-32, `src/features/settings/components/SettingsScreen.tsx`):** replace the placeholder wiring with `<LegalLinks testID="settings-legal-links" />` in an "About" / "Legal" section at the bottom of the list; `settings-legal-links-route.test.tsx` then keeps proving it.

## API changes
None.

## Database changes
None.

## Dependencies on other tickets
Blocked by: none in Jira. Blocks TB-38 (beta builds) and TB-64 (store submission). The sign-in wiring needs TB-20 (PR #18) on `main`; TB-32 (PR #19) replaces the Settings screen.

## Known limitations
- Operator name, country and contact email are placeholders until the owner supplies them (D1). The pages are live with those placeholders.
- Several disclosed features (AI capture, voice, photos, check-ins, analytics, account deletion) are not built yet. The policy describes them as they are specified (CLAUDE.md); each owning ticket must re-check the policy before it ships.
- Unknown paths on the legal site return the legal home page (EAS Hosting static fallback), not a 404.

## Testing notes
Unit + integration tests for the component, the config and the published content; full gates green. Evidence in [verification.md](verification.md).

## Follow-up tasks
1. Wire the sign-in link (TB-20) and the Settings-shell link (TB-32) once those PRs merge.
2. AI gateway ticket(s) (`supabase/functions/ai-gateway`): do not store request content, keep only the usage record (time, feature, size, cost); prune `ai_usage_ledger` after 13 months.
3. TB-53 (account deletion): in-app deletion, then update `#delete-account`.
4. TB-65 (analytics): opt-in toggle off by default, no task text in events, 13-month retention in PostHog.
5. TB-37 (Sentry): set event retention ≤ 90 days on the Sentry plan.
6. Bump `LEGAL_LAST_UPDATED` and redeploy whenever a feature changes data handling (sync, Shared Spaces, billing).
