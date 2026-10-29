# Human actions

Step-by-step guides for things only the project owner can do: credentials, console settings, store forms, paid builds, approvals. Agents create one from [`_TEMPLATE.md`](_TEMPLATE.md) whenever they're blocked on you, and link it from the Jira comment.

Rules: never store secrets here. Name the secret and where it goes (for example, the Supabase Edge Function secret `ANTHROPIC_API_KEY`), never its value. When you finish an action, tick its checklist and set its status to Done in the same file.

## Your to-do list (open actions, in order)
1. **[Push the database migration to Supabase](supabase-db-push.md)** (TB-19 deploy step). About 5 minutes. It creates the `profiles` table in dev and staging, and TB-20 sign-in needs it.
2. **[Set up email-code sign-in in the Supabase dashboard](supabase-auth-email-otp.md)** (TB-20). About 15 minutes, plus pasting one CI job and a new dev build. Decisions made (D1–D9 option A). Do it after step 1.
3. **[Add the Deno type check for Edge Functions to CI](ci-deno-check.md)** (TB-22, after its PR merges). About 5 minutes: paste one job into `ci.yml`.
4. **[Set the AI provider key and deploy the AI gateway](ai-gateway-deploy.md)** (TB-22, TB-23). About 15 minutes, once you have an Anthropic API key and before AI features are tried on a device. TB-23 adds step 0 (push the usage-limits migration **before** deploying the function) and optional limit overrides and a CI rollback check (steps 5–6).
5. **[Confirm the operator facts on the legal pages](legal-owner-facts.md)** (TB-54). About 15 minutes plus a lawyer review. Gives the live privacy policy and terms your name, contact email and country; needed before the TestFlight / Play beta (TB-38) and store submission (TB-64).
6. **[Turn on sync in the hosted Supabase projects](supabase-sync-deploy.md)** (TB-43, after its PR merges). About 10 minutes: `db push` to dev and staging, then check the purge job and Realtime publication. Optional CI rollback step to paste.
7. **[Update the privacy policy for sync before release](privacy-policy-sync.md)** (TB-43). About 15 minutes plus a lawyer review; before any build with sync goes to outside testers.
8. **[Deploy account deletion and update the privacy policy's deletion section](account-deletion-deploy.md)** (TB-53, after its PR merges). About 20 minutes plus a new EAS dev build: deploy the `delete-account` function to dev and staging, then reword privacy §9 "Deleting your account" (it still says "coming in a future update"). Needed before store submission (TB-64).

Everything else is done.

## All actions
| Action | Related | Status |
|---|---|---|
| [Push the database migration to Supabase](supabase-db-push.md) | TB-19 | Open |
| [Set up email-code sign-in in the Supabase dashboard](supabase-auth-email-otp.md) | TB-20 | Open (decisions made) |
| [Add the Deno type check for Edge Functions to CI](ci-deno-check.md) | TB-22 | Open |
| [Set the AI provider key and deploy the AI gateway](ai-gateway-deploy.md) | TB-22, TB-23 | Open |
| [Confirm the operator facts on the legal pages](legal-owner-facts.md) | TB-54 | Open |
| [Turn on sync in the hosted Supabase projects](supabase-sync-deploy.md) | TB-43 | Open |
| [Update the privacy policy for sync before release](privacy-policy-sync.md) | TB-43 | Open |
| [Deploy account deletion and update the privacy policy's deletion section](account-deletion-deploy.md) | TB-53 | Open |
| [Create the Supabase projects and set their EAS variables](supabase-projects.md) | TB-19 | Done (2026-10-28) |
| [Check the task modal's swipe-down on an iPhone](ios-modal-swipe-check.md) | TB-18 | Done (2026-10-28) |
| [Make the Supabase and bundle checks required](github-required-checks.md) | TB-19 | Done (2026-10-28, by Claude) |
| [Add the ESLint rule for database imports](eslint-db-import-rule.md) | TB-21 | Done (2026-10-28, by Claude, PR #15) |
| [Align Jira and the workbook](jira-workbook-alignment.md) | Workflow / Wave 1 | Done (one optional workbook edit left) |
| [Set up an Android emulator and Expo Go on iPhone](android-emulator-setup.md) | TB-15 | Done |
