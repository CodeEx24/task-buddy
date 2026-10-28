# Confirm the operator facts on the legal pages

> Related: TB-54 (https://stratyge.atlassian.net/browse/TB-54) | Wave 3 | blocks TB-38 / TB-64 store forms
> Status: Open · Created by: TB-54 worker agent on 2026-10-28

## Purpose
The Privacy Policy, Terms of Use and AI disclosure are live at https://task-buddy--legal.expo.app, but three facts only you can give are still visible placeholders: the **operator name**, the **privacy contact email**, and the **country** you operate from. App Store and Google Play reviewers check that a privacy policy names who runs the app and how to contact them, and Play needs a working account-deletion contact. This guide collects those facts, gets the texts reviewed, and republishes the site.

## Prerequisites
- Access to the Expo account `codeex24` (already used for EAS builds).
- A contact mailbox you are happy to publish. Use a dedicated address (for example a new mailbox just for Task Buddy), not your personal email.
- About 15 minutes, plus the time for a lawyer review.

## Steps
1. Decide the three values:
   - **Operator name:** your legal name as the individual developer (or a business name if you register one).
   - **Contact email:** the dedicated mailbox above. You must answer privacy and deletion requests sent there within 30 days.
   - **Country:** where you are based (this is also the governing law in the Terms, section 12). The Privacy Policy is written with the Philippines as the home regime (section 1 "personal information controller", sections 5 and 10, National Privacy Commission). If you are based elsewhere, tell Claude so those references are reworked.
2. Tell Claude the three values (or edit them yourself). They live in exactly these places:
   - `src/features/legal/legal-config.ts`: `LEGAL_OPERATOR.name`, `.country`, `.contactEmail`; set `IS_OPERATOR_CONFIRMED = true`.
   - `legal-site/privacy.html`, `terms.html`, `ai.html`, `index.html`: every `<span class="owner-confirm" data-owner-confirm="…">`. Replace the bracketed text and remove the `owner-confirm` class so the yellow marker disappears.
3. Confirm or change the retention periods we proposed (Privacy Policy section 8): AI usage records 13 months, crash reports 90 days, analytics 13 months, account deletion within 30 days of a request. Check your Sentry plan's event retention is 90 days or less.
4. Have a lawyer review `legal-site/privacy.html`, `terms.html`, `ai.html` and the store drafts in `docs/tickets/TB-54/` (Philippines Data Privacy Act, GDPR / UK GDPR, CCPA/CPRA). These were drafted by an AI agent and are not legal advice.
5. If any text changed, update `LEGAL_LAST_UPDATED` in `legal-config.ts` and the "Last updated" line on each page (the tests check they match).
6. Run the checks: `pnpm test src/features/legal`.
7. Republish the site to the same URL:
   `npx eas-cli@latest deploy --export-dir legal-site --alias legal`
   (run from the repo root; the alias keeps the URL `https://task-buddy--legal.expo.app` unchanged).
8. Open a PR with the changes (Claude can do steps 2, 5, 6, 7 and the PR once you give the values).

## Expected result
The four pages show your name, country and contact email with no yellow "to be confirmed by owner" markers, and the "Last updated" date is current.

## Verify
- Open https://task-buddy--legal.expo.app/privacy and search the page for "to be confirmed": no matches.
- `pnpm test src/features/legal` passes with `IS_OPERATOR_CONFIRMED = true`.
- In the app: Settings → "Privacy Policy" opens the updated page.

## Completion checklist
- [ ] Operator name, contact email and country chosen
- [ ] Contact mailbox created and monitored
- [ ] Retention periods confirmed
- [ ] Lawyer review done
- [ ] `legal-config.ts` and the four HTML pages updated, `IS_OPERATOR_CONFIRMED = true`
- [ ] Site redeployed to the `legal` alias and checked
- [ ] Status above set to Done with the date

## If it fails
- **`eas deploy` asks you to log in:** run `npx eas-cli@latest login` with the `codeex24` account, then repeat step 7.
- **`eas deploy` says the export dir is missing:** run it from the repo root (the folder with `app.json`).
- **The page still shows old text:** hard-refresh the browser. If the alias still serves the old version after a minute (this happened once on 2026-10-28), point it at the new deployment explicitly: copy the id from the deploy output's "Deployment URL" (`https://task-buddy--<id>.expo.app`) and run `npx eas-cli@latest deploy:alias --alias legal --id <id>`.
- **A test fails after editing:** the config value and the page text must match exactly; the email test only allows an address once `IS_OPERATOR_CONFIRMED` is `true`.
